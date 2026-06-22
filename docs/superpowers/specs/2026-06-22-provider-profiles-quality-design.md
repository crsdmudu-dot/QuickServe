# QuickServe Slice 7 — Provider Profiles + Internal Quality System (Design)

**Goal:** Providers appear as vetted QuickServe professionals (not independent freelancers). Providers manage a profile; admins curate/verify it; customers see a curated "Assigned Professional" card only after admin assignment.

**Invariants (must hold):**
- Admin remains in full control (assigns, verifies, edits any profile field).
- Customers cannot browse providers — they only ever see curated info for the professional assigned to *their* booking.
- Providers cannot choose customers; they only view/progress jobs assigned to them (Slice 6).

**Out of scope:** ratings, reviews, payments, notifications, maps, tracking, earnings.

---

## Database (migration `0005`)

Add to `public.profiles`:
- `profile_photo_url text`
- `bio text`
- `years_experience int`
- `skills text[]`
- `is_verified boolean not null default false`
- `completed_jobs_count int not null default 0`
- `average_rating numeric` (nullable; future — no UI/logic this slice)
- `availability_status text not null default 'available' check (availability_status in ('available','unavailable'))`

**RLS (extend `profiles_update_own` from `0001`):** keep `role` and `approval_status` pinned, and additionally pin `is_verified`, `completed_jobs_count`, `average_rating` to their stored values via subquery. Providers may self-edit only `profile_photo_url`, `bio`, `years_experience`, `skills`, `availability_status`. `profiles_update_admin` (from `0003`) is unchanged — admin edits everything, including `is_verified`. No new browse policy for customers.

**Trigger (quality system):** a `security definer` trigger on `bookings AFTER UPDATE`: when `status` changes to `completed` and `assigned_provider_id is not null`, increment that provider's `profiles.completed_jobs_count`. Fires only on the transition into `completed` (guard `old.status <> 'completed'`).

**RPC (curated, no-browse):** `security definer` function `get_booking_professional(p_booking_id uuid)` returns one row of curated fields — `full_name`, `skills`, `is_verified`, `completed_jobs_count`, `profile_photo_url` (NO phone, NO bio/contact) — for the booking's `assigned_provider_id`, but only when `auth.uid() = (booking.customer_id)` OR `is_admin()`. Returns no row when the caller doesn't own the booking, the booking has no in-app provider, or it doesn't exist. This is the only path a customer can read another profile, and it is scoped to their own booking — preventing enumeration/browsing.

## Data layer

- `src/lib/providers.ts`:
  - Expand `ProviderProfile` with the new fields.
  - `getProviderProfile(id: string): Promise<ProviderProfile | null>` — RLS scopes to self or admin.
  - `updateMyProviderProfile(fields: { profile_photo_url?; bio?; years_experience?; skills?; availability_status? }): Promise<{ ok; error? }>` — provider self-edit; updates own row (RLS pins the protected fields).
  - `adminUpdateProviderProfile(id, fields): Promise<{ ok; error? }>` — admin edit of any field including `is_verified` and `availability_status`.
- `src/lib/bookings.ts`:
  - `getBookingProfessional(bookingId: string): Promise<Professional | null>` → `supabase.rpc('get_booking_professional', { p_booking_id: bookingId })`, returning `{ full_name, skills, is_verified, completed_jobs_count, profile_photo_url } | null`.

## UI

**Shared components:** `Avatar` (renders `profile_photo_url` image, else initials placeholder); `VerifiedBadge` ("Verified by QuickServe" pill, shown only when `is_verified`); `ProfessionalCard` (customer-facing curated card: avatar, name, primary skill, verified badge, completed-jobs count).

**Provider** — restructure `src/app/provider/` into tabs + detail:
- `provider/_layout.tsx` → `Stack` (wraps the tabs group + job detail).
- `provider/(tabs)/_layout.tsx` → `NativeTabs`: `index` = **My Jobs**, `profile` = **My Profile** (route group strips from URL → `/provider`, `/provider/profile`).
- `provider/(tabs)/index.tsx` → My Jobs (the Slice 6 jobs list + approval gate; pending/rejected render the existing EmptyState).
- `provider/(tabs)/profile.tsx` → My Profile: `Avatar`, bio, skills, years of experience, availability switch (`available`/`unavailable` via `updateMyProviderProfile`), completed-jobs count (read-only), verified badge (read-only). Editable fields saved via `updateMyProviderProfile`. Pending/rejected → gate.
- `provider/job/[id].tsx` → unchanged forward-only job detail (pushed by the Stack).

**Customer** — `src/app/booking/[id].tsx`: replace the raw name/phone Card. When `assigned_provider_id` is set, call `getBookingProfessional(id)` and render `ProfessionalCard` ("Assigned Professional": avatar, name, skill, "Verified by QuickServe" when verified, completed-jobs count) — phone is no longer shown. When only a manual provider is set (`assigned_provider_name` present, no `assigned_provider_id`), show the name as the assigned professional without verified/skills. When none, "No provider assigned yet".

**Admin** — new `src/app/admin/provider/[id].tsx`: view + edit a provider profile (bio, skills, years_experience, profile_photo_url, availability_status), a **Verify** toggle (`is_verified` via `adminUpdateProviderProfile`), and read-only completed-jobs count. The Providers list in `admin/index.tsx` links each provider row to this screen (existing approve/reject preserved).

## Testing

Mock Supabase; no network. Screen/route tests in `src/__tests__/`, never `src/app/`.
- lib: `getProviderProfile`, `updateMyProviderProfile` (self-editable payload), `adminUpdateProviderProfile` (incl. `is_verified`), `getBookingProfessional` (rpc call shape + null).
- `Avatar` (image vs initials), `VerifiedBadge` (shown only when verified), `ProfessionalCard`.
- Provider My Profile: renders fields; availability switch calls `updateMyProviderProfile`; pending/rejected gate.
- Customer booking detail: in-app provider → curated card (name/skill/verified/count, NO phone); manual → name only; none → "No provider assigned yet".
- Admin provider edit: renders profile; Verify toggle calls `adminUpdateProviderProfile({ is_verified: true })`; field edits save.

## Tasks (for the implementation plan)

1. **T1** — migration `0005` (profile fields + RLS pin extension + completed-jobs trigger + `get_booking_professional` RPC) + data layer (`getProviderProfile`, `updateMyProviderProfile`, `adminUpdateProviderProfile`, `getBookingProfessional`) + shared components `Avatar`/`VerifiedBadge`/`ProfessionalCard` (+tests).
2. **T2** — provider tabs restructure + My Profile screen (availability switch, editable fields) (+tests).
3. **T3** — customer Assigned Professional card via RPC (no phone) (+tests).
4. **T4** — admin provider profile view/edit + verify toggle, linked from the Providers list (+tests).
5. **Verify + merge** — `npm test`, `npx tsc --noEmit`, Android bundle smoke; merge to `main`.

## Constraints

- Reuse Slice 1 design tokens; preserve premium feel. Customer Home/Profile and admin booking flows otherwise unchanged.
- Supabase mocked in tests; PLAIN `router.push/replace` (no casts). Route groups strip from the URL — keep admin/provider paths literal (Slice 5/6 lesson).
- One commit per task; after each: `npm test` + `npx tsc --noEmit`.

## Rollback

Branch `feat/slice-7-provider-profiles`; one commit per task; `git revert <sha>`. Additive migration (new columns, extended self-update policy, trigger, RPC), new screens, additive lib functions/components. Migration `0005` forward-only; to undo in DB drop the trigger + `get_booking_professional` and the new columns, and restore the prior `profiles_update_own` check.
