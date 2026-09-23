-- 0056_account_deletion.sql — self-service account deletion with financial-history protection.
--
-- WHY. Google Play requires in-app account deletion for any app with account creation. The
-- schema as it stood made a naive deletion either destructive or impossible:
--
--   * profiles.id            -> auth.users  ON DELETE CASCADE
--   * bookings.customer_id   -> auth.users  ON DELETE CASCADE
--
--   Deleting the auth user would therefore erase the customer's bookings and, through the cascades
--   on bookings, every payment, payment attempt and PROVIDER EARNING on them — other people's
--   money. And because provider_payouts.earning_id is ON DELETE RESTRICT, the cascade would
--   actually ERROR the moment a payout existed, so the deletion could not complete either way.
--   Roughly thirty other tables reference profiles(id) with the default NO ACTION, so deleting the
--   profile row is blocked for any account with history.
--
-- MODEL. The profile row is never deleted. It becomes a TOMBSTONE: personal fields are scrubbed in
-- place, `deleted_at` is set, and financial, dispute and audit rows keep pointing at it. Only the
-- auth.users row is removed (by the delete-account Edge Function, after this database step
-- succeeds). Two foreign keys change to make that possible:
--
--   1. profiles.id no longer references auth.users, so the tombstone survives the auth deletion.
--   2. bookings.customer_id references profiles(id) with RESTRICT instead of auth.users with
--      CASCADE, so bookings — and everything hanging off them — are never cascade-deleted.
--
-- ACCESS DENIAL. The database step and auth.admin.deleteUser cannot share a transaction. If the
-- auth deletion fails after tombstoning, the user still holds a valid access token. RESTRICTIVE
-- row-level policies (ANDed with every existing permissive policy) deny a tombstoned identity all
-- rows on every user-facing table the moment `deleted_at` is set, independently of auth state.
--
-- Everything runs as SECURITY DEFINER with a fixed search_path; EXECUTE is granted to
-- service_role only. The mobile client never receives a service-role key and never names the
-- target user: the Edge Function derives it from the verified bearer token.

-- ── 1. Tombstone columns ────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_status text not null default 'active'
    check (deletion_status in ('active', 'pending_auth_delete', 'deleted'));

create index if not exists profiles_deleted_at_idx on public.profiles (deleted_at) where deleted_at is not null;

-- ── 2. Decouple the tombstone from auth.users ──────────────────────────────────────────────
-- The constraint name was never fixed by an earlier migration, so resolve it from the catalog
-- rather than guessing.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    join pg_class frel on frel.oid = con.confrelid
    join pg_namespace fns on fns.oid = frel.relnamespace
    where con.contype = 'f'
      and ns.nspname = 'public' and rel.relname = 'profiles'
      and fns.nspname = 'auth' and frel.relname = 'users'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

-- ── 3. bookings.customer_id: protect financial history ─────────────────────────────────────
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    join pg_class frel on frel.oid = con.confrelid
    join pg_namespace fns on fns.oid = frel.relnamespace
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any (con.conkey)
    where con.contype = 'f'
      and ns.nspname = 'public' and rel.relname = 'bookings'
      and att.attname = 'customer_id'
      and fns.nspname = 'auth' and frel.relname = 'users'
  loop
    execute format('alter table public.bookings drop constraint %I', c.conname);
  end loop;
end $$;

-- Every booking's customer must already have a profile (the signup trigger guarantees it). If a
-- historical row violates this the migration must FAIL here, not silently orphan the booking.
alter table public.bookings
  add constraint bookings_customer_id_profiles_fkey
  foreign key (customer_id) references public.profiles (id) on delete restrict;

-- ── 4. Audit and throttle tables (service-role only: RLS on, no policies) ──────────────────
create table if not exists public.account_deletions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete restrict,
  role             text not null,
  status           text not null check (status in ('blocked', 'pending_auth_delete', 'deleted')),
  blockers         jsonb not null default '[]'::jsonb,
  requested_at     timestamptz not null default now(),
  db_completed_at  timestamptz,
  auth_deleted_at  timestamptz,
  auth_attempts    integer not null default 0
);
-- Deliberately no email, phone, name or request body: the row proves WHEN and WHAT HAPPENED, not
-- who the person was.
alter table public.account_deletions enable row level security;
create index if not exists account_deletions_user_idx on public.account_deletions (user_id);

create table if not exists public.account_deletion_attempts (
  user_id            uuid primary key,
  failures           integer not null default 0,
  window_started_at  timestamptz not null default now(),
  last_attempt_at    timestamptz not null default now()
);
alter table public.account_deletion_attempts enable row level security;

-- ── 5. Access denial for tombstoned identities ─────────────────────────────────────────────
-- TRUE for anonymous callers (auth.uid() is null) and for any identity WITHOUT a tombstone, so
-- existing anonymous/public semantics are untouched and a brand-new signup is never denied. FALSE
-- only when a profile exists for the caller and it has been tombstoned.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.deleted_at is null from public.profiles p where p.id = auth.uid()),
    true
  );
$$;
revoke execute on function public.is_active_user() from public;
grant execute on function public.is_active_user() to anon, authenticated, service_role;

-- One RESTRICTIVE policy per user-facing table. Restrictive policies are ANDed with the
-- permissive ones, so nothing here widens access; it can only deny. Reference/catalogue tables
-- (services, service_categories, promo_codes) are intentionally excluded.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'bookings', 'payments', 'payment_attempts', 'provider_earnings', 'provider_payouts',
    'provider_earning_deductions', 'wallets', 'wallet_transactions', 'reviews',
    'review_private_feedback', 'booking_messages', 'booking_photos', 'booking_activity',
    'notifications', 'notification_preferences', 'device_tokens', 'customer_addresses',
    'favorite_providers', 'favorite_services', 'provider_locations', 'provider_conduct_acceptances',
    'support_cases', 'support_case_events', 'support_case_notes', 'promo_redemptions'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_deny_deleted_identity', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (public.is_active_user()) with check (public.is_active_user())',
      t || '_deny_deleted_identity', t
    );
  end loop;
end $$;

-- ── 6. Blockers ────────────────────────────────────────────────────────────────────────────
-- Read-only. Returns a JSON array of machine-readable blocker codes; empty when deletion may
-- proceed. Every condition is one that would strand money, an active job or an open dispute.
create or replace function public.account_deletion_blockers(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb := '[]'::jsonb;
begin
  if exists (
    select 1 from public.bookings b
    where (b.customer_id = p_user or b.assigned_provider_id = p_user)
      and b.status not in ('completed', 'cancelled')
  ) then v := v || '"active_booking"'::jsonb; end if;

  if exists (
    select 1 from public.payment_attempts pa
    join public.payments p on p.id = pa.payment_id
    join public.bookings b on b.id = p.booking_id
    where (b.customer_id = p_user or b.assigned_provider_id = p_user)
      and pa.status in ('initiated', 'pending')
  ) then v := v || '"pending_payment_attempt"'::jsonb; end if;

  if exists (
    select 1 from public.payments p
    join public.bookings b on b.id = p.booking_id
    where (b.customer_id = p_user or b.assigned_provider_id = p_user)
      and p.status = 'pending'
  ) then v := v || '"unsettled_payment"'::jsonb; end if;

  if exists (
    select 1 from public.provider_earnings e
    where e.provider_id = p_user and e.payout_status <> 'paid'
  ) then v := v || '"unpaid_provider_earning"'::jsonb; end if;

  if exists (
    select 1 from public.wallets w where w.customer_id = p_user and w.balance > 0
  ) then v := v || '"positive_wallet_balance"'::jsonb; end if;

  if exists (
    select 1 from public.support_cases s
    where (s.customer_id = p_user or s.provider_id = p_user)
      and s.status not in ('resolved', 'closed')
  ) then v := v || '"open_support_case"'::jsonb; end if;

  if exists (
    select 1 from public.account_flags f
    where f.subject_id = p_user and f.active = true
  ) then v := v || '"active_account_flag"'::jsonb; end if;

  return v;
end;
$$;
revoke execute on function public.account_deletion_blockers(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_blockers(uuid) to service_role;

-- ── 7. Throttle ────────────────────────────────────────────────────────────────────────────
-- Five failed credential checks per fifteen-minute window. Outcomes: 'check' (may I proceed?),
-- 'failure' (wrong credential), 'success' (reset). Returns {allowed, retry_after_seconds}.
create or replace function public.throttle_account_deletion(p_user uuid, p_outcome text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  r public.account_deletion_attempts%rowtype;
  v_window interval := interval '15 minutes';
  v_limit int := 5;
begin
  if p_outcome not in ('check', 'failure', 'success') then
    raise exception 'invalid outcome';
  end if;

  select * into r from public.account_deletion_attempts where user_id = p_user for update;
  if not found then
    insert into public.account_deletion_attempts (user_id) values (p_user) returning * into r;
  end if;

  -- Expired window: start over.
  if r.window_started_at + v_window < now() then
    update public.account_deletion_attempts
      set failures = 0, window_started_at = now(), last_attempt_at = now()
      where user_id = p_user returning * into r;
  end if;

  if p_outcome = 'failure' then
    update public.account_deletion_attempts
      set failures = failures + 1, last_attempt_at = now()
      where user_id = p_user returning * into r;
  elsif p_outcome = 'success' then
    delete from public.account_deletion_attempts where user_id = p_user;
    return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  end if;

  if r.failures >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', greatest(0, extract(epoch from (r.window_started_at + v_window - now()))::int)
    );
  end if;
  return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
end;
$$;
revoke execute on function public.throttle_account_deletion(uuid, text) from public, anon, authenticated;
grant execute on function public.throttle_account_deletion(uuid, text) to service_role;

-- ── 8. The deletion itself (database half) ─────────────────────────────────────────────────
-- One transaction: blockers are re-checked INSIDE it, so a booking created between the client's
-- preview and the request cannot slip through. Returns a status object; never raises for
-- business outcomes, only for programming errors.
--
--   {status: 'blocked', blockers: [...]}          nothing was changed
--   {status: 'pending_auth_delete', idempotent}   tombstoned; auth deletion still owed
--   {status: 'deleted', idempotent: true}         already fully deleted earlier
--   {status: 'not_found'}                          no profile for this id
create or replace function public.delete_account(p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  p public.profiles%rowtype;
  v_blockers jsonb;
  v_deletion_id uuid;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Admin/support identities are removed by operations, never by self-service.
  if p.role = 'admin' then
    raise exception 'admin accounts cannot be self-deleted' using errcode = '42501';
  end if;

  -- Idempotent re-entry: the scrub already happened; report where we are.
  if p.deletion_status = 'deleted' then
    return jsonb_build_object('status', 'deleted', 'idempotent', true);
  end if;
  if p.deletion_status = 'pending_auth_delete' then
    return jsonb_build_object('status', 'pending_auth_delete', 'idempotent', true);
  end if;

  v_blockers := public.account_deletion_blockers(p_user);
  if jsonb_array_length(v_blockers) > 0 then
    insert into public.account_deletions (user_id, role, status, blockers)
      values (p_user, p.role, 'blocked', v_blockers);
    return jsonb_build_object('status', 'blocked', 'blockers', v_blockers);
  end if;

  insert into public.account_deletions (user_id, role, status)
    values (p_user, p.role, 'pending_auth_delete')
    returning id into v_deletion_id;

  -- DELETE: disposable personal data with no financial or dispute basis.
  delete from public.device_tokens            where user_id = p_user;
  delete from public.notification_preferences where user_id = p_user;
  delete from public.notifications            where user_id = p_user;
  delete from public.customer_addresses       where customer_id = p_user;
  delete from public.favorite_providers       where customer_id = p_user or provider_id = p_user;
  delete from public.favorite_services        where customer_id = p_user;
  delete from public.provider_locations       where provider_id = p_user;
  delete from public.provider_conduct_acceptances where provider_id = p_user;

  -- ANONYMIZE: the tombstone. Aggregates (ratings, job counts) stay: they are not personal data
  -- and they back other users' reviews.
  update public.profiles set
    full_name         = 'Deleted user',
    phone             = null,
    bio               = null,
    skills            = '{}'::text[],
    years_experience  = null,
    profile_photo_url = null,
    is_verified       = false,
    deleted_at        = now(),
    deletion_status   = 'pending_auth_delete'
  where id = p_user;

  -- ANONYMIZE: denormalised personal fields on retained financial rows. Amounts, statuses,
  -- references, timestamps and the counterpart's data are untouched.
  update public.bookings set
    address        = '[deleted]',
    notes          = null,
    latitude       = null,
    longitude      = null,
    landmark       = null,
    building_name  = null,
    door_number    = null,
    floor          = null,
    access_notes   = null,
    address_label  = null,
    service_details = null
  where customer_id = p_user;

  update public.bookings set
    assigned_provider_name  = 'Deleted provider',
    assigned_provider_phone = null
  where assigned_provider_id = p_user;

  update public.booking_messages set message_text = '[deleted]' where sender_id = p_user;
  update public.reviews set comment = null where customer_id = p_user;

  -- The payer's MSISDN on retained payment attempts: keep only the last three digits so the
  -- M-PESA reference can still be matched by operations without identifying the person.
  update public.payment_attempts pa set phone = '***' || right(pa.phone, 3)
  from public.payments pm join public.bookings b on b.id = pm.booking_id
  where pa.payment_id = pm.id and b.customer_id = p_user
    and pa.phone is not null and pa.phone not like '***%';

  update public.account_deletions set db_completed_at = now() where id = v_deletion_id;

  return jsonb_build_object('status', 'pending_auth_delete', 'deletion_id', v_deletion_id);
end;
$$;
revoke execute on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;

-- ── 9. Completion (after auth.admin.deleteUser succeeded) ──────────────────────────────────
create or replace function public.complete_account_deletion(p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles set deletion_status = 'deleted'
    where id = p_user and deletion_status = 'pending_auth_delete';
  update public.account_deletions set
      status = 'deleted',
      auth_deleted_at = coalesce(auth_deleted_at, now()),
      auth_attempts = auth_attempts + 1
    where user_id = p_user and status = 'pending_auth_delete';
  return jsonb_build_object('status', 'deleted');
end;
$$;
revoke execute on function public.complete_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.complete_account_deletion(uuid) to service_role;

-- Records an auth-deletion attempt that FAILED, so retries are visible in the audit trail.
create or replace function public.record_auth_deletion_failure(p_user uuid)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update public.account_deletions set auth_attempts = auth_attempts + 1
    where user_id = p_user and status = 'pending_auth_delete';
$$;
revoke execute on function public.record_auth_deletion_failure(uuid) from public, anon, authenticated;
grant execute on function public.record_auth_deletion_failure(uuid) to service_role;
