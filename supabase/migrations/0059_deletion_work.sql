-- ============================================================================================
-- 0059 — Durable deletion work: cleanup intents, account-level recovery, holds, upload controls
-- ============================================================================================
--
-- WHAT THIS ADDS. Account deletion (0056) tombstones the profile in one transaction and then asks
-- Auth to remove the identity. Nothing tracked the person's booking photos, nothing retried an
-- interrupted auth deletion except the user re-invoking the function, and a single status column
-- had to describe two independent outcomes. This migration adds:
--
--   1. Independent state on account_deletions: access_state, auth_state, cleanup_state, each with
--      its own lease/attempt bookkeeping, so "auth deleted, photos pending" and "auth pending,
--      photos done" are both representable and both true.
--   2. deletion_photo_intents: one durable row per object the person uploaded, created INSIDE the
--      delete_account transaction (0060) and swept again by the worker, so no object can be
--      forgotten between the tombstone and the end of cleanup.
--   3. legal_holds / legal_hold_items: legal holds and support-case holds applied through ONE
--      routine under ONE lock order, with an honest per-item outcome ("held" only when the object
--      still exists; "already removed" when it does not).
--   4. Service-only routines that give the worker exactly the storage.objects facts it needs
--      (present? which id?) without exposing the storage schema to any client.
--   5. A tightened storage INSERT policy: a tombstoned identity can no longer add objects, and an
--      authenticated upload must target a booking the uploader is party to.
--   6. A worker tick that does nothing until an operator configures it. No schedule is created
--      here and no credential is stored here.
--
-- LOCK ORDER (every routine follows it, including ordinary row locks, so no two can deadlock):
--   (1) pg_advisory_xact_lock('deletion:user:<user_id>')     when the user is known
--   (2) account_deletions row, FOR UPDATE                     account-level routines only
--   (3) pg_advisory_xact_lock('deletion:booking:<booking>')  ascending, when bookings are known
--   (4) deletion_photo_intents rows, ORDER BY id, FOR UPDATE
-- Consequences that keep the order acyclic:
--   * try_complete_cleanup / record_auth_result take (1) then (2); the inventory then takes (3)
--     and inserts intents (no (4) locks).
--   * apply_hold, release_hold and the support-case trigger take (3) then (4) and NEVER touch an
--     account_deletions row. A released hold is picked up lazily: list_cleanup_candidates selects
--     accounts with re-planned intents and try_complete_cleanup reopens them under (1)-(2).
--     (The earlier design updated account_deletions from release_hold — (3) then (2) — which could
--     deadlock with try_complete_cleanup holding (2) and waiting for (3). Removed.)
--   * authorize_destroy / record_destroy_result / finish_intent take (1), (3), (4) only.
-- delete_account (0060) holds the profiles row lock first, then inserts its own (invisible)
-- account_deletions row, then takes (1) and (3); nothing here ever locks profiles.
--
-- DESTRUCTIVE AUTHORISATION BOUNDARY. `authorize_destroy` commits state 'destroying'. Before that
-- commit a hold wins; after it the Storage delete may already have happened, so a hold records
-- 'authorized_before_hold' for that item and never claims the object is preserved.
--
-- REPLACEMENT SAFETY (the object at a path must be the object whose id was verified). The
-- Storage API deletes by path with no id or etag precondition, so the guarantee is built at the
-- policy layer instead: a path that has EVER been inventoried is RETIRED for every RLS-governed
-- client, for the lifetime of its intent row (which is deletion evidence and outlives any worker
-- execution by months). Retirement, not a temporary freeze, is what makes a stale worker's
-- path-based removal harmless: after another worker has removed and verified the object, no
-- client can put a new object at that path, so a late removal call finds nothing. A second,
-- independent bound: the worker refuses to call Storage unless its lease still has more than the
-- Storage call's own timeout left, and the platform's wall-clock limit on a function invocation
-- is shorter than the lease, so a worker cannot be alive past its lease.
-- The ways a path in this bucket can be written, and what stops each while retired:
--   * upload (POST /object, standard or resumable)        INSERT policy: denied on a frozen path
--   * upload with x-upsert, move, rename                    UPDATE policy: none exists → denied
--   * copy INTO the path                                    INSERT policy (destination): denied
--   * delete then re-create (admins)                        DELETE policy: denied on a frozen path
--   * service role, database superuser, direct S3           outside RLS; trusted operators only;
--                                                           the post-removal re-read detects them
-- The worker is the only service-role writer to this bucket and works one intent at a time under
-- a lease. A guard test asserts no UPDATE policy on storage.objects exists in any migration.
-- Operational consequence of retirement: a legitimate client never needs to reuse a path (uploads
-- use a fresh random name each time); an attempt to reuse a retired path is refused by policy.
--
-- UPLOADS IN FLIGHT AT DELETION. Storage checks the INSERT policy when an upload STARTS and writes
-- the object row when it FINISHES, so an upload begun before the tombstone can land after the
-- inventory. The UPLOAD BOUNDARY is db_completed_at + 24 hours: the resumable-upload URL lifetime
-- documented by the platform, taken as the longest any upload started before the tombstone can
-- still complete. This is a documented figure, not something these tests prove; the connected
-- certification records what the platform actually does. Completion is honest about it:
--   pending      known work outstanding (intents to process, or the settling window)
--   provisional  every known intent is terminal, but the boundary has not passed; periodic sweeps
--                keep looking for late objects and reopen work when one lands
--   complete     the boundary has passed AND a final sweep at or after the boundary found nothing
--                the person still owns; only then is the account closed
-- A worker outage across the boundary delays finalisation (the account stays provisional and is
-- selected on the next run) — it never ends checking silently.
--
-- WHAT A LEASE DOES AND DOES NOT DO. `lease_id` fences DATABASE writes: every transition checks it
-- and a stale worker's write affects zero rows. It does not fence the Storage API; that call is
-- unconditional by path. Safety there comes from (a) issuing it only after the worker's own fenced
-- 'destroying' transition succeeded and (b) reading storage.objects before and after and deciding
-- from those reads, never from the API's response alone (the API answers 200 [] for "missing",
-- "not permitted" and "already removed" alike — verified on QA 2026-09-23).
--
-- Applied migrations 0056 and 0058 are not modified. 0060 re-creates delete_account.

-- ── 1. account_deletions: independent dimensions ──────────────────────────────────────────
alter table public.account_deletions
  add column if not exists access_state text not null default 'active'
    check (access_state in ('active', 'revoked')),
  add column if not exists auth_state text not null default 'not_started'
    check (auth_state in ('not_started', 'pending_retry', 'deleted', 'needs_operator')),
  add column if not exists cleanup_state text not null default 'not_started'
    check (cleanup_state in ('not_started', 'pending', 'provisional', 'complete', 'complete_with_retained', 'needs_operator')),
  add column if not exists cleanup_eligible_at timestamptz,
  add column if not exists cleanup_settled_at timestamptz,
  add column if not exists cleanup_boundary_at timestamptz,   -- upload boundary: db_completed_at + 24 h
  add column if not exists last_sweep_at timestamptz,
  add column if not exists final_sweep_at timestamptz,        -- set only by the sweep that finalised
  add column if not exists retained_exception_ref text,
  add column if not exists auth_lease_id uuid,
  add column if not exists auth_leased_until timestamptz,
  add column if not exists auth_next_attempt_at timestamptz,
  add column if not exists auth_last_error_class text
    check (auth_last_error_class in ('transient', 'permission', 'dependency', 'attempt_ceiling')),
  add column if not exists auth_last_error text,
  add column if not exists closed_at timestamptz;

-- Rows written before this migration described only the auth outcome. Map them so the worker
-- can finish their cleanup: access was revoked at tombstone; photos were never inventoried, so
-- cleanup is 'pending' and the first completion attempt will sweep them. Blocked rows are left
-- at their defaults (nothing happened to those accounts).
update public.account_deletions set
    access_state        = 'revoked',
    auth_state          = case status when 'deleted' then 'deleted' else 'pending_retry' end,
    cleanup_state       = 'pending',
    cleanup_eligible_at = now(),
    cleanup_boundary_at = coalesce(db_completed_at, now()) + interval '24 hours'
  where status in ('pending_auth_delete', 'deleted')
    and auth_state = 'not_started'
    and cleanup_state = 'not_started';

create index if not exists account_deletions_auth_work_idx
  on public.account_deletions (auth_state, auth_next_attempt_at)
  where status <> 'blocked';
create index if not exists account_deletions_cleanup_work_idx
  on public.account_deletions (cleanup_state, cleanup_eligible_at)
  where status <> 'blocked';

-- ── 2. Holds ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.legal_holds (
  id           uuid primary key default gen_random_uuid(),
  scope        text not null check (scope in ('booking', 'user')),
  booking_id   uuid references public.bookings (id) on delete restrict,
  user_id      uuid references public.profiles (id) on delete restrict,
  source       text not null check (source in ('legal', 'case')),
  case_id      uuid references public.support_cases (id) on delete restrict,
  reference    text not null check (char_length(btrim(reference)) between 1 and 200),
  placed_by    uuid references public.profiles (id),
  placed_at    timestamptz not null default now(),
  released_at  timestamptz,
  released_by  uuid references public.profiles (id),
  release_note text,
  check ((scope = 'booking' and booking_id is not null) or (scope = 'user' and user_id is not null)),
  check (source <> 'case' or case_id is not null)
);
alter table public.legal_holds enable row level security;
create unique index if not exists legal_holds_one_active_per_case_idx
  on public.legal_holds (case_id) where source = 'case' and released_at is null;
create index if not exists legal_holds_active_booking_idx
  on public.legal_holds (booking_id) where released_at is null;
create index if not exists legal_holds_active_user_idx
  on public.legal_holds (user_id) where released_at is null;

create table if not exists public.legal_hold_items (
  id          uuid primary key default gen_random_uuid(),
  hold_id     uuid not null references public.legal_holds (id) on delete restrict,
  intent_id   uuid not null,
  outcome     text not null check (outcome in
                ('held', 'authorized_before_hold', 'already_removed', 'already_absent')),
  recorded_at timestamptz not null default now()
);
alter table public.legal_hold_items enable row level security;
create index if not exists legal_hold_items_hold_idx on public.legal_hold_items (hold_id);

-- ── 3. Photo cleanup intents ──────────────────────────────────────────────────────────────
-- One row per object the person uploaded. `expected_object_id` is storage.objects.id at
-- inventory time; destruction is refused when the object at the path no longer has that id.
create table if not exists public.deletion_photo_intents (
  id                    uuid primary key default gen_random_uuid(),
  account_deletion_id   uuid not null references public.account_deletions (id) on delete restrict,
  user_id               uuid not null references public.profiles (id) on delete restrict,
  booking_id            uuid,                       -- from the path prefix; no FK (booking may be gone)
  photo_id              uuid,                       -- booking_photos.id at inventory; null for an orphan object
  bucket_id             text not null default 'booking-photos',
  object_path           text not null,
  expected_object_id    uuid,                       -- null when no object existed at inventory
  state                 text not null default 'planned' check (state in
                          ('planned', 'held', 'destroying', 'object_removed', 'object_absent',
                           'verified', 'needs_operator')),
  outcome               text check (outcome in ('removed', 'absent')),
  hold_id               uuid references public.legal_holds (id),
  lease_id              uuid,
  leased_until          timestamptz,
  attempts              integer not null default 0,
  next_attempt_at       timestamptz,
  last_error_class      text check (last_error_class in
                          ('permission', 'transient', 'ambiguous', 'identity_mismatch',
                           'row_delete_failed', 'attempt_ceiling')),
  last_error            text,
  destroy_authorized_at timestamptz,
  object_removed_at     timestamptz,
  verified_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (account_deletion_id, bucket_id, object_path)
);
alter table public.deletion_photo_intents enable row level security;
create index if not exists deletion_photo_intents_work_idx
  on public.deletion_photo_intents (state, next_attempt_at, leased_until);
create index if not exists deletion_photo_intents_deletion_idx
  on public.deletion_photo_intents (account_deletion_id);
create index if not exists deletion_photo_intents_booking_idx
  on public.deletion_photo_intents (booking_id);

-- ── 4. Internal helpers (not callable by any client role) ─────────────────────────────────
create or replace function public._deletion_lock(p_user uuid, p_booking uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  -- Lock order (1) then (2). Advisory xact locks are re-entrant within a transaction, so a
  -- caller that already holds the user lock may take it again while iterating bookings.
  if p_user is not null then
    perform pg_advisory_xact_lock(hashtext('deletion:user:' || p_user::text));
  end if;
  if p_booking is not null then
    perform pg_advisory_xact_lock(hashtext('deletion:booking:' || p_booking::text));
  end if;
end;
$$;
revoke execute on function public._deletion_lock(uuid, uuid) from public, anon, authenticated, service_role;

-- The earliest active hold covering this user or this booking, or null.
create or replace function public._deletion_active_hold(p_user uuid, p_booking uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select h.id
    from public.legal_holds h
   where h.released_at is null
     and ((h.scope = 'user' and h.user_id = p_user)
          or (h.scope = 'booking' and p_booking is not null and h.booking_id = p_booking))
   order by h.placed_at, h.id
   limit 1;
$$;
revoke execute on function public._deletion_active_hold(uuid, uuid) from public, anon, authenticated, service_role;

-- A path is RETIRED once any intent has ever been recorded for it, whatever the intent's state.
-- Lifetime: as long as the intent row exists (deletion evidence). Called from the storage
-- policies, so it must be executable by the client roles; it reveals nothing but a boolean.
create or replace function public.deletion_path_frozen(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.deletion_photo_intents i
     where i.bucket_id = p_bucket and i.object_path = p_name
  );
$$;
revoke execute on function public.deletion_path_frozen(text, text) from public;
grant execute on function public.deletion_path_frozen(text, text) to anon, authenticated, service_role;

-- The booking a path belongs to, or null. Only a strictly well-formed UUID prefix is parsed (the
-- CASE guarantees the cast is never attempted otherwise), and only an EXISTING booking is
-- associated; anything else is inventoried under the user with a null booking. Paths that the
-- old open policy allowed (malformed, non-booking, unknown booking) are therefore still swept.
create or replace function public._deletion_booking_of_path(p_name text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.id
    from public.bookings b
   where b.id = (case when split_part(coalesce(p_name, ''), '/', 1)
                        ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                      then split_part(p_name, '/', 1)::uuid end);
$$;
revoke execute on function public._deletion_booking_of_path(text) from public, anon, authenticated, service_role;

create or replace function public._deletion_backoff(p_attempts integer)
returns interval
language sql
immutable
as $$
  select case
    when p_attempts <= 1 then interval '1 minute'
    when p_attempts = 2  then interval '5 minutes'
    when p_attempts = 3  then interval '15 minutes'
    when p_attempts = 4  then interval '1 hour'
    else interval '4 hours' end;
$$;
revoke execute on function public._deletion_backoff(integer) from public, anon, authenticated, service_role;

-- Inventory: every object the person uploaded, from the metadata table AND from storage.objects
-- by owner (an object whose metadata insert never happened is still theirs). Idempotent: a path
-- already inventoried for this deletion is skipped. Returns the number of NEW intents.
create or replace function public._deletion_inventory(p_deletion_id uuid, p_user uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_b uuid;
  v_new integer := 0;
begin
  perform public._deletion_lock(p_user, null);
  for v_b in
    select distinct x.b from (
      select bp.booking_id as b
        from public.booking_photos bp
       where bp.uploaded_by = p_user
      union
      select public._deletion_booking_of_path(so.name) as b
        from storage.objects so
       where so.bucket_id = 'booking-photos' and so.owner_id = p_user::text
    ) x
    where x.b is not null
    order by x.b
  loop
    perform public._deletion_lock(null, v_b);
  end loop;

  with candidates as (
    select bp.id as photo_id, bp.booking_id, bp.photo_url as object_path, so.id as object_id
      from public.booking_photos bp
      left join storage.objects so
        on so.bucket_id = 'booking-photos' and so.name = bp.photo_url
     where bp.uploaded_by = p_user
    union all
    select null::uuid,
           public._deletion_booking_of_path(so.name),
           so.name,
           so.id
      from storage.objects so
     where so.bucket_id = 'booking-photos'
       and so.owner_id = p_user::text
       and not exists (select 1 from public.booking_photos bp where bp.photo_url = so.name)
  ), ins as (
    insert into public.deletion_photo_intents
      (account_deletion_id, user_id, booking_id, photo_id, bucket_id, object_path,
       expected_object_id, state, hold_id)
    select p_deletion_id, p_user, c.booking_id, c.photo_id, 'booking-photos', c.object_path,
           c.object_id,
           case when public._deletion_active_hold(p_user, c.booking_id) is not null
                then 'held' else 'planned' end,
           public._deletion_active_hold(p_user, c.booking_id)
      from candidates c
    on conflict (account_deletion_id, bucket_id, object_path) do nothing
    returning id, hold_id
  ), items as (
    insert into public.legal_hold_items (hold_id, intent_id, outcome)
    select ins.hold_id, ins.id, 'held' from ins where ins.hold_id is not null
    returning 1
  )
  select count(*) into v_new from ins;
  return v_new;
end;
$$;
revoke execute on function public._deletion_inventory(uuid, uuid) from public, anon, authenticated, service_role;

-- ── 5. Worker routines (service role only) ────────────────────────────────────────────────
-- Claim: lease eligible intents. Eligibility = a state with work left, no live lease, no
-- backoff pending. Two workers cannot claim the same row (FOR UPDATE SKIP LOCKED), and a row
-- whose lease expired is claimable again — its previous holder is then fenced out by lease_id.
create or replace function public.claim_deletion_work(p_limit integer default 25)
returns table (
  intent_id uuid, lease_id uuid, leased_until timestamptz, state text, bucket_id text, object_path text,
  booking_id uuid, user_id uuid, photo_id uuid, attempts integer
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with picked as (
    select i.id
      from public.deletion_photo_intents i
     where i.state in ('planned', 'destroying', 'object_removed', 'object_absent')
       and (i.leased_until is null or i.leased_until < now())
       and (i.next_attempt_at is null or i.next_attempt_at <= now())
     order by i.created_at, i.id
     limit greatest(1, least(coalesce(p_limit, 25), 100))
     for update skip locked
  )
  -- The lease (10 minutes) exceeds the platform's wall-clock limit on one function invocation,
  -- so a worker cannot still be executing when its lease expires and another worker resumes.
  update public.deletion_photo_intents i
     set lease_id = gen_random_uuid(), leased_until = now() + interval '10 minutes', updated_at = now()
    from picked
   where i.id = picked.id
  returning i.id, i.lease_id, i.leased_until, i.state, i.bucket_id, i.object_path, i.booking_id,
            i.user_id, i.photo_id, i.attempts;
end;
$$;
revoke execute on function public.claim_deletion_work(integer) from public, anon, authenticated;
grant execute on function public.claim_deletion_work(integer) to service_role;

-- Authorise destruction. This is the boundary: once 'destroying' commits, a hold can no longer
-- protect the object. Refuses on a lost lease, an active hold, an absent object, or an object
-- whose id is not the inventoried one (replacement). A 'destroying' intent whose worker died is
-- resumed through the same checks.
create or replace function public.authorize_destroy(p_intent uuid, p_lease uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  i public.deletion_photo_intents%rowtype;
  v_hold uuid;
  v_obj uuid;
begin
  select * into i from public.deletion_photo_intents where id = p_intent;
  if not found then
    return jsonb_build_object('authorized', false, 'reason', 'missing');
  end if;
  perform public._deletion_lock(i.user_id, i.booking_id);
  select * into i from public.deletion_photo_intents where id = p_intent for update;

  if i.lease_id is distinct from p_lease or i.leased_until is null or i.leased_until < now() then
    return jsonb_build_object('authorized', false, 'reason', 'lease_lost');
  end if;
  if i.state not in ('planned', 'destroying') then
    return jsonb_build_object('authorized', false, 'reason', 'state:' || i.state);
  end if;

  if i.state = 'planned' then
    v_hold := public._deletion_active_hold(i.user_id, i.booking_id);
    if v_hold is not null then
      update public.deletion_photo_intents
         set state = 'held', hold_id = v_hold, lease_id = null, leased_until = null, updated_at = now()
       where id = p_intent;
      insert into public.legal_hold_items (hold_id, intent_id, outcome) values (v_hold, p_intent, 'held');
      return jsonb_build_object('authorized', false, 'reason', 'held');
    end if;
  end if;

  select so.id into v_obj
    from storage.objects so
   where so.bucket_id = i.bucket_id and so.name = i.object_path;

  if v_obj is null then
    -- Nothing to destroy. If we had already authorised (interrupted attempt), we cannot know
    -- whether our call removed it, so the outcome is recorded as 'absent', not 'removed'.
    update public.deletion_photo_intents
       set state = 'object_absent', outcome = 'absent',
           last_error = case when i.state = 'destroying'
                             then 'absent when resumed after an interrupted destruction' end,
           updated_at = now()
     where id = p_intent;
    return jsonb_build_object('authorized', false, 'reason', 'absent');
  end if;

  if i.expected_object_id is null or v_obj <> i.expected_object_id then
    update public.deletion_photo_intents
       set state = 'needs_operator', last_error_class = 'identity_mismatch',
           last_error = 'the object at this path is not the inventoried object',
           lease_id = null, leased_until = null, updated_at = now()
     where id = p_intent;
    return jsonb_build_object('authorized', false, 'reason', 'identity_mismatch');
  end if;

  update public.deletion_photo_intents
     set state = 'destroying',
         destroy_authorized_at = coalesce(destroy_authorized_at, now()),
         updated_at = now()
   where id = p_intent;
  return jsonb_build_object('authorized', true, 'bucket_id', i.bucket_id, 'object_path', i.object_path);
end;
$$;
revoke execute on function public.authorize_destroy(uuid, uuid) from public, anon, authenticated;
grant execute on function public.authorize_destroy(uuid, uuid) to service_role;

-- Record what the Storage call reported, then decide from storage.objects, not from the report:
--   api_ok_item     API returned the removed object       → removed if the row is gone
--   api_ok_empty    API returned []                        → absent if the row is gone (someone
--                                                            else removed it), ambiguous if not
--   api_permission  401/403                                → operator, immediately
--   api_transient   5xx / network                          → backoff, retry
create or replace function public.record_destroy_result(
  p_intent uuid, p_lease uuid, p_result text, p_detail text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  i public.deletion_photo_intents%rowtype;
  v_obj uuid;
  v_attempts integer;
begin
  if p_result not in ('api_ok_item', 'api_ok_empty', 'api_permission', 'api_transient') then
    raise exception 'invalid result';
  end if;
  select * into i from public.deletion_photo_intents where id = p_intent;
  if not found then return jsonb_build_object('recorded', false, 'reason', 'missing'); end if;
  perform public._deletion_lock(i.user_id, i.booking_id);
  select * into i from public.deletion_photo_intents where id = p_intent for update;
  if i.lease_id is distinct from p_lease then
    return jsonb_build_object('recorded', false, 'reason', 'lease_lost');
  end if;
  if i.state <> 'destroying' then
    return jsonb_build_object('recorded', false, 'reason', 'state:' || i.state);
  end if;

  v_attempts := i.attempts + 1;

  if p_result = 'api_permission' then
    update public.deletion_photo_intents
       set state = 'needs_operator', last_error_class = 'permission', last_error = left(p_detail, 500),
           attempts = v_attempts, lease_id = null, leased_until = null, updated_at = now()
     where id = p_intent;
    return jsonb_build_object('recorded', true, 'state', 'needs_operator');
  end if;

  if p_result = 'api_transient' then
    if v_attempts >= 10 then
      update public.deletion_photo_intents
         set state = 'needs_operator', last_error_class = 'attempt_ceiling', last_error = left(p_detail, 500),
             attempts = v_attempts, lease_id = null, leased_until = null, updated_at = now()
       where id = p_intent;
      return jsonb_build_object('recorded', true, 'state', 'needs_operator');
    end if;
    update public.deletion_photo_intents
       set last_error_class = 'transient', last_error = left(p_detail, 500), attempts = v_attempts,
           next_attempt_at = now() + public._deletion_backoff(v_attempts),
           lease_id = null, leased_until = null, updated_at = now()
     where id = p_intent;
    return jsonb_build_object('recorded', true, 'state', 'destroying', 'retry', true);
  end if;

  -- api_ok_*: the truth is in storage.objects.
  select so.id into v_obj
    from storage.objects so
   where so.bucket_id = i.bucket_id and so.name = i.object_path;

  if v_obj is null then
    update public.deletion_photo_intents
       set state = case when p_result = 'api_ok_item' then 'object_removed' else 'object_absent' end,
           outcome = case when p_result = 'api_ok_item' then 'removed' else 'absent' end,
           object_removed_at = case when p_result = 'api_ok_item' then now() end,
           last_error = case when p_result = 'api_ok_empty'
                             then 'the API reported no item; the object was already gone' end,
           attempts = v_attempts, updated_at = now()
     where id = p_intent;
    return jsonb_build_object('recorded', true,
      'state', case when p_result = 'api_ok_item' then 'object_removed' else 'object_absent' end);
  end if;

  if v_obj <> i.expected_object_id then
    update public.deletion_photo_intents
       set state = 'needs_operator', last_error_class = 'identity_mismatch',
           last_error = 'an object with a different id is at this path after the destruction call; '
                        || 'the inventoried object may or may not have been removed',
           attempts = v_attempts, lease_id = null, leased_until = null, updated_at = now()
     where id = p_intent;
    return jsonb_build_object('recorded', true, 'state', 'needs_operator');
  end if;

  -- The API said OK, yet the inventoried object is still there: ambiguous (a policy or a
  -- silent failure). Retry with backoff; escalate at the ceiling.
  if v_attempts >= 10 then
    update public.deletion_photo_intents
       set state = 'needs_operator', last_error_class = 'attempt_ceiling',
           last_error = 'object still present after repeated destruction calls',
           attempts = v_attempts, lease_id = null, leased_until = null, updated_at = now()
     where id = p_intent;
    return jsonb_build_object('recorded', true, 'state', 'needs_operator');
  end if;
  update public.deletion_photo_intents
     set last_error_class = 'ambiguous', last_error = 'API reported success but the object is still present',
         attempts = v_attempts, next_attempt_at = now() + public._deletion_backoff(v_attempts),
         lease_id = null, leased_until = null, updated_at = now()
   where id = p_intent;
  return jsonb_build_object('recorded', true, 'state', 'destroying', 'retry', true);
end;
$$;
revoke execute on function public.record_destroy_result(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_destroy_result(uuid, uuid, text, text) to service_role;

-- Metadata cleanup and verification. Only from object_removed / object_absent. Deletes the
-- inventoried metadata row (by id AND path), then verifies by reading both tables; 'verified'
-- is set only when neither the object nor any metadata row for the path remains.
create or replace function public.finish_intent(p_intent uuid, p_lease uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  i public.deletion_photo_intents%rowtype;
  v_obj uuid;
  v_rows integer;
begin
  select * into i from public.deletion_photo_intents where id = p_intent;
  if not found then return jsonb_build_object('verified', false, 'reason', 'missing'); end if;
  perform public._deletion_lock(i.user_id, i.booking_id);
  select * into i from public.deletion_photo_intents where id = p_intent for update;
  if i.lease_id is distinct from p_lease then
    return jsonb_build_object('verified', false, 'reason', 'lease_lost');
  end if;
  if i.state not in ('object_removed', 'object_absent') then
    return jsonb_build_object('verified', false, 'reason', 'state:' || i.state);
  end if;

  if i.photo_id is not null then
    delete from public.booking_photos where id = i.photo_id and photo_url = i.object_path;
  end if;
  delete from public.booking_photos where photo_url = i.object_path and uploaded_by = i.user_id;

  select so.id into v_obj
    from storage.objects so
   where so.bucket_id = i.bucket_id and so.name = i.object_path;
  select count(*) into v_rows from public.booking_photos where photo_url = i.object_path;

  if v_obj is not null then
    update public.deletion_photo_intents
       set state = 'needs_operator', last_error_class = 'ambiguous',
           last_error = 'an object is present at the path at verification time',
           lease_id = null, leased_until = null, updated_at = now()
     where id = p_intent;
    return jsonb_build_object('verified', false, 'reason', 'object_present');
  end if;
  if v_rows > 0 then
    update public.deletion_photo_intents
       set state = 'needs_operator', last_error_class = 'row_delete_failed',
           last_error = 'a metadata row for the path remains after deletion',
           lease_id = null, leased_until = null, updated_at = now()
     where id = p_intent;
    return jsonb_build_object('verified', false, 'reason', 'row_present');
  end if;

  update public.deletion_photo_intents
     set state = 'verified', verified_at = now(),
         outcome = coalesce(outcome, case when i.state = 'object_removed' then 'removed' else 'absent' end),
         lease_id = null, leased_until = null, updated_at = now()
   where id = p_intent;
  return jsonb_build_object('verified', true, 'outcome',
    coalesce(i.outcome, case when i.state = 'object_removed' then 'removed' else 'absent' end));
end;
$$;
revoke execute on function public.finish_intent(uuid, uuid) from public, anon, authenticated;
grant execute on function public.finish_intent(uuid, uuid) to service_role;

-- Account-level auth work. 'not_started' rows are the ones the Edge Function never got to finish
-- (it crashed between the database phase and the auth call); they become claimable two minutes
-- after the database phase so an in-flight request is not raced by the worker.
create or replace function public.claim_auth_work(p_limit integer default 10)
returns table (deletion_id uuid, user_id uuid, lease_id uuid, attempts integer)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with picked as (
    select d.id
      from public.account_deletions d
     where d.status <> 'blocked'
       and d.db_completed_at is not null
       and d.auth_state in ('not_started', 'pending_retry')
       and (d.auth_leased_until is null or d.auth_leased_until < now())
       and (d.auth_next_attempt_at is null or d.auth_next_attempt_at <= now())
       and (d.auth_state <> 'not_started' or d.db_completed_at < now() - interval '2 minutes')
     order by d.db_completed_at, d.id
     limit greatest(1, least(coalesce(p_limit, 10), 100))
     for update skip locked
  )
  update public.account_deletions d
     set auth_lease_id = gen_random_uuid(), auth_leased_until = now() + interval '10 minutes'
    from picked
   where d.id = picked.id
  returning d.id, d.user_id, d.auth_lease_id, d.auth_attempts;
end;
$$;
revoke execute on function public.claim_auth_work(integer) from public, anon, authenticated;
grant execute on function public.claim_auth_work(integer) to service_role;

--   deleted     the identity is gone (including "already gone")
--   transient   retry with backoff
--   dependency  the platform refused because something still references the identity (for
--               example owned storage objects, if the platform enforces that); retry after
--               cleanup has had time to run
--   permission  operator, immediately
create or replace function public.record_auth_result(
  p_deletion uuid, p_lease uuid, p_result text, p_detail text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  d public.account_deletions%rowtype;
  v_attempts integer;
begin
  if p_result not in ('deleted', 'transient', 'dependency', 'permission') then
    raise exception 'invalid result';
  end if;
  select * into d from public.account_deletions where id = p_deletion;
  if not found then return jsonb_build_object('recorded', false, 'reason', 'missing'); end if;
  perform public._deletion_lock(d.user_id, null);
  select * into d from public.account_deletions where id = p_deletion for update;
  if d.auth_lease_id is distinct from p_lease then
    return jsonb_build_object('recorded', false, 'reason', 'lease_lost');
  end if;
  if d.auth_state not in ('not_started', 'pending_retry') then
    return jsonb_build_object('recorded', false, 'reason', 'state:' || d.auth_state);
  end if;
  v_attempts := d.auth_attempts + 1;

  if p_result = 'deleted' then
    update public.account_deletions
       set auth_state = 'deleted', status = 'deleted',
           auth_deleted_at = coalesce(auth_deleted_at, now()), auth_attempts = v_attempts,
           auth_lease_id = null, auth_leased_until = null, auth_next_attempt_at = null,
           closed_at = case when cleanup_state in ('complete', 'complete_with_retained')
                            then coalesce(closed_at, now()) end
     where id = p_deletion;
    update public.profiles set deletion_status = 'deleted'
     where id = d.user_id and deletion_status = 'pending_auth_delete';
    return jsonb_build_object('recorded', true, 'auth_state', 'deleted');
  end if;

  -- A dependency refusal while objects are RETAINED UNDER A HOLD cannot resolve itself: cleanup
  -- is finished by decision, so retrying would loop until the ceiling. Operator, immediately.
  if p_result = 'dependency'
     and (d.cleanup_state = 'complete_with_retained'
          or (d.cleanup_state = 'provisional'
              and exists (select 1 from public.deletion_photo_intents i
                           where i.account_deletion_id = p_deletion and i.state = 'held')
              and not exists (select 1 from public.deletion_photo_intents i
                               where i.account_deletion_id = p_deletion
                                 and i.state in ('planned', 'destroying', 'object_removed', 'object_absent')))) then
    update public.account_deletions
       set auth_state = 'needs_operator', auth_last_error_class = 'dependency',
           auth_last_error = left(coalesce(p_detail, '') || ' [held objects remain; operator decision needed]', 500),
           auth_attempts = v_attempts, auth_lease_id = null, auth_leased_until = null
     where id = p_deletion;
    return jsonb_build_object('recorded', true, 'auth_state', 'needs_operator');
  end if;

  if p_result = 'permission' or v_attempts >= 10 then
    update public.account_deletions
       set auth_state = 'needs_operator',
           auth_last_error_class = case when p_result = 'permission' then 'permission' else 'attempt_ceiling' end,
           auth_last_error = left(p_detail, 500), auth_attempts = v_attempts,
           auth_lease_id = null, auth_leased_until = null
     where id = p_deletion;
    return jsonb_build_object('recorded', true, 'auth_state', 'needs_operator');
  end if;

  update public.account_deletions
     set auth_state = 'pending_retry', auth_last_error_class = p_result,
         auth_last_error = left(p_detail, 500), auth_attempts = v_attempts,
         auth_next_attempt_at = now() + case when p_result = 'dependency'
                                             then greatest(interval '10 minutes', public._deletion_backoff(v_attempts))
                                             else public._deletion_backoff(v_attempts) end,
         auth_lease_id = null, auth_leased_until = null
   where id = p_deletion;
  return jsonb_build_object('recorded', true, 'auth_state', 'pending_retry');
end;
$$;
revoke execute on function public.record_auth_result(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_auth_result(uuid, uuid, text, text) to service_role;

-- Completion: only after the settling window, only when no intent has work left, and only after
-- one more inventory sweep finds nothing new. An owned object that the inventory cannot cover
-- (for example a replacement at an already-verified path) sends the account to the operator
-- rather than being reported as complete.
create or replace function public.list_cleanup_candidates(p_limit integer default 25)
returns table (deletion_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select x.id from (
    -- pending accounts past the settling window
    select d.id, d.cleanup_eligible_at as due
      from public.account_deletions d
     where d.status <> 'blocked'
       and d.db_completed_at is not null
       and d.cleanup_state in ('not_started', 'pending')
       and d.cleanup_eligible_at is not null and d.cleanup_eligible_at <= now()
    union all
    -- provisional accounts: always once the boundary has passed (until a final sweep finalises
    -- them, however late the worker runs), and at most hourly before it
    select d.id, coalesce(d.last_sweep_at, d.cleanup_settled_at)
      from public.account_deletions d
     where d.status <> 'blocked'
       and d.cleanup_state = 'provisional'
       and (d.cleanup_boundary_at is null or d.cleanup_boundary_at <= now()
            or d.last_sweep_at is null or d.last_sweep_at < now() - interval '1 hour')
    union all
    -- settled accounts touched by a hold release: reopened or re-finalised here, lazily, so
    -- release_hold never has to lock an account_deletions row (lock order, header). Selected
    -- while open work exists, or while 'complete_with_retained' no longer retains anything.
    select d.id, d.cleanup_settled_at
      from public.account_deletions d
     where d.status <> 'blocked'
       and d.cleanup_state in ('provisional', 'complete_with_retained')
       and (exists (select 1 from public.deletion_photo_intents i
                     where i.account_deletion_id = d.id
                       and i.state in ('planned', 'destroying', 'object_removed', 'object_absent'))
            or (d.cleanup_state = 'complete_with_retained'
                and not exists (select 1 from public.deletion_photo_intents i
                                 where i.account_deletion_id = d.id and i.state = 'held')))
  ) x
  order by x.due, x.id
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;
revoke execute on function public.list_cleanup_candidates(integer) from public, anon, authenticated;
grant execute on function public.list_cleanup_candidates(integer) to service_role;

create or replace function public.try_complete_cleanup(p_deletion uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  d public.account_deletions%rowtype;
  v_new integer;
  v_refs text;
  v_state text;
begin
  select * into d from public.account_deletions where id = p_deletion;
  if not found then return jsonb_build_object('complete', false, 'reason', 'missing'); end if;
  perform public._deletion_lock(d.user_id, null);
  select * into d from public.account_deletions where id = p_deletion for update;

  -- 'complete' is terminal: the boundary passed and a final sweep found nothing.
  -- 'needs_operator' waits for a person. 'complete_with_retained' and 'provisional' can be
  -- reopened when a hold release re-plans intents (open work below).
  if d.cleanup_state = 'complete' then
    return jsonb_build_object('complete', true, 'cleanup_state', d.cleanup_state);
  end if;
  if d.cleanup_state = 'needs_operator' then
    return jsonb_build_object('complete', false, 'cleanup_state', d.cleanup_state);
  end if;
  if d.cleanup_state in ('not_started', 'pending')
     and (d.cleanup_eligible_at is null or d.cleanup_eligible_at > now()) then
    return jsonb_build_object('complete', false, 'reason', 'settling', 'cleanup_state', d.cleanup_state);
  end if;
  if exists (select 1 from public.deletion_photo_intents i
              where i.account_deletion_id = p_deletion
                and i.state in ('planned', 'destroying', 'object_removed', 'object_absent')) then
    if d.cleanup_state in ('provisional', 'complete_with_retained') then
      update public.account_deletions
         set cleanup_state = 'pending', cleanup_settled_at = null, final_sweep_at = null, closed_at = null
       where id = p_deletion;
      return jsonb_build_object('complete', false, 'reason', 'reopened', 'cleanup_state', 'pending');
    end if;
    return jsonb_build_object('complete', false, 'reason', 'work_pending', 'cleanup_state', d.cleanup_state);
  end if;
  -- 'complete_with_retained' with no open work falls through: the sweep, the checks and the
  -- boundary re-run, and the retained references are recomputed (a release may have emptied them).

  -- SWEEP (every path through here sweeps and then runs the uncovered-object check, so an object
  -- that reappears at an already-inventoried path — where ON CONFLICT inserts nothing — is still
  -- caught by the check below, never bypassed).
  v_new := public._deletion_inventory(p_deletion, d.user_id);
  update public.account_deletions set last_sweep_at = now() where id = p_deletion;
  if v_new > 0 then
    update public.account_deletions
       set cleanup_state = 'pending', cleanup_settled_at = null, final_sweep_at = null, closed_at = null
     where id = p_deletion;
    return jsonb_build_object('complete', false,
                              'reason', case when d.cleanup_state = 'provisional' then 'reopened' else 'new_intents' end,
                              'new_intents', v_new, 'cleanup_state', 'pending');
  end if;

  -- Anything the person still owns that is not covered by a held intent cannot be inventoried
  -- (the path was already used by a verified intent): operator.
  if exists (
       select 1 from storage.objects so
        where so.bucket_id = 'booking-photos' and so.owner_id = d.user_id::text
          and not exists (select 1 from public.deletion_photo_intents i
                           where i.account_deletion_id = p_deletion
                             and i.object_path = so.name and i.state = 'held'))
     or exists (
       select 1 from public.booking_photos bp
        where bp.uploaded_by = d.user_id
          and not exists (select 1 from public.deletion_photo_intents i
                           where i.account_deletion_id = p_deletion
                             and i.object_path = bp.photo_url and i.state = 'held')) then
    update public.account_deletions
       set cleanup_state = 'needs_operator', cleanup_settled_at = now() where id = p_deletion;
    return jsonb_build_object('complete', false, 'reason', 'uninventoried_owned_data',
                              'cleanup_state', 'needs_operator');
  end if;

  if exists (select 1 from public.deletion_photo_intents i
              where i.account_deletion_id = p_deletion and i.state = 'needs_operator') then
    update public.account_deletions
       set cleanup_state = 'needs_operator', cleanup_settled_at = now() where id = p_deletion;
    return jsonb_build_object('complete', false, 'cleanup_state', 'needs_operator');
  end if;

  select string_agg(distinct h.reference, '; ' order by h.reference) into v_refs
    from public.deletion_photo_intents i
    join public.legal_holds h on h.id = i.hold_id
   where i.account_deletion_id = p_deletion and i.state = 'held';

  -- Before the upload boundary: provisional. Everything known is done; late objects can still land.
  if d.cleanup_boundary_at is null or d.cleanup_boundary_at > now() then
    update public.account_deletions
       set cleanup_state = 'provisional', cleanup_settled_at = coalesce(cleanup_settled_at, now()),
           retained_exception_ref = v_refs
     where id = p_deletion;
    return jsonb_build_object('complete', false, 'reason', 'awaiting_boundary',
                              'cleanup_state', 'provisional', 'boundary_at', d.cleanup_boundary_at,
                              'retained_exception_ref', v_refs);
  end if;

  -- At or after the boundary, with this sweep clean: final.
  v_state := case when v_refs is not null then 'complete_with_retained' else 'complete' end;
  update public.account_deletions
     set cleanup_state = v_state, cleanup_settled_at = coalesce(cleanup_settled_at, now()),
         final_sweep_at = now(), retained_exception_ref = v_refs,
         closed_at = case when auth_state = 'deleted' then coalesce(closed_at, now()) end
   where id = p_deletion;
  return jsonb_build_object('complete', true, 'cleanup_state', v_state,
                            'retained_exception_ref', v_refs, 'final_sweep_at', now());
end;
$$;
revoke execute on function public.try_complete_cleanup(uuid) from public, anon, authenticated;
grant execute on function public.try_complete_cleanup(uuid) to service_role;

-- ── 6. Holds: one applying routine, two callers ───────────────────────────────────────────
create or replace function public.apply_hold(
  p_scope text, p_booking uuid, p_user uuid, p_source text, p_reference text,
  p_case_id uuid, p_placed_by uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_hold uuid;
  i record;
  v_outcome text;
  v_counts jsonb := '{}'::jsonb;
begin
  if p_scope not in ('booking', 'user') then raise exception 'invalid scope'; end if;
  if p_source not in ('legal', 'case') then raise exception 'invalid source'; end if;
  if p_scope = 'booking' and p_booking is null then raise exception 'booking required'; end if;
  if p_scope = 'user' and p_user is null then raise exception 'user required'; end if;
  if p_source = 'case' and p_case_id is null then raise exception 'case required'; end if;

  -- Lock order: user (when known), booking (when known), intent rows by id.
  perform public._deletion_lock(p_user, p_booking);

  insert into public.legal_holds (scope, booking_id, user_id, source, case_id, reference, placed_by)
    values (p_scope, p_booking, p_user, p_source, p_case_id, btrim(p_reference), p_placed_by)
    returning id into v_hold;

  for i in
    select * from public.deletion_photo_intents x
     where (p_scope = 'booking' and x.booking_id = p_booking)
        or (p_scope = 'user' and x.user_id = p_user)
     order by x.id
     for update
  loop
    v_outcome := case
      when i.state in ('planned', 'needs_operator') then 'held'
      when i.state = 'destroying' then 'authorized_before_hold'
      when i.state = 'object_removed' then 'already_removed'
      when i.state = 'object_absent' then 'already_absent'
      when i.state = 'verified' then case when i.outcome = 'removed' then 'already_removed' else 'already_absent' end
      when i.state = 'held' then 'held'
    end;
    if i.state in ('planned', 'needs_operator') then
      -- A needs_operator intent has not destroyed anything (destruction either did not start or
      -- was refused); the hold keeps it from being re-planned into destruction.
      update public.deletion_photo_intents
         set state = 'held', hold_id = v_hold, lease_id = null, leased_until = null, updated_at = now()
       where id = i.id;
    end if;
    insert into public.legal_hold_items (hold_id, intent_id, outcome) values (v_hold, i.id, v_outcome);
    v_counts := v_counts || jsonb_build_object(v_outcome, coalesce((v_counts ->> v_outcome)::int, 0) + 1);
  end loop;

  return jsonb_build_object('hold_id', v_hold, 'items', v_counts);
end;
$$;
revoke execute on function public.apply_hold(text, uuid, uuid, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.apply_hold(text, uuid, uuid, text, text, uuid, uuid) to service_role;

create or replace function public.release_hold(p_hold uuid, p_released_by uuid, p_note text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  h public.legal_holds%rowtype;
  v_replanned integer := 0;
  v_reassigned integer := 0;
  i record;
  v_other uuid;
begin
  select * into h from public.legal_holds where id = p_hold;
  if not found then return jsonb_build_object('released', false, 'reason', 'missing'); end if;
  if h.released_at is not null then return jsonb_build_object('released', true, 'already', true); end if;

  perform public._deletion_lock(h.user_id, h.booking_id);
  update public.legal_holds
     set released_at = now(), released_by = p_released_by, release_note = p_note
   where id = p_hold;

  for i in
    select * from public.deletion_photo_intents x
     where x.hold_id = p_hold and x.state = 'held'
     order by x.id
     for update
  loop
    v_other := public._deletion_active_hold(i.user_id, i.booking_id);
    if v_other is not null then
      update public.deletion_photo_intents set hold_id = v_other, updated_at = now() where id = i.id;
      insert into public.legal_hold_items (hold_id, intent_id, outcome) values (v_other, i.id, 'held');
      v_reassigned := v_reassigned + 1;
    else
      update public.deletion_photo_intents
         set state = 'planned', hold_id = null, next_attempt_at = null, updated_at = now()
       where id = i.id;
      v_replanned := v_replanned + 1;
    end if;
  end loop;
  -- Deliberately NO account_deletions write here (lock order, header): the account is reopened
  -- lazily by list_cleanup_candidates / try_complete_cleanup, which take the user and account
  -- locks before any booking lock. Re-planned intents are claimable immediately regardless.
  return jsonb_build_object('released', true, 'replanned', v_replanned, 'reassigned', v_reassigned);
end;
$$;
revoke execute on function public.release_hold(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.release_hold(uuid, uuid, text) to service_role;

-- Admin-facing wrappers (authenticated admins only; the check is inside).
create or replace function public.place_legal_hold(p_booking uuid, p_user uuid, p_reference text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if coalesce(btrim(p_reference), '') = '' then raise exception 'Reference required'; end if;
  if (p_booking is null) = (p_user is null) then raise exception 'Exactly one of booking or user'; end if;
  return public.apply_hold(case when p_booking is not null then 'booking' else 'user' end,
                           p_booking, p_user, 'legal', p_reference, null, auth.uid());
end;
$$;
revoke execute on function public.place_legal_hold(uuid, uuid, text) from public, anon;
grant execute on function public.place_legal_hold(uuid, uuid, text) to authenticated, service_role;

create or replace function public.release_legal_hold(p_hold uuid, p_note text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare v_source text;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  select source into v_source from public.legal_holds where id = p_hold;
  if v_source is distinct from 'legal' then raise exception 'Not a legal hold'; end if;
  return public.release_hold(p_hold, auth.uid(), p_note);
end;
$$;
revoke execute on function public.release_legal_hold(uuid, text) from public, anon;
grant execute on function public.release_legal_hold(uuid, text) to authenticated, service_role;

-- Case holds: a support case on a booking holds that booking's intents while it is open.
-- Reconciles the case's hold with its CURRENT booking and status, atomically with the case row
-- change. Reassignment is reachable (admins may update support_cases directly), so:
--   * an open case moved from booking A to booking B releases the hold on A (audit note
--     'case reassigned') and applies a hold on B — B's items get their own honest outcomes,
--     including 'authorized_before_hold' for anything already past the boundary;
--   * booking_id cleared releases the old hold;
--   * status and booking changed together are handled in the same pass.
-- Lock order: both bookings' advisory locks ascending before any hold routine runs, so a
-- concurrent B→A reassignment or destruction cannot deadlock with this one.
create or replace function public.tg_support_case_hold()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_open boolean := new.status in ('open', 'in_review', 'waiting_on_customer', 'waiting_on_provider');
  v_old_booking uuid := case when tg_op = 'UPDATE' then old.booking_id end;
  v_hold uuid;
  v_hold_booking uuid;
  v_b uuid;
begin
  if tg_op = 'UPDATE' and new.booking_id is not distinct from old.booking_id and new.status = old.status then
    return new;
  end if;
  for v_b in
    select distinct b from unnest(array[v_old_booking, new.booking_id]) as b where b is not null order by b
  loop
    perform public._deletion_lock(null, v_b);
  end loop;

  select h.id, h.booking_id into v_hold, v_hold_booking
    from public.legal_holds h
   where h.source = 'case' and h.case_id = new.id and h.released_at is null;

  if v_hold is not null and (not v_open or v_hold_booking is distinct from new.booking_id) then
    perform public.release_hold(v_hold, null,
      case when not v_open then 'case ' || new.status else 'case reassigned' end);
    v_hold := null;
  end if;
  if v_open and new.booking_id is not null and v_hold is null then
    perform public.apply_hold('booking', new.booking_id, null, 'case', 'case:' || new.id::text, new.id, null);
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_support_case_hold() from public, anon, authenticated, service_role;
drop trigger if exists trg_support_case_hold on public.support_cases;
create trigger trg_support_case_hold
  after insert or update of status, booking_id on public.support_cases
  for each row execute function public.tg_support_case_hold();

-- Authoritative existence read for one object, for certification and operators. Returns only a
-- boolean; the storage schema stays unexposed. (The Storage info endpoint's non-200 answers
-- cannot distinguish absence from permission or transport failures.)
create or replace function public.deletion_object_exists(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from storage.objects so where so.bucket_id = p_bucket and so.name = p_name);
$$;
revoke execute on function public.deletion_object_exists(text, text) from public, anon, authenticated;
grant execute on function public.deletion_object_exists(text, text) to service_role;

-- ── 7. Health (read-only) ─────────────────────────────────────────────────────────────────
create or replace function public.deletion_work_health()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'intents', (select coalesce(jsonb_object_agg(s.state, s.n), '{}'::jsonb)
                  from (select state, count(*) as n from public.deletion_photo_intents group by state) s),
    'auth',    (select coalesce(jsonb_object_agg(a.auth_state, a.n), '{}'::jsonb)
                  from (select auth_state, count(*) as n from public.account_deletions
                         where status <> 'blocked' group by auth_state) a),
    'cleanup', (select coalesce(jsonb_object_agg(c.cleanup_state, c.n), '{}'::jsonb)
                  from (select cleanup_state, count(*) as n from public.account_deletions
                         where status <> 'blocked' group by cleanup_state) c),
    'oldest_open_intent', (select min(created_at) from public.deletion_photo_intents
                            where state in ('planned', 'destroying', 'object_removed', 'object_absent')),
    'oldest_needs_operator', (select min(updated_at) from public.deletion_photo_intents where state = 'needs_operator'),
    'active_holds', (select count(*) from public.legal_holds where released_at is null),
    'retired_paths', (select count(*) from public.deletion_photo_intents),
    'bucket_objects', (select count(*) from storage.objects where bucket_id = 'booking-photos')
  );
$$;
revoke execute on function public.deletion_work_health() from public, anon, authenticated;
grant execute on function public.deletion_work_health() to service_role;

-- ── 8. Upload controls ────────────────────────────────────────────────────────────────────
-- 0006 allowed any authenticated identity to insert any object path in the bucket, and the 0056
-- restrictive policies cover public.* tables only. A tombstoned identity could therefore still
-- add an object after inventory. Now: active identities only, and only under a booking the
-- uploader is party to (or an admin). INSERT is the only client write the bucket allows.
drop policy if exists "booking_photos_obj_insert" on storage.objects;
create policy "booking_photos_obj_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'booking-photos'
    and public.is_active_user()
    and not public.deletion_path_frozen('booking-photos', storage.objects.name)
    and exists (
      select 1 from public.bookings b
       where b.id::text = split_part(storage.objects.name, '/', 1)
         and (b.customer_id = auth.uid() or b.assigned_provider_id = auth.uid() or public.is_admin())
    )
  );

-- Admin delete stays admin-only (0006) and is additionally refused on a retired path, so an admin
-- cannot delete-and-recreate a different object at a path that has ever been under destruction. There is no UPDATE
-- policy on this bucket in any migration: move, rename and upsert are denied to every client.
drop policy if exists "booking_photos_obj_delete" on storage.objects;
create policy "booking_photos_obj_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'booking-photos'
    and public.is_admin()
    and not public.deletion_path_frozen('booking-photos', storage.objects.name)
  );

-- ── 9. Worker tick: disabled until configured; no schedule is created here ────────────────
create table if not exists private.deletion_worker_config (
  id          integer primary key check (id = 1),
  worker_url  text,        -- the deletion-worker Edge Function URL; null = disabled
  secret      text,        -- set by an operator with `update`, never by a migration
  batch_limit integer not null default 25,
  updated_at  timestamptz not null default now()
);
insert into private.deletion_worker_config (id) values (1) on conflict (id) do nothing;

create or replace function public.deletion_worker_tick()
returns void
language plpgsql
volatile
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_url text;
  v_secret text;
  v_limit integer;
begin
  select worker_url, secret, batch_limit into v_url, v_secret, v_limit
    from private.deletion_worker_config where id = 1;
  if v_url is null or v_secret is null then
    return;  -- disabled by default
  end if;
  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object('limit', v_limit),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', v_secret)
  );
end;
$$;
revoke execute on function public.deletion_worker_tick() from public, anon, authenticated;
grant execute on function public.deletion_worker_tick() to service_role;
-- To enable later, an operator runs (not part of this migration):
--   update private.deletion_worker_config set worker_url = '<url>', secret = '<secret>' where id = 1;
--   select cron.schedule('deletion-worker', '*/10 * * * *', $c$ select public.deletion_worker_tick() $c$);
