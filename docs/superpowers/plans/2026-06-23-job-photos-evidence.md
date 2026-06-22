# Slice 8 — Job Photos / Before & After Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Attach private photos to bookings (issue / before / after / completion) for trust and quality control; customers, providers, and admins each see/act per their role.

**Architecture:** Migration `0006` adds a private `booking-photos` Storage bucket + a `booking_photos` table whose RLS is the access boundary (customer-own / provider-assigned / admin-all; role↔type INSERT check; admin-only delete & verify). `src/lib/photos.ts` wraps upload (file→ArrayBuffer→Storage) + signed-URL reads. `expo-image-picker` supplies images. Photo UI components are reused across customer/provider/admin screens.

**Tech Stack:** Expo Router, TypeScript, Supabase (Postgres + Storage), expo-image-picker, jest-expo + @testing-library/react-native.

## Global Constraints
- Admin only deletes/verifies photos. Customers see only their own bookings' photos; providers only assigned-job photos. Photos are private (signed URLs only; never public).
- Role↔type: customer→`issue`; provider→`before|after|completion`; admin→any.
- Create-flow issue photos are OPTIONAL and best-effort: if creation succeeds but a photo upload fails, the booking stays created and the success screen shows a friendly warning. Creation failure path unchanged.
- Reuse Slice 1 tokens. Supabase + image-picker mocked in tests; no network. Screen/route tests in `src/__tests__/`, NEVER `src/app/`.
- PLAIN `router.push/replace` (no casts). Route groups strip from URL — keep literal admin/provider paths. One commit per task; after each: `npm test` + `npx tsc --noEmit`.
- OUT: ratings, reviews, payments, notifications, maps, tracking, image compression, advanced moderation.

## File Structure
- `supabase/migrations/0006_booking_photos.sql` — bucket + table + RLS (T1).
- `src/lib/photos.ts` — upload/read/delete/verify (T1); `src/lib/bookings.ts` — `createBooking` returns id (T1).
- `app.json` — expo-image-picker plugin perms (T1).
- `src/components/ui/{photo-thumb,photo-gallery,photo-upload-button}.tsx` (T2).
- `src/booking/booking-draft.tsx` (+issuePhotos), `src/app/booking/notes.tsx`, `src/app/booking/review.tsx`, `src/app/booking/success.tsx`, `src/app/booking/[id].tsx` (T3).
- `src/app/provider/job/[id].tsx` (T4); `src/app/admin/booking/[id].tsx` (T5).
- Tests in `src/__tests__/`, `src/lib/*.test.ts`, `src/components/ui/*.test.tsx`.

---

## Task 1 — Bucket + table + RLS + photos data layer + expo-image-picker

**Files:**
- Create: `supabase/migrations/0006_booking_photos.sql`, `src/lib/photos.ts`, `src/lib/photos.test.ts`
- Modify: `src/lib/bookings.ts`, `src/lib/bookings.test.ts`, `app.json`, `package.json`/`package-lock.json`
- Test: `src/lib/photos.test.ts`, `src/lib/bookings.test.ts`

**Interfaces — Produces:**
- `PhotoType = 'issue'|'before'|'after'|'completion'`
- `BookingPhoto = { id; booking_id; uploaded_by; photo_url; photo_type: PhotoType; caption: string|null; is_verified: boolean; created_at }`
- `BookingPhotoView = BookingPhoto & { signedUrl: string|null }`
- `uploadBookingPhoto(input: { bookingId: string; uri: string; photoType: PhotoType; caption?: string }): Promise<{ ok: boolean; error?: string }>`
- `getBookingPhotos(bookingId: string): Promise<BookingPhotoView[]>`
- `deleteBookingPhoto(photo: { id: string; photo_url: string }): Promise<{ ok: boolean; error?: string }>`
- `setPhotoVerified(id: string, value: boolean): Promise<{ ok: boolean; error?: string }>`
- `createBooking(...)` now returns `{ ok: boolean; id?: string; error?: string }`

- [ ] **1. Install** `npx expo install expo-image-picker`. In `app.json` add to `plugins`: `["expo-image-picker", { "photosPermission": "QuickServe needs photo access to attach job photos.", "cameraPermission": "QuickServe needs camera access to take job photos." }]`.
- [ ] **2. SQL `supabase/migrations/0006_booking_photos.sql`**
```sql
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
```
- [ ] **3. Failing test `src/lib/bookings.test.ts`** — `createBooking` returns the new id (extend the insert mock to support `.select('id').single()`):
```ts
it('createBooking returns the new id on success', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  insert.mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: { id: 'bk1' }, error: null }) }) });
  const res = await createBooking({ serviceId: 's', address: 'a', scheduledFor: 't' });
  expect(res).toEqual({ ok: true, id: 'bk1' });
});
```
- [ ] **4. Failing tests `src/lib/photos.test.ts`** (mock `@/lib/supabase` with `auth.getUser`, `from('booking_photos')` insert/select(order)/delete(eq)/update(eq), and `storage.from()` `upload`/`createSignedUrl`/`remove`; mock global `fetch` to return `{ arrayBuffer: async () => new ArrayBuffer(8) }`):
```ts
it('uploadBookingPhoto uploads then inserts a row', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  upload.mockResolvedValue({ data: { path: 'x' }, error: null });
  insert.mockResolvedValue({ error: null });
  const res = await uploadBookingPhoto({ bookingId: 'bk1', uri: 'file://p.jpg', photoType: 'issue' });
  expect(res).toEqual({ ok: true });
  expect(storageFrom).toHaveBeenCalledWith('booking-photos');
  const insertedRow = insert.mock.calls[0][0];
  expect(insertedRow).toMatchObject({ booking_id: 'bk1', uploaded_by: 'u1', photo_type: 'issue' });
  expect(insertedRow.photo_url.startsWith('bk1/')).toBe(true);
});
it('getBookingPhotos attaches a signed url per row', async () => {
  order.mockResolvedValue({ data: [{ id: 'p1', photo_url: 'bk1/a.jpg', photo_type: 'issue', is_verified: false }], error: null });
  createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/a' }, error: null });
  const rows = await getBookingPhotos('bk1');
  expect(rows[0].signedUrl).toBe('https://signed/a');
});
it('deleteBookingPhoto removes the object then the row', async () => {
  remove.mockResolvedValue({ data: {}, error: null });
  del.mockReturnValue({ eq: (...a:unknown[]) => delEq(...a) });
  delEq.mockResolvedValue({ error: null });
  expect(await deleteBookingPhoto({ id: 'p1', photo_url: 'bk1/a.jpg' })).toEqual({ ok: true });
  expect(remove).toHaveBeenCalledWith(['bk1/a.jpg']);
});
it('setPhotoVerified updates the row', async () => {
  update.mockReturnValue({ eq: (...a:unknown[]) => updateEq(...a) });
  updateEq.mockResolvedValue({ error: null });
  expect(await setPhotoVerified('p1', true)).toEqual({ ok: true });
  expect(update).toHaveBeenCalledWith({ is_verified: true });
});
```
- [ ] **5. Run → FAIL** `npm test -- photos.test bookings.test`
- [ ] **6. Implement:**
  - `bookings.ts` `createBooking`: change insert to `.insert({...}).select('id').single()`; on `error` return `{ ok:false, error }`; else `{ ok:true, id: data.id }`.
  - `photos.ts`:
    - `uploadBookingPhoto`: get user (signed-out → friendly error); derive `ext` from uri (default `jpg`); `path = `${bookingId}/${randomUuid()}.${ext}``; `const bytes = await (await fetch(uri)).arrayBuffer()`; `supabase.storage.from('booking-photos').upload(path, bytes, { contentType: `image/${ext === 'png' ? 'png' : 'jpeg'}` })`; on error friendly; then `insert({ booking_id, uploaded_by: user.id, photo_url: path, photo_type, caption: caption ?? null })`; map errors. (Use a uuid: `globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}``.)
    - `getBookingPhotos`: `select('*').eq('booking_id', bookingId).order('created_at',{ascending:false})`; for each row `createSignedUrl(row.photo_url, 3600)` → attach `signedUrl` (null on error).
    - `deleteBookingPhoto`: `storage.from('booking-photos').remove([photo.photo_url])` then `from('booking_photos').delete().eq('id', photo.id)`; map errors.
    - `setPhotoVerified`: `update({ is_verified: value }).eq('id', id)`.
- [ ] **7. Run → PASS** `npm test`; `npx tsc --noEmit`
- [ ] **8. Commit** `git add supabase/migrations/0006_booking_photos.sql src/lib/photos.ts src/lib/photos.test.ts src/lib/bookings.ts src/lib/bookings.test.ts app.json package.json package-lock.json && git commit -m "feat: slice8 booking_photos table + storage + photos data layer"`

---

## Task 2 — Photo UI components

**Files:**
- Create: `src/components/ui/photo-thumb.tsx`, `src/components/ui/photo-gallery.tsx`, `src/components/ui/photo-upload-button.tsx`
- Test: `src/components/ui/photo-thumb.test.tsx`, `src/components/ui/photo-gallery.test.tsx`, `src/components/ui/photo-upload-button.test.tsx`

**Interfaces:**
- Consumes: `BookingPhotoView`, `PhotoType`, `uploadBookingPhoto`; `Card`/`Text`/`Button`; `expo-image-picker`.
- Produces:
  - `<PhotoThumb photo={BookingPhotoView} />`
  - `<PhotoGallery photos={BookingPhotoView[]} renderActions?={(p) => ReactNode} />` (optional per-photo actions for admin)
  - `<PhotoUploadButton bookingId photoType label onUploaded?={() => void} />`

- [ ] **1. Failing component tests:**
  - `photo-thumb.test.tsx`: `<PhotoThumb photo={{ ...mk, signedUrl:'https://x', photo_type:'before', is_verified:true }} />` → an `Image` (testID `photo-image`) is present, label "Before" shown, a verified tick shown; with `signedUrl:null` → a placeholder (testID `photo-placeholder`), no Image.
  - `photo-gallery.test.tsx`: empty array → muted "No photos yet"; with 2 photos → 2 `photo-image`s; `renderActions` output rendered per photo (e.g. a "Delete" button text appears twice).
  - `photo-upload-button.test.tsx`: mock `expo-image-picker` (`requestMediaLibraryPermissionsAsync`→granted; `launchImageLibraryAsync`→`{ canceled:false, assets:[{ uri:'file://x.jpg' }] }`) and `@/lib/photos` (`uploadBookingPhoto`→`{ok:true}`). Press the button → `uploadBookingPhoto` called with `{ bookingId:'bk1', uri:'file://x.jpg', photoType:'issue' }` and `onUploaded` fired; canceled pick → no upload.
- [ ] **2. Run → FAIL** `npm test -- photo-thumb photo-gallery photo-upload-button`
- [ ] **3. Implement** (reuse `useTheme`, `Radii`, `Spacing`):
  - `PhotoThumb`: `Card`-ish; `signedUrl ? <Image testID="photo-image" source={{uri:signedUrl}} style={thumb}/> : <View testID="photo-placeholder">`; a `Text variant="caption"` label from a `{issue:'Issue',before:'Before',after:'After',completion:'Completion'}` map; verified tick (`Text` "✓" / reuse a small badge) when `is_verified`.
  - `PhotoGallery`: horizontal `ScrollView`/wrap of `PhotoThumb`; muted `Text` "No photos yet" when empty; render `renderActions?.(photo)` under each thumb.
  - `PhotoUploadButton`: `Button` (label prop); onPress → request permission → `launchImageLibraryAsync({ mediaTypes: ['images'] })`; if not canceled, `setBusy(true)`, `uploadBookingPhoto({ bookingId, uri: assets[0].uri, photoType })`, on ok call `onUploaded?.()`, on fail set inline error; `setBusy(false)`. Disable while busy.
- [ ] **4. Run → PASS**; `npx tsc --noEmit`
- [ ] **5. Commit** `git add src/components/ui/photo-thumb.tsx src/components/ui/photo-thumb.test.tsx src/components/ui/photo-gallery.tsx src/components/ui/photo-gallery.test.tsx src/components/ui/photo-upload-button.tsx src/components/ui/photo-upload-button.test.tsx && git commit -m "feat: slice8 photo UI components"`

---

## Task 3 — Customer: create-flow issue photos + booking-detail gallery

**Files:**
- Modify: `src/booking/booking-draft.tsx`, `src/app/booking/notes.tsx`, `src/app/booking/review.tsx`, `src/app/booking/success.tsx`, `src/app/booking/[id].tsx`
- Test: `src/booking/booking-draft.test.tsx`, `src/__tests__/booking-review.test.tsx`, `src/__tests__/booking-success.test.tsx`, `src/__tests__/booking-detail.test.tsx`, `src/__tests__/booking-notes.test.tsx`

**Interfaces:**
- Consumes: `uploadBookingPhoto`, `getBookingPhotos`; `PhotoGallery`, `PhotoUploadButton`; `expo-image-picker`; `createBooking` (returns id).
- Produces: draft `issuePhotos: string[]`, `addIssuePhoto(uri)`, `removeIssuePhoto(uri)`.

- [ ] **1. Draft state** — extend `Draft` with `issuePhotos: string[]` (EMPTY `[]`), add `addIssuePhoto(uri)` (append) and `removeIssuePhoto(uri)` (filter); `reset`/`start` clear to `[]`. Update `booking-draft.test.tsx` to cover add/remove/reset.
- [ ] **2. Notes screen** — add an optional "Add issue photos" section: a Button that uses `expo-image-picker.launchImageLibraryAsync` to pick an image and calls `addIssuePhoto(uri)`; show the count of selected photos and a way to remove. (Local only — NOT uploaded yet.) Update `booking-notes.test.tsx`: picking calls `addIssuePhoto`.
- [ ] **3. Review screen** — change `handlePlaceBooking`: `const res = await createBooking({...})`; if `!res.ok` → inline error (unchanged). If ok: upload each `issuePhotos` URI best-effort: `let anyFailed = false; for (const uri of issuePhotos) { const r = await uploadBookingPhoto({ bookingId: res.id!, uri, photoType: 'issue' }); if (!r.ok) anyFailed = true; }` then `reset()` and `router.replace({ pathname: '/booking/success', params: anyFailed ? { photoWarning: '1' } : {} })`.
- [ ] **4. Success screen** — read `const { photoWarning } = useLocalSearchParams<{ photoWarning?: string }>();` when `photoWarning === '1'` render a muted warning `Text`: "Booking created — some photos couldn't be uploaded. You can add them from the booking later." (Booking remains created regardless.)
- [ ] **5. Booking detail** — add a "Photos" section: `getBookingPhotos(id)` into state + `<PhotoGallery photos={photos} />` and a `<PhotoUploadButton bookingId={id} photoType="issue" label="Add issue photos" onUploaded={reload} />`.
- [ ] **6. Tests** (`src/__tests__/`): mock `expo-router`, `@/booking/booking-draft`, `@/lib/bookings`, `@/lib/photos`, `expo-image-picker`.
  - review: ok with `issuePhotos:['file://a']` → `createBooking` then `uploadBookingPhoto('...','file://a','issue')` then `reset` + `replace` to success WITHOUT warning when upload ok; when `uploadBookingPhoto`→`{ok:false}` → still `reset` + `replace` to success WITH `params:{photoWarning:'1'}` (booking stays created). createBooking `{ok:false}` → inline error, NO upload, NO nav.
  - success: `useLocalSearchParams`→`{photoWarning:'1'}` → warning text shown; without → not shown; Back to Home still works.
  - booking-detail: `getBookingPhotos`→one photo → image shown; upload button present.
  - notes: picking an image calls `addIssuePhoto`.
- [ ] **7. Run → PASS** `npm test`; `npx tsc --noEmit`
- [ ] **8. Commit** `git add src/booking/booking-draft.tsx src/booking/booking-draft.test.tsx src/app/booking/notes.tsx src/app/booking/review.tsx src/app/booking/success.tsx src/app/booking/[id].tsx src/__tests__/booking-review.test.tsx src/__tests__/booking-success.test.tsx src/__tests__/booking-detail.test.tsx src/__tests__/booking-notes.test.tsx && git commit -m "feat: slice8 customer create-flow + booking detail photos"`

---

## Task 4 — Provider job photos

**Files:**
- Modify: `src/app/provider/job/[id].tsx`
- Test: `src/__tests__/provider-job-detail.test.tsx`

**Interfaces:** Consumes `getBookingPhotos`, `PhotoGallery`, `PhotoUploadButton`.

- [ ] **1. Add a Photos section** to the provider job detail (below the forward-only status buttons): `getBookingPhotos(id)` into state + `<PhotoGallery photos={photos} />`; two `PhotoUploadButton`s — `photoType="before"` label "Add before photo", and `photoType="after"` label "Add after / completion photo" — both `onUploaded={reload}`. (Provider view only; no delete.)
- [ ] **2. Failing tests** — extend `provider-job-detail.test.tsx`: mock `@/lib/photos` (`getBookingPhotos`→[one before photo]; `uploadBookingPhoto`→`{ok:true}`) and `expo-image-picker`. Assert: the before photo image renders; pressing "Add before photo" → `uploadBookingPhoto` called with `photoType:'before'`; pressing "Add after / completion photo" → `photoType:'after'`. Keep the existing forward-only status tests passing.
- [ ] **3. Run → FAIL** then implement → **PASS** `npm test -- provider-job-detail`; `npm test`; `npx tsc --noEmit`
- [ ] **4. Commit** `git add "src/app/provider/job/[id].tsx" src/__tests__/provider-job-detail.test.tsx && git commit -m "feat: slice8 provider job before/after photos"`

---

## Task 5 — Admin view / delete / verify photos

**Files:**
- Modify: `src/app/admin/booking/[id].tsx`
- Test: `src/__tests__/admin-booking-detail.test.tsx`

**Interfaces:** Consumes `getBookingPhotos`, `deleteBookingPhoto`, `setPhotoVerified`, `PhotoGallery`.

- [ ] **1. Add a Photos section** to admin booking detail: `getBookingPhotos(id)` into state; `<PhotoGallery photos={photos} renderActions={(p) => (<><Button label="Delete" variant="ghost" onPress={() => handleDelete(p)} /><Button label={p.is_verified ? 'Unverify' : 'Verify'} onPress={() => handleVerify(p)} /></>)} />`. `handleDelete(p)` → `deleteBookingPhoto({ id:p.id, photo_url:p.photo_url })` then reload; `handleVerify(p)` → `setPhotoVerified(p.id, !p.is_verified)` then reload. Inline error on failure.
- [ ] **2. Failing tests** — extend `admin-booking-detail.test.tsx`: mock `@/lib/photos` (`getBookingPhotos`→[one photo `is_verified:false`]; `deleteBookingPhoto`→`{ok:true}`; `setPhotoVerified`→`{ok:true}`). Assert: photo image renders; pressing **Delete** calls `deleteBookingPhoto` with the photo's id+path; pressing **Verify** calls `setPhotoVerified(id, true)`. Keep existing status/assign/notes tests passing.
- [ ] **3. Run → FAIL** then implement → **PASS** `npm test -- admin-booking-detail`; `npm test`; `npx tsc --noEmit`
- [ ] **4. Commit** `git add "src/app/admin/booking/[id].tsx" src/__tests__/admin-booking-detail.test.tsx && git commit -m "feat: slice8 admin photo view/delete/verify"`

---

## Verification (controller, after Task 5)
- `npm test` all pass; `npx tsc --noEmit` clean.
- Android bundle smoke: `npx expo start -c`, wait for Metro, fetch the manifest's `launchAsset.url` → HTTP 200, no errors. (Regenerates route types; run before trusting tsc if route changes were made.)

### Supabase Storage + SQL setup (run before Expo Go)
1. Apply `supabase/migrations/0006_booking_photos.sql`. Confirm: bucket `booking-photos` exists and is **private** (`public = false`); `booking_photos` table + its 4 policies exist; the 3 `storage.objects` policies exist.
2. If the SQL `insert into storage.buckets` is blocked in your project, create the bucket `booking-photos` (private) via the Supabase dashboard → Storage, then run the rest of the migration.

### Expo Go end-to-end
1. **Customer**: in the create flow, optionally add issue photos on the Notes step → place booking → success. (To exercise the warning: simulate an upload failure, e.g. revoke storage insert; booking must still be created and the success screen shows the friendly warning.) Open the booking detail → see the issue photos + add more.
2. **Admin**: assign an in-app provider to that booking. Open admin booking detail → see the photo, **Verify** it, **Delete** one.
3. **Provider** (assigned): open the job → add a before photo and an after/completion photo; gallery shows them. Confirm a different provider cannot see them (RLS).
4. **Customer**: reopen booking detail → sees the before/after photos too (own booking). Confirm images load via signed URLs (private bucket).

## Rollback
Branch `feat/slice-8-job-photos`; one commit per task → `git revert <sha>`. Additive: new table/bucket/policies, new lib + components, additive screen sections, `createBooking` optional `id` (existing callers unaffected). Migration `0006` forward-only; to undo in DB drop the 4 `booking_photos` policies + table, the 3 storage policies, and the `booking-photos` bucket.

## Self-review
- Bucket + table + RLS (select/insert role↔type/admin delete+verify) + storage policies → T1 ✓. photos data layer + createBooking id → T1 ✓. Components → T2 ✓. Customer create-flow (optional, best-effort, warning) + detail gallery → T3 ✓. Provider before/after on assigned jobs → T4 ✓. Admin view/delete/verify → T5 ✓. Tests mock Supabase storage + image-picker, in `src/__tests__/`/`src/lib/`/`src/components/ui/` ✓.
- Signatures consistent across tasks (`uploadBookingPhoto`, `getBookingPhotos`, `deleteBookingPhoto`, `setPhotoVerified`, `BookingPhotoView`, `createBooking` returns id). Invariants: table RLS is the boundary; admin-only delete/verify; signed-URL-only rendering.
