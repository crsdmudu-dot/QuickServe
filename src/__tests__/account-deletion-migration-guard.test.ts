/**
 * account-deletion-migration-guard.test.ts — static proof that migration 0056 cannot cascade-delete
 * financial history and that the deletion path is locked to the service role.
 *
 * WHY. Before 0056, `bookings.customer_id -> auth.users ON DELETE CASCADE` meant that deleting a
 * customer's auth row would erase their bookings and, through the cascades on bookings, every
 * payment and PROVIDER EARNING on them. These tests pin the properties that make self-service
 * deletion safe, so a later "cleanup" cannot quietly reintroduce the cascade.
 *
 * Offline: reads the migration text only.
 */
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION = '0056_account_deletion.sql';
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/', f), 'utf-8');
// Comments are stripped first: the migration's header explains the OLD cascade in prose, and an
// assertion that "auth.users" never follows "customer_id" must judge the SQL, not the essay.
const stripComments = (s: string) => s.replace(/--[^\n]*/g, '');
const norm = (s: string) => stripComments(s).replace(/\s+/g, ' ').toLowerCase();

const sql = norm(read(MIGRATION));

describe('0056: financial history cannot be cascade-deleted', () => {
  it('repoints bookings.customer_id to profiles(id) with RESTRICT, never to auth.users', () => {
    expect(sql).toContain(
      'add constraint bookings_customer_id_profiles_fkey foreign key (customer_id) references public.profiles (id) on delete restrict',
    );
    expect(sql).not.toMatch(/customer_id[^;]*references auth\.users/);
  });

  it('drops the profiles -> auth.users cascade so the tombstone survives auth deletion', () => {
    expect(sql).toContain("ns.nspname = 'public' and rel.relname = 'profiles'");
    expect(sql).toContain("fns.nspname = 'auth' and frel.relname = 'users'");
    expect(sql).toContain('alter table public.profiles drop constraint %i');
  });

  it('never deletes from any financial, dispute or audit table', () => {
    for (const t of [
      'bookings', 'payments', 'payment_attempts', 'provider_earnings', 'provider_payouts',
      'provider_earning_deductions', 'wallet_transactions', 'wallets', 'mpesa_callback_events',
      'support_cases', 'support_case_notes', 'support_case_events', 'internal_notes',
      'account_flags', 'booking_activity', 'booking_photos', 'reviews', 'profiles', 'account_deletions',
    ]) {
      expect(sql).not.toMatch(new RegExp(`delete from public\\.${t}\\b`));
    }
  });

  it('adds no ON DELETE CASCADE anywhere', () => {
    expect(sql).not.toContain('on delete cascade');
  });

  it('audit rows carry no personal data columns', () => {
    const m = sql.match(/create table if not exists public\.account_deletions \((.*?)\);/);
    expect(m).not.toBeNull();
    const cols = m![1];
    for (const pii of ['email', 'phone', 'full_name', 'name ', 'body', 'ip']) {
      expect(cols).not.toContain(pii);
    }
  });
});

/**
 * The body of one function definition: from its `create or replace function public.<name>(` to
 * the closing `$$;`. Definitions carry parameter NAMES (`p_user uuid`); revoke/grant lines carry
 * only types (`uuid`), so the two must be located differently.
 */
function definition(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  // Called at describe-collection time, where `expect` is not allowed: a plain throw fails the
  // suite with the reason instead of Jest's opaque "suite failed to run".
  if (start < 0) throw new Error(`definition of ${name} not found in ${MIGRATION}`);
  const end = sql.indexOf('$$;', sql.indexOf('$$', start) + 2);
  return sql.slice(start, end);
}

describe('0056: the deletion path is service-role only', () => {
  for (const [name, sig] of [
    ['delete_account', 'delete_account(uuid)'],
    ['complete_account_deletion', 'complete_account_deletion(uuid)'],
    ['account_deletion_blockers', 'account_deletion_blockers(uuid)'],
    ['throttle_account_deletion', 'throttle_account_deletion(uuid, text)'],
    ['record_auth_deletion_failure', 'record_auth_deletion_failure(uuid)'],
  ]) {
    it(`${sig}: SECURITY DEFINER, fixed search_path, revoked from public/anon/authenticated, granted to service_role`, () => {
      const def = definition(name);
      expect(def).toContain('security definer');
      expect(def).toContain('set search_path = public, pg_temp');
      expect(sql).toContain(`revoke execute on function public.${sig} from public, anon, authenticated`);
      expect(sql).toContain(`grant execute on function public.${sig} to service_role`);
    });
  }

  it('audit and throttle tables have RLS enabled and no policies (service role only)', () => {
    expect(sql).toContain('alter table public.account_deletions enable row level security');
    expect(sql).toContain('alter table public.account_deletion_attempts enable row level security');
    expect(sql).not.toMatch(/create policy \S+ on public\.account_deletions/);
    expect(sql).not.toMatch(/create policy \S+ on public\.account_deletion_attempts/);
  });
});

describe('0056: tombstoned identities are denied at the data layer', () => {
  it('is_active_user() is false only for an existing tombstoned profile (anonymous and new users unaffected)', () => {
    const def = sql.slice(sql.indexOf('function public.is_active_user()'));
    expect(def).toContain('coalesce( (select p.deleted_at is null from public.profiles p where p.id = auth.uid()), true )');
  });

  it('installs RESTRICTIVE policies (ANDed, can only deny) on every user-facing table', () => {
    expect(sql).toContain('as restrictive for all to authenticated using (public.is_active_user()) with check (public.is_active_user())');
    for (const t of [
      'profiles', 'bookings', 'payments', 'payment_attempts', 'provider_earnings', 'provider_payouts',
      'wallets', 'wallet_transactions', 'reviews', 'booking_messages', 'notifications', 'device_tokens',
      'customer_addresses', 'support_cases',
    ]) {
      expect(sql).toContain(`'${t}'`);
    }
  });
});

describe('0056: delete_account is transactional and refuses the wrong subjects', () => {
  const def = definition('delete_account');

  it('locks the profile row and re-checks blockers INSIDE the transaction before mutating', () => {
    expect(def).toContain('for update');
    const blockersAt = def.indexOf('public.account_deletion_blockers(p_user)');
    const firstDeleteAt = def.indexOf('delete from public.device_tokens');
    expect(blockersAt).toBeGreaterThan(-1);
    expect(firstDeleteAt).toBeGreaterThan(blockersAt);
  });

  it('refuses admin identities', () => {
    expect(def).toContain("if p.role = 'admin' then raise exception");
  });

  it('is idempotent: re-entry on a tombstone reports status without re-scrubbing', () => {
    expect(def).toContain("if p.deletion_status = 'deleted' then return");
    expect(def).toContain("if p.deletion_status = 'pending_auth_delete' then return");
  });

  it('scrubs the approved personal fields and keeps amounts/status/references', () => {
    for (const s of [
      "full_name = 'deleted user'", 'phone = null', 'profile_photo_url = null',
      "address = '[deleted]'", 'latitude = null', 'longitude = null',
      "assigned_provider_name = 'deleted provider'", 'assigned_provider_phone = null',
      "message_text = '[deleted]'", 'set comment = null',
    ]) {
      expect(def).toContain(s);
    }
    expect(def).not.toMatch(/update public\.(payments|provider_earnings|provider_payouts|wallet_transactions) set/);
  });

  it('masks the payer phone on retained payment attempts rather than deleting them', () => {
    expect(def).toContain("phone = '***' || right(pa.phone, 3)");
  });
});
