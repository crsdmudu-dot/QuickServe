-- 0078_provisional_provider_location_share_lock.sql - Update 74, hardening H2: the provider-location fix.
--
-- PROVISIONAL NUMBER. The final number is assigned when this is merged (see H1's header, provisional
-- 0077). Two packages must never hold the same number.
--
-- INDEPENDENTLY RELEASABLE. This file depends on nothing from Update 74: not on H1 (the terminal guard,
-- provisional 0077) and not on the customer cancellation feature (provisional 0079). It can ship alone,
-- before or after H1, through its own QA and Production windows (owner instruction 2026-10-02 18:25, item
-- 1). The feature does not require it, but without it the feature's "tracking stops" step can be undone
-- by a location write in flight at the moment of cancellation (shown by the 74c harness).
--
-- WHAT IT FIXES (P4, reproduced on a local database built from every migration at main afd2c71b; 74c
-- race proofs H2-R1 and H2-R3):
--   A provider location write in flight during a cancellation survived it. upsert_provider_location
--   (0018) read the booking status without a lock, so its insert landed after the cancellation had
--   cleared the location row, and the booking's customer could still read that position (the 0018
--   SELECT policy has no status condition).
--
-- THE FIX: the same function, with the booking read taking FOR SHARE. FOR SHARE conflicts with a
-- cancellation's row lock (an UPDATE of the status takes FOR NO KEY UPDATE; the feature's RPC takes it
-- explicitly), so a racing write either finishes first (and the cancellation's clearing then removes it)
-- or waits and re-reads 'cancelled' and is refused. FOR KEY SHARE would not conflict (control H2-R2). The
-- provider's own status updates wait at most for one location write (milliseconds; the app writes once
-- every 8 s per provider).
--
-- WHAT IT DOES NOT DO: at afd2c71b nothing clears a location row when an ADMIN cancels; only
-- clear_provider_location (the assigned provider or an admin) or the feature's RPC deletes it. Clearing on
-- cancellation and completion, and a status-restricted SELECT, are M-93-4 (proposal U74-H3, not in this
-- file).
--
-- NOT CHANGED: every policy, every other function, all data. upsert_provider_location keeps its
-- signature, body, checks and grants (CREATE OR REPLACE keeps them).
--
-- ROLLBACK (only if ever needed): re-create upsert_provider_location from 0018 (CREATE OR REPLACE). No data
-- is involved.

-- ── 1. Location writes serialise with a cancellation (P4) ────────────────────────────────────────
-- 0018's function, verbatim, except "for share" on the booking read.
create or replace function public.upsert_provider_location(
  p_booking_id uuid,
  p_lat        double precision,
  p_lng        double precision,
  p_heading    double precision,
  p_speed      double precision
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_assigned_provider_id uuid;
  v_status               text;
begin
  select assigned_provider_id, status
    into v_assigned_provider_id, v_status
    from public.bookings
   where id = p_booking_id
     for share;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_assigned_provider_id is distinct from auth.uid() then
    raise exception 'Not the assigned provider';
  end if;

  if v_status not in ('on_the_way', 'in_progress') then
    raise exception 'Booking is not active for tracking';
  end if;

  insert into public.provider_locations (booking_id, provider_id, latitude, longitude, heading, speed, updated_at)
  values (p_booking_id, auth.uid(), p_lat, p_lng, p_heading, p_speed, now())
  on conflict (booking_id) do update
    set provider_id = auth.uid(), latitude = p_lat, longitude = p_lng,
        heading = p_heading, speed = p_speed, updated_at = now();
end; $$;

-- ── 2. Self-check: stop (and undo everything above) if the result is not exactly as intended ────
do $$
declare
  upsert constant regprocedure :=
    'public.upsert_provider_location(uuid, double precision, double precision, double precision, double precision)'::regprocedure;
begin
  if not has_function_privilege('authenticated', upsert, 'EXECUTE') then
    raise exception 'provisional 0078 self-check: upsert_provider_location lost its authenticated grant';
  end if;
  if has_function_privilege('anon', upsert, 'EXECUTE') then
    raise exception 'provisional 0078 self-check: upsert_provider_location is executable by anon';
  end if;
  if position('for share' in pg_get_functiondef(upsert)) = 0 then
    raise exception 'provisional 0078 self-check: upsert_provider_location does not take FOR SHARE';
  end if;
end $$;
