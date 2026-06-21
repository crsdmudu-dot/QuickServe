# QuickServe Slice 5 — Admin Dispatch + Provider Approval (Design)

**Goal:** Let a QuickServe admin manage real bookings manually (view, accept/reject, assign an off-platform provider, update status, add notes) and approve/reject provider accounts. Customers see their booking status and the assigned provider's name + phone once assigned.

**Out of scope:** payments, maps, live tracking, provider marketplace automation, realtime. Manual dispatch only. Existing customer UI (Home, Profile) preserved.

---

## Authorization (core)

New migration `0003` adds a security-definer helper and admin RLS policies. Customer/self policies from `0001`/`0002` are left unchanged.

- `is_admin()` — `security definer`, returns true when the caller's `profiles.role = 'admin'`. Used in policy `USING`/`WITH CHECK` clauses (security definer avoids RLS recursion on `profiles`).
- `bookings`: admin `SELECT` all + `UPDATE` all. Customers keep `insert/select own` — so they automatically see the new provider columns on their own rows.
- `profiles`: admin `SELECT` all + `UPDATE` all (to set `approval_status`). Self-signup/self-update policies unchanged (still cannot self-escalate role/approval).

## Schema changes

`bookings` (add columns):
- `assigned_provider_name text`
- `assigned_provider_phone text`
- `admin_notes text`

`bookings` status — replace the `check` constraint with the 7 values:
`pending, accepted, provider_assigned, on_the_way, in_progress, completed, cancelled`.
Migration first maps any existing `assigned` → `provider_assigned`, then swaps the constraint. Default stays `pending`.

Provider approval reuses the existing `profiles.approval_status` (`pending | approved | rejected`) — no new column.

## Status semantics

- Admin **Accept** → `accepted`; **Reject** → `cancelled`.
- Admin **Assign provider** → saves `assigned_provider_name` + `assigned_provider_phone` and sets status `provider_assigned`.
- Admin can also free-set any of the 7 statuses via a picker on the detail screen.

## Data layer

`src/lib/bookings.ts` (extend; update `BookingStatus` type + `Booking` type with new columns):
- `getAllBookings(): Promise<Booking[]>` — admin, newest first.
- `getBookingById(id): Promise<Booking | null>` — RLS scopes to own (customer) or all (admin).
- `updateBookingStatus(id, status): Promise<{ ok; error? }>`
- `assignProvider(id, { name, phone }): Promise<{ ok; error? }>` — sets the two columns + status `provider_assigned`.
- `updateAdminNotes(id, notes): Promise<{ ok; error? }>`

`src/lib/providers.ts` (new):
- `getPendingProviders(): Promise<ProviderProfile[]>` — `role='provider'`, `approval_status='pending'`.
- `setProviderApproval(id, 'approved' | 'rejected'): Promise<{ ok; error? }>`

`src/constants/booking-status.ts` (new): `ALL_STATUSES`, `STATUS_LABELS`, `STATUS_COLORS`.

## UI

Shared: `StatusBadge` component (status → label + color). Reuse `BookingSummaryCard` for detail summaries where it fits.

**Admin** — `(admin)` stack:
- `admin.tsx` — in-page **Bookings | Providers** toggle.
  - Bookings: list of all bookings (service, status badge, date) → tap opens detail.
  - Providers: list of pending providers with inline **Approve** / **Reject**.
- `(admin)/booking/[id].tsx` — detail: booking summary, status picker (7 values), assign-provider form (name + phone), admin notes field, save actions wired to the lib functions above.

**Customer** — preserve existing tabs, add one:
- Add **My Bookings** tab to the existing NativeTabs (Home + Profile unchanged; reuse/add a tab icon asset).
- `(customer)/bookings.tsx` — list via `getCustomerBookings()` with status badges → navigates to detail.
- `src/app/booking/[id].tsx` (new, in the existing `/booking` stack) — read-only detail showing status and, once assigned, provider name + phone.

## Testing

Mock Supabase; no network. Screen/route tests in `src/__tests__/`, never in `src/app/`.
- lib: admin booking fns (`getAllBookings`, `getBookingById`, `updateBookingStatus`, `assignProvider`, `updateAdminNotes`), providers (`getPendingProviders`, `setProviderApproval`).
- `StatusBadge`.
- Admin screen (toggle + lists), admin booking detail (status update, assign provider, notes), providers list (approve/reject).
- Customer bookings list + booking detail (provider shown only when assigned).

## Tasks (for the implementation plan)

1. **T1** — migration `0003` (admin RLS + columns + status constraint) + `booking-status` constants + `StatusBadge` (+tests).
2. **T2** — data layer: extend `bookings.ts`, new `providers.ts` (+tests).
3. **T3** — Admin lists screen (Bookings | Providers toggle) + provider approve/reject.
4. **T4** — Admin booking detail (status picker, assign provider, admin notes).
5. **T5** — Customer My Bookings tab + list + booking detail.
6. **Verify + merge** — `npm test`, `npx tsc --noEmit`, Android bundle smoke; merge to `main`.

## Constraints

- Reuse Slice 1 design system + tokens; preserve premium feel.
- Supabase mocked in tests; PLAIN `router.push/replace` (no casts).
- One commit per task; after each: `npm test` + `npx tsc --noEmit`.

## Rollback

Branch `feat/slice-5-admin-dispatch`; one commit/task; `git revert <sha>`. Mostly new files plus additive migration, tab, and lib functions.
