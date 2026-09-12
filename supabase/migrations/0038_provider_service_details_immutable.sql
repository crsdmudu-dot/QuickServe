-- Service Details V1 — provider must not be able to mutate the customer's structured request.
--
-- Context. 0037 adds bookings.service_details: an IMMUTABLE snapshot of what the customer
-- actually asked for (variant/issue, structured answers, add-ons, request item lines). It is
-- customer evidence and a future pricing/sourcing input, so nothing after submission may edit it.
--
-- Problem. The provider UPDATE policy pins a FIXED list of columns written before this column
-- existed, so `service_details` would be unpinned: an assigned provider could rewrite the
-- customer's request through a direct API update while satisfying every other check.
--
-- Fix. Recreate `bookings_update_provider` with EVERY clause that is currently live, plus one
-- new clause pinning `service_details`. Verified against the live QA policy expression read from
-- pg_policy on 2026-08-17 — this migration is that expression, unchanged, with a single
-- additional conjunct. It therefore:
--   * preserves the F4/P1 terminal-state guard (pre-update status must be provider-progressable,
--     so 'cancelled' and 'completed' remain terminal for providers);
--   * preserves every existing field pin, the allowed-target-status list, and the forward-only
--     rank check, verbatim;
--   * WIDENS NOTHING. The policy is strictly more restrictive than before by exactly one column.
--
-- Deliberately NOT changed here:
--   * `bookings_update_admin` (0003) and every other policy — untouched.
--   * The other columns added since 0004 that remain unpinned (Slice-20 structured address
--     fields, Slice-24 scheduling fields, quote fields). Those predate Service Details and
--     pinning them could regress legitimate provider workflows, so they are recorded as a
--     separate PROVIDER UPDATE POLICY HARDENING FOLLOW-UP requiring its own review.
--
-- Ordering: must run AFTER 0037, which creates the column this policy references.
-- Idempotent: drop-if-exists + create. Safe to re-run.
-- Rollback: re-apply 0034_provider_terminal_states.sql (the same policy without the new pin).

drop policy if exists "bookings_update_provider" on public.bookings;
create policy "bookings_update_provider" on public.bookings
  for update
  using (assigned_provider_id = auth.uid())
  with check (
    assigned_provider_id = auth.uid()
    and customer_id   = (select b.customer_id   from public.bookings b where b.id = bookings.id)
    and service_id    = (select b.service_id    from public.bookings b where b.id = bookings.id)
    and address       = (select b.address       from public.bookings b where b.id = bookings.id)
    and scheduled_for = (select b.scheduled_for  from public.bookings b where b.id = bookings.id)
    and notes is not distinct from (select b.notes from public.bookings b where b.id = bookings.id)
    and assigned_provider_id    = (select b.assigned_provider_id    from public.bookings b where b.id = bookings.id)
    and assigned_provider_name  is not distinct from (select b.assigned_provider_name  from public.bookings b where b.id = bookings.id)
    and assigned_provider_phone is not distinct from (select b.assigned_provider_phone from public.bookings b where b.id = bookings.id)
    and admin_notes is not distinct from (select b.admin_notes from public.bookings b where b.id = bookings.id)
    -- NEW: the customer's structured Service Details snapshot is immutable to the provider.
    and service_details is not distinct from (select b.service_details from public.bookings b where b.id = bookings.id)
    and status in ('on_the_way','in_progress','completed')
    -- F4 (P1), preserved: the pre-update status must be a provider-progressable state, so
    -- 'cancelled' and 'completed' are terminal — a provider cannot transition out of them.
    and (select b.status from public.bookings b where b.id = bookings.id)
          in ('provider_assigned','on_the_way','in_progress')
    and (case status
            when 'on_the_way' then 1 when 'in_progress' then 2 when 'completed' then 3 else 0 end)
        >
        (case (select b.status from public.bookings b where b.id = bookings.id)
            when 'provider_assigned' then 0 when 'on_the_way' then 1
            when 'in_progress' then 2 when 'completed' then 3 else -1 end)
  );
