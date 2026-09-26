/**
 * Guard for 0065_content_reports_and_moderation.sql (store-compliance F5.1).
 *
 * Pins the security shape reviewed by the lead PM (stage 06, R1/R3/R7/R10), so a later edit cannot
 * quietly widen it:
 *   - both new tables: RLS on, every privilege revoked from public/anon/authenticated, SELECT only
 *     re-granted, one active-admin SELECT policy each — no client writes, so no forged actors;
 *   - reports hold references only (no free-text details, no content snapshot);
 *   - every function: SECURITY DEFINER, fixed search_path, EXECUTE revoked from public and anon;
 *   - admin functions refuse anyone who is not an ACTIVE admin (approved, not deleted);
 *   - hidden messages disappear for participants and cannot be inserted pre-hidden;
 *   - the admin alert is wrapped so it cannot lose a report, and quotes no content.
 * The behaviour itself is proven on a real database by the F5 SQL harness (t0065.sql).
 */
import * as fs from 'fs';
import * as path from 'path';

const FILE = path.join(__dirname, '../../supabase/migrations/0065_content_reports_and_moderation.sql');
const raw = fs.readFileSync(FILE, 'utf-8');
// Comments removed, so every assertion below is about executable SQL.
const sql = raw
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const flat = norm(sql);

/** The full text of one function definition, from its header to the closing $$;. */
function body(name: string): string {
  const start = flat.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = flat.indexOf('$$;', start);
  return flat.slice(start, end + 3);
}

const FUNCTIONS: [name: string, signature: string][] = [
  ['is_active_admin', ''],
  ['report_content', 'text, uuid, text'],
  ['admin_get_content_reports', 'text'],
  ['admin_resolve_content_report', 'uuid, text, text'],
  ['admin_set_message_hidden', 'uuid, boolean, uuid, text'],
  ['admin_set_review_hidden', 'uuid, boolean, uuid, text'],
  ['admin_clear_profile_text', 'uuid, uuid, text'],
];
const ADMIN_FUNCTIONS = FUNCTIONS.map(([n]) => n).filter((n) => n.startsWith('admin_'));

describe('0065 — content reports and moderation', () => {
  it('is stored byte-exact (no CR bytes)', () => {
    expect(raw.includes('\r')).toBe(false);
  });

  describe.each(['content_reports', 'moderation_actions'])('table %s', (table) => {
    it('has RLS enabled', () => {
      expect(flat).toContain(`alter table public.${table} enable row level security;`);
    });

    it('revokes everything from public, anon and authenticated and re-grants SELECT only', () => {
      expect(flat).toContain(`revoke all on table public.${table} from public, anon, authenticated;`);
      const grants = flat.match(new RegExp(`grant [a-z, ]+ on (table )?public\\.${table} to [a-z_, ]+;`, 'g')) ?? [];
      expect(grants).toEqual([`grant select on table public.${table} to authenticated;`]);
    });

    it('has exactly one policy: SELECT for active admins', () => {
      const policies = flat.match(new RegExp(`create policy "[a-z_]+" on public\\.${table}[^;]*;`, 'g')) ?? [];
      expect(policies).toHaveLength(1);
      expect(policies[0]).toContain('for select to authenticated using (public.is_active_admin())');
    });
  });

  it('reports store references only: no free-text details or content snapshot column', () => {
    const table = flat.slice(flat.indexOf('create table if not exists public.content_reports'), flat.indexOf(');', flat.indexOf('create table if not exists public.content_reports')));
    const textColumns = (table.match(/\b([a-z_]+) +text\b/g) ?? []).map((c) => c.split(' ')[0]);
    expect(textColumns.sort()).toEqual(['reason', 'resolution_note', 'status', 'target_type']);
  });

  it('people are referenced ON DELETE SET NULL (R10)', () => {
    for (const col of ['reporter_id', 'reported_user_id', 'resolved_by', 'admin_id', 'hidden_by']) {
      expect(flat).toMatch(new RegExp(`${col} +uuid +references public\\.profiles\\(id\\) on delete set null`));
    }
  });

  it.each(FUNCTIONS)('%s is SECURITY DEFINER with a fixed search_path and no PUBLIC/anon EXECUTE', (name, sig) => {
    const b = body(name);
    expect(b).toContain('security definer');
    expect(b).toContain('set search_path = public, pg_temp');
    expect(flat).toContain(`revoke execute on function public.${name}(${sig}) from public, anon;`);
    expect(flat).not.toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to [^;]*\\banon\\b`));
    expect(flat).toContain(`grant execute on function public.${name}(${sig}) to authenticated`);
  });

  it('is_active_admin requires role admin, approval and no tombstone', () => {
    const b = body('is_active_admin');
    expect(b).toContain("p.role = 'admin'");
    expect(b).toContain("p.approval_status = 'approved'");
    expect(b).toContain('p.deleted_at is null');
  });

  it.each(ADMIN_FUNCTIONS)('%s refuses anyone who is not an active admin, first', (name) => {
    const b = body(name);
    const begin = b.indexOf(' begin ');
    expect(b.slice(begin, begin + 90)).toContain("begin if not public.is_active_admin() then raise exception 'admin only'");
  });

  it('report_content requires an active signed-in caller and derives the reported user server-side', () => {
    const b = body('report_content');
    expect(b).toContain('if v_uid is null or not public.is_active_user() then');
    expect(b).toContain('m.sender_id, m.booking_id into v_reported, v_booking');
    expect(b).toContain('r.provider_id = v_uid');
    expect(b).toContain("if v_recent >= 20 then raise exception 'rate_limited'");
  });

  it('the admin alert is wrapped so a failure never loses the report, and quotes no content', () => {
    const b = body('report_content');
    const call = b.slice(b.indexOf('perform public.notify_admins('), b.indexOf(');', b.indexOf('perform public.notify_admins(')));
    expect(b).toMatch(/begin perform public\.notify_admins\([\s\S]*exception when others then raise warning/);
    for (const leak of ['message_text', 'comment', 'bio', 'full_name', 'v_uid', 'v_reported']) {
      expect(call).not.toContain(leak);
    }
  });

  it('participants never see hidden messages; admins still do', () => {
    const select = flat.slice(flat.indexOf('create policy "booking_messages_select"'), flat.indexOf(';', flat.indexOf('create policy "booking_messages_select"')));
    expect(select).toContain('for select to authenticated using');
    expect(select).toContain('public.is_admin() or (booking_messages.hidden_at is null and');
  });

  it('a message cannot be inserted already hidden (R3 push-evasion guard)', () => {
    const insert = flat.slice(flat.indexOf('create policy "booking_messages_insert"'), flat.indexOf(';', flat.indexOf('create policy "booking_messages_insert"')));
    expect(insert).toContain('for insert to authenticated with check');
    expect(insert).toContain('and hidden_at is null and hidden_by is null');
  });

  it("hiding blanks the recipient's preview using 0020's exact truncation", () => {
    const b = body('admin_set_message_hidden');
    expect(b).toContain("set body = 'message removed by kwikserve'");
    expect(b).toContain('when char_length(v_text) > 80 then left(v_text, 80) || chr(8230)');
    const n0020 = norm(fs.readFileSync(path.join(__dirname, '../../supabase/migrations/0020_notification_system.sql'), 'utf-8'));
    expect(n0020).toContain('when char_length(new.message_text) > 80 then left(new.message_text, 80) || \'…\'');
  });

  it('clearing a provider profile clears both bio and skills (R7)', () => {
    const b = body('admin_clear_profile_text');
    expect(b).toContain("set bio = null, skills = '{}'::text[]");
    expect(b).toContain("and role = 'provider'");
  });
});
