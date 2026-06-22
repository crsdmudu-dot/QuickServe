# Slice 7 — Provider Profiles + Internal Quality System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Providers manage a profile, admins curate/verify it, customers see a curated "Assigned Professional" card after admin assignment; completed-jobs count is maintained automatically.

**Architecture:** Migration `0005` adds profile columns, extends the `profiles_update_own` pin list (providers can't self-verify or edit counts), adds a completed-jobs trigger, and a `security definer` `get_booking_professional` RPC (curated, scoped to the caller's own booking — no browsing, no phone). Data layer wraps these. Provider section becomes NativeTabs (My Jobs / My Profile) + job-detail stack; customer detail shows a curated card via the RPC; admin gains a provider profile edit/verify screen.

**Tech Stack:** Expo Router, TypeScript, Supabase, jest-expo + @testing-library/react-native.

## Global Constraints
- Admin remains in full control; customers cannot browse providers; providers cannot choose customers; customers see only curated assigned-professional info after admin assignment.
- Reuse Slice 1 design tokens; preserve premium feel. Customer Home and admin booking flows otherwise unchanged.
- Supabase mocked in tests; no network. Screen/route tests in `src/__tests__/`, NEVER `src/app/`.
- PLAIN `router.push/replace` (no casts). Route groups `(name)` strip from the URL — keep literal admin/provider path segments (Slice 5/6 lesson).
- One commit per task; after each: `npm test` + `npx tsc --noEmit`.
- Provider self-editable fields ONLY: `profile_photo_url, bio, years_experience, skills, availability_status`. `is_verified`, `completed_jobs_count`, `average_rating`, `role`, `approval_status` are NOT provider-editable.
- OUT: ratings, reviews, payments, notifications, maps, tracking, earnings.

## File Structure
- `supabase/migrations/0005_provider_profiles.sql` — columns + RLS + trigger + RPC (T1).
- `src/lib/providers.ts` — expanded `ProviderProfile`, `getProviderProfile`, `updateMyProviderProfile`, `adminUpdateProviderProfile` (T1).
- `src/lib/bookings.ts` — `Professional` type + `getBookingProfessional` (T1).
- `src/components/ui/{avatar,verified-badge,professional-card}.tsx` (T1).
- `src/app/provider/_layout.tsx` (→ Stack), `src/app/provider/(tabs)/_layout.tsx` (NativeTabs), `src/app/provider/(tabs)/index.tsx` (moved jobs), `src/app/provider/(tabs)/profile.tsx` (new) (T2); `src/app/provider/job/[id].tsx` unchanged.
- `src/app/booking/[id].tsx` — curated card (T3).
- `src/app/admin/provider/[id].tsx` (new) + `src/app/admin/index.tsx` (link rows) (T4).
- Tests in `src/__tests__/` and `src/lib/*.test.ts`, `src/components/ui/*.test.tsx`.

---

## Task 1 — Migration 0005 + RLS + trigger + RPC + data layer + shared components

**Files:**
- Create: `supabase/migrations/0005_provider_profiles.sql`, `src/components/ui/avatar.tsx`, `src/components/ui/verified-badge.tsx`, `src/components/ui/professional-card.tsx`
- Modify: `src/lib/providers.ts`, `src/lib/bookings.ts`
- Test: `src/lib/providers.test.ts`, `src/lib/bookings.test.ts`, `src/components/ui/avatar.test.tsx`, `src/components/ui/verified-badge.test.tsx`, `src/components/ui/professional-card.test.tsx`

**Interfaces — Produces:**
- `ProviderProfile` gains: `profile_photo_url: string|null; bio: string|null; years_experience: number|null; skills: string[]|null; is_verified: boolean; completed_jobs_count: number; average_rating: number|null; availability_status: 'available'|'unavailable'`.
- `EditableProviderFields = { profile_photo_url?: string; bio?: string; years_experience?: number; skills?: string[]; availability_status?: 'available'|'unavailable' }`
- `getProviderProfile(id: string): Promise<ProviderProfile | null>`
- `updateMyProviderProfile(fields: EditableProviderFields): Promise<{ok;error?}>`
- `adminUpdateProviderProfile(id: string, fields: Partial<ProviderProfile>): Promise<{ok;error?}>`
- `Professional = { full_name: string|null; skills: string[]|null; is_verified: boolean; completed_jobs_count: number; profile_photo_url: string|null }`
- `getBookingProfessional(bookingId: string): Promise<Professional | null>`
- `<Avatar name photoUrl size? />`, `<VerifiedBadge />`, `<ProfessionalCard professional />`

- [ ] **1. SQL `supabase/migrations/0005_provider_profiles.sql`**
```sql
-- New provider profile columns
alter table public.profiles
  add column if not exists profile_photo_url text,
  add column if not exists bio text,
  add column if not exists years_experience int,
  add column if not exists skills text[],
  add column if not exists is_verified boolean not null default false,
  add column if not exists completed_jobs_count int not null default 0,
  add column if not exists average_rating numeric,
  add column if not exists availability_status text not null default 'available'
    check (availability_status in ('available','unavailable'));

-- Extend self-update guard: pin verify/count/rating in addition to role/approval_status
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and approval_status = (select p.approval_status from public.profiles p where p.id = auth.uid())
    and is_verified = (select p.is_verified from public.profiles p where p.id = auth.uid())
    and completed_jobs_count = (select p.completed_jobs_count from public.profiles p where p.id = auth.uid())
    and average_rating is not distinct from (select p.average_rating from public.profiles p where p.id = auth.uid())
  );

-- Quality system: bump completed_jobs_count when a job transitions into 'completed'
create or replace function public.bump_completed_jobs()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status <> 'completed'
     and new.assigned_provider_id is not null then
    update public.profiles
      set completed_jobs_count = completed_jobs_count + 1
      where id = new.assigned_provider_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_bump_completed_jobs on public.bookings;
create trigger trg_bump_completed_jobs after update on public.bookings
  for each row execute function public.bump_completed_jobs();

-- Curated professional card for a booking; caller must own the booking or be admin.
create or replace function public.get_booking_professional(p_booking_id uuid)
returns table (
  full_name text, skills text[], is_verified boolean,
  completed_jobs_count int, profile_photo_url text
)
language sql security definer set search_path = public as $$
  select pr.full_name, pr.skills, pr.is_verified, pr.completed_jobs_count, pr.profile_photo_url
  from public.bookings b
  join public.profiles pr on pr.id = b.assigned_provider_id
  where b.id = p_booking_id
    and b.assigned_provider_id is not null
    and (b.customer_id = auth.uid() or public.is_admin());
$$;
```
- [ ] **2. Failing tests `src/lib/providers.test.ts`** (extend the existing `@/lib/supabase` mock: add `single` for `select().eq().single()`, `update().eq()`, and `auth.getUser`):
```ts
it('getProviderProfile returns the row or null', async () => {
  single.mockResolvedValue({ data: { id: 'p1', is_verified: true }, error: null });
  expect(await getProviderProfile('p1')).toEqual({ id: 'p1', is_verified: true });
  single.mockResolvedValue({ data: null, error: { message: 'x' } });
  expect(await getProviderProfile('p1')).toBeNull();
});
it('updateMyProviderProfile updates the signed-in user row', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'p1' } } });
  update.mockReturnValue({ eq: (...a:unknown[]) => updateEq(...a) });
  updateEq.mockResolvedValue({ error: null });
  expect(await updateMyProviderProfile({ availability_status: 'unavailable' })).toEqual({ ok: true });
  expect(update).toHaveBeenCalledWith({ availability_status: 'unavailable' });
  expect(updateEq).toHaveBeenCalledWith('id', 'p1');
});
it('adminUpdateProviderProfile updates by id incl is_verified', async () => {
  update.mockReturnValue({ eq: (...a:unknown[]) => updateEq(...a) });
  updateEq.mockResolvedValue({ error: null });
  expect(await adminUpdateProviderProfile('p1', { is_verified: true })).toEqual({ ok: true });
  expect(update).toHaveBeenCalledWith({ is_verified: true });
  expect(updateEq).toHaveBeenCalledWith('id', 'p1');
});
```
- [ ] **3. Failing test `src/lib/bookings.test.ts`** (add `rpc` to the `@/lib/supabase` mock):
```ts
it('getBookingProfessional returns the first rpc row or null', async () => {
  rpc.mockResolvedValue({ data: [{ full_name: 'Jane', skills: ['Plumbing'], is_verified: true, completed_jobs_count: 5, profile_photo_url: null }], error: null });
  expect(await getBookingProfessional('b1')).toEqual({ full_name: 'Jane', skills: ['Plumbing'], is_verified: true, completed_jobs_count: 5, profile_photo_url: null });
  expect(rpc).toHaveBeenCalledWith('get_booking_professional', { p_booking_id: 'b1' });
  rpc.mockResolvedValue({ data: [], error: null });
  expect(await getBookingProfessional('b1')).toBeNull();
});
```
- [ ] **4. Failing component tests:**
  - `avatar.test.tsx`: `<Avatar name="Jane Doe" photoUrl={null} />` → `screen.getByText('JD')` (initials); with `photoUrl="http://x/p.png"` → an `Image` is rendered (query by testID `avatar-image`).
  - `verified-badge.test.tsx`: `<VerifiedBadge />` → `screen.getByText('Verified by QuickServe')`.
  - `professional-card.test.tsx`: `<ProfessionalCard professional={{ full_name:'Jane', skills:['Plumbing'], is_verified:true, completed_jobs_count:5, profile_photo_url:null }} />` → shows `Jane`, `Plumbing`, `Verified by QuickServe`, and `5` (completed count); with `is_verified:false` → no "Verified by QuickServe".
- [ ] **5. Run → FAIL** `npm test -- providers.test bookings.test avatar verified-badge professional-card`
- [ ] **6. Implement:**
  - `providers.ts`: expand `ProviderProfile`; add `EditableProviderFields`; `getProviderProfile` (`select('*').eq('id',id).single()`, `if (error) return null`); `updateMyProviderProfile` (get user, `update(fields).eq('id', user.id)`, signed-out → `{ok:false,error:'You must be signed in.'}`); `adminUpdateProviderProfile` (`update(fields).eq('id', id)`). Friendly error strings on failure.
  - `bookings.ts`: add `Professional` type + `getBookingProfessional` (`supabase.rpc('get_booking_professional', { p_booking_id: bookingId })`; return `rows?.[0] ?? null`).
  - `avatar.tsx`: if `photoUrl` → `<Image testID="avatar-image" source={{uri:photoUrl}} …>` (rounded, `size` default 56); else a circle (`Radii.pill`, `theme.backgroundElement`) with initials (first letters of up to 2 name words, uppercased). Use `useTheme`.
  - `verified-badge.tsx`: pill (`Radii.pill`, tinted `primaryTint` bg) + `Text variant="caption" color="primary"` "Verified by QuickServe".
  - `professional-card.tsx`: `Card` with `Avatar`, name (`heading`), primary skill (`skills?.[0]`, `body`), `VerifiedBadge` when `is_verified`, and a caption `"<n> jobs completed"`.
- [ ] **7. Run → PASS** same commands; `npm test`; `npx tsc --noEmit`
- [ ] **8. Commit** `git add supabase/migrations/0005_provider_profiles.sql src/lib/providers.ts src/lib/providers.test.ts src/lib/bookings.ts src/lib/bookings.test.ts src/components/ui/avatar.tsx src/components/ui/avatar.test.tsx src/components/ui/verified-badge.tsx src/components/ui/verified-badge.test.tsx src/components/ui/professional-card.tsx src/components/ui/professional-card.test.tsx && git commit -m "feat: slice7 provider profile schema + quality system + data layer"`

---

## Task 2 — Provider tabs + My Profile

**Files:**
- Create: `src/app/provider/(tabs)/_layout.tsx`, `src/app/provider/(tabs)/index.tsx`, `src/app/provider/(tabs)/profile.tsx`
- Modify: `src/app/provider/_layout.tsx`; delete old `src/app/provider/index.tsx`
- Test: `src/__tests__/provider.test.tsx` (update import), `src/__tests__/provider-profile.test.tsx` (create)

**Interfaces:**
- Consumes: `useAuth().approvalStatus`/`signOut`/`session`; `getProviderProfile`, `updateMyProviderProfile`; `getProviderJobs`; `Avatar`/`VerifiedBadge`/`Card`/`Button`/`Input`/`Text`/`EmptyState`/`StatusBadge`; `SERVICES`; `router`.
- Produces: routes `/provider` (My Jobs), `/provider/profile` (My Profile); `/provider/job/[id]` unchanged.

- [ ] **1. `provider/_layout.tsx` → Stack** wrapping the tabs group + job detail:
```tsx
import { Stack } from 'expo-router';
export default function ProviderLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="job/[id]" options={{ headerShown: true, title: 'Job' }} />
    </Stack>
  );
}
```
- [ ] **2. `provider/(tabs)/_layout.tsx` → NativeTabs** (mirror `src/components/app-tabs.tsx`): two `NativeTabs.Trigger`s — `index` label "My Jobs" (icon `@/assets/images/tabIcons/home.png`), `profile` label "My Profile" (icon `@/assets/images/tabIcons/explore.png`), both `renderingMode="template"`, with the same `backgroundColor`/`indicatorColor`/`labelStyle` from `Colors`.
- [ ] **3. Move jobs screen** — copy the current `provider/index.tsx` content to `provider/(tabs)/index.tsx` unchanged (keeps approval gate + jobs list + `router.push('/provider/job/'+id)`), then delete `provider/index.tsx`.
- [ ] **4. `provider/(tabs)/profile.tsx`** — `const { approvalStatus, session, signOut } = useAuth();`
  - pending/rejected → the same EmptyState gates as the jobs screen.
  - approved → `useEffect` load `getProviderProfile(session.user.id)` into state. Render: `Avatar` (name=full_name, photoUrl), name + `VerifiedBadge` when `is_verified`, completed-jobs count (read-only caption), `Input`s for bio / years_experience / skills (comma-separated → split/join), profile_photo_url; an availability switch (a `Button` toggling `available`/`unavailable`, label reflects state). A "Save" Button calls `updateMyProviderProfile({ bio, years_experience: Number(...), skills: <split>, profile_photo_url, availability_status })`; the availability toggle may save immediately via `updateMyProviderProfile({ availability_status })`. Inline error on failure. Sign-out button.
- [ ] **5. Tests:**
  - `provider.test.tsx`: update the import to `@/app/provider/(tabs)/index`; keep the existing 3 approvalStatus cases.
  - `provider-profile.test.tsx`: mock `expo-router`, `@/auth/auth-context` (`useAuth` → `{ approvalStatus:'approved', session:{ user:{ id:'p1' } }, signOut: jest.fn() }`), `@/lib/providers` (`getProviderProfile` → a full profile with `is_verified:true, completed_jobs_count:5, availability_status:'available'`; `updateMyProviderProfile` → `{ok:true}`). Assert (async): name + "Verified by QuickServe" + "5" shown; toggling availability calls `updateMyProviderProfile` with `{ availability_status: 'unavailable' }`. Also a `pending` case → "Awaiting approval".
- [ ] **6. Run → FAIL** then implement → **PASS** `npm test`; `npx tsc --noEmit` (regenerate route types via the bundle smoke if tsc complains about `/provider/profile` — see Verification).
- [ ] **7. Commit** `git add src/app/provider src/__tests__/provider.test.tsx src/__tests__/provider-profile.test.tsx && git rm src/app/provider/index.tsx && git commit -m "feat: slice7 provider tabs + my profile"`

---

## Task 3 — Customer Assigned Professional card

**Files:**
- Modify: `src/app/booking/[id].tsx`
- Test: `src/__tests__/booking-detail.test.tsx`

**Interfaces:**
- Consumes: `getBookingProfessional`; `ProfessionalCard`; existing `getBookingById`.

- [ ] **1. Replace the raw provider Card** in `booking/[id].tsx`:
  - Add `const [professional, setProfessional] = useState<Professional | null>(null);`
  - In the effect, after loading the booking, if `b.assigned_provider_id` is set call `getBookingProfessional(id).then(setProfessional)`.
  - Render logic under the status badge:
    - `professional` present → "Assigned Professional" heading + `<ProfessionalCard professional={professional} />`. (NO phone shown.)
    - else if `booking.assigned_provider_name` (manual, no id) → a simple Card: "Assigned Professional" + name only (no phone, no verified/skills).
    - else → muted "No provider assigned yet".
- [ ] **2. Failing tests `src/__tests__/booking-detail.test.tsx`** (extend the existing mock of `@/lib/bookings` to also mock `getBookingProfessional`):
  - In-app provider: `getBookingById` → booking with `assigned_provider_id:'p1', assigned_provider_name:'Jane'`; `getBookingProfessional` → `{ full_name:'Jane', skills:['Plumbing'], is_verified:true, completed_jobs_count:5, profile_photo_url:null }`. Assert "Jane", "Plumbing", "Verified by QuickServe", "5" shown; assert the phone string is NOT present (`screen.queryByText('0700')` is null — booking has a phone but it must not render).
  - Manual provider: `assigned_provider_id:null, assigned_provider_name:'Bob'` → "Bob" shown, no "Verified by QuickServe".
  - None: nulls → "No provider assigned yet".
- [ ] **3. Run → FAIL** then implement → **PASS** `npm test -- booking-detail`; `npm test`; `npx tsc --noEmit`
- [ ] **4. Commit** `git add src/app/booking/[id].tsx src/__tests__/booking-detail.test.tsx && git commit -m "feat: slice7 customer assigned professional card"`

---

## Task 4 — Admin provider profile edit + verify

**Files:**
- Create: `src/app/admin/provider/[id].tsx`
- Modify: `src/app/admin/index.tsx` (link provider rows)
- Test: `src/__tests__/admin-provider-detail.test.tsx` (create), `src/__tests__/admin.test.tsx` (update)

**Interfaces:**
- Consumes: `getProviderProfile`, `adminUpdateProviderProfile`; `Avatar`/`VerifiedBadge`/`Input`/`Button`/`Text`/`Card`; `useLocalSearchParams`, `router`.
- Produces: route `/admin/provider/[id]`.

- [ ] **1. `admin/provider/[id].tsx`** — `const { id } = useLocalSearchParams<{id:string}>();` load `getProviderProfile(id)` into state. Render: `Avatar`, name + `VerifiedBadge` when verified, read-only completed-jobs count; editable `Input`s (bio, years_experience, skills comma-separated, profile_photo_url) + availability toggle; a **Verify** toggle Button → `adminUpdateProviderProfile(id, { is_verified: !current })` then update local state; a **Save** Button → `adminUpdateProviderProfile(id, { bio, years_experience:Number(...), skills:<split>, profile_photo_url, availability_status })`. Inline error on failure.
- [ ] **2. Link provider rows** — in `admin/index.tsx` Providers list, wrap each provider `Card` with `onPress={() => router.push('/admin/provider/' + p.id)}` (keep the Approve/Reject buttons working — they call `handleApprove/handleReject` and must not trigger navigation; rely on the buttons' own `onPress`).
- [ ] **3. Failing test `src/__tests__/admin-provider-detail.test.tsx`** — mock `expo-router` (`useLocalSearchParams`→`{id:'p1'}`, `router`), `@/lib/providers` (`getProviderProfile` → profile with `is_verified:false, completed_jobs_count:3`; `adminUpdateProviderProfile`→`{ok:true}`). Assert (async): name + "3" shown; pressing **Verify** calls `adminUpdateProviderProfile('p1', { is_verified: true })`; editing bio + **Save** calls `adminUpdateProviderProfile` with the bio.
- [ ] **4. Update `admin.test.tsx`** — the Providers tab rows are now pressable; add an assertion that pressing a provider row (its name) calls `router.push('/admin/provider/p1')`. Keep the existing approve/reject assertions.
- [ ] **5. Run → FAIL** then implement → **PASS** `npm test`; `npx tsc --noEmit`
- [ ] **6. Commit** `git add "src/app/admin/provider" src/app/admin/index.tsx src/__tests__/admin-provider-detail.test.tsx src/__tests__/admin.test.tsx && git commit -m "feat: slice7 admin provider profile edit + verify"`

---

## Verification (controller, after Task 4)
- `npm test` all pass; `npx tsc --noEmit` clean.
- Android bundle smoke: `npx expo start -c`, wait for Metro, fetch the manifest's `launchAsset.url` → HTTP 200, no errors. (Regenerates `.expo/types/router.d.ts`; run BEFORE trusting tsc on the new `/provider/profile` and `/admin/provider/[id]` routes.)
- Routes present: `/provider`, `/provider/profile`, `/provider/job/[id]`, `/admin/provider/[id]`.

### SQL migration step (run before Expo Go)
Apply `supabase/migrations/0005_provider_profiles.sql`. Confirm: the 8 new `profiles` columns exist; `profiles_update_own` recreated with the extended pin list; trigger `trg_bump_completed_jobs` and function `bump_completed_jobs` exist; function `get_booking_professional` exists.

### RPC + trigger verification (DB)
- As an approved in-app provider, advance one of their assigned bookings to `completed`; confirm that provider's `profiles.completed_jobs_count` incremented by exactly 1 (and does not increment again on a no-op re-save of `completed`).
- As the booking's customer, `select * from get_booking_professional('<booking_id>')` returns the curated row (name/skills/verified/count/photo, NO phone). As a DIFFERENT signed-in user, the same call returns 0 rows (no browsing). As admin, it returns the row.
- As a provider, attempt `update profiles set is_verified = true where id = auth.uid()` → rejected by RLS (pinned).

### Expo Go end-to-end
1. **Provider**: sign in (approved) → bottom tabs **My Jobs** / **My Profile**. On My Profile edit bio/skills/years/photo URL + Save; toggle availability. Verified badge + completed count are read-only.
2. **Admin**: Providers tab → tap a provider → edit fields, press **Verify** (badge turns on). Approve/Reject still work from the list.
3. **Customer**: open a booking assigned to an in-app provider → "Assigned Professional" card (name, skill, "Verified by QuickServe", completed count) with NO phone. Manual provider → name only. Unassigned → "No provider assigned yet".

## Rollback
Branch `feat/slice-7-provider-profiles`; one commit per task → `git revert <sha>`. Additive: new columns, recreated self-update policy, trigger, RPC, new screens/components, additive lib functions. Migration `0005` forward-only; to undo in DB drop trigger `trg_bump_completed_jobs` + functions `bump_completed_jobs`/`get_booking_professional` and the new columns, and restore the prior `profiles_update_own` check from `0001`.

## Self-review
- Columns + extended RLS pin (verify/count/rating) + trigger + RPC → T1 ✓. Data layer (`getProviderProfile`/`updateMyProviderProfile`/`adminUpdateProviderProfile`/`getBookingProfessional`) + `Avatar`/`VerifiedBadge`/`ProfessionalCard` → T1 ✓. Provider tabs + My Profile (availability switch, self-editable fields only) → T2 ✓. Customer curated card, no phone → T3 ✓. Admin profile edit + verify, linked from list → T4 ✓. Tests mock Supabase, in `src/__tests__/`/`src/lib/`/`src/components/ui/` ✓.
- Invariants: RPC scoped to own booking (no browse, no phone); `is_verified`/`completed_jobs_count` pinned (no self-verify); admin full edit; signatures consistent across tasks (`ProviderProfile`, `Professional`, `getBookingProfessional`, `adminUpdateProviderProfile`).
