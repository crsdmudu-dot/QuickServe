-- Link a booking to an in-app provider (nullable; manual dispatch leaves it null)
alter table public.bookings
  add column if not exists assigned_provider_id uuid references public.profiles(id);

-- Providers can read only the bookings assigned to them
create policy "bookings_select_provider" on public.bookings
  for select using (assigned_provider_id = auth.uid());

-- Providers can update ONLY their own assigned bookings: forward-only status,
-- every other field pinned to its stored value (subquery reads the pre-update row,
-- same technique as profiles_update_own in 0001).
create policy "bookings_update_provider" on public.bookings
  for update
  using (assigned_provider_id = auth.uid())
  with check (
    assigned_provider_id = auth.uid()
    and customer_id   = (select b.customer_id   from public.bookings b where b.id = bookings.id)
    and service_id    = (select b.service_id    from public.bookings b where b.id = bookings.id)
    and address       = (select b.address       from public.bookings b where b.id = bookings.id)
    and scheduled_for = (select b.scheduled_for  from public.bookings b where b.id = bookings.id)
    and assigned_provider_id    = (select b.assigned_provider_id    from public.bookings b where b.id = bookings.id)
    and assigned_provider_name  is not distinct from (select b.assigned_provider_name  from public.bookings b where b.id = bookings.id)
    and assigned_provider_phone is not distinct from (select b.assigned_provider_phone from public.bookings b where b.id = bookings.id)
    and admin_notes is not distinct from (select b.admin_notes from public.bookings b where b.id = bookings.id)
    and status in ('on_the_way','in_progress','completed')
    and (case status
            when 'on_the_way' then 1 when 'in_progress' then 2 when 'completed' then 3 else 0 end)
        >
        (case (select b.status from public.bookings b where b.id = bookings.id)
            when 'provider_assigned' then 0 when 'on_the_way' then 1
            when 'in_progress' then 2 when 'completed' then 3 else -1 end)
  );
