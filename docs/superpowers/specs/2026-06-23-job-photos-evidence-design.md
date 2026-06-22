# QuickServe Slice 8 — Job Photos / Before & After Evidence (Design)

**Goal:** Attach photos to bookings for trust, proof of work, disputes, and quality control. Customers add issue photos; providers add before/after/completion photos on assigned jobs; admins view all, delete, and verify.

**Invariants:** Admin remains in control (only admin deletes/verifies). Customers see only their own bookings' photos; providers only assigned-job photos. Photos are private — never publicly browseable; rendered via short-lived signed URLs.

**Out of scope:** ratings, reviews, payments, notifications, maps, tracking, image compression, advanced moderation.

---

## Database + Storage (migration `0006`)

`public.booking_photos`:
- `id uuid primary key default gen_random_uuid()`
- `booking_id uuid not null references public.bookings(id) on delete cascade`
- `uploaded_by uuid not null references public.profiles(id)`
- `photo_url text not null` — the Storage **path** (`<booking_id>/<uuid>.<ext>`), NOT a public URL
- `photo_type text not null check (photo_type in ('issue','before','after','completion'))`
- `caption text`
- `is_verified boolean not null default false`
- `created_at timestamptz not null default now()`

**Table RLS (source of truth for access):**
- `SELECT` (`bookings_photos_select`): a row is visible when the caller is the booking's `customer_id` OR `assigned_provider_id`, OR `is_admin()` (subquery on `bookings`).
- `INSERT` (`with check`): `uploaded_by = auth.uid()` AND one of:
  - caller is the booking's `customer_id` AND `photo_type = 'issue'`; or
  - caller is the booking's `assigned_provider_id` AND `photo_type in ('before','after','completion')`; or
  - `is_admin()`.
- `DELETE`: `is_admin()` only.
- `UPDATE` (only `is_verified` matters): `is_admin()` only.

**Storage:** private bucket `booking-photos`. `storage.objects` policies: authenticated `SELECT` + `INSERT` scoped to `bucket_id = 'booking-photos'`; `DELETE` restricted to `is_admin()`. Paths are unguessable (`<booking_id>/<uuid>.<ext>`) and only surfaced to clients via table-RLS-visible rows; images render through `createSignedUrl` (short-lived). This satisfies "not publicly browseable unless via signed URLs" — the chosen pragmatic model (table RLS is the real boundary; storage is private with UUID paths).

## Dependencies

- `expo-image-picker` (Expo Go compatible) for camera + library selection. Request permission on first use.
- Upload uses the standard Expo→Supabase pattern: read the picked file into an `ArrayBuffer` and `supabase.storage.from('booking-photos').upload(path, arrayBuffer, { contentType })`.

## Data layer — `src/lib/photos.ts`

- Types: `PhotoType = 'issue'|'before'|'after'|'completion'`; `BookingPhoto = { id; booking_id; uploaded_by; photo_url; photo_type: PhotoType; caption: string|null; is_verified: boolean; created_at }`; `BookingPhotoView = BookingPhoto & { signedUrl: string|null }`.
- `uploadBookingPhoto({ bookingId, uri, photoType, caption? }): Promise<{ ok; error? }>` — resolves the signed-in user, uploads the file to `<bookingId>/<uuid>.<ext>`, inserts a `booking_photos` row (`photo_url = path`, `uploaded_by = uid`). Friendly error on failure.
- `getBookingPhotos(bookingId): Promise<BookingPhotoView[]>` — selects RLS-visible rows (newest first) and attaches a `signedUrl` per row via `createSignedUrl`.
- `deleteBookingPhoto(photo: { id; photo_url }): Promise<{ ok; error? }>` — admin: `storage.remove([photo_url])` then delete the row.
- `setPhotoVerified(id, value): Promise<{ ok; error? }>` — admin: update `is_verified`.
- `src/lib/bookings.ts`: extend `createBooking` to return `{ ok; id?; error? }` (insert `.select('id').single()`), so the create flow can attach issue photos after the row exists.

## UI

**Components (`src/components/ui/`):**
- `PhotoThumb` — renders an `Image` from `signedUrl` (placeholder when null), a small `photo_type` label, and a verified tick when `is_verified`.
- `PhotoGallery` — horizontal row/grid of `PhotoThumb` for a booking; `EmptyState`/muted text when none.
- `PhotoUploadButton` — opens the image picker, calls `uploadBookingPhoto` with a fixed `photoType`, shows progress + inline error.

**Customer:**
- Create flow: an optional "Add issue photos" picker (held as local URIs in the booking draft). On **Place Booking**, `createBooking` returns the new `id`; each draft issue photo is uploaded best-effort. Photo upload is OPTIONAL and never blocks: if creation succeeds but a photo upload fails, the booking remains created and the success screen shows a friendly warning ("Booking created — some photos couldn't be uploaded; you can add them from the booking later."). Creation failure is unchanged (inline error, no navigation).
- Booking detail (`booking/[id].tsx`): a `PhotoGallery` of the booking's photos + an "Add issue photos" `PhotoUploadButton` (`photoType='issue'`).

**Provider** (`provider/job/[id].tsx`): `PhotoGallery` of the job's photos (assigned-only via RLS) + upload buttons — "Add before photo" (`before`) and "Add after / completion photo" (`after`/`completion`). View only; cannot delete.

**Admin** (`admin/booking/[id].tsx`): `PhotoGallery` of all photos for the booking; each photo has **Delete** (`deleteBookingPhoto`) and a **Verify** toggle (`setPhotoVerified`).

## Testing

Mock Supabase (incl. `storage.from().upload/createSignedUrl/remove`), `expo-image-picker`, and the `photos` lib in screen tests; no network. Screen/route tests in `src/__tests__/`, never `src/app/`.
- lib: `uploadBookingPhoto` (path + insert payload), `getBookingPhotos` (signed-url attach), `deleteBookingPhoto` (remove + delete), `setPhotoVerified`; `createBooking` returns `id`.
- components: `PhotoThumb` (verified tick / placeholder), `PhotoGallery` (empty vs list), `PhotoUploadButton` (calls picker → `uploadBookingPhoto`).
- customer: detail gallery + issue upload; create flow uploads after create; **upload-failure-after-create shows the warning and still navigates to success**.
- provider: job detail before/after upload + gallery (assigned only).
- admin: gallery + delete + verify toggle.

## Tasks (for the implementation plan)

1. **T1** — migration `0006` (bucket + `booking_photos` table + table/storage RLS) + `src/lib/photos.ts` + `createBooking` returns id + install `expo-image-picker` (+tests).
2. **T2** — photo components `PhotoThumb`, `PhotoGallery`, `PhotoUploadButton` (+tests).
3. **T3** — customer: create-flow optional issue photos (best-effort, friendly warning on partial failure) + booking-detail gallery/upload (+tests).
4. **T4** — provider: job-detail before/after/completion upload + gallery (assigned only) (+tests).
5. **T5** — admin: booking-detail gallery + delete + verify (+tests).
6. **Verify + merge** — `npm test`, `npx tsc --noEmit`, Android bundle smoke; merge to `main`.

## Constraints

- Reuse Slice 1 design tokens; preserve premium feel. Route groups strip from the URL — keep literal admin/provider paths (Slice 5/6 lesson).
- Supabase + image-picker mocked in tests; PLAIN `router.push/replace` (no casts). One commit per task; after each: `npm test` + `npx tsc --noEmit`.

## Rollback

Branch `feat/slice-8-job-photos`; one commit per task; `git revert <sha>`. Additive: new table + bucket + policies, new lib + components, additive screen sections, `createBooking` return-shape extension (id is optional — existing callers unaffected). Migration `0006` forward-only; to undo in DB drop the `booking_photos` table, the storage policies, and the `booking-photos` bucket.
