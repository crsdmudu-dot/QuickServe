# Slice 22 — Saved Addresses & Favorites (Design Spec)

**Date:** 2026-07-03
**Status:** Approved design → implementation plan
**Builds on:** Slice 20 (structured address fields, `AddressSearch`/`SelectedAddressCard`/`ApartmentDetailsForm`, `BookingDraft.setLocation`/`setApartment`, `createBooking` structured fields).

---

## 1. Goal & Non-Goals

Let customers save, reuse, and manage service addresses (Home/Work/Other, a default, recents) and pick a saved address to prefill the booking location — while search and manual entry keep working exactly as today.

**Non-goals (out of scope):** provider ranking, smart dispatch, live-tracking changes, payments, chat, reviews changes, marketing/referrals. **No** payment/auth/chat/tracking change. **No provider access** to saved addresses; **no admin access** this slice (owner-only). Backward-compatible; manual-address fallback preserved.

---

## 2. Architecture

- **`customer_addresses` table** — owner-scoped CRUD (RLS: `customer_id = auth.uid()` for every op; no admin/provider policy). Reuses the Slice-20 structured-address column set.
- **Single default per customer** enforced by a **partial unique index** (`unique (customer_id) where is_default`) + a `set_default_address` RPC that atomically unsets the previous default. `touch_saved_address` RPC bumps `last_used_at` on reuse.
- **Client lib `src/lib/saved-addresses.ts`** — list/create/update/delete + set-default + touch, matching existing lib style (`{ ok, error? }` / typed rows). No new business logic beyond CRUD.
- **Booking flow integration (additive):** the address step shows a **Saved-addresses picker first**; tapping one prefills the draft (via existing `setLocation`/`setApartment`) + touches `last_used_at`; **search** and **manual** remain. A **"Save this address"** prompt appears after a search selection or manual entry. A **Manage Saved Addresses** screen (list/add/edit/delete/set-default) lives under the customer profile.

---

## 3. Database — migration `0019_customer_addresses.sql`

```sql
create table if not exists public.customer_addresses (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.profiles(id) on delete cascade,
  label_type    text not null default 'other' check (label_type in ('home','work','other')),
  nickname      text,
  address       text not null,
  address_label text,
  latitude      double precision,
  longitude     double precision,
  building_name text,
  floor         text,
  door_number   text,
  landmark      text,
  access_notes  text,
  is_default    boolean not null default false,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.customer_addresses enable row level security;
create unique index if not exists customer_addresses_one_default
  on public.customer_addresses (customer_id) where is_default;
create index if not exists customer_addresses_customer_idx
  on public.customer_addresses (customer_id, last_used_at desc);
```
- **RLS (owner-only, all ops):**
  `select`/`insert`/`update`/`delete` policies each: `customer_id = auth.uid()` (with `with check (customer_id = auth.uid())` on insert/update). **No admin/provider policy** → invisible to everyone else.
- **`set_default_address(p_address_id uuid)`** `security definer set search_path = public`: assert the row belongs to `auth.uid()`; in one statement clear the customer's current default then set this row `is_default = true`, `updated_at = now()` (order to satisfy the partial unique index — unset-then-set within the function).
- **`touch_saved_address(p_address_id uuid)`** `security definer`: assert ownership; set `last_used_at = now()`.
- `updated_at` maintained by the update helpers (set in the client payload) — no trigger needed. `address` stays required (never breaks a save).

---

## 4. Client Data Layer — `src/lib/saved-addresses.ts` (+ test)

```ts
export type SavedAddress = {
  id; customer_id; label_type: 'home'|'work'|'other'; nickname: string|null;
  address; address_label: string|null; latitude: number|null; longitude: number|null;
  building_name; floor; door_number; landmark; access_notes: string|null;   // all string|null
  is_default: boolean; last_used_at: string|null; created_at; updated_at;
};
export type NewSavedAddress = { /* the structured fields + label_type/nickname, address required */ };

getSavedAddresses(): Promise<SavedAddress[]>;            // own rows, ordered is_default desc, last_used_at desc nulls last, created_at desc
createSavedAddress(input: NewSavedAddress): Promise<{ ok; id?; error? }>;   // customer_id = auth user
updateSavedAddress(id, patch): Promise<{ ok; error? }>; // sets updated_at = now()
deleteSavedAddress(id): Promise<{ ok; error? }>;
setDefaultAddress(id): Promise<{ ok; error? }>;         // set_default_address RPC
touchSavedAddress(id): Promise<{ ok; error? }>;         // touch_saved_address RPC (fire-and-forget ok)
```
Reuse the Slice-20 field shape; a small mapper converts a `SavedAddress` → the `BookingDraft` location/apartment partials (and vice-versa when saving from the draft).

---

## 5. UI

Reuse the design kit + Slice-20 components.
- **`SavedAddressCard`** (`src/components/ui/saved-address-card.tsx`): shows nickname/`label_type` (Home/Work/Other icon), the formatted address (reuse `formatDestination`), a **Default** indicator, and optional actions (tap-to-select, edit, delete, set-default) via props.
- **`SavedAddressPicker`** (`src/components/ui/saved-address-picker.tsx`): loads `getSavedAddresses`; renders a compact list of `SavedAddressCard`s (default first); `onSelect(addr)` callback; empty state ("No saved addresses yet"). Used at the top of the booking address step.
- **Booking address step** (`src/app/booking/address.tsx`, additive): render `SavedAddressPicker` first (when the customer has any) → tap prefills the draft via `setLocation`/`setApartment` + `touchSavedAddress`; below it the existing **AddressSearch** (+ manual). After a fresh search-select or manual entry, show a **"Save this address"** prompt → a small type/nickname + default choice → `createSavedAddress`. Manual fallback + existing Continue gating unchanged.
- **Manage Saved Addresses** (`src/app/(customer)/saved-addresses.tsx` + an entry on `profile.tsx`): list (via picker/cards), add (reuse AddressSearch + ApartmentDetailsForm), edit, delete (confirm), set-default. Read/write only the signed-in customer's rows.

---

## 6. Backward Compatibility & Privacy

- Booking flow works unchanged for customers with **zero** saved addresses (picker hidden/empty; search + manual as today). The "Save this address" prompt is optional/dismissible.
- `customer_addresses` is **owner-only** (RLS) — providers and admin cannot read it; no cross-user exposure. Saving an address does **not** change how bookings are stored (booking still carries its own address snapshot from Slice 20; no booking→address FK).
- No payment/auth/chat/tracking change; reuse Slice-20 fields/helpers; `address` required so a save never fails on the core field.

---

## 7. Testing

- **Lib** (`saved-addresses.test.ts`, mocked supabase): list ordering; create (customer_id from auth); update (updated_at); delete; `setDefaultAddress`/`touchSavedAddress` RPC names/args; error paths → `{ ok:false }` / `[]`.
- **Components:** `SavedAddressCard` (type/default indicator, actions fire), `SavedAddressPicker` (renders rows, onSelect, empty state).
- **Screens:** booking address step — picker prefills the draft + touch fires, search/manual still work, "Save this address" calls `createSavedAddress`; Manage screen — add/edit/delete/set-default. Keep existing `booking-address`/profile tests green (additive mocks; never weaken).
- **Manual RLS verification** (`docs/pilot/saved-addresses.sql`): a customer sees only their own rows; another customer/provider/admin cannot select them; `set_default_address` enforces one default; `touch_saved_address`/writes rejected for non-owners.
- Gate: `npm test` green, `npx tsc --noEmit` clean, `expo export --platform web` + `--platform android` succeed.

---

## 8. Deliverables

1. `supabase/migrations/0019_customer_addresses.sql` (table + owner RLS + partial-unique default + `set_default_address`/`touch_saved_address` RPCs).
2. `src/lib/saved-addresses.ts` (+ test) + a `SavedAddress ↔ BookingDraft` mapper.
3. `SavedAddressCard` + `SavedAddressPicker` components (+ tests).
4. Booking address step: saved picker + "Save this address" prompt (additive; manual fallback preserved).
5. `Manage Saved Addresses` screen + profile entry.
6. `docs/pilot/saved-addresses.sql` RLS verification + notes; green gate.
