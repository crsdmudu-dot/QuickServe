# QuickServe Slice 4 — Customer Booking Flow Implementation Plan

> Subagent-Driven execution. `- [ ]` steps. TDD; one commit per task.

**Goal:** Customer can book a service: Home → service → address → date/time → notes → review → place booking → success. No marketplace/dispatch/payments/notifications/maps/tracking.

**Architecture:** A `bookings` table (RLS: insert/select own). `src/lib/bookings.ts` wraps Supabase. An in-memory `BookingDraftProvider` holds the draft across the flow. Booking screens live in a new `src/app/booking/` stack (gated as a signed-in route); Home's ServiceCard starts the flow.

## Global Constraints
- Reuse Slice 1 design system + tokens; preserve premium look; Customer Home visuals unchanged (only ServiceCard tap now navigates).
- Supabase mocked in tests; no network. Screen/route tests in `src/__tests__/`, NEVER `src/app/`.
- PLAIN `router.push/replace` (no casts). Bundle smoke via `expo start` (not `expo export`).
- RLS: customer insert+select own only; no update/delete policies.
- OUT: provider queries, dispatch, payments, realtime/subscriptions, maps, tracking.
- After each task: `npm test` + `npx tsc --noEmit`; commit.

---

## Task 1 — bookings table + `src/lib/bookings.ts`
**Files:** Create `supabase/migrations/0002_bookings.sql`, `src/lib/bookings.ts`, `src/lib/bookings.test.ts`.
**Produces:** `BookingStatus`, `NewBooking {serviceId,address,scheduledFor,notes?}`, `Booking`, `createBooking(input): Promise<{ok:boolean;error?:string}>`, `getCustomerBookings(): Promise<Booking[]>`.

- [ ] **1. Branch** `git checkout -b feat/slice-4-booking`
- [ ] **2. SQL `supabase/migrations/0002_bookings.sql`**
```sql
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  service_id text not null,
  address text not null,
  scheduled_for timestamptz not null,
  notes text,
  status text not null default 'pending'
    check (status in ('pending','assigned','accepted','in_progress','completed','cancelled')),
  created_at timestamptz not null default now()
);
alter table public.bookings enable row level security;
create policy "bookings_insert_own" on public.bookings
  for insert with check (auth.uid() = customer_id);
create policy "bookings_select_own" on public.bookings
  for select using (auth.uid() = customer_id);
```
- [ ] **3. Failing test `src/lib/bookings.test.ts`**
```ts
import { createBooking, getCustomerBookings } from '@/lib/bookings';

const getUser = jest.fn();
const insert = jest.fn();
const order = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => getUser(...a) },
    from: () => ({
      insert: (...a: unknown[]) => insert(...a),
      select: () => ({ order: (...a: unknown[]) => order(...a) }),
    }),
  },
}));

beforeEach(() => jest.clearAllMocks());

describe('createBooking', () => {
  it('fails when signed out', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await createBooking({ serviceId: 's', address: 'a', scheduledFor: 't' })).toEqual({
      ok: false, error: 'You must be signed in to book.',
    });
  });
  it('inserts with customer_id and returns ok', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    insert.mockResolvedValue({ error: null });
    const res = await createBooking({ serviceId: 'house-cleaning', address: 'Nairobi', scheduledFor: '2026-07-01T10:00:00Z', notes: 'gate code 12' });
    expect(res).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith({
      customer_id: 'u1', service_id: 'house-cleaning', address: 'Nairobi',
      scheduled_for: '2026-07-01T10:00:00Z', notes: 'gate code 12',
    });
  });
  it('maps insert error', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    insert.mockResolvedValue({ error: { message: 'boom' } });
    expect(await createBooking({ serviceId: 's', address: 'a', scheduledFor: 't' })).toEqual({
      ok: false, error: 'Could not create booking. Please try again.',
    });
  });
});

describe('getCustomerBookings', () => {
  it('returns rows newest-first, [] when none', async () => {
    order.mockResolvedValue({ data: [{ id: 'b1' }], error: null });
    expect(await getCustomerBookings()).toEqual([{ id: 'b1' }]);
    order.mockResolvedValue({ data: null, error: null });
    expect(await getCustomerBookings()).toEqual([]);
  });
});
```
- [ ] **4. Run → FAIL** `npm test -- bookings.test`
- [ ] **5. Implement `src/lib/bookings.ts`**
```ts
import { supabase } from '@/lib/supabase';

export type BookingStatus =
  | 'pending' | 'assigned' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';

export type NewBooking = { serviceId: string; address: string; scheduledFor: string; notes?: string };

export type Booking = {
  id: string;
  service_id: string;
  address: string;
  scheduled_for: string;
  notes: string | null;
  status: BookingStatus;
  created_at: string;
};

export async function createBooking(input: NewBooking): Promise<{ ok: boolean; error?: string }> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: 'You must be signed in to book.' };
  const { error } = await supabase.from('bookings').insert({
    customer_id: data.user.id,
    service_id: input.serviceId,
    address: input.address,
    scheduled_for: input.scheduledFor,
    notes: input.notes ?? null,
  });
  if (error) return { ok: false, error: 'Could not create booking. Please try again.' };
  return { ok: true };
}

export async function getCustomerBookings(): Promise<Booking[]> {
  const { data } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });
  return (data as Booking[] | null) ?? [];
}
```
- [ ] **6. Run → PASS** `npm test -- bookings.test`; `npx tsc --noEmit`
- [ ] **7. Commit** `git add supabase/migrations/0002_bookings.sql src/lib/bookings.ts src/lib/bookings.test.ts && git commit -m "feat: bookings table + bookings lib"`

---

## Task 2 — BookingDraft context + booking stack skeleton + Home wiring
**Files:** Create `src/booking/booking-draft.tsx`, `src/booking/booking-draft.test.tsx`, `src/app/booking/_layout.tsx`, and 5 stub screens `src/app/booking/{address,schedule,notes,review,success}.tsx`; Modify `src/app/_layout.tsx` (mount provider), `src/app/(customer)/index.tsx` (ServiceCard → start+push), `src/__tests__/home-screen.test.tsx`.
**Produces:** `useBookingDraft(): { serviceId, address, scheduledFor, notes, start(serviceId), setAddress(v), setScheduledFor(iso), setNotes(v), reset() }`; routes `/booking/address|schedule|notes|review|success`.

- [ ] **1. `src/booking/booking-draft.tsx`**
```tsx
import { createContext, useContext, useState, type ReactNode } from 'react';

type Draft = {
  serviceId: string | null;
  address: string;
  scheduledFor: string | null;
  notes: string;
};
type BookingDraft = Draft & {
  start: (serviceId: string) => void;
  setAddress: (v: string) => void;
  setScheduledFor: (iso: string) => void;
  setNotes: (v: string) => void;
  reset: () => void;
};

const EMPTY: Draft = { serviceId: null, address: '', scheduledFor: null, notes: '' };
const Ctx = createContext<BookingDraft | null>(null);

export function BookingDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const value: BookingDraft = {
    ...draft,
    start: (serviceId) => setDraft({ ...EMPTY, serviceId }),
    setAddress: (address) => setDraft((d) => ({ ...d, address })),
    setScheduledFor: (scheduledFor) => setDraft((d) => ({ ...d, scheduledFor })),
    setNotes: (notes) => setDraft((d) => ({ ...d, notes })),
    reset: () => setDraft(EMPTY),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBookingDraft(): BookingDraft {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBookingDraft must be used within BookingDraftProvider');
  return ctx;
}
```
- [ ] **2. Test `src/booking/booking-draft.test.tsx`** — render a Probe; assert `start('s1')` sets serviceId + clears others; setters update; reset clears. (Use fireEvent.press + screen text, like the Slice 2/3 context tests.)
- [ ] **3. Stub screens** — each `src/app/booking/<name>.tsx` exports a default component rendering `<Text>` with the screen name (e.g. "Address"). `_layout.tsx`:
```tsx
import { Stack } from 'expo-router';
export default function BookingLayout() {
  return <Stack screenOptions={{ headerShown: true, title: 'Book a service' }} />;
}
```
- [ ] **4. Mount provider in `src/app/_layout.tsx`** — wrap `<RootNavigator />` with `<BookingDraftProvider>` (inside `<AuthProvider>`). Do NOT change the gating effect.
- [ ] **5. Wire Home** — in `src/app/(customer)/index.tsx`, replace the placeholder `handleServicePress` so it uses the draft + navigates:
```tsx
import { router } from 'expo-router';
import { useBookingDraft } from '@/booking/booking-draft';
// in component:
const { start } = useBookingDraft();
function handleServicePress(service: Service) {
  start(service.id);
  router.push('/booking/address');
}
```
(Keep the rest of Home unchanged.)
- [ ] **6. Update `src/__tests__/home-screen.test.tsx`** — it renders `HomeScreen` directly; wrap in `<BookingDraftProvider>` (import it) so `useBookingDraft` resolves. Keep existing assertions.
- [ ] **7. Run** `npm test`; `npx tsc --noEmit` (all green; `/booking/address` now a valid route)
- [ ] **8. Commit** `git add -A -- src && git commit -m "feat: booking draft context + booking stack skeleton + home wiring"`

---

## Task 3 — Address, Schedule, Notes screens
**Files:** Modify `src/app/booking/{address,schedule,notes}.tsx`; Create `src/__tests__/booking-address.test.tsx`, `booking-schedule.test.tsx`, `booking-notes.test.tsx`. Install `@react-native-community/datetimepicker`.
**Consumes:** `useBookingDraft`, `Input`/`Button`/`Text`, `useTheme`, `Spacing`, `router`.

- [ ] **1. Install picker** `npx expo install @react-native-community/datetimepicker`
- [ ] **2. Address `src/app/booking/address.tsx`** — `Input` (label "Address", value=draft.address, onChangeText=setAddress), Continue → if address non-empty `router.push('/booking/schedule')` else inline error "Address is required." Safe-area, tokens.
- [ ] **3. Schedule `src/app/booking/schedule.tsx`** — a "Pick date & time" Button opens `DateTimePicker`; on change call `setScheduledFor(date.toISOString())` and show the chosen value (formatted). Continue → if `scheduledFor` set `router.push('/booking/notes')` else inline error "Please choose a date and time." Keep picker usage minimal.
- [ ] **4. Notes `src/app/booking/notes.tsx`** — `Input` (label "Notes (optional)", multiline ok), value=draft.notes, onChangeText=setNotes; Continue → `router.push('/booking/review')` (always allowed).
- [ ] **5. Tests** (in `src/__tests__/`, mock `expo-router` + `@/booking/booking-draft`):
  - address: empty Continue → error + no nav; with address → `push('/booking/schedule')`.
  - schedule: with no `scheduledFor` Continue → error; (set via mock draft `scheduledFor: '...'`) Continue → `push('/booking/notes')`.
  - notes: Continue → `push('/booking/review')`; typing calls `setNotes`.
- [ ] **6. Run** `npm test`; `npx tsc --noEmit`
- [ ] **7. Commit** `git add -A -- src package.json package-lock.json && git commit -m "feat: booking address/schedule/notes screens"`

---

## Task 4 — Review + Success screens (+ BookingSummaryCard)
**Files:** Create `src/components/ui/booking-summary-card.tsx`; Modify `src/app/booking/{review,success}.tsx`; Create `src/__tests__/booking-review.test.tsx`, `booking-success.test.tsx`. (Optional `booking-summary-card.test.tsx`.)
**Consumes:** `useBookingDraft`, `createBooking`, `SERVICES` (for title), `Button`/`Text`/`Card`, `router`.

- [ ] **1. `BookingSummaryCard`** — props `{ serviceTitle, address, scheduledFor, notes }`; renders labeled rows in a `Card` (tokens). Formats `scheduledFor` via `new Date(iso).toLocaleString()`.
- [ ] **2. Review `src/app/booking/review.tsx`** — read draft; resolve service title from `SERVICES.find(s=>s.id===draft.serviceId)`; render `BookingSummaryCard`. "Place Booking" Button → `createBooking({serviceId,address,scheduledFor,notes})`; on `{ok:true}` `reset()` + `router.replace('/booking/success')`; on error show inline error text. Disable/guard if required fields missing.
- [ ] **3. Success `src/app/booking/success.tsx`** — "Booking created successfully" + "Back to Home" Button → `router.replace('/')`.
- [ ] **4. Tests** (in `src/__tests__/`, mock `expo-router`, `@/booking/booking-draft`, `@/lib/bookings`):
  - review: renders service/address/date/notes; Place Booking calls `createBooking` with draft; on ok → `reset` + `replace('/booking/success')`; on error → message shown, no nav.
  - success: renders success text; Back to Home → `replace('/')`.
- [ ] **5. Run** `npm test`; `npx tsc --noEmit`
- [ ] **6. Commit** `git add -A -- src && git commit -m "feat: booking review + success screens"`

---

## Verification (controller, after Task 4)
- `npm test` all pass; `npx tsc --noEmit` clean; `expo start` android bundle 200; routes `/booking/*` present.
- Expo Go (needs Supabase + run `0002_bookings.sql`): Home → service → address → date → notes → review → place → success; confirm a `bookings` row (status `pending`).

## Rollback
Branch `feat/slice-4-booking`; one commit/task; `git revert <sha>`. New files only + small Home/_layout edits.

## Self-review
- DB+RLS (insert/select own, status check) → T1 ✓. lib createBooking/getCustomerBookings → T1 ✓. draft+flow state → T2 ✓. screens address/schedule/notes → T3 ✓. review(+summary card)/success + createBooking → T4 ✓. Tests mock supabase, in `src/__tests__/` ✓.
- Deviation: booking screens in `src/app/booking/` (own Stack), not the customer NativeTabs group — avoids fighting NativeTabs; still gated (signed-in). Draft provider mounted at root so Home can seed serviceId.
