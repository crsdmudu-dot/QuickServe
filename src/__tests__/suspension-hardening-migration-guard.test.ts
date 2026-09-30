/**
 * Guard for 0069_suspension_and_hardening.sql (store-compliance F5.6, plus the lead-PM hardening bundle).
 *
 * Pins the reviewed shape:
 *   - account_suspensions: no client writes; only active admins can read it; one active suspension per user;
 *   - is_active_user() also refuses a suspended user, keeps "true when not signed in" and keeps its grants;
 *   - suspend and lift are for active admins only, with the caller as the acting admin (no admin parameter);
 *     recording the Auth ban outcome is for the service role only;
 *   - the bundle: R5 edit_review, S8-1 emit_notification body, F51-6 notify_admins, F52-1 pairing trigger columns,
 *     F53-1 booking-notes filter, F53-2 word-list RLS, S15-2 route CHECK (NOT VALID).
 * The 0066 and 0067 guards still pin those migrations' own text; this guard pins what 0069 changes on top.
 * Behaviour is proven on a real database by the F5 SQL harness (t0069.sql, with negative controls).
 */
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS = path.join(__dirname, '../../supabase/migrations');
const raw = fs.readFileSync(path.join(MIGRATIONS, '0069_suspension_and_hardening.sql'), 'utf-8');
const sql = raw
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');
const flat = sql.replace(/\s+/g, ' ').trim().toLowerCase();

function body(name: string): string {
  const start = flat.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  return flat.slice(start, flat.indexOf('$$;', start) + 3);
}

describe('0069 — suspension and the hardening bundle', () => {
  it('is stored byte-exact (no CR bytes) and later migrations do not re-define its functions', () => {
    expect(raw.includes('\r')).toBe(false);
    const later = fs.readdirSync(MIGRATIONS).filter((f) => /^\d{4}_/.test(f) && Number(f.slice(0, 4)) > 69);
    for (const f of later) {
      const text = fs.readFileSync(path.join(MIGRATIONS, f), 'utf-8').toLowerCase().replace(/\s+/g, ' ');
      for (const fn of ['is_active_user', 'edit_review', 'emit_notification', 'notify_admins', 'tg_bookings_block_pairing', 'tg_filter_user_text']) {
        expect({ file: f, redefines: text.includes(`create or replace function public.${fn}(`) }).toEqual({ file: f, redefines: false });
      }
    }
  });

  it('account_suspensions: no client writes, active admins read, one active suspension per user', () => {
    expect(flat).toContain('create table if not exists public.account_suspensions');
    expect(flat).toContain('user_id uuid not null references public.profiles (id) on delete cascade');
    expect(flat).toContain('check (char_length(btrim(reason)) between 1 and 500)');
    expect(flat).toContain("check (auth_ban_state in ('pending', 'banned', 'failed', 'unbanned'))");
    expect(flat).toContain(
      'create unique index if not exists account_suspensions_one_active on public.account_suspensions (user_id) where lifted_at is null;',
    );
    expect(flat).toContain('alter table public.account_suspensions enable row level security;');
    expect(flat).toContain('revoke all on table public.account_suspensions from public, anon, authenticated;');
    expect(flat).toContain('grant select on table public.account_suspensions to authenticated;');
    expect(flat).not.toMatch(/grant (insert|update|delete|all)[a-z, ]* on (table )?public\.account_suspensions/);
    expect(flat).toContain(
      'create policy account_suspensions_select_admin on public.account_suspensions for select to authenticated using (public.is_active_admin());',
    );
  });

  it('is_active_user(): not deleted and not suspended; true when not signed in; grants unchanged', () => {
    const b = body('is_active_user');
    expect(b).toContain('security definer set search_path = public, pg_temp');
    expect(b).toContain('p.deleted_at is null and not exists (select 1 from public.account_suspensions s where s.user_id = p.id and s.lifted_at is null)');
    expect(b).toContain('where p.id = auth.uid()), true );');
    expect(flat).toContain('revoke execute on function public.is_active_user() from public;');
    expect(flat).toContain('grant execute on function public.is_active_user() to anon, authenticated, service_role;');
  });

  it('suspend and lift: active admins only, the acting admin is the caller, audited', () => {
    for (const [name, sig, action] of [
      ['admin_suspend_account', 'uuid, text, uuid', 'account_suspended'],
      ['admin_lift_account_suspension', 'uuid, text', 'account_unsuspended'],
    ] as const) {
      const b = body(name);
      expect(b).not.toContain('p_admin');
      expect(b).toContain("if not public.is_active_admin() then raise exception 'admin only' using errcode = '42501';");
      expect(b).toContain(`'${action}', 'user', p_user`);
      expect(b).toContain('auth.uid()');
      expect(flat).toContain(`revoke execute on function public.${name}(${sig}) from public, anon;`);
      expect(flat).toContain(`grant execute on function public.${name}(${sig}) to authenticated;`);
    }
    expect(body('admin_suspend_account')).toContain("if v_role not in ('customer', 'provider') then");
    expect(body('admin_suspend_account')).toContain('if v_gone is not null then');
  });

  it('the Auth ban outcome is recorded by the service role only; the account state is about the caller only', () => {
    expect(flat).toContain('revoke execute on function public.set_suspension_ban_state(uuid, text) from public, anon, authenticated;');
    expect(flat).toContain('grant execute on function public.set_suspension_ban_state(uuid, text) to service_role;');
    expect(flat).not.toMatch(/grant execute on function public\.set_suspension_ban_state\([^)]*\) to [a-z_, ]*(anon|authenticated)/);
    expect(body('get_my_account_state')).toContain('where p.id = auth.uid();');
    expect(flat).toContain('revoke execute on function public.get_my_account_state() from public, anon;');
    expect(flat).toContain('grant execute on function public.get_my_account_state() to authenticated;');
  });

  it('R5: edit_review refuses deleted and suspended users, pins pg_temp, signed-in only', () => {
    const b = body('edit_review');
    expect(b).toContain('set search_path = public, pg_temp');
    expect(b).toContain(") or not public.is_active_user() then raise exception 'edit window closed or not owner';");
    expect(flat).toContain(
      'revoke execute on function public.edit_review(uuid, text, integer, integer, integer, integer, integer, integer, boolean, text[]) from public, anon;',
    );
  });

  it('S8-1: the emit_notification check is NULL-safe and refuses a caller who is not signed in', () => {
    const b = body('emit_notification');
    expect(b).toContain('set search_path = public, pg_temp');
    expect(b).toContain("if auth.uid() is null or (public.is_admin() or p_user_id = auth.uid()) is not true then raise exception 'not authorized';");
    expect(flat).toContain('revoke execute on function public.emit_notification(uuid, text, text, text, text, text, text, jsonb, text) from public, anon;');
  });

  it('F51-6: notify_admins skips deleted admins and stays closed to clients', () => {
    const b = body('notify_admins');
    expect(b).toContain("where role = 'admin' and approval_status = 'approved' and deleted_at is null loop");
    expect(b).toContain('set search_path = public, pg_temp');
    expect(flat).toContain('revoke execute on function public.notify_admins(uuid, text, text, text, text, text) from public, anon, authenticated;');
  });

  it('F52-1: the blocked-pair check also runs when the customer changes', () => {
    expect(body('tg_bookings_block_pairing')).toContain('or new.customer_id is distinct from old.customer_id');
    expect(flat).toContain(
      'create trigger trg_bookings_block_pairing before insert or update of assigned_provider_id, customer_id on public.bookings',
    );
  });

  it('F53-1 and F53-2: booking notes are filtered; the word list has row-level security', () => {
    const b = body('tg_filter_user_text');
    expect(b).toContain("elsif tg_table_name = 'bookings' then if tg_op = 'insert' then v_text := concat_ws(' ', new.notes, new.access_notes);");
    expect(b).toContain('case when new.access_notes is distinct from old.access_notes then new.access_notes end');
    expect(b).toContain('if auth.uid() is null then return new;');
    expect(flat).toContain('create trigger trg_filter_bookings before insert or update of notes, access_notes on public.bookings');
    expect(flat).toContain('revoke execute on function public.tg_filter_user_text() from public, anon, authenticated;');
    expect(flat).toContain('alter table private.blocked_terms enable row level security;');
  });

  it("S15-2: notification routes must be plain in-app paths (the app's rule), added NOT VALID", () => {
    expect(flat).toContain('add constraint notifications_route_internal check (route is null');
    expect(flat).toContain("char_length(route) <= 512 and left(route, 1) = '/' and left(route, 2) <> '//'");
    expect(raw).toContain("route !~ '[\\\\[:space:][:cntrl:]]'");
    expect(flat).toMatch(/add constraint notifications_route_internal check \(.*\) not valid;/);
  });

  it('grants nothing to anon except the is_active_user() grant it restates', () => {
    const anonGrants = flat.match(/grant [^;]* to [^;]*\banon\b[^;]*;/g) ?? [];
    expect(anonGrants).toEqual(['grant execute on function public.is_active_user() to anon, authenticated, service_role;']);
  });
});
