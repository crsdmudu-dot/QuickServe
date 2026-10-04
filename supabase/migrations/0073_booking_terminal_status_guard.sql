-- 0073_booking_terminal_status_guard.sql - Update 74, hardening H1: the cancellation race fix.
--
-- FINAL NUMBER 0073. U74 precedes the v1 activation on every environment (PM stage 119; numbering N1:
-- H1 0073, H2 0074, H3 0075, the feature 0076). Two packages must never hold the same number, and the
-- Supabase CLI refuses a lower number once a higher one is recorded on an environment.
--
-- INDEPENDENTLY RELEASABLE. This file depends on nothing from Update 74: not on H2 (the location lock,
-- 0074) and not on the customer cancellation feature (0076). It can ship alone,
-- before or after H2, through its own QA and Production windows (owner instruction 2026-10-02 18:25, item
-- 1; PM stage 102 (b): fix P1 before public launch whatever Update 74's release). The feature requires
-- this file (its self-check stops without it).
--
-- WHAT IT FIXES (P1, reproduced on a local database built from every migration at main afd2c71b;
-- kwikserve-updates/74-in-app-cancellation/evidence and 74c checks, race proofs H1-R1 and H1-R3):
--   A provider's status change that is in flight while a booking is cancelled overwrote the
--   cancellation. bookings_update_provider (0049) checks the pre-update status with subqueries in
--   WITH CHECK, and those read the statement's snapshot, taken before the cancellation committed. The
--   waiting UPDATE re-checks only its USING clause on the newest row, so 'cancelled' became
--   'in_progress' (or 'completed', which the provider graph also allows in one step from 'on_the_way').
--   This affects today's admin cancellations too: after the reversal the job can be completed, and a
--   completed booking can be paid by M-PESA.
--
-- THE FIX: a BEFORE UPDATE OF status trigger. A BEFORE ROW trigger runs after the row lock, so its OLD
-- is the newest committed row version, not the statement snapshot. A signed-in caller who is not an
-- admin can never move a booking out of 'cancelled' or 'completed'. Admins keep every transition they
-- have today (GAP-L3-4 is a separate decision). Paths with no signed-in user (service role, cron) are
-- unchanged. An update that leaves the status as it is (or does not set it) is unaffected.
--
-- WHAT THE PROVIDER SEES: the refused PATCH returns the error 'booking_status_final'. The app at
-- afd2c71b shows its generic "Could not update booking. Please try again." for any refused status
-- change (src/lib/bookings.ts:286); the Update 74 build shows a specific message instead.
--
-- NOT CHANGED: every policy, every function, all data. No grant is added: the trigger function is not
-- executable by any client role.
--
-- ROLLBACK (only if ever needed): drop trigger trg_bookings_terminal_guard on public.bookings; drop
-- function public.tg_bookings_terminal_guard(). The feature (0076) must be rolled back first if it is
-- applied, because its self-check requires this trigger. No data is involved.

-- ── 1. Terminal-state guard (P1) ─────────────────────────────────────────────────────────────────
create or replace function public.tg_bookings_terminal_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- OLD is the newest committed row version (see the header). A signed-in non-admin may never move a
  -- booking out of a terminal status.
  if old.status in ('cancelled', 'completed')
     and new.status is distinct from old.status
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'booking_status_final' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_bookings_terminal_guard() from public, anon, authenticated;

drop trigger if exists trg_bookings_terminal_guard on public.bookings;
create trigger trg_bookings_terminal_guard
  before update of status on public.bookings
  for each row execute function public.tg_bookings_terminal_guard();

-- ── 2. Self-check: stop (and undo everything above) if the result is not exactly as intended ────
do $$
declare
  guard constant regprocedure := 'public.tg_bookings_terminal_guard()'::regprocedure;
  t record;
begin
  select tgfoid, tgtype, tgenabled into t
    from pg_trigger
   where tgrelid = 'public.bookings'::regclass and tgname = 'trg_bookings_terminal_guard' and not tgisinternal;
  if not found then
    raise exception '0073 self-check: the terminal guard trigger is missing';
  end if;
  -- tgtype bits: 1 = ROW, 2 = BEFORE, 16 = UPDATE.
  if t.tgfoid <> guard or (t.tgtype & 1) = 0 or (t.tgtype & 2) = 0 or (t.tgtype & 16) = 0 or t.tgenabled <> 'O' then
    raise exception '0073 self-check: the terminal guard is not an enabled BEFORE UPDATE row trigger on its function';
  end if;
  if has_function_privilege('authenticated', guard, 'EXECUTE') or has_function_privilege('anon', guard, 'EXECUTE') then
    raise exception '0073 self-check: the guard trigger function is executable by a client role';
  end if;
end $$;
