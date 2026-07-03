# Slice 22 — Saved Addresses & Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers save/reuse/manage service addresses (Home/Work/Other, one default, recents) and pick a saved address to prefill the booking location — while search + manual entry keep working unchanged.

**Architecture:** An owner-only `customer_addresses` table (RLS `customer_id = auth.uid()`, no admin/provider policy) with a partial-unique default + `set_default_address`/`touch_saved_address` RPCs; a `saved-addresses.ts` CRUD lib; additive booking-flow integration (saved picker + "Save this address" prompt) and a Manage screen — all reusing the Slice-20 structured fields, helpers, and `BookingDraft` setters.

**Tech Stack:** Expo RN + TS, Expo Router, Supabase (Postgres + RLS + RPCs), Jest + RNTL.

## Global Constraints

- **`customer_addresses` is OWNER-ONLY** (RLS: `customer_id = auth.uid()` on every op; **NO admin/provider policy**). Admin/provider only ever see the booking's copied `address` snapshot (Slice 20) — never this table.
- **Existing booking address flow + manual fallback must keep working** for customers with zero saved addresses; all saved-address UI is additive/dismissible. Bookings still store their own address snapshot — **no booking→address FK, no `bookings` change.**
- Single default per customer via partial unique index `(customer_id) where is_default` + `set_default_address` RPC (unset-then-set atomically). `touch_saved_address` bumps `last_used_at`.
- Reuse Slice-20 fields/helpers (`formatDestination`, `AddressSearch`, `ApartmentDetailsForm`, `SelectedAddressCard`, `BookingDraft.setLocation`/`setApartment`, `createBooking` structured fields). `address` stays required so a save never fails.
- No payment/auth/chat/tracking change. DB/RPC pattern mirrors prior slices (`security definer set search_path = public`, `public.is_admin()` not used here since no admin access).
- Merge gate every task: `npm test` green, `npx tsc --noEmit` clean, `expo export --platform web` AND `--platform android` succeed.

---

## File Structure

**Create**
- `supabase/migrations/0019_customer_addresses.sql` — table + owner RLS + partial-unique default + 2 RPCs.
- `src/lib/saved-addresses.ts` (+ test) — CRUD + set-default + touch + `SavedAddress↔draft` mapper.
- `src/components/ui/saved-address-card.tsx` (+ test).
- `src/components/ui/saved-address-picker.tsx` (+ test).
- `src/app/(customer)/saved-addresses.tsx` — Manage screen.
- `docs/pilot/saved-addresses.sql` — RLS verification.

**Modify**
- `src/app/booking/address.tsx` — saved picker (prefill + touch) + "Save this address" prompt (additive).
- `src/app/(customer)/profile.tsx` — "Saved addresses" entry.

---

## Task Order (dependency-ordered)

1. **T1** — Migration `0019` (table, owner RLS, partial-unique default, `set_default_address`/`touch_saved_address`).
2. **T2** — `saved-addresses.ts` lib + `SavedAddress↔draft` mapper (+ tests). Depends on T1 names.
3. **T3** — `SavedAddressCard` + `SavedAddressPicker` components (+ tests). Depends on T2 types.
4. **T4** — Manage Saved Addresses screen + profile entry.
5. **T5** — Booking address step integration: saved picker prefill + touch + "Save this address" prompt.
6. **T6** — Verification: privacy/RLS SQL + backward-compat + final gate.

Each task ends green (tests/tsc/both exports).

---

### Task 1: Migration `0019_customer_addresses.sql`

**Files:** Create `supabase/migrations/0019_customer_addresses.sql`

**Build (mirror `0013`/`0018` style):**
- Table `customer_addresses` per spec §3 (id PK; `customer_id` FK→profiles on delete cascade; `label_type` check home/work/other default 'other'; `nickname`; `address` not null; the 7 Slice-20 structured fields nullable; `is_default` default false; `last_used_at`; `created_at`/`updated_at`). `enable row level security`.
- Partial unique index `customer_addresses_one_default on (customer_id) where is_default`; index `(customer_id, last_used_at desc)`.
- **Owner-only RLS (4 policies):** select/insert/update/delete each `customer_id = auth.uid()` (insert/update also `with check (customer_id = auth.uid())`). NO admin/provider policy.
- **`set_default_address(p_address_id uuid) returns void`** `security definer set search_path = public`: load the row's `customer_id`; raise unless `= auth.uid()`; `update customer_addresses set is_default = false where customer_id = auth.uid() and is_default;` then `update … set is_default = true, updated_at = now() where id = p_address_id;` (unset-then-set to satisfy the partial unique index).
- **`touch_saved_address(p_address_id uuid) returns void`** `security definer`: raise unless the row's `customer_id = auth.uid()`; `set last_used_at = now()`.

**Checks:** migration applies cleanly; `\d customer_addresses` shows table/RLS/indexes; RPCs exist; `npm test` green, `tsc` clean, both exports. Commit `feat: slice22 customer_addresses schema (0019)`.

> Behavioral RLS/RPC verification in T6.

---

### Task 2: `saved-addresses.ts` lib + mapper

**Files:** Create `src/lib/saved-addresses.ts` (+ `saved-addresses.test.ts`)

**Build (mirror `src/lib/messages.ts` / `reviews.ts` style):**
- `type SavedAddress` + `type NewSavedAddress` (spec §4; structured fields + `label_type`/`nickname`, `address` required).
- `getSavedAddresses(): Promise<SavedAddress[]>` — own rows, `.order('is_default', desc).order('last_used_at', desc nullsFirst:false).order('created_at', desc)`; `[]` on error.
- `createSavedAddress(input): Promise<{ ok; id?; error? }>` — insert with `customer_id` from `supabase.auth.getUser()`; return new id.
- `updateSavedAddress(id, patch): Promise<{ ok; error? }>` — update the patch + `updated_at: new Date().toISOString()`.
- `deleteSavedAddress(id): Promise<{ ok; error? }>`.
- `setDefaultAddress(id)` → `rpc('set_default_address', { p_address_id: id })`.
- `touchSavedAddress(id)` → `rpc('touch_saved_address', { p_address_id: id })` (fire-and-forget-safe).
- `savedAddressToDraft(a): { location: {...}; apartment: {...} }` and `draftToNewSavedAddress(draft, { label_type, nickname, is_default }): NewSavedAddress` — pure mappers (reuse Slice-20 field names).

**Tests:** list ordering asserted; create uses auth user id; update sets updated_at; delete; `setDefaultAddress`/`touchSavedAddress` RPC name+args; errors → `{ ok:false }` / `[]`; mappers round-trip the fields.

**Steps:** TDD → `tsc` → commit `feat: slice22 saved-addresses lib + mapper`.

---

### Task 3: SavedAddressCard + SavedAddressPicker

**Files:** Create `src/components/ui/saved-address-card.tsx` (+ test), `src/components/ui/saved-address-picker.tsx` (+ test)

**Build:**
- `SavedAddressCard`: props `{ address: SavedAddress; onSelect?; onEdit?; onDelete?; onSetDefault? }` — icon by `label_type` (🏠 home / 💼 work / 📍 other), `nickname || label_type` title, formatted address via `formatDestination` (map SavedAddress → its `DestinationInput` shape), a **Default** badge when `is_default`, and only the action affordances whose handlers are passed. Token-driven.
- `SavedAddressPicker`: props `{ onSelect: (a: SavedAddress) => void }` — loads `getSavedAddresses` on mount; renders a compact list of tappable `SavedAddressCard`s (default first — the lib already orders); `EmptyState`/nothing when none; loading skeleton.

**Tests:** card renders title/formatted address/default badge; only passed actions render + fire; picker renders rows from a mocked `@/lib/saved-addresses`, `onSelect` fires on tap, empty state when `[]`.

**Steps:** TDD → `tsc` → commit `feat: slice22 saved-address components`.

---

### Task 4: Manage Saved Addresses screen + profile entry

**Files:** Create `src/app/(customer)/saved-addresses.tsx`; Modify `src/app/(customer)/profile.tsx`

**Build:**
- Manage screen: list via `SavedAddressCard`s (with edit/delete/set-default actions) from `getSavedAddresses`. **Add**: reuse `AddressSearch` (+ `ApartmentDetailsForm`) OR a manual entry → collect fields + `label_type`/`nickname`/`is_default` → `createSavedAddress` (then `setDefaultAddress` if chosen). **Edit**: prefill the same form from a `SavedAddress` → `updateSavedAddress`. **Delete**: confirm → `deleteSavedAddress`. **Set default** → `setDefaultAddress`; refresh list on any mutation. Owner-only (no id passing beyond own rows).
- `profile.tsx`: add a **"Saved addresses"** row/button → `router.push('/(customer)/saved-addresses')`. No other profile change.

**Checks:** keep `profile`/`customer-*` tests green (mock `@/lib/saved-addresses`); add a manage-screen test (renders rows; add calls create; delete calls delete). `npm test`, `tsc`, both exports. Commit `feat: slice22 manage saved addresses + profile entry`.

---

### Task 5: Booking address step integration

**Files:** Modify `src/app/booking/address.tsx`

**Build (ADDITIVE — preserve current behavior):**
- At the top (only when the customer has saved addresses): render `<SavedAddressPicker onSelect={handlePickSaved} />`.
  `handlePickSaved(a)`: `setLocation(savedAddressToDraft(a).location)` + `setApartment(...apartment)` + `void touchSavedAddress(a.id)`; then show the existing SelectedAddressCard/apartment UI (same as a search select).
- Keep **AddressSearch** + the **manual** path + the existing **Continue** gating (`address` non-empty) exactly as-is.
- After a fresh **search-select or manual entry** (not from a saved pick), show a dismissible **"Save this address"** prompt: a compact `label_type` (Home/Work/Other) + optional nickname + "set as default" toggle → `draftToNewSavedAddress(draft, …)` → `createSavedAddress` (+ `setDefaultAddress` if toggled). Dismiss = do nothing (optional). Never blocks Continue.

**Checks:** keep `booking-address.test.tsx` green — the picker only renders when saved addresses exist (mock `@/lib/saved-addresses` → `[]` by default so the current flow/assertions are unchanged); the two must-preserve assertions (empty→"Address is required.", non-empty→navigate) stay intact. Add a case: a saved pick prefills + touches; "Save this address" calls create. Never weaken. `npm test`, `tsc`, both exports. Commit `feat: slice22 booking saved-address picker + save prompt`.

---

### Task 6: Verification, privacy, final gate

**Files:** Create `docs/pilot/saved-addresses.sql`

- **Privacy/RLS verification (documented SQL + manual):** customer A sees only their own `customer_addresses`; customer B cannot select A's rows; a provider cannot select any; **admin cannot select** (no policy); `set_default_address`/`touch_saved_address`/update/delete rejected for non-owners; the partial unique index enforces exactly one default (setting a new default clears the old). Confirm **no `bookings` change** and admin/provider still see only the booking `address` snapshot.
- **Backward-compat:** a customer with zero saved addresses gets the exact current booking flow (picker hidden, search + manual, Continue gating); the "Save this address" prompt is optional/dismissible; existing booking-flow + profile tests green.
- **Isolation check:** `git diff <base>..HEAD --stat` shows no payment/auth/chat/tracking file changed (no `src/lib/{payments,attempts,earnings,tracking}.ts`, no `messages.ts`/ChatThread, no `src/auth/**`, no `bookings.ts` schema-shape change beyond none).
- **Final gate:** `expo export --platform web` AND `--platform android` succeed → `tsc` clean → `npm test` green → `git status` clean.
- Commit `test: slice22 saved-addresses verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-22-saved-addresses`. Abandon = `git checkout main` + delete branch.
- **Per-task revert:** independent commits — `git revert <commit>` rolls back one (migration/lib/components/manage/booking-integration) without affecting others. Reverting T5 restores the exact Slice-20 booking flow.
- **Disable without schema revert:** revert the T5 + T4 UI commits — the table simply goes unused; nothing else references it, and bookings are unaffected (they never depended on it).
- **Schema rollback:** forward-only; if needed `0020_rollback_customer_addresses.sql` — `drop function set_default_address, touch_saved_address; drop table customer_addresses cascade;` (owner-only, isolated — nothing else depends on it; bookings untouched).
- **No payment/auth/chat/tracking involvement** — rollback is confined to this feature.

---

## Self-Review

- **Spec coverage:** table+owner-RLS+partial-default+2 RPCs (T1), lib CRUD+mapper (T2), SavedAddressCard+Picker (T3), Manage screen+profile entry (T4), booking picker+prefill+touch+"Save this address" (T5), privacy/RLS + backward-compat + isolation + gate (T6 + sections). Owner-only (no admin/provider), booking snapshot unchanged, manual fallback preserved, no payment/auth/chat/tracking — all covered.
- **Placeholder scan:** none; checks concrete.
- **Type/name consistency:** `SavedAddress`/`NewSavedAddress` (T2) consumed by components (T3) + screens (T4/T5); `savedAddressToDraft`/`draftToNewSavedAddress` consistent T2↔T5; RPC names `set_default_address`/`touch_saved_address` consistent T1↔T2↔T6; `getSavedAddresses`/`createSavedAddress`/`setDefaultAddress`/`touchSavedAddress` consistent across T2/T3/T4/T5; reuses Slice-20 `formatDestination`/`setLocation`/`setApartment`.
