# Slice 22 — Saved Addresses: Privacy, RLS & Backward-Compat Verification

Accurate as of migration `0019_customer_addresses.sql` and commit range `04248b9..HEAD`.

---

## 1. Overview

`customer_addresses` is an **owner-only** table. A customer owns every row they create; no other authenticated user — admin or provider — can read, write, or even enumerate those rows.

- **Admin / provider visibility:** zero. They never interact with `customer_addresses` directly. When a booking is created the caller's address text and structured fields are **copied** into the `bookings` row at creation time (Slice 20 pattern). Admin and provider see that snapshot only.
- **No bookings schema change in Slice 22.** No foreign key from `bookings` to `customer_addresses` exists or was added. Deleting a saved address has no effect on any past booking.
- **Fully additive / backward-compatible.** A customer with zero saved addresses gets the byte-identical pre-Slice-22 address entry flow. The saved-address picker and "Save this address" prompt appear only when relevant.

---

## 2. Schema Check

Run in the Supabase SQL Editor or psql:

```sql
-- Verify table columns (expect 18 rows: id, customer_id, label_type, nickname,
-- address, address_label, latitude, longitude, building_name, floor, door_number,
-- landmark, access_notes, is_default, last_used_at, created_at, updated_at, plus
-- relrowsecurity = true from pg_class)
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name  = 'customer_addresses'
order by ordinal_position;
-- Expected: 17 columns listed in definition order (id→updated_at).
```

```sql
-- Verify RLS is enabled on the table
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname = 'customer_addresses';
-- Expected: relrowsecurity = true
```

```sql
-- Verify both indexes exist
select indexname, indexdef
from pg_indexes
where tablename = 'customer_addresses'
order by indexname;
-- Expected indexes:
--   customer_addresses_customer_idx  — btree (customer_id, last_used_at DESC)
--   customer_addresses_one_default   — UNIQUE btree (customer_id) WHERE is_default
--   customer_addresses_pkey          — btree (id)  [primary key]
```

---

## 3. Owner-Only RLS — Four Policies, Customer Sees Only Their Own Rows

### Policy listing

```sql
select policyname, cmd, qual, with_check
from pg_policies
where tablename = 'customer_addresses'
order by policyname;
-- Expected: exactly 4 rows:
--   customer_addresses_delete  | DELETE | (customer_id = auth.uid()) | —
--   customer_addresses_insert  | INSERT | —                          | (customer_id = auth.uid())
--   customer_addresses_select  | SELECT | (customer_id = auth.uid()) | —
--   customer_addresses_update  | UPDATE | (customer_id = auth.uid()) | (customer_id = auth.uid())
--
-- NO admin policy, NO provider policy, NO is_admin() reference.
```

### Cross-customer isolation (run as Customer A's JWT)

```sql
-- Returns ONLY Customer A's rows — RLS filters all others.
select count(*) from customer_addresses;

-- Direct lookup of another customer's row returns 0 rows.
select * from customer_addresses where id = '<Customer-B-row-uuid>';
-- Expected: 0 rows
```

---

## 4. No Admin SELECT / No Provider Access

There is **no** admin or provider policy on `customer_addresses`. When signed in as an admin or provider account that is not the address owner:

```sql
-- Run with admin JWT or provider JWT (not the address owner).
select * from customer_addresses where id = '<Customer-A-row-uuid>';
-- Expected: 0 rows (RLS returns nothing; no admin/provider bypass policy exists).
```

Admin and provider oversight of a customer's address relies exclusively on the `address` snapshot stored in the `bookings` table at booking creation time — never on `customer_addresses`.

---

## 5. `set_default_address` Ownership Check

The function is `SECURITY DEFINER` so it can bypass RLS to perform the unset-then-set update atomically. It still enforces ownership explicitly.

```sql
-- As the address OWNER — succeeds, flips is_default to true.
select set_default_address('<own-address-uuid>');
-- Expected: no error; row updated.

-- As a NON-OWNER (different JWT, or run as service_role with a foreign id) — raises exception.
select set_default_address('<another-customers-address-uuid>');
-- Expected: ERROR: Not the address owner
-- (or "Address not found" if the row is invisible via RLS to the non-owner)
```

---

## 6. `touch_saved_address` Ownership Check

Same pattern: `SECURITY DEFINER` + explicit ownership assertion.

```sql
-- As the OWNER — updates last_used_at to now().
select touch_saved_address('<own-address-uuid>');
-- Expected: no error; last_used_at updated.

-- As a NON-OWNER — raises exception.
select touch_saved_address('<another-customers-address-uuid>');
-- Expected: ERROR: Not the address owner
```

---

## 7. One Default Per Customer

The partial unique index `customer_addresses_one_default` on `(customer_id) WHERE is_default` means only **one** row per customer can have `is_default = true` at any time.

### Verifying via `set_default_address`

```sql
-- Insert two rows for Customer A (both is_default = false).
insert into customer_addresses (customer_id, address, label_type)
values (auth.uid(), '1 Main St', 'home'),
       (auth.uid(), '2 Work Ave', 'work');

-- Set the first as default.
select set_default_address('<row-1-uuid>');

-- Verify: only row 1 is default.
select id, address, is_default from customer_addresses;
-- Expected: row 1 true, row 2 false.

-- Now switch default to row 2 (RPC unsets row 1 first, then sets row 2).
select set_default_address('<row-2-uuid>');

-- Verify: only row 2 is default.
select id, address, is_default from customer_addresses;
-- Expected: row 1 false, row 2 true.

-- Index violation check: attempting to set is_default = true directly on row 1
-- while row 2 is already default violates the unique index.
update customer_addresses set is_default = true where id = '<row-1-uuid>';
-- Expected: ERROR: duplicate key value violates unique constraint
--           "customer_addresses_one_default"
-- (Use set_default_address RPC instead — it does the unset-then-set safely.)
```

---

## 8. Booking Flow — Manual Verification Checklist

### Saved-address picker

- [ ] Customer with ≥ 1 saved address: on the booking address screen the `SavedAddressPicker` appears **above** the search bar (picker is shown first, search is hidden while picker is visible).
- [ ] Tapping a saved address: prefills the location text and apartment field (`setLocation` + `setApartment`) and calls `touch_saved_address` (bumps `last_used_at` for that row).
- [ ] After picking a saved address, the "Save this address" toggle is hidden (`fromSaved = true` suppresses it).

### Manual entry fallback

- [ ] Tapping "Use a new address" or selecting from the Google Places search dismisses the picker and shows the normal search/manual flow unchanged.
- [ ] Typing into the manual address field also clears the `fromSaved` flag.
- [ ] The manual entry path, the Continue button logic, and the resulting booking creation are **identical** to pre-Slice-22 behaviour.

### Zero saved addresses

- [ ] Customer with **zero** saved addresses: `getMySavedAddresses` returns `[]`; `showPicker` is `false`; the address screen renders exactly as it did before Slice 22 — no picker, no extra UI.
- [ ] Confirming no layout shift or extra whitespace appears when `savedAddresses` is empty.

### "Save this address" optional / non-blocking

- [ ] Toggle defaults to **off**. Customer is never required to save.
- [ ] When the toggle is on: `createSavedAddress` is called in a `try/catch` **after** the Continue intent. A Supabase error (network, RLS failure, validation) is caught silently — the booking navigation still proceeds.
- [ ] When the toggle is off: Continue navigates synchronously as before — no async detour.

---

## 9. Bookings Unaffected

```sql
-- Confirm no new column was added to bookings in this slice.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name  = 'bookings'
order by ordinal_position;
-- Compare against pre-Slice-22 baseline. No new column should appear.

-- Confirm no FK from bookings → customer_addresses.
select tc.constraint_name, kcu.column_name, ccu.table_name as references_table
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name
where tc.table_name = 'bookings'
  and tc.constraint_type = 'FOREIGN KEY';
-- Expected: customer_addresses does NOT appear in references_table.
```

**Evidence from isolation diff (section 10):** The `--stat` output for `04248b9..HEAD` lists exactly 13 changed files; `bookings.ts`, any bookings migration, and any payment/auth/chat/tracking/push/notifications file are **absent**.

---

## 10. Isolation Diff

`git diff 04248b9..HEAD --stat` output (run 2026-07-03):

```
 src/__tests__/booking-address.test.tsx          | 243 ++++++++++++-
 src/__tests__/profile.test.tsx                  |  15 +-
 src/__tests__/saved-addresses-manage.test.tsx   | 221 ++++++++++++
 src/app/(customer)/profile.tsx                  |   2 +
 src/app/booking/address.tsx                     | 145 +++++++-
 src/app/saved-addresses.tsx                     | 446 ++++++++++++++++++++++++
 src/components/ui/saved-address-card.test.tsx   | 192 ++++++++++
 src/components/ui/saved-address-card.tsx        | 169 +++++++++
 src/components/ui/saved-address-picker.test.tsx | 195 +++++++++++
 src/components/ui/saved-address-picker.tsx      |  98 ++++++
 src/lib/saved-addresses.test.ts                 | 427 +++++++++++++++++++++++
 src/lib/saved-addresses.ts                      | 223 ++++++++++++
 supabase/migrations/0019_customer_addresses.sql | 108 ++++++
 13 files changed, 2474 insertions(+), 10 deletions(-) (plus this doc)
```

### Files changed — all in scope

| File | Purpose |
|------|---------|
| `supabase/migrations/0019_customer_addresses.sql` | T1: Schema + RLS + RPCs |
| `src/lib/saved-addresses.ts` + `.test.ts` | T2: Client data layer |
| `src/components/ui/saved-address-card.tsx` + `.test.tsx` | T3: Card UI component |
| `src/components/ui/saved-address-picker.tsx` + `.test.tsx` | T3: Picker UI component |
| `src/app/saved-addresses.tsx` | T4: Manage-addresses screen |
| `src/__tests__/saved-addresses-manage.test.tsx` | T4: Manage-addresses tests |
| `src/app/(customer)/profile.tsx` | T4: "Saved addresses" nav entry point |
| `src/__tests__/profile.test.tsx` | T4: Profile nav test |
| `src/app/booking/address.tsx` | T5: Picker + save-prompt integration |
| `src/__tests__/booking-address.test.tsx` | T5: Booking address tests |

### Out-of-scope files — confirmed absent

- `src/lib/{payments,earnings,attempts,tracking,messages,push,notifications}.ts` — NOT in diff.
- `src/auth/**` — NOT in diff.
- `src/lib/bookings.ts` — NOT in diff.
- Any chat / ChatThread file — NOT in diff.
- Any migration other than `0019` — NOT in diff.

Isolation: **CLEAN**.

---

## 11. Final Gate Results (2026-07-03)

| Check | Result |
|-------|--------|
| `npm test` | PASS — 109 suites, 797 tests, 0 failures |
| `npx tsc --noEmit` | PASS — no errors |
| `npx expo export --platform web` | PASS — exported to `dist/` |
| `npx expo export --platform android` | PASS — exported to `dist/` |
| `git status` (after doc commit) | CLEAN — only `supabase/.temp/` untracked |

> Note: `npx expo export` auto-updates `package.json`/`package-lock.json` (expo-router 56.2.11→56.2.13). These modifications were discarded with `git checkout -- package.json package-lock.json` before committing to keep the diff clean. This is a Minor nit: the lock file drift is a runtime artifact of running export locally, not a Slice-22 change.

---

## 12. Rollback / Kill-Switch

### Option A — UI-only revert (hide the feature, preserve schema)

Revert the T5 (`booking/address.tsx`) and T4 (`saved-addresses.tsx`, `profile.tsx`) commits. The `customer_addresses` table will exist but be entirely unused. All existing bookings remain unaffected (no FK). Customer data in the table persists and can be re-enabled at any time.

### Option B — Full schema rollback (forward migration)

Create a `0020` migration:

```sql
-- Drop RPCs
drop function if exists public.set_default_address(uuid);
drop function if exists public.touch_saved_address(uuid);

-- Drop table (cascades RLS policies and indexes)
drop table if exists public.customer_addresses cascade;
```

This migration is safe to run at any time because:
- No foreign key in `bookings` references `customer_addresses`.
- No other table or function depends on it.
- Past bookings store their own address snapshot and are unaffected.
