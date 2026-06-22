# Slice 6 — Provider Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Approved providers view and forward-progress the jobs assigned to them; admins assign either a manual or an approved in-app provider.

**Architecture:** Migration `0004` adds `bookings.assigned_provider_id` + provider RLS (select-own-assigned; update-own with forward-only status and all other fields pinned). Data layer gains provider/admin helpers. A literal `provider/` route dir replaces the `(provider)` group; the home branches on `approvalStatus`. Admin detail gets a Manual|In-app assign toggle.

**Tech Stack:** Expo Router, TypeScript, Supabase, jest-expo + @testing-library/react-native.

## Global Constraints
- Reuse Slice 1 design tokens; preserve premium feel. Existing customer/admin UI unchanged except the admin assign toggle.
- Supabase mocked in tests; no network. Screen/route tests in `src/__tests__/`, NEVER `src/app/`.
- PLAIN `router.push/replace` (no casts). One commit per task. After each task: `npm test` + `npx tsc --noEmit`.
- Forward-only provider progression: `provider_assigned → on_the_way → in_progress → completed`. Providers cannot cancel, reopen, move backward, or edit `customer_id/service_id/address/scheduled_for/assigned_provider_id/assigned_provider_name/assigned_provider_phone`. Admin retains full control.
- Route groups `(name)` strip from the URL — use a literal `provider/` directory (Slice 5 lesson).
- OUT: payments, maps, tracking, earnings, notifications, ratings.

## File Structure
- `supabase/migrations/0004_provider_jobs.sql` — column + provider RLS (T1).
- `src/lib/bookings.ts` — `Booking.assigned_provider_id`, `getProviderJobs`, extend `assignProvider` (T1).
- `src/lib/providers.ts` — `getApprovedProviders` (T1).
- `src/constants/booking-status.ts` — `PROVIDER_NEXT_STATUSES` (T1).
- `src/app/provider/{_layout,index}.tsx`, `src/app/provider/job/[id].tsx` (T2); delete `src/app/(provider)/provider.tsx`.
- `src/app/admin/booking/[id].tsx` — Manual|In-app toggle (T3).
- Tests in `src/__tests__/` and `src/lib/*.test.ts`, `src/constants/booking-status.test.ts`.

---

## Task 1 — Migration 0004 + data layer

**Files:**
- Create: `supabase/migrations/0004_provider_jobs.sql`
- Modify: `src/lib/bookings.ts`, `src/lib/providers.ts`, `src/constants/booking-status.ts`
- Test: `src/lib/bookings.test.ts`, `src/lib/providers.test.ts`, `src/constants/booking-status.test.ts` (create)

**Interfaces — Produces:**
- `Booking.assigned_provider_id: string | null`
- `getProviderJobs(): Promise<Booking[]>`
- `assignProvider(id, { name: string; phone: string; providerId?: string }): Promise<{ok;error?}>` (extended)
- `getApprovedProviders(): Promise<ProviderProfile[]>`
- `PROVIDER_NEXT_STATUSES: Record<BookingStatus, BookingStatus[]>`

- [ ] **1. SQL `supabase/migrations/0004_provider_jobs.sql`**
```sql
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
    and status in ('on_the_way','in_progress','completed')
    and (case status
            when 'on_the_way' then 1 when 'in_progress' then 2 when 'completed' then 3 else 0 end)
        >
        (case (select b.status from public.bookings b where b.id = bookings.id)
            when 'provider_assigned' then 0 when 'on_the_way' then 1
            when 'in_progress' then 2 when 'completed' then 3 else -1 end)
  );
```
- [ ] **2. `PROVIDER_NEXT_STATUSES` in `src/constants/booking-status.ts`** (append):
```ts
// Forward-only provider progression: each status maps to the single next step
// a provider may move to. Empty array = no provider action available.
export const PROVIDER_NEXT_STATUSES: Record<BookingStatus, BookingStatus[]> = {
  pending: [],
  accepted: [],
  provider_assigned: ['on_the_way'],
  on_the_way: ['in_progress'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
};
```
- [ ] **3. Failing test `src/constants/booking-status.test.ts`**
```ts
import { PROVIDER_NEXT_STATUSES } from '@/constants/booking-status';
describe('PROVIDER_NEXT_STATUSES (forward-only)', () => {
  it('advances one step along the provider chain', () => {
    expect(PROVIDER_NEXT_STATUSES.provider_assigned).toEqual(['on_the_way']);
    expect(PROVIDER_NEXT_STATUSES.on_the_way).toEqual(['in_progress']);
    expect(PROVIDER_NEXT_STATUSES.in_progress).toEqual(['completed']);
  });
  it('offers no action on terminal/non-provider statuses', () => {
    expect(PROVIDER_NEXT_STATUSES.completed).toEqual([]);
    expect(PROVIDER_NEXT_STATUSES.cancelled).toEqual([]);
    expect(PROVIDER_NEXT_STATUSES.pending).toEqual([]);
  });
});
```
- [ ] **4. Failing tests in `src/lib/bookings.test.ts`** (reuse the existing `@/lib/supabase` mock with `from().select().order()` and `update().eq()`):
```ts
it('getProviderJobs returns rows newest-first', async () => {
  order.mockResolvedValue({ data: [{ id: 'j1' }], error: null });
  expect(await getProviderJobs()).toEqual([{ id: 'j1' }]);
});
it('assignProvider (manual) clears assigned_provider_id', async () => {
  update.mockReturnValue({ eq: (...a:unknown[]) => updateEq(...a) });
  updateEq.mockResolvedValue({ error: null });
  await assignProvider('b1', { name: 'Jane', phone: '0700' });
  expect(update).toHaveBeenCalledWith({
    assigned_provider_id: null, assigned_provider_name: 'Jane',
    assigned_provider_phone: '0700', status: 'provider_assigned',
  });
});
it('assignProvider (in-app) sets assigned_provider_id', async () => {
  update.mockReturnValue({ eq: (...a:unknown[]) => updateEq(...a) });
  updateEq.mockResolvedValue({ error: null });
  await assignProvider('b1', { name: 'Jane', phone: '0700', providerId: 'p1' });
  expect(update).toHaveBeenCalledWith({
    assigned_provider_id: 'p1', assigned_provider_name: 'Jane',
    assigned_provider_phone: '0700', status: 'provider_assigned',
  });
});
```
- [ ] **5. Failing test in `src/lib/providers.test.ts`**
```ts
it('getApprovedProviders filters provider+approved', async () => {
  // select().eq('role','provider').eq('approval_status','approved') resolves data
  expect(await getApprovedProviders()).toEqual([{ id: 'p1' }]);
});
```
- [ ] **6. Run → FAIL** `npm test -- bookings.test providers.test booking-status.test`
- [ ] **7. Implement**: add `assigned_provider_id: string | null` to `Booking`; add `getProviderJobs` (`from('bookings').select('*').order('created_at',{ascending:false})`); extend `assignProvider` to write `assigned_provider_id: p.providerId ?? null` alongside name/phone/status; add `getApprovedProviders` (mirror `getPendingProviders` with `approval_status='approved'`).
- [ ] **8. Run → PASS** same commands; `npm test`; `npx tsc --noEmit`
- [ ] **9. Commit** `git add supabase/migrations/0004_provider_jobs.sql src/lib/bookings.ts src/lib/bookings.test.ts src/lib/providers.ts src/lib/providers.test.ts src/constants/booking-status.ts src/constants/booking-status.test.ts && git commit -m "feat: slice6 provider jobs migration + data layer"`

---

## Task 2 — Provider section (literal dir, home states, job detail)

**Files:**
- Create: `src/app/provider/_layout.tsx`, `src/app/provider/index.tsx`, `src/app/provider/job/[id].tsx`
- Delete: `src/app/(provider)/provider.tsx` (and the now-empty `(provider)` group)
- Modify: `src/__tests__/provider.test.tsx` (import path + content)
- Test: `src/__tests__/provider.test.tsx`, `src/__tests__/provider-job-detail.test.tsx` (create)

**Interfaces:**
- Consumes: `useAuth().approvalStatus`/`signOut`; `getProviderJobs`, `getBookingById`, `updateBookingStatus`; `PROVIDER_NEXT_STATUSES`, `STATUS_LABELS`, `StatusBadge`, `BookingSummaryCard`, `Card`/`Button`/`Text`/`EmptyState`; `SERVICES`; `router`, `useLocalSearchParams`.
- Produces: routes `/provider`, `/provider/job/[id]`.

- [ ] **1. `provider/_layout.tsx`** — `import { Stack } from 'expo-router'; export default () => <Stack screenOptions={{ headerShown: true, title: 'Provider' }} />;`
- [ ] **2. `provider/index.tsx`** — `const { approvalStatus, signOut } = useAuth();`
  - `approvalStatus === 'pending'` → `EmptyState` (icon `⏳`, title "Awaiting approval", message your application is under review) + sign-out action.
  - `approvalStatus === 'rejected'` → `EmptyState` (icon `🚫`, title "Application declined") + sign-out.
  - else (approved) → `useEffect` load `getProviderJobs()` into state; render each as a `Card` (service title via `SERVICES.find`, `<StatusBadge>`, formatted `scheduled_for`) with `onPress={() => router.push('/provider/job/' + j.id)}`; `EmptyState` ("No jobs yet") when empty; sign-out button. Match `SafeAreaView`/`useTheme`/`Spacing` pattern from `src/app/admin/index.tsx`.
- [ ] **3. `provider/job/[id].tsx`** — `const { id } = useLocalSearchParams<{id:string}>();` load `getBookingById(id)`. Render `BookingSummaryCard` (service title via `SERVICES.find`) + address/customer info + `<StatusBadge>`. Render a Button per `PROVIDER_NEXT_STATUSES[booking.status]` (label `STATUS_LABELS[next]`) → `updateBookingStatus(id, next)`; on ok set local status; inline error on failure. When the array is empty (e.g. `completed`) show a muted "No further action" `Text`. READ-ONLY for all other fields.
- [ ] **4. Tests:**
  - `provider.test.tsx` — mock `expo-router`, `@/auth/auth-context` (`useAuth`), `@/lib/bookings` (`getProviderJobs`). Cases: `approvalStatus:'pending'` → "Awaiting approval" shown; `'rejected'` → "Application declined"; `'approved'` with one job → status label renders and pressing the row calls `router.push('/provider/job/j1')`.
  - `provider-job-detail.test.tsx` — mock `expo-router` (`useLocalSearchParams`→`{id:'j1'}`), `@/lib/bookings` (`getBookingById`→ booking with `status:'provider_assigned'`; `updateBookingStatus`→`{ok:true}`). Assert: only "On the way" button shown; pressing it calls `updateBookingStatus('j1','on_the_way')`. Second case: `status:'completed'` → no action button, "No further action" shown.
- [ ] **5. Run → FAIL** then implement → **PASS** `npm test`; `npx tsc --noEmit` (after regenerating route types via the bundle smoke if tsc complains about the new routes — see Verification).
- [ ] **6. Commit** `git add src/app/provider src/__tests__/provider.test.tsx src/__tests__/provider-job-detail.test.tsx && git rm "src/app/(provider)/provider.tsx" && git commit -m "feat: slice6 provider home + job detail (forward-only)"`

---

## Task 3 — Admin in-app assign toggle

**Files:**
- Modify: `src/app/admin/booking/[id].tsx`
- Test: `src/__tests__/admin-booking-detail.test.tsx`

**Interfaces:**
- Consumes: `getApprovedProviders` (`@/lib/providers`), extended `assignProvider`.

- [ ] **1. Add a Manual|In-app toggle** to the Assign Provider section of `admin/booking/[id].tsx`: `useState<'manual'|'inApp'>('manual')` with two `Button`s (secondary active / ghost inactive).
  - Manual (unchanged): name + phone inputs → `assignProvider(id, { name: providerName, phone: providerPhone })`.
  - In-app: `useEffect`/lazy-load `getApprovedProviders()` into state; render each approved provider as a `Card` (full_name + phone) with `onPress={() => handleAssignInApp(p)}` where `handleAssignInApp(p)` calls `assignProvider(id, { providerId: p.id, name: p.full_name ?? '', phone: p.phone ?? '' })` and on ok updates local booking (`status:'provider_assigned'`, name/phone). Inline error on failure.
- [ ] **2. Failing tests in `src/__tests__/admin-booking-detail.test.tsx`** — extend the existing mock: add `@/lib/providers` mock (`getApprovedProviders`→`[{id:'p1',full_name:'Jane',phone:'0700',approval_status:'approved'}]`) and `assignProvider` already mocked. Cases:
  - Manual (default): filling name/phone + Assign calls `assignProvider('b1',{name:'Jane',phone:'0700'})` (unchanged behavior).
  - Switching to In-app shows `Jane`; tapping the provider calls `assignProvider('b1',{providerId:'p1',name:'Jane',phone:'0700'})`.
- [ ] **3. Run → FAIL** then implement → **PASS** `npm test -- admin-booking-detail`; `npm test`; `npx tsc --noEmit`
- [ ] **4. Commit** `git add "src/app/admin/booking/[id].tsx" src/__tests__/admin-booking-detail.test.tsx && git commit -m "feat: slice6 admin in-app provider assignment"`

---

## Verification (controller, after Task 3)
- `npm test` all pass; `npx tsc --noEmit` clean.
- Android bundle smoke: `npx expo start -c`, wait for Metro, fetch the manifest's `launchAsset.url` (`expo-router/entry.bundle?platform=android…`) → expect HTTP 200, no Metro errors. (This also regenerates `.expo/types/router.d.ts`; run it BEFORE trusting tsc on the new `/provider/job/[id]` route.)
- Routes present: `/provider`, `/provider/job/[id]`, plus existing `/admin/booking/[id]`.

### SQL migration step (run before Expo Go)
Apply `supabase/migrations/0004_provider_jobs.sql` to the Supabase project (SQL editor or `supabase db push`). Confirm: `bookings.assigned_provider_id` exists; policies `bookings_select_provider` and `bookings_update_provider` exist. Have one approved provider account and one pending/rejected provider for the home-state checks.

### Expo Go end-to-end
1. As **admin**: open a booking → Assign Provider → **In-app** → pick the approved provider (sets `assigned_provider_id`, status `provider_assigned`).
2. As that **provider** (approved): `/provider` shows the job; open it → only **On the way** is offered → tap (status advances). Reopen → only **In progress** → tap → only **Completed** → tap. Confirm no backward/cancel buttons and that a `completed` job shows "No further action".
3. As a **pending** provider: `/provider` shows "Awaiting approval". As a **rejected** provider: shows "Application declined".
4. As **customer**: the booking detail still shows the assigned provider name + phone and the live status.
5. Attempt (DB-level) a backward update as the provider → rejected by RLS.

## Rollback
Branch `feat/slice-6-provider-experience`; one commit per task → `git revert <sha>`. Additive: new migration (column + provider policies), new provider screens, additive lib functions, one admin section. Migration `0004` is forward-only; to undo in DB drop policies `bookings_select_provider`/`bookings_update_provider` and column `assigned_provider_id`.

## Self-review
- `assigned_provider_id` + provider RLS (select-own, update forward-only, fields pinned) → T1 ✓. `getProviderJobs`/extended `assignProvider`/`getApprovedProviders`/`PROVIDER_NEXT_STATUSES` → T1 ✓. Provider literal dir + home (pending/rejected/approved) + job detail forward-only → T2 ✓. Admin Manual|In-app toggle → T3 ✓. Tests mock Supabase, in `src/__tests__/`/`src/lib/`/`src/constants/` ✓.
- Forward-only enforced in BOTH RLS (rank CASE) and UI (`PROVIDER_NEXT_STATUSES`). Names consistent across tasks (`assignProvider` signature, `getProviderJobs`, `getApprovedProviders`).
