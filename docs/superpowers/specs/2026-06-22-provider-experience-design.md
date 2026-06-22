# QuickServe Slice 6 — Provider Experience (Design)

**Goal:** Turn approved providers into real app users who can view and manage the jobs assigned to them, and let admins assign either a manual/off-platform provider or an approved in-app provider.

**Out of scope:** payments, maps, live tracking, provider earnings, notifications, ratings/reviews.

---

## Database (migration `0004`)

- `bookings.assigned_provider_id uuid` — nullable, `references profiles(id)`. Keep `assigned_provider_name` and `assigned_provider_phone` for manual/off-platform dispatch.
- **Provider RLS:**
  - `SELECT` bookings where `assigned_provider_id = auth.uid()`.
  - `UPDATE` only own assigned bookings (`assigned_provider_id = auth.uid()`), with a `WITH CHECK` that:
    - pins `customer_id`, `service_id`, `address`, `scheduled_for`, `assigned_provider_id`, `assigned_provider_name`, `assigned_provider_phone` to their stored values (compared via subquery, like the `profiles` self-update guard in `0001`) — providers cannot edit customer/address/service/schedule/provider fields;
    - enforces **forward-only** status progression (see below).
  - No provider `INSERT`/`DELETE` policies — providers cannot create or cancel/delete bookings.
- Admin and customer policies from `0002`/`0003` are unchanged. Admin retains full control of all fields and statuses.

### Forward-only status progression

Provider-driven status follows a strict one-way chain:

```
provider_assigned → on_the_way → in_progress → completed
```

Define a rank: `provider_assigned=0, on_the_way=1, in_progress=2, completed=3`. A provider `UPDATE` is allowed only when the new status is in `{on_the_way, in_progress, completed}` **and** `rank(new) > rank(old)`. This blocks moving backwards, reopening a `completed` job, cancelling, or jumping outside the chain. The RLS `WITH CHECK` encodes this via a `CASE` rank comparison against the current stored status. The provider UI additionally only shows buttons for valid forward transitions.

## Data layer

- `src/lib/bookings.ts`:
  - `getProviderJobs(): Promise<Booking[]>` — RLS-scoped list of the signed-in provider's jobs, newest first.
  - Providers reuse the existing `updateBookingStatus(id, status)` (RLS enforces forward-only + field pinning).
  - Extend `assignProvider(id, { name, phone, providerId? }): Promise<{ ok; error? }>` — when `providerId` is supplied (in-app provider), also set `assigned_provider_id`; when omitted (manual), set `assigned_provider_id` to `null`. Both set status `provider_assigned` and the name/phone.
  - `Booking` type gains `assigned_provider_id: string | null`.
- `src/lib/providers.ts`:
  - `getApprovedProviders(): Promise<ProviderProfile[]>` — `role='provider'`, `approval_status='approved'`.
- `src/constants/booking-status.ts`:
  - `PROVIDER_NEXT_STATUSES: Record<BookingStatus, BookingStatus[]>` (or a `nextProviderStatuses(current)` helper) returning the valid forward targets for a given current status; used by the provider UI and unit-tested.

## UI

**Provider** — convert the `(provider)` route group to a literal `provider/` directory (route groups strip from the URL; this mirrors the Slice 5 admin fix so `/provider` and `/provider/job/[id]` resolve cleanly):
- `provider/_layout.tsx` — `Stack`, header "Provider".
- `provider/index.tsx` — branches on `useAuth().approvalStatus`:
  - `pending` → "Awaiting approval" screen (your application is under review).
  - `rejected` → "Application declined" screen.
  - `approved` → jobs list via `getProviderJobs()`: each a `Card` with service title (`SERVICES.find`), `StatusBadge`, formatted `scheduled_for`, tapping → `/provider/job/<id>`. `EmptyState` when none. `signOut` available.
- `provider/job/[id].tsx` — load `getBookingById(id)`; show `BookingSummaryCard` (service/address/schedule/notes), customer-relevant info, and current `StatusBadge`. Render only the valid forward-transition buttons from `PROVIDER_NEXT_STATUSES[status]` (e.g. `provider_assigned` → "On the way"; `in_progress` → "Completed"; `completed` → none). Pressing one calls `updateBookingStatus` and updates local state; inline error on failure.

**Admin** — `src/app/admin/booking/[id].tsx` Assign Provider section gains a **Manual | In-app** in-page toggle:
- Manual (default, today's flow): name + phone inputs → `assignProvider(id, { name, phone })`.
- In-app: list of `getApprovedProviders()`; tapping a provider calls `assignProvider(id, { providerId, name, phone })` using that profile's `full_name`/`phone`, setting `assigned_provider_id`.
- The full admin status picker (all 7 statuses) is unchanged — admin retains full control.

## Testing

Mock Supabase; no network. Screen/route tests in `src/__tests__/`, never `src/app/`.
- lib: `getProviderJobs`, extended `assignProvider` (manual vs in-app payloads), `getApprovedProviders`.
- `PROVIDER_NEXT_STATUSES`/helper: forward-only transitions (correct next set per status; `completed` → empty).
- Provider home: renders Pending / Rejected / (approved) jobs list per `approvalStatus`; row press navigates.
- Provider job detail: shows only forward buttons; pressing calls `updateBookingStatus` with the right status; `completed` shows no action.
- Admin assign toggle: Manual calls `assignProvider({name,phone})`; In-app lists approved providers and assigns with `providerId`.

## Tasks (for the implementation plan)

1. **T1** — migration `0004` (column + provider RLS, forward-only) + data layer (`getProviderJobs`, extended `assignProvider`, `getApprovedProviders`, `PROVIDER_NEXT_STATUSES`) (+tests).
2. **T2** — provider section: literal `provider/` dir, home with pending/rejected/approved states + jobs list, job detail with forward-only status buttons (+tests).
3. **T3** — admin in-app assign toggle (+tests).
4. **Verify + merge** — `npm test`, `npx tsc --noEmit`, Android bundle smoke; merge to `main`.

## Constraints

- Reuse Slice 1 design system + tokens; preserve premium feel. Existing customer/admin UI unchanged except the admin assign toggle.
- Supabase mocked in tests; PLAIN `router.push/replace` (no casts). One commit per task; after each: `npm test` + `npx tsc --noEmit`.
- Providers cannot cancel jobs, reopen completed jobs, move backwards, or edit customer/address/service/schedule/provider fields. Admin retains full control.

## Rollback

Branch `feat/slice-6-provider-experience`; one commit per task; `git revert <sha>`. Additive migration (new column + provider policies), new provider screens, additive lib functions. Forward-only migration; to undo in DB, drop the provider policies and the `assigned_provider_id` column.
