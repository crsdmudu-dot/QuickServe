/**
 * Guard for 0066_user_blocks.sql (store-compliance F5.2).
 *
 * Pins the reviewed shape (lead-PM stage 06: R1, R2, R4, R10), so a later edit cannot quietly widen it:
 *   - user_blocks: RLS on, no client writes (R2), only the blocker (or an active admin) can read a block;
 *   - blocks work both ways for chat (the insert policy) and for dispatch (a BEFORE trigger on bookings);
 *   - booking_chat_blocked answers only participants and active admins;
 *   - deleting an account removes its blocks both ways, without touching the certified 0059-0061 routines;
 *   - every function: SECURITY DEFINER, fixed search_path, no PUBLIC/anon EXECUTE; trigger functions
 *     executable by no client role.
 * Behaviour is proven on a real database by the F5 SQL harness (t0066.sql).
 */
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS = path.join(__dirname, '../../supabase/migrations');
const raw = fs.readFileSync(path.join(MIGRATIONS, '0066_user_blocks.sql'), 'utf-8');
const sql = raw
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const flat = norm(sql);

function body(name: string): string {
  const start = flat.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  return flat.slice(start, flat.indexOf('$$;', start) + 3);
}
function statement(prefix: string): string {
  const start = flat.indexOf(prefix);
  expect(start).toBeGreaterThanOrEqual(0);
  return flat.slice(start, flat.indexOf(';', start) + 1);
}

const CLIENT_FUNCTIONS: [string, string][] = [
  ['block_user', 'uuid'],
  ['unblock_user', 'uuid'],
  ['get_my_blocked_users', ''],
  ['booking_chat_blocked', 'uuid'],
  ['admin_blocked_provider_ids', 'uuid'],
];
const TRIGGER_FUNCTIONS = ['tg_bookings_block_pairing', 'tg_profiles_remove_blocks_on_tombstone'];

describe('0066 — user blocks', () => {
  it('is stored byte-exact (no CR bytes)', () => {
    expect(raw.includes('\r')).toBe(false);
  });

  it('user_blocks: RLS on, everything revoked, SELECT re-granted only (no client writes, R2)', () => {
    expect(flat).toContain('alter table public.user_blocks enable row level security;');
    expect(flat).toContain('revoke all on table public.user_blocks from public, anon, authenticated;');
    const grants = flat.match(/grant [a-z, ]+ on (table )?public\.user_blocks to [a-z_, ]+;/g) ?? [];
    expect(grants).toEqual(['grant select on table public.user_blocks to authenticated;']);
  });

  it('only the blocker or an active admin can read a block — never the blocked person', () => {
    const policies = flat.match(/create policy "[a-z_]+" on public\.user_blocks[^;]*;/g) ?? [];
    expect(policies).toHaveLength(1);
    expect(policies[0]).toContain('for select to authenticated using (blocker_id = auth.uid() or public.is_active_admin())');
  });

  it('block rows go when either profile row goes (R10), and a person cannot block themselves', () => {
    expect(flat).toContain('blocker_id uuid not null references public.profiles(id) on delete cascade');
    expect(flat).toContain('blocked_id uuid not null references public.profiles(id) on delete cascade');
    expect(flat).toContain('check (blocker_id <> blocked_id)');
  });

  it.each(CLIENT_FUNCTIONS)('%s: SECURITY DEFINER, fixed search_path, authenticated only', (name, sig) => {
    const b = body(name);
    expect(b).toContain('security definer');
    expect(b).toContain('set search_path = public, pg_temp');
    expect(flat).toContain(`revoke execute on function public.${name}(${sig}) from public, anon;`);
    expect(flat).toContain(`grant execute on function public.${name}(${sig}) to authenticated;`);
    expect(flat).not.toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to [^;]*\\banon\\b`));
  });

  it.each(TRIGGER_FUNCTIONS)('%s: SECURITY DEFINER and executable by no client role', (name) => {
    const b = body(name);
    expect(b).toContain('returns trigger');
    expect(b).toContain('security definer');
    expect(b).toContain('set search_path = public, pg_temp');
    expect(flat).toContain(`revoke execute on function public.${name}() from public, anon, authenticated;`);
    expect(flat).not.toMatch(new RegExp(`grant execute on function public\\.${name}\\(`));
  });

  it('block_user needs an active caller and a real counterpart (or an approved provider)', () => {
    const b = body('block_user');
    expect(b).toContain('if v_uid is null or not public.is_active_user() then');
    expect(b).toContain("(p.role = 'provider' and p.approval_status = 'approved')");
    expect(b).toContain('(b.customer_id = v_uid and b.assigned_provider_id = p.id)');
    expect(b).toContain('p_user_id = v_uid');
  });

  it('booking_chat_blocked answers only the participants and active admins', () => {
    const b = body('booking_chat_blocked');
    expect(b).toContain('(ub.blocker_id = b.customer_id and ub.blocked_id = b.assigned_provider_id)');
    expect(b).toContain('(ub.blocker_id = b.assigned_provider_id and ub.blocked_id = b.customer_id)');
    expect(b).toContain('and (auth.uid() = b.customer_id or auth.uid() = b.assigned_provider_id or public.is_active_admin())');
  });

  it('the chat insert policy refuses messages while blocked, and keeps the 0065 pins', () => {
    const p = statement('create policy "booking_messages_insert"');
    expect(p).toContain('for insert to authenticated with check');
    expect(p).toContain('and hidden_at is null and hidden_by is null');
    expect(p).toContain('and not public.booking_chat_blocked(booking_messages.booking_id)');
  });

  it('dispatch: a BEFORE trigger refuses to pair a blocked pair, for inserts and reassignments', () => {
    expect(statement('create trigger trg_bookings_block_pairing')).toContain(
      'before insert or update of assigned_provider_id on public.bookings for each row execute function public.tg_bookings_block_pairing()',
    );
    const b = body('tg_bookings_block_pairing');
    expect(b).toContain("tg_op = 'insert' or new.assigned_provider_id is distinct from old.assigned_provider_id");
    expect(b).toContain("raise exception 'blocked_pair'");
  });

  it('admin_blocked_provider_ids refuses anyone who is not an active admin, first', () => {
    const b = body('admin_blocked_provider_ids');
    const begin = b.indexOf(' begin ');
    expect(b.slice(begin, begin + 90)).toContain("begin if not public.is_active_admin() then raise exception 'admin only'");
  });

  it('account deletion removes blocks both ways through its own trigger (R4)', () => {
    expect(statement('create trigger trg_profiles_remove_blocks_on_tombstone')).toContain(
      'after update of deleted_at on public.profiles',
    );
    const b = body('tg_profiles_remove_blocks_on_tombstone');
    expect(b).toContain('if new.deleted_at is not null and old.deleted_at is null then');
    expect(b).toContain('where blocker_id = new.id or blocked_id = new.id');
  });

  it('does not redefine any certified deletion routine (0059-0061 stay the latest owners)', () => {
    for (const routine of ['delete_account', 'complete_account_deletion', '_deletion_inventory', 'list_cleanup_candidates', 'try_complete_cleanup']) {
      expect(flat).not.toContain(`function public.${routine}(`);
    }
  });
});
