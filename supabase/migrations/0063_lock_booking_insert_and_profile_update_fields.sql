-- Client write authority - API users can no longer write the fields KwikServe or the account system decides.
--
--   Part A (H1, HIGH)  bookings: a customer can still create a booking, but can no longer set KwikServe's fields.
--   Part B (O1, HIGH)  profiles: an admin can change only the provider fields the admin web edits - never a role,
--                      the account-deletion state, contact details or computed counters.
--   Part C (O3, LOW)   profiles: a user still cannot change their own role or deletion state (the two deletion
--                      columns that 0056 added are now pinned too).
--
-- Numbering: 0063 comes after the committed 0056-0062 set that is still waiting for its Production rollout.
-- 0055 and 0057 stay permanently unused.
--
-- ==========================================================================================================
-- PART A (H1) - BOOKINGS: INSERT
-- ==========================================================================================================
--
-- THE PROBLEM
-- The only rule on creating a booking was the INSERT policy from 0002_bookings.sql:
--     create policy "bookings_insert_own" ... for insert with check (auth.uid() = customer_id)
-- It checks WHO the booking belongs to, and nothing else. The app sends a harmless request, but a signed-in
-- customer calling the database API directly (POST /rest/v1/bookings) could also send the columns that only
-- KwikServe is meant to set, for example:
--     status = 'completed', assigned_provider_id = <any provider>, quoted_amount = 1, quote_status = 'sent'.
-- What that allowed:
--   * Fake reviews. reviews_insert_own (0008_reviews.sql) accepts a review of any COMPLETED booking the customer
--     owns whose assigned_provider_id matches, so a fake completed booking let a customer rate any provider and
--     move that provider's public rating.
--   * A self-chosen price. A quote the customer wrote themselves could be accepted with accept_quote and then
--     paid through the normal payment path.
--   * Skipping dispatch. A job could be placed straight on any provider's job list, and it opened a chat with
--     that provider (booking_messages_insert in 0013 only needs an assigned, active booking).
--
-- THE FIX, IN TWO LAYERS
--   1. Column privileges (the main lock). The signed-in role, authenticated, loses the table-wide INSERT
--      privilege and gets INSERT back on exactly the twenty columns the app sends in createBooking
--      (src/lib/bookings.ts). Every other column - id, status, created_at, the provider, quote and admin
--      fields, and any column added in the future - can no longer be named in a client insert at all, so it
--      always starts at its database default. The signed-out role, anon, gets no INSERT at all: it could never
--      create a booking anyway, because auth.uid() is null for it.
--   2. The insert policy (the backstop). bookings_insert_own is re-created with the same owner check plus the
--      starting values of the fields that matter most. If the table-wide INSERT privilege is ever given back
--      (for example by a blanket "grant ... on all tables" command), the policy still refuses any new booking
--      that does not start as a plain, unassigned, unquoted pending request.
--
-- REJECT, NEVER REWRITE
-- A client that sends a KwikServe-owned column gets an error and nothing is saved:
--     SQLSTATE 42501 "permission denied for table bookings"      (layer 1)
--     SQLSTATE 42501 "new row violates row-level security policy" (layer 2, only if layer 1 were removed)
-- No value is silently changed. The real app never sends these columns, so it keeps working unchanged.
--
-- WHO IS NOT AFFECTED
--   * The app: createBooking sends only the twenty granted columns. A guard test compares the two lists.
--   * service_role (Edge Functions, QA fixtures): keeps its table-wide privilege and is not subject to RLS.
--   * postgres (migrations, the SQL editor, and SECURITY DEFINER functions such as set_quote, accept_quote and
--     decline_quote): it owns the table, so neither layer applies to it.
--   * Admins: the admin app has no booking-creation feature. Admin dispatch, status and quote changes are
--     UPDATEs (bookings_update_admin in 0049 and the quote RPCs), which this migration does not touch.
--   * Existing bookings: no row is read or changed.
--
-- ROLLBACK of Part A (only if ever needed): a new migration that restores the table-wide INSERT for
-- authenticated and re-creates bookings_insert_own with its original check (auth.uid() = customer_id).

-- ----------------------------------------------------------------------------------------------------------
-- A1. Take away the table-wide INSERT privilege from every client role.
--     Revoking a table privilege also removes any column-level INSERT grants on that table, so after this
--     line no client role can insert into bookings at all. (PUBLIC holds no table privilege today; it is
--     listed so the statement stays correct even if that ever changes.)
-- ----------------------------------------------------------------------------------------------------------
revoke insert on table public.bookings from public, anon, authenticated;

-- ----------------------------------------------------------------------------------------------------------
-- A2. Give signed-in customers INSERT back on exactly the columns the app sends, and nothing else.
--     These are all things the customer legitimately chooses: what, where and when, plus the retry key and
--     the structured service answers. customer_id is still checked by the policy below.
--     A future column that customers must fill in has to be added to this list in a new migration; until
--     then a client insert that names it is refused.
-- ----------------------------------------------------------------------------------------------------------
grant insert (
  customer_id,                                   -- who: must equal auth.uid() (policy below)
  service_id, address, scheduled_for, notes,     -- what, where, when (0002)
  address_label, latitude, longitude,            -- structured address (0017)
  building_name, floor, door_number, landmark, access_notes,
  scheduling_type, time_window, window_start,    -- scheduling choices (0021)
  window_end, recurrence,
  idempotency_key,                               -- retry key for safe resubmission (0034 / 0039)
  service_details                                -- the customer's structured answers (0037)
) on table public.bookings to authenticated;

-- ----------------------------------------------------------------------------------------------------------
-- A3. Re-create the insert policy with the starting values pinned.
--     Same name and same owner check as 0002; the new lines say what a brand-new booking must look like.
--     status and quote_status must be 'pending' (their defaults). The provider, quote and admin fields must be
--     empty. created_at must be the database clock: now() is fixed for the whole transaction, so the default
--     always passes and a customer-chosen timestamp never does.
-- ----------------------------------------------------------------------------------------------------------
drop policy if exists "bookings_insert_own" on public.bookings;
create policy "bookings_insert_own" on public.bookings
  for insert
  with check (
    auth.uid() = customer_id
    and status = 'pending'
    and quote_status = 'pending'
    and quoted_amount is null
    and provider_share is null
    and assigned_provider_id is null
    and assigned_provider_name is null
    and assigned_provider_phone is null
    and admin_notes is null
    and created_at = now()
  );

-- ----------------------------------------------------------------------------------------------------------
-- A4. Self-check. Stop the migration (and undo everything above) if the privileges did not come out exactly
--     as intended in this database, for example because a role membership grants INSERT some other way.
--     has_table_privilege / has_column_privilege report EFFECTIVE privileges, including inherited ones.
-- ----------------------------------------------------------------------------------------------------------
do $$
declare
  client_columns constant text[] := array[
    'customer_id', 'service_id', 'address', 'scheduled_for', 'notes',
    'address_label', 'latitude', 'longitude', 'building_name', 'floor', 'door_number', 'landmark', 'access_notes',
    'scheduling_type', 'time_window', 'window_start', 'window_end', 'recurrence',
    'idempotency_key', 'service_details'
  ];
  col record;
begin
  if has_table_privilege('anon', 'public.bookings', 'INSERT')
     or has_table_privilege('authenticated', 'public.bookings', 'INSERT') then
    raise exception '0063 self-check: a client role still holds table-wide INSERT on public.bookings';
  end if;

  for col in
    select a.attname::text as name
    from pg_attribute a
    where a.attrelid = 'public.bookings'::regclass and a.attnum > 0 and not a.attisdropped
  loop
    if has_column_privilege('anon', 'public.bookings', col.name, 'INSERT') then
      raise exception '0063 self-check: anon can still insert bookings.%', col.name;
    end if;
    if has_column_privilege('authenticated', 'public.bookings', col.name, 'INSERT')
       is distinct from (col.name = any (client_columns)) then
      raise exception '0063 self-check: unexpected INSERT privilege for authenticated on bookings.%', col.name;
    end if;
  end loop;
end $$;

-- ==========================================================================================================
-- PART B (O1) - PROFILES: WHAT AN ADMIN MAY CHANGE
-- ==========================================================================================================
--
-- THE PROBLEM
-- profiles_update_admin (0003_admin_dispatch.sql:27) was
--     for update using (public.is_admin()) with check (public.is_admin())
-- It pins no column, so any admin could PATCH any profile through the API and change its role (including
-- making someone else an admin, or removing another admin), its account-deletion state (deleted_at,
-- deletion_status), the person's name and phone, and the counters that triggers compute (completed_jobs_count,
-- review_count and average_rating - the provider's public rating).
--
-- WHAT THE ADMIN WEB REALLY WRITES (apps/admin, through src/lib/providers.ts)
--     setProviderApproval         -> approval_status                            (provider list and detail)
--     adminUpdateProviderProfile  -> is_verified                                (Verify toggle)
--                                 -> availability_status                        (Availability toggle)
--                                 -> bio, years_experience, skills, profile_photo_url, availability_status
--                                                                               (Save profile)
-- Nothing else in the admin web updates profiles. A guard test compares this list with the admin screens.
--
-- THE FIX
-- Re-create profiles_update_admin with the same admin check, and pin every OTHER column to the value it already
-- has. "Pin" is the pattern 0009 uses: (select p.col from public.profiles p where p.id = profiles.id) reads the
-- row as it was before this update, so the new value must equal the old one. IS NOT DISTINCT FROM is used for
-- columns that may be NULL (plain = would refuse NULL = NULL). Changing id is refused as well: the lookups then
-- find no row, and every pin on a NOT NULL column fails.
--
-- NOT AFFECTED: triggers and SECURITY DEFINER functions (they run as postgres, the table owner, and skip RLS -
-- so the rating and job counters keep updating), account deletion (service role and definer functions), QA
-- fixtures (service role), and a user's own profile edits (Part C). A role or contact change for a real person
-- is done in the SQL editor, the same way admins are created today.
-- ----------------------------------------------------------------------------------------------------------
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update
  using (public.is_admin())
  with check (
    public.is_admin()
    -- who the person is, and what they may do
    and role = (select p.role from public.profiles p where p.id = profiles.id)
    and full_name is not distinct from (select p.full_name from public.profiles p where p.id = profiles.id)
    and phone is not distinct from (select p.phone from public.profiles p where p.id = profiles.id)
    and created_at = (select p.created_at from public.profiles p where p.id = profiles.id)
    -- the account-deletion state (0056)
    and deleted_at is not distinct from (select p.deleted_at from public.profiles p where p.id = profiles.id)
    and deletion_status = (select p.deletion_status from public.profiles p where p.id = profiles.id)
    -- computed by triggers from completed jobs and reviews
    and completed_jobs_count = (select p.completed_jobs_count from public.profiles p where p.id = profiles.id)
    and review_count = (select p.review_count from public.profiles p where p.id = profiles.id)
    and average_rating is not distinct from (select p.average_rating from public.profiles p where p.id = profiles.id)
  );

-- ==========================================================================================================
-- PART C (O3) - PROFILES: WHAT A USER MAY CHANGE ON THEIR OWN PROFILE
-- ==========================================================================================================
--
-- THE PROBLEM
-- profiles_update_own (latest version: 0009_pin_review_count.sql:7-19) pins role, approval_status,
-- is_verified, completed_jobs_count, review_count and average_rating. It was written before 0056 added
-- deleted_at and deletion_status, so a signed-in user could rewrite their own deletion state through the API:
-- for example set deleted_at themselves, which fires the tombstone redaction trigger and blocks their own
-- access, without the checks the real deletion flow makes first (open bookings, money owed, legal holds).
--
-- THE FIX
-- Re-create it: the 0009 expression unchanged, plus the two new pins. Name, phone and a provider's own editable
-- fields stay editable. The real deletion flow is unaffected: it runs as the service role and in SECURITY
-- DEFINER functions, which skip RLS.
-- ----------------------------------------------------------------------------------------------------------
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and approval_status = (select p.approval_status from public.profiles p where p.id = auth.uid())
    and is_verified = (select p.is_verified from public.profiles p where p.id = auth.uid())
    and completed_jobs_count = (select p.completed_jobs_count from public.profiles p where p.id = auth.uid())
    and review_count = (select p.review_count from public.profiles p where p.id = auth.uid())
    and average_rating is not distinct from (select p.average_rating from public.profiles p where p.id = auth.uid())
    -- NEW: the account-deletion state (0056) belongs to the deletion flow, not to the API.
    and deleted_at is not distinct from (select p.deleted_at from public.profiles p where p.id = auth.uid())
    and deletion_status = (select p.deletion_status from public.profiles p where p.id = auth.uid())
  );

-- ROLLBACK of Parts B and C (only if ever needed): a new migration that re-creates the two policies with their
-- previous expressions (0003_admin_dispatch.sql:27 and 0009_pin_review_count.sql:7-19).
