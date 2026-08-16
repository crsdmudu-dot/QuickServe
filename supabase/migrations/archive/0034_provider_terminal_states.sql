-- Slice 44 RC1 — F4 (P1) fix: cancelled (and completed) are terminal for the
-- assigned provider.
--
-- Before: the provider update policy allowed any status whose forward-rank was
-- greater than the current row's rank. 'cancelled' was ranked -1 ("else -1"), so a
-- provider could move an admin-CANCELLED booking to on_the_way / in_progress /
-- completed (rank > -1 always). This let an assigned provider silently override an
-- admin cancellation and fire completion effects.
--
-- Fix: recreate the policy with an added guard requiring the CURRENT (pre-update)
-- status to be a provider-progressable state (provider_assigned / on_the_way /
-- in_progress). This blocks any transition FROM 'cancelled' or 'completed'. All
-- existing field-pinning and the forward-only rank check are preserved verbatim.
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
    and status in ('on_the_way','in_progress','completed')
    -- NEW (F4): the pre-update status must be a progressable state, so 'cancelled'
    -- and 'completed' are terminal — a provider cannot transition out of them.
    and (select b.status from public.bookings b where b.id = bookings.id)
          in ('provider_assigned','on_the_way','in_progress')
    and (case status
            when 'on_the_way' then 1 when 'in_progress' then 2 when 'completed' then 3 else 0 end)
        >
        (case (select b.status from public.bookings b where b.id = bookings.id)
            when 'provider_assigned' then 0 when 'on_the_way' then 1
            when 'in_progress' then 2 when 'completed' then 3 else -1 end)
  );
