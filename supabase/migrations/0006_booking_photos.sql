-- Private bucket for booking photos
insert into storage.buckets (id, name, public)
values ('booking-photos', 'booking-photos', false)
on conflict (id) do nothing;

-- Storage object policies: authenticated read/insert within the bucket; admin-only delete.
create policy "booking_photos_obj_select" on storage.objects
  for select to authenticated using (bucket_id = 'booking-photos');
create policy "booking_photos_obj_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'booking-photos');
create policy "booking_photos_obj_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'booking-photos' and public.is_admin());

-- Metadata table (access boundary)
create table if not exists public.booking_photos (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  photo_url text not null,
  photo_type text not null check (photo_type in ('issue','before','after','completion')),
  caption text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.booking_photos enable row level security;

create policy "booking_photos_select" on public.booking_photos
  for select using (
    exists (select 1 from public.bookings b where b.id = booking_id
      and (b.customer_id = auth.uid() or b.assigned_provider_id = auth.uid() or public.is_admin()))
  );

create policy "booking_photos_insert" on public.booking_photos
  for insert with check (
    uploaded_by = auth.uid()
    and exists (select 1 from public.bookings b where b.id = booking_id and (
      (b.customer_id = auth.uid() and photo_type = 'issue')
      or (b.assigned_provider_id = auth.uid() and photo_type in ('before','after','completion'))
      or public.is_admin()
    ))
  );

create policy "booking_photos_delete" on public.booking_photos
  for delete using (public.is_admin());
create policy "booking_photos_update" on public.booking_photos
  for update using (public.is_admin()) with check (public.is_admin());
