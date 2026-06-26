-- ============================================================
-- Slice 17 (QA) — IMP-01 fix: tighten booking-photos storage read access
-- ============================================================
-- The original 0006 storage SELECT policy allowed ANY authenticated user to
-- read ANY object in the private `booking-photos` bucket if they knew the path
-- (a defense-in-depth gap; paths were not enumerable thanks to the metadata
-- RLS, so real-world exploitability was low). This scopes object reads to the
-- booking's participants (customer / assigned provider) or an admin, mirroring
-- the `public.booking_photos` metadata SELECT policy.
--
-- `booking_photos.photo_url` stores the storage object path (= storage.objects.name),
-- so the join below is exact (see src/lib/photos.ts: `photo_url: path`).

drop policy if exists "booking_photos_obj_select" on storage.objects;

create policy "booking_photos_obj_select" on storage.objects
  for select to authenticated using (
    bucket_id = 'booking-photos'
    and exists (
      select 1
        from public.booking_photos bp
        join public.bookings b on b.id = bp.booking_id
       where bp.photo_url = storage.objects.name
         and (b.customer_id = auth.uid()
              or b.assigned_provider_id = auth.uid()
              or public.is_admin())
    )
  );

-- Note: INSERT (authenticated within bucket) and DELETE (admin-only) policies
-- from 0006 are unchanged; only object READ is tightened.
