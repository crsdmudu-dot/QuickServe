# Slice 5 — Admin Dispatch + Provider Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement task-by-task. Steps use `- [ ]` checkboxes.

**Goal:** Admin manually manages real bookings (view all, accept/reject, assign off-platform provider, update status, notes) and approves/rejects providers; customers see status + assigned provider name/phone.

**Architecture:** Migration `0003` adds a security-definer `is_admin()` + admin RLS on `bookings`/`profiles`, new provider columns, and the 7-status constraint. A data layer (`bookings.ts` extended, new `providers.ts`) wraps Supabase. New `(admin)` stack + a customer **My Bookings** tab consume it. Slice 1 design tokens throughout.

**Tech Stack:** Expo Router, TypeScript, Supabase, jest-expo + @testing-library/react-native.

## Global Constraints
- Reuse Slice 1 design system + tokens; preserve premium feel. Customer Home/Profile unchanged.
- Supabase mocked in tests; no network. Screen/route tests in `src/__tests__/`, NEVER `src/app/`.
- PLAIN `router.push/replace` (no casts). One commit per task. After each task: `npm test` + `npx tsc --noEmit`.
- Status values (exact): `pending, accepted, provider_assigned, on_the_way, in_progress, completed, cancelled`.
- RLS: customer keeps insert/select own; admin gets select-all + update-all on bookings, select-all + update-all on profiles. No delete policies.
- OUT: payments, maps, tracking, marketplace automation, realtime.

## File Structure
- `supabase/migrations/0003_admin_dispatch.sql` — admin RLS, columns, status constraint (T1).
- `src/constants/booking-status.ts` — `ALL_STATUSES`, `STATUS_LABELS`, `STATUS_COLORS` (T1).
- `src/components/ui/status-badge.tsx` — status pill (T1).
- `src/lib/bookings.ts` — extend with admin fns + new types (T2).
- `src/lib/providers.ts` — provider approval queries (T2).
- `src/app/(admin)/_layout.tsx`, `src/app/(admin)/admin.tsx` — admin lists (T3).
- `src/app/(admin)/booking/[id].tsx` — admin booking detail (T4).
- `src/components/app-tabs.tsx`, `src/app/(customer)/bookings.tsx`, `src/app/booking/[id].tsx` — customer view (T5).
- Tests in `src/__tests__/` and `src/lib/*.test.ts`.

---

## Task 1 — Migration + status constants + StatusBadge

**Files:**
- Create: `supabase/migrations/0003_admin_dispatch.sql`
- Create: `src/constants/booking-status.ts`, `src/components/ui/status-badge.tsx`
- Test: `src/components/ui/status-badge.test.tsx`

**Interfaces — Produces:**
- `type BookingStatus = 'pending'|'accepted'|'provider_assigned'|'on_the_way'|'in_progress'|'completed'|'cancelled'` (will move to `bookings.ts` in T2; T1 defines it inline in `booking-status.ts` and re-exports).
- `ALL_STATUSES: BookingStatus[]`, `STATUS_LABELS: Record<BookingStatus,string>`, `STATUS_COLORS: Record<BookingStatus, ThemeColor>`.
- `<StatusBadge status={BookingStatus} />`.

- [ ] **1. SQL `supabase/migrations/0003_admin_dispatch.sql`**
```sql
-- New booking columns
alter table public.bookings add column if not exists assigned_provider_name text;
alter table public.bookings add column if not exists assigned_provider_phone text;
alter table public.bookings add column if not exists admin_notes text;

-- Migrate old status value, then swap the check constraint to the 7-status set
update public.bookings set status = 'provider_assigned' where status = 'assigned';
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending','accepted','provider_assigned','on_the_way','in_progress','completed','cancelled'));

-- Admin detection without RLS recursion
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- Admin policies on bookings
create policy "bookings_select_admin" on public.bookings for select using (public.is_admin());
create policy "bookings_update_admin" on public.bookings for update using (public.is_admin()) with check (public.is_admin());

-- Admin policies on profiles
create policy "profiles_select_admin" on public.profiles for select using (public.is_admin());
create policy "profiles_update_admin" on public.profiles for update using (public.is_admin()) with check (public.is_admin());
```
- [ ] **2. `src/constants/booking-status.ts`** — export `BookingStatus`, `ALL_STATUSES` (in the order above), `STATUS_LABELS` (e.g. `provider_assigned: 'Provider assigned'`, `on_the_way: 'On the way'`), `STATUS_COLORS` mapping to existing `ThemeColor` tokens (`pending→warning`, `accepted→primary`, `provider_assigned→primary`, `on_the_way→primary`, `in_progress→primary`, `completed→success`, `cancelled→error`).
- [ ] **3. Failing test `src/components/ui/status-badge.test.tsx`** — render `<StatusBadge status="provider_assigned" />`; assert `screen.getByText('Provider assigned')` is on screen; render `status="completed"` and assert label `Completed`.
- [ ] **4. Run → FAIL** `npm test -- status-badge`
- [ ] **5. Implement `src/components/ui/status-badge.tsx`** — small pill: a `View` (rounded, `Radii.pill`, tinted background) + `Text variant="caption"` showing `STATUS_LABELS[status]` colored by `STATUS_COLORS[status]`. Use `useTheme` like `Button`/`Card`.
- [ ] **6. Run → PASS** `npm test -- status-badge`; `npx tsc --noEmit`
- [ ] **7. Commit** `git add supabase/migrations/0003_admin_dispatch.sql src/constants/booking-status.ts src/components/ui/status-badge.tsx src/components/ui/status-badge.test.tsx && git commit -m "feat: slice5 migration + status constants + StatusBadge"`

---

## Task 2 — Data layer (bookings admin fns + providers)

**Files:**
- Modify: `src/lib/bookings.ts`
- Create: `src/lib/providers.ts`
- Test: `src/lib/bookings.test.ts` (extend), `src/lib/providers.test.ts`

**Interfaces:**
- Consumes: `BookingStatus` from `@/constants/booking-status`; `supabase` from `@/lib/supabase`.
- Produces (bookings):
  - `Booking` gains `assigned_provider_name: string|null; assigned_provider_phone: string|null; admin_notes: string|null`.
  - `getAllBookings(): Promise<Booking[]>`
  - `getBookingById(id: string): Promise<Booking | null>`
  - `updateBookingStatus(id: string, status: BookingStatus): Promise<{ok:boolean;error?:string}>`
  - `assignProvider(id: string, p: {name:string; phone:string}): Promise<{ok:boolean;error?:string}>`
  - `updateAdminNotes(id: string, notes: string): Promise<{ok:boolean;error?:string}>`
- Produces (providers):
  - `type ProviderProfile = { id:string; full_name:string|null; phone:string|null; approval_status:'pending'|'approved'|'rejected' }`
  - `getPendingProviders(): Promise<ProviderProfile[]>`
  - `setProviderApproval(id:string, status:'approved'|'rejected'): Promise<{ok:boolean;error?:string}>`

- [ ] **1. `BookingStatus` source of truth** — in `bookings.ts` replace the local union with `export type { BookingStatus } from '@/constants/booking-status';` and add the 3 new fields to `Booking`. (`booking-status.ts` keeps the canonical union from T1.)
- [ ] **2. Failing tests `src/lib/bookings.test.ts`** (add to existing mock pattern — extend the `from()` mock to support `update().eq()` and `select().eq().single()`):
```ts
it('getAllBookings returns rows newest-first', async () => {
  order.mockResolvedValue({ data: [{ id: 'b1' }], error: null });
  expect(await getAllBookings()).toEqual([{ id: 'b1' }]);
});
it('updateBookingStatus updates by id and returns ok', async () => {
  update.mockReturnValue({ eq: (...a:unknown[]) => updateEq(...a) });
  updateEq.mockResolvedValue({ error: null });
  expect(await updateBookingStatus('b1', 'accepted')).toEqual({ ok: true });
  expect(update).toHaveBeenCalledWith({ status: 'accepted' });
  expect(updateEq).toHaveBeenCalledWith('id', 'b1');
});
it('assignProvider sets columns + provider_assigned', async () => {
  update.mockReturnValue({ eq: (...a:unknown[]) => updateEq(...a) });
  updateEq.mockResolvedValue({ error: null });
  expect(await assignProvider('b1', { name: 'Jane', phone: '0700' })).toEqual({ ok: true });
  expect(update).toHaveBeenCalledWith({
    assigned_provider_name: 'Jane', assigned_provider_phone: '0700', status: 'provider_assigned',
  });
});
it('updateAdminNotes updates notes', async () => {
  update.mockReturnValue({ eq: (...a:unknown[]) => updateEq(...a) });
  updateEq.mockResolvedValue({ error: null });
  expect(await updateAdminNotes('b1', 'call gate')).toEqual({ ok: true });
  expect(update).toHaveBeenCalledWith({ admin_notes: 'call gate' });
});
it('getBookingById returns row or null', async () => {
  single.mockResolvedValue({ data: { id: 'b1' }, error: null });
  expect(await getBookingById('b1')).toEqual({ id: 'b1' });
  single.mockResolvedValue({ data: null, error: { message: 'x' } });
  expect(await getBookingById('b1')).toBeNull();
});
```
(Add `update`, `updateEq`, `single` jest.fn()s and wire them into the `@/lib/supabase` mock's `from()` return.)
- [ ] **3. Failing tests `src/lib/providers.test.ts`** — mirror the bookings mock:
```ts
it('getPendingProviders queries provider+pending', async () => {
  // select().eq('role','provider').eq('approval_status','pending') resolves data
  expect(await getPendingProviders()).toEqual([{ id: 'p1' }]);
});
it('setProviderApproval updates status and returns ok', async () => {
  expect(await setProviderApproval('p1', 'approved')).toEqual({ ok: true });
  expect(update).toHaveBeenCalledWith({ approval_status: 'approved' });
});
it('maps update error', async () => {
  updateEq.mockResolvedValue({ error: { message: 'boom' } });
  expect(await setProviderApproval('p1','rejected')).toEqual({ ok:false, error:'Could not update provider. Please try again.' });
});
```
- [ ] **4. Run → FAIL** `npm test -- bookings.test providers.test`
- [ ] **5. Implement** the new functions in `bookings.ts` and `providers.ts`. Each mutation returns `{ ok:true }` on `error===null`, else `{ ok:false, error:<friendly message> }`. `getAllBookings` = `from('bookings').select('*').order('created_at',{ascending:false})`. `getBookingById` = `.select('*').eq('id',id).single()` → return `data ?? null`. `getPendingProviders` = `from('profiles').select('id, full_name, phone, approval_status').eq('role','provider').eq('approval_status','pending')`.
- [ ] **6. Run → PASS** `npm test -- bookings.test providers.test`; `npx tsc --noEmit`
- [ ] **7. Commit** `git add src/lib/bookings.ts src/lib/bookings.test.ts src/lib/providers.ts src/lib/providers.test.ts && git commit -m "feat: slice5 admin booking + provider data layer"`

---

## Task 3 — Admin lists screen + provider approval

**Files:**
- Create: `src/app/(admin)/_layout.tsx`
- Modify: `src/app/(admin)/admin.tsx`
- Test: `src/__tests__/admin.test.tsx` (replace the placeholder test)

**Interfaces:**
- Consumes: `getAllBookings`, `getPendingProviders`, `setProviderApproval`; `StatusBadge`; `Card`/`Button`/`Text`; `router`.
- Produces: route `/admin` (lists) and a working tap-through to `/admin/booking/[id]` (target built in T4).

- [ ] **1. `_layout.tsx`** — `import { Stack } from 'expo-router'; export default () => <Stack screenOptions={{ headerShown: true, title: 'Admin' }} />;`
- [ ] **2. `admin.tsx`** — `useState` toggle `'bookings' | 'providers'` (two `Button`s, secondary/ghost for the inactive one). Load data in `useEffect` (`getAllBookings`, `getPendingProviders`) into state; keep `signOut` available in a header/ghost button.
  - Bookings list: each row a `Card` (service id/title via `SERVICES.find`, `<StatusBadge>`, formatted `scheduled_for`) with `onPress={() => router.push('/admin/booking/' + b.id)}`.
  - Providers list: each pending provider a `Card` with `full_name`/`phone` + **Approve**/**Reject** `Button`s calling `setProviderApproval(id, ...)` then removing the row from state.
  - Empty states via existing `EmptyState`.
- [ ] **3. Failing test `src/__tests__/admin.test.tsx`** — mock `expo-router`, `@/lib/bookings` (`getAllBookings` → `[{id:'b1',service_id:'house-cleaning',status:'pending',scheduled_for:'2026-07-01T10:00:00Z',...}]`), `@/lib/providers` (`getPendingProviders` → `[{id:'p1',full_name:'Jane',phone:'0700',approval_status:'pending'}]`, `setProviderApproval` → `{ok:true}`), and `@/auth/auth-context` (`useAuth` → `{ signOut: jest.fn() }`). Assert with `findBy*` (async load):
  - booking row shows status label; pressing it calls `router.push('/admin/booking/b1')`.
  - switching to Providers shows `Jane`; pressing **Approve** calls `setProviderApproval('p1','approved')`.
- [ ] **4. Run → FAIL** then implement → **PASS** `npm test -- admin.test`; `npx tsc --noEmit`
- [ ] **5. Commit** `git add "src/app/(admin)" src/__tests__/admin.test.tsx && git commit -m "feat: slice5 admin lists + provider approval"`

---

## Task 4 — Admin booking detail

**Files:**
- Create: `src/app/(admin)/booking/[id].tsx`
- Test: `src/__tests__/admin-booking-detail.test.tsx`

**Interfaces:**
- Consumes: `getBookingById`, `updateBookingStatus`, `assignProvider`, `updateAdminNotes`; `ALL_STATUSES`/`StatusBadge`; `Input`/`Button`/`Text`/`Card`; `useLocalSearchParams`, `router`.
- Produces: route `/admin/booking/[id]`.

- [ ] **1. `[id].tsx`** — `const { id } = useLocalSearchParams<{ id: string }>();` load booking via `getBookingById(id)` into state. Render: summary (`BookingSummaryCard` reused: service title, address, scheduled_for, notes), current `<StatusBadge>`.
  - Status picker: render `ALL_STATUSES` as a row of selectable `Button`s; tapping one calls `updateBookingStatus(id, s)` and updates local state.
  - Assign provider: two `Input`s (name, phone) + **Assign** `Button` → `assignProvider(id, {name, phone})`, on ok update local status to `provider_assigned`.
  - Admin notes: `Input` (multiline) + **Save notes** `Button` → `updateAdminNotes(id, notes)`.
  - Inline error `Text` (color `error`) when any call returns `{ok:false}`.
- [ ] **2. Failing test `src/__tests__/admin-booking-detail.test.tsx`** — mock `expo-router` (`useLocalSearchParams` → `{id:'b1'}`, `router`), `@/lib/bookings` (`getBookingById` → full booking; the 3 mutations → `{ok:true}`). Assert with async queries:
  - renders service title + address + status badge.
  - tapping a status button (e.g. `In progress`) calls `updateBookingStatus('b1','in_progress')`.
  - filling name/phone + **Assign** calls `assignProvider('b1',{name:'Jane',phone:'0700'})`.
  - typing notes + **Save notes** calls `updateAdminNotes('b1','call gate')`.
- [ ] **3. Run → FAIL** then implement → **PASS** `npm test -- admin-booking-detail`; `npx tsc --noEmit`
- [ ] **4. Commit** `git add "src/app/(admin)/booking" src/__tests__/admin-booking-detail.test.tsx && git commit -m "feat: slice5 admin booking detail"`

---

## Task 5 — Customer My Bookings tab + booking detail

**Files:**
- Modify: `src/components/app-tabs.tsx`
- Create: `src/app/(customer)/bookings.tsx`, `src/app/booking/[id].tsx`
- Test: `src/__tests__/customer-bookings.test.tsx`, `src/__tests__/booking-detail.test.tsx`

**Interfaces:**
- Consumes: `getCustomerBookings`, `getBookingById`; `StatusBadge`/`BookingSummaryCard`/`Card`/`Text`; `router`, `useLocalSearchParams`.
- Produces: customer tab `bookings` (route `/bookings`); detail route `/booking/[id]`.

- [ ] **1. `app-tabs.tsx`** — add a third `<NativeTabs.Trigger name="bookings">` (label "My Bookings") between Home and Profile, reusing an existing tab icon asset (`@/assets/images/tabIcons/explore.png` is fine; keep Profile on its current icon). Home + Profile triggers unchanged.
- [ ] **2. `(customer)/bookings.tsx`** — `useEffect` load `getCustomerBookings()` into state; list each as a `Card` (service title via `SERVICES.find`, `<StatusBadge>`, formatted date) with `onPress={() => router.push('/booking/' + b.id)}`; `EmptyState` when none.
- [ ] **3. `src/app/booking/[id].tsx`** — read-only detail: `getBookingById(id)`; render `BookingSummaryCard` + `<StatusBadge>`; if `assigned_provider_name` present, a `Card` showing **Provider** name + phone; otherwise a muted "No provider assigned yet" `Text`.
- [ ] **4. Failing tests:**
  - `customer-bookings.test.tsx` — mock `expo-router`, `@/lib/bookings` (`getCustomerBookings` → one row). Assert (async) the status label renders and pressing the row calls `router.push('/booking/b1')`.
  - `booking-detail.test.tsx` — mock `expo-router` (`useLocalSearchParams`→`{id:'b1'}`), `@/lib/bookings` (`getBookingById`). Case A: booking with `assigned_provider_name:'Jane', assigned_provider_phone:'0700'` → asserts `Jane` and `0700` shown. Case B: nulls → asserts "No provider assigned yet".
- [ ] **5. Run → FAIL** then implement → **PASS** `npm test`; `npx tsc --noEmit`
- [ ] **6. Commit** `git add src/components/app-tabs.tsx "src/app/(customer)/bookings.tsx" src/app/booking/[id].tsx src/__tests__/customer-bookings.test.tsx src/__tests__/booking-detail.test.tsx && git commit -m "feat: slice5 customer bookings tab + detail"`

---

## Verification (controller, after Task 5)
- `npm test` all pass; `npx tsc --noEmit` clean.
- Android bundle smoke: `npx expo start -c`, fetch the manifest's `launchAsset.url` (`expo-router/entry.bundle?platform=android…`) → expect HTTP 200, no Metro errors.
- Routes present: `/admin`, `/admin/booking/[id]`, `/bookings`, `/booking/[id]`.

### SQL migration step (run before Expo Go)
Apply `supabase/migrations/0003_admin_dispatch.sql` to the Supabase project (SQL editor or `supabase db push`). Confirm: `bookings` has the 3 new columns + 7-status constraint; `is_admin()` exists; the 4 new policies exist. Seed one admin manually (`profiles.role='admin', approval_status='approved'`).

### Expo Go end-to-end
1. As **customer**: create a booking (Slice 4 flow) → open **My Bookings** → status `pending`, no provider yet.
2. As **admin**: `/admin` → Bookings → open the booking → set `accepted`, then **Assign** provider (name+phone) → status becomes `provider_assigned`; add an admin note.
3. As **admin**: Providers tab → approve a pending provider; confirm `profiles.approval_status='approved'`.
4. Back as **customer**: My Bookings → booking detail now shows provider name + phone and updated status.

## Rollback
Branch `feat/slice-5-admin-dispatch`; one commit per task → `git revert <sha>`. Changes are additive (new migration, new files, one tab, additive lib functions). Migration `0003` is forward-only; to undo in DB, drop the 4 policies + `is_admin()` and the 3 columns, and restore the prior status constraint.

## Self-review
- Admin auth (is_admin + RLS) → T1 ✓. Columns + 7-status → T1 ✓. Data layer incl. `updateAdminNotes` → T2 ✓. Admin lists + provider approve/reject → T3 ✓. Admin detail (status/assign/notes) → T4 ✓. Customer tab + detail (provider shown when assigned) → T5 ✓. Tests mock Supabase, live in `src/__tests__/` / `src/lib/` ✓.
- Status union single source: `booking-status.ts` (T1), re-exported by `bookings.ts` (T2) — consistent names across tasks.
