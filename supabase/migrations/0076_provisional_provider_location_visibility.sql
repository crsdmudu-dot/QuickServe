-- 0076_provisional_provider_location_visibility.sql - Update 74, hardening H3: provider-location visibility
-- (M-93-4, owner decision of 2026-10-03 19:19, item 7: option (a)).
--
-- PROVISIONAL NUMBER. The final number is assigned when this is merged (see H1's header, provisional
-- 0077). Two packages must never hold the same number.
--
-- INDEPENDENTLY RELEASABLE. This file depends on nothing from Update 74: not on H1 (provisional 0077), not
-- on H2 (provisional 0078) and not on the customer cancellation feature (provisional 0079). It can ship
-- alone, through its own QA and Production windows.
--   Relation to H2: the visibility rule below holds on its own. Without H2, a location write in flight at
--   the moment of a completion or cancellation can re-create the row after this file's trigger has deleted
--   it; the customer still cannot read that row (the booking is no longer travelling or working), but the
--   row stays until it is cleared. H2 closes that race, so ship H2 with or before this file (74e harness
--   H3-R1 and H3-R2 show both cases).
--
-- WHAT IT DOES (owner item 7: "backend-enforced location visibility only while travelling or working, with
-- deletion on completion or cancellation"; PM stage 93 M-93-4):
--   1. provider_locations_select (0018) is replaced. Its old rule let the booking's customer read the
--      provider's last position in ANY status. Now:
--        - the booking's customer reads it only while the booking is 'on_the_way' or 'in_progress', and
--          only a row written by the provider currently assigned;
--        - the assigned provider reads only their own row for that booking, in any status, as before;
--        - admins read every row, as before (is_admin()).
--      A provider who was unassigned or replaced can no longer read the booking's row, and a newly assigned
--      provider cannot read a row written by the former one.
--   2. trg_provider_locations_clear: after a booking's status becomes 'completed' or 'cancelled', or its
--      assigned provider changes (unassigned or replaced), the booking's location row is deleted, whoever
--      made the change (provider, admin, the customer's cancellation or a service path).
--
-- NOT CHANGED: upsert_provider_location and clear_provider_location (the write rules: only the assigned
-- provider, only while 'on_the_way' or 'in_progress'), the table, its grants, the realtime publication.
-- Realtime delivery follows the SELECT policy, so the customer's live map stops when the booking leaves
-- 'on_the_way' / 'in_progress'.
--
-- ROLLBACK (only if ever needed): drop trigger trg_provider_locations_clear on public.bookings; drop
-- function public.tg_provider_locations_clear(); re-create provider_locations_select from 0018. No data is
-- restored (deleted positions were last positions only; no history is kept, 0018).

-- ── 1. Who may read a provider's position ──────────────────────────────────────────────────────
drop policy if exists "provider_locations_select" on public.provider_locations;
create policy "provider_locations_select" on public.provider_locations
  for select using (
    exists (
      select 1 from public.bookings b
       where b.id = provider_locations.booking_id
         and (
               -- the booking's customer: only while the provider is travelling or working, and only the
               -- current provider's row
               (b.customer_id = auth.uid()
                and b.status in ('on_the_way', 'in_progress')
                and provider_locations.provider_id = b.assigned_provider_id)
               -- the assigned provider: their own row
            or (b.assigned_provider_id = auth.uid()
                and provider_locations.provider_id = auth.uid())
               -- admins, as before
            or public.is_admin()
         )
    )
  );

-- ── 2. Delete the position when the job ends or the provider changes ───────────────────────────
create or replace function public.tg_provider_locations_clear()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.provider_locations where booking_id = new.id;
  return null;
end;
$$;
revoke execute on function public.tg_provider_locations_clear() from public, anon, authenticated;

drop trigger if exists trg_provider_locations_clear on public.bookings;
create trigger trg_provider_locations_clear
  after update of status, assigned_provider_id on public.bookings
  for each row
  when ((new.status in ('completed', 'cancelled') and new.status is distinct from old.status)
        or new.assigned_provider_id is distinct from old.assigned_provider_id)
  execute function public.tg_provider_locations_clear();

-- ── 3. Self-check: stop (and undo everything above) if the result is not exactly as intended ────
do $$
declare
  fn constant regprocedure := 'public.tg_provider_locations_clear()'::regprocedure;
  q text;
  t record;
begin
  select pg_get_expr(polqual, polrelid) into q
    from pg_policy
   where polrelid = 'public.provider_locations'::regclass and polname = 'provider_locations_select' and polcmd = 'r';
  if q is null or position('on_the_way' in q) = 0 or position('in_progress' in q) = 0
     or position('assigned_provider_id' in q) = 0 or position('is_admin()' in q) = 0 then
    raise exception 'provisional 0076 self-check: provider_locations_select is not the status-restricted rule';
  end if;
  -- Only PERMISSIVE policies can widen a read (the restrictive deny-deleted-identity policy of 0056 narrows it).
  if (select count(*) from pg_policy where polrelid = 'public.provider_locations'::regclass
        and polcmd in ('r', '*') and polpermissive) <> 1 then
    raise exception 'provisional 0076 self-check: another SELECT policy on provider_locations would widen the rule';
  end if;
  select tgfoid, tgtype, tgenabled into t
    from pg_trigger
   where tgrelid = 'public.bookings'::regclass and tgname = 'trg_provider_locations_clear' and not tgisinternal;
  -- tgtype bits: 1 = ROW, 2 = BEFORE (clear means AFTER on a table), 16 = UPDATE. A BEFORE trigger whose
  -- function returns null would silently drop every booking update it fires on (PM stage 109, L-109-1).
  if not found or t.tgfoid <> fn or (t.tgtype & 1) = 0 or (t.tgtype & 2) <> 0 or (t.tgtype & 16) = 0
     or t.tgenabled <> 'O' then
    raise exception 'provisional 0076 self-check: the clearing trigger is not an enabled AFTER UPDATE row trigger on its function';
  end if;
  if has_function_privilege('authenticated', fn, 'EXECUTE') or has_function_privilege('anon', fn, 'EXECUTE') then
    raise exception 'provisional 0076 self-check: the clearing function is executable by a client role';
  end if;
end $$;
