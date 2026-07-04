# Slice 27 — Promotions & Coupons: Operator & Verification Guide

Accurate as of migration `0024_promotions.sql` and commit range `881311c..HEAD`.

---

## 1. Overview

The Promotions system lets admins create **promo codes** that customers redeem at checkout to reduce what they owe. QuickServe absorbs all discounts — provider share is never reduced.

Two tables form the foundation:

| Table | Role |
|---|---|
| `promo_codes` | Admin-managed codes; RLS admin-only (customers never enumerate, only redeem by exact code via RPC). |
| `promo_redemptions` | Append-only ledger; every redemption is an immutable row; no update/delete/insert policy (RPC-only writes). |

Two columns are added to `payments` (both additive, both default 0/null — fully backward-compatible):

| Column | Purpose |
|---|---|
| `promo_discount` | KES discount applied to this payment (0 = no promo). |
| `promo_code_id` | FK to `promo_codes` (null = no promo). |

**Key design invariants:**

- `amount_due = amount − wallet_applied − promo_discount` — floored at 0; never negative.
- **QuickServe absorbs the discount** — `provider_share`, `quickserve_share`, and `payments_shares_check` are untouched.
- **Promo + wallet stack** — `apply_wallet_to_payment` is recreated promo-aware; due-check and auto-settle account for both.
- **`promo_codes` are admin-only** — customers redeem by exact code via `redeem_promo` RPC, they never enumerate.
- **`promo_redemptions` are append-only and RPC-only** — no direct insert/update/delete policy.
- **One promo per payment** — second `redeem_promo` raises 'Promo already applied'.
- **No referral engine** — `wallet_credit` type is an admin-created campaign code, not auto-generated.
- **`wallet_applied` and `promo_discount` both default 0** — all pre-Slice-27 payments behave unchanged.

```
Customer redeems promo code
    │
    └─ redeem_promo(p_payment_id, p_code) ← SECURITY DEFINER RPC
            │
            ├─ Ownership + pending + one-per-payment guard
            ├─ Validate code: is_active, window (starts_at/ends_at), max_redemptions, per_user_limit
            │
            ├─ discount_type = 'percentage':
            │       v_disc = amount * value / 100 [cap at max_discount] [cap at remaining]
            │       → UPDATE payments SET promo_discount=v_disc, promo_code_id=pc.id
            │
            ├─ discount_type = 'fixed':
            │       v_disc = least(discount_value, remaining)
            │       → UPDATE payments SET promo_discount=v_disc, promo_code_id=pc.id
            │
            ├─ discount_type = 'wallet_credit':
            │       → _wallet_post(auth.uid(), 'promo_credit', value, ...) — balance rises
            │       → UPDATE payments SET promo_code_id=pc.id (promo_discount stays 0)
            │
            ├─ INSERT promo_redemptions row (always)
            │
            └─ Auto-settle (percentage/fixed only):
                    if (wallet_applied + v_disc) == amount AND booking.status='completed'
                    → UPDATE payments SET status='paid', paid_at=now()
                    → trg_create_earning_on_paid fires → INSERT provider_earnings (UNCHANGED)
                    → tg_notify_payment_paid fires → notification (UNCHANGED)

Customer applies wallet after promo
    │
    └─ apply_wallet_to_payment(p_payment_id, p_amount) ← recreated promo-aware
            │
            ├─ due-check: p_amount > (amount - wallet_applied - promo_discount) → raise
            ├─ _wallet_post: debit wallet, post ledger row
            ├─ UPDATE payments SET wallet_applied += p_amount
            └─ Auto-settle: if (wallet_applied+p_amount+promo_discount)==amount AND booking completed → paid

M-Pesa STK push
    └─ amountDue = amount − wallet_applied − promo_discount (both default 0 → backward-compat)
            → charges amountDue; blocks if amountDue <= 0 ('Nothing due on this payment.')
```

---

## 2. `promo_codes` RLS — Admin-Only

`promo_codes` has three policies, all gated on `is_admin()`: SELECT, INSERT, UPDATE. There is no DELETE policy, no customer policy, and no provider policy. Customers can never enumerate promo codes — they redeem by exact code via `redeem_promo`.

### Verify only admin policies exist

```sql
select policyname, cmd
from pg_policies
where tablename = 'promo_codes'
order by policyname;
-- Expected: exactly 3 rows
--   promo_codes_insert | INSERT
--   promo_codes_select | SELECT
--   promo_codes_update | UPDATE
-- NO delete policy. NO customer or provider policy.
```

### Prove customer or provider select returns 0 rows

```sql
-- As a customer (auth.uid() != any admin):
select * from public.promo_codes;
-- Expected: 0 rows (is_admin() = false → no row passes the SELECT policy)

-- As a provider (role='provider' in profiles):
select * from public.promo_codes;
-- Expected: 0 rows (same — no provider clause in any policy)
```

### Prove admin can select, insert, and update

```sql
-- As admin (is_admin() = true):
select count(*) from public.promo_codes;
-- Expected: N rows (all codes visible)

-- Create a test code:
insert into public.promo_codes (code, discount_type, discount_value, per_user_limit)
values ('TESTCODE10', 'fixed', 200, 1);
-- Expected: 1 row inserted (no error)

-- Toggle is_active:
update public.promo_codes set is_active = false where code = 'TESTCODE10';
-- Expected: 1 row updated (no error)
```

### Prove direct customer insert is rejected

```sql
-- As a customer (is_admin() = false):
insert into public.promo_codes (code, discount_type, discount_value, per_user_limit)
values ('HACK', 'fixed', 9999, 99);
-- Expected: ERROR 42501 new row violates row-level security policy for table "promo_codes"
```

---

## 3. `promo_redemptions` — Immutable + Provider Privacy

`promo_redemptions` has exactly one policy: SELECT for `customer_id = auth.uid() OR is_admin()`. There is no INSERT, UPDATE, or DELETE policy. Providers read 0 rows. Direct writes by any user are blocked.

### Verify only one SELECT policy exists

```sql
select policyname, cmd
from pg_policies
where tablename = 'promo_redemptions'
order by policyname;
-- Expected: exactly 1 row
--   promo_redemptions_select | SELECT
-- NO insert, update, or delete policy.
```

### Prove direct insert is rejected

```sql
-- As any authenticated user (including admin):
insert into public.promo_redemptions
  (promo_code_id, customer_id, discount_type, discount_amount)
values
  ('<any-uuid>', auth.uid(), 'fixed', 100);
-- Expected: ERROR 42501 new row violates row-level security policy for table "promo_redemptions"
```

### Prove update is rejected

```sql
-- As any authenticated user:
update public.promo_redemptions set discount_amount = 9999
where customer_id = '<customer-uuid>';
-- Expected: 0 rows affected (no UPDATE policy → Postgres silently denies)
```

### Prove delete is rejected

```sql
-- As any authenticated user:
delete from public.promo_redemptions where customer_id = '<customer-uuid>';
-- Expected: 0 rows affected (no DELETE policy → Postgres silently denies)
```

### Prove provider reads 0 rows

```sql
-- As any provider (role='provider' in profiles):
select * from public.promo_redemptions;
-- Expected: 0 rows (no provider clause in the SELECT policy)
```

### Customer reads own; admin reads all

```sql
-- As the redemption owner (customer_id = auth.uid()):
select * from public.promo_redemptions;
-- Expected: own rows only

-- As admin:
select count(*) from public.promo_redemptions;
-- Expected: total rows across all customers
```

---

## 4. `redeem_promo` — Percentage and Fixed Types

`redeem_promo` is a SECURITY DEFINER RPC. The caller must own the payment and the payment must be pending. On success it sets `promo_discount` (and `promo_code_id`) on the payment and inserts a redemption row.

### Verify percentage discount with max_discount cap

```sql
-- Promo: discount_type='percentage', discount_value=20, max_discount=300
-- Payment: amount=2000, wallet_applied=0
-- Expected v_disc = min(2000*20/100, 300) = min(400, 300) = 300

-- As the payment owner:
select public.redeem_promo('<payment-uuid>', 'PERCENT20CAP');
-- Expected: returns 300

-- Confirm payment updated:
select promo_discount, promo_code_id from public.payments where id = '<payment-uuid>';
-- Expected: promo_discount=300, promo_code_id IS NOT NULL

-- Confirm redemption row inserted:
select discount_type, discount_amount
from public.promo_redemptions where payment_id = '<payment-uuid>';
-- Expected: discount_type='percentage', discount_amount=300
```

### Verify fixed discount

```sql
-- Promo: discount_type='fixed', discount_value=500
-- Payment: amount=800, wallet_applied=0
-- Expected v_disc = least(500, 800) = 500

select public.redeem_promo('<payment-uuid>', 'SAVE500');
-- Expected: returns 500

select promo_discount from public.payments where id = '<payment-uuid>';
-- Expected: 500
```

### Verify no-negative-due: discount larger than remaining is capped

```sql
-- Promo: discount_type='fixed', discount_value=1500
-- Payment: amount=800, wallet_applied=200 (remaining=600)
-- Expected v_disc = least(1500, 600) = 600

select public.redeem_promo('<payment-uuid>', 'BIGDISCOUNT');
-- Expected: returns 600 (NOT 1500)

select promo_discount, amount, wallet_applied from public.payments where id = '<payment-uuid>';
-- Expected: promo_discount=600, amount=800, wallet_applied=200
-- amount_due = 800 - 200 - 600 = 0  ← NEVER negative
```

---

## 5. `redeem_promo` — `wallet_credit` Type

When `discount_type = 'wallet_credit'`, the RPC credits the customer's wallet (via `_wallet_post('promo_credit', ...)`) rather than discounting the payment. The payment's `promo_discount` stays 0; only `promo_code_id` is set. A redemption row is still inserted so the admin can audit.

### Verify wallet_credit posts balance and does not discount payment

```sql
-- Promo: discount_type='wallet_credit', discount_value=300
-- Customer wallet balance before: 100

-- As the payment owner:
select public.redeem_promo('<payment-uuid>', 'WALLET300');
-- Expected: returns 300

-- Payment discount is 0 (only promo_code_id is set):
select promo_discount, promo_code_id from public.payments where id = '<payment-uuid>';
-- Expected: promo_discount=0, promo_code_id IS NOT NULL

-- Wallet balance rose by 300:
select balance from public.wallets where customer_id = auth.uid();
-- Expected: 400 (100 + 300)

-- Ledger row shows type='promo_credit':
select type, amount, balance_after
from public.wallet_transactions
where customer_id = auth.uid() order by created_at desc limit 1;
-- Expected: type='promo_credit', amount=300, balance_after=400

-- Redemption row still recorded:
select discount_type, discount_amount from public.promo_redemptions
where payment_id = '<payment-uuid>';
-- Expected: discount_type='wallet_credit', discount_amount=300
```

---

## 6. One Promo Per Payment

A second call to `redeem_promo` on the same payment raises 'Promo already applied'. The guard checks `promo_code_id IS NOT NULL` before looking up the code.

### Prove second redemption raises

```sql
-- Payment already has promo_code_id set:
select public.redeem_promo('<payment-uuid>', 'ANOTHERCCODE');
-- Expected: ERROR P0001 Promo already applied

-- Payment is unchanged:
select promo_discount, promo_code_id from public.payments where id = '<payment-uuid>';
-- Expected: same as before (no second discount, no changed promo_code_id)
```

---

## 7. Limits and Window — Validation Guards

All four guards raise before any mutation.

### `max_redemptions` total cap

```sql
-- Promo has max_redemptions=2 and already has 2 rows in promo_redemptions:
select public.redeem_promo('<payment-uuid>', 'LIMITED');
-- Expected: ERROR P0001 Promo fully redeemed
```

### `per_user_limit` per-customer cap

```sql
-- Promo has per_user_limit=1 (default) and this customer already redeemed it once:
select public.redeem_promo('<payment-uuid-2>', 'ONEPERCUSTOMER');
-- Expected: ERROR P0001 Promo limit reached
```

### `is_active = false` kill-switch

```sql
-- Admin disables a code:
update public.promo_codes set is_active = false where code = 'DISABLED';

-- Any customer attempt:
select public.redeem_promo('<payment-uuid>', 'DISABLED');
-- Expected: ERROR P0001 Promo code is not valid
```

### Out-of-window (`starts_at` / `ends_at`)

```sql
-- Promo with ends_at in the past:
select public.redeem_promo('<payment-uuid>', 'EXPIRED');
-- Expected: ERROR P0001 Promo code is not valid

-- Promo with starts_at in the future:
select public.redeem_promo('<payment-uuid>', 'NOTYETLIVE');
-- Expected: ERROR P0001 Promo code is not valid
```

### Verify guard is enforced by policy introspection

```sql
-- Confirm per_user_limit constraint in promo_codes column:
select column_name, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'promo_codes'
  and column_name in ('per_user_limit', 'is_active', 'max_redemptions', 'starts_at', 'ends_at')
order by column_name;
-- Expected: per_user_limit (default 1, not null), is_active (default true, not null),
--   max_redemptions (nullable), starts_at/ends_at (nullable timestamptz)
```

---

## 8. No-Negative-Due (Amount Floor)

`amount_due = amount − wallet_applied − promo_discount`, floored at 0. Capping is enforced at three layers:

1. **SQL `redeem_promo`**: `v_disc = least(v_disc, v_remaining)` (and `least(v_disc, max_discount)` for percentage).
2. **TypeScript `amountDue()`**: `Math.max(0, amount - (wallet_applied ?? 0) - (promo_discount ?? 0))`.
3. **M-Pesa STK guard**: `if (amountDue <= 0) return 400`.

### Verify `amountDue` never goes negative

```sql
-- Payment: amount=500, wallet_applied=200, promo_discount=350
-- remaining before promo = 500-200 = 300; promo capped at 300; so promo_discount=300
-- amount_due = 500 - 200 - 300 = 0  ← never -50

select promo_discount from public.payments where id = '<payment-uuid>';
-- Expected: 300 (capped by least(..., remaining)), NOT 350
```

### TypeScript amountDue calculation

The helper in `src/lib/wallet.ts`:

```ts
export function amountDue(p: { amount: number; wallet_applied?: number; promo_discount?: number }): number {
  return Math.max(0, p.amount - (p.wallet_applied ?? 0) - (p.promo_discount ?? 0));
}
```

For a payment with `amount=500`, `wallet_applied=200`, `promo_discount=350`:
```
amountDue = Math.max(0, 500 - 200 - 350) = Math.max(0, -50) = 0
```

---

## 9. Promo + Wallet Stacking + Auto-Settle

Promo and wallet stack. Customers apply promo first, then wallet, or either alone. Auto-settle fires when `wallet_applied + promo_discount == amount` (or `wallet_applied + p_amount + promo_discount == amount` in `apply_wallet_to_payment`) on a completed booking.

### Apply fixed promo then wallet — partial coverage leaves pending

```sql
-- Payment: amount=1000, wallet_applied=0, promo_discount=0, status='pending'; booking='completed'
-- Customer has wallet balance 400.

-- Step 1: apply promo (fixed 300):
select public.redeem_promo('<payment-uuid>', 'SAVE300');
-- promo_discount=300; amount_due=700; status still 'pending'

-- Step 2: apply wallet (400 — leaves 300 due):
select public.apply_wallet_to_payment('<payment-uuid>', 400);
-- wallet_applied=400; amount_due=300; status still 'pending'

select status, promo_discount, wallet_applied from public.payments where id = '<payment-uuid>';
-- Expected: status='pending', promo_discount=300, wallet_applied=400
```

### Full combined coverage → auto-settle on completed booking

```sql
-- Payment: amount=500, wallet_applied=0, promo_discount=0, status='pending'; booking='completed'
-- Customer has wallet balance 300.

-- Step 1: apply promo (fixed 200):
select public.redeem_promo('<payment-uuid>', 'SAVE200');
-- promo_discount=200; amount_due=300

-- Step 2: apply wallet exactly 300:
select public.apply_wallet_to_payment('<payment-uuid>', 300);
-- wallet_applied=300; (300+200)==500 AND booking completed → auto-settle

select status, paid_at from public.payments where id = '<payment-uuid>';
-- Expected: status='paid', paid_at IS NOT NULL

-- Provider earning created (unchanged trigger):
select provider_id, amount, payout_status
from public.provider_earnings where booking_id = '<booking-uuid>';
-- Expected: 1 row; amount = provider_share (from original payment row)

-- Notification fired:
select type from public.notifications
where booking_id = '<booking-uuid>' order by created_at desc limit 1;
-- Expected: type = 'payment_paid'
```

### Auto-settle via redeem_promo (promo alone covers completed booking)

```sql
-- Payment: amount=400, wallet_applied=200, promo_discount=0, status='pending'; booking='completed'
-- Promo: fixed 200 → v_disc=min(200,200)=200 → (200+200)==400 AND completed → auto-settle

select public.redeem_promo('<payment-uuid>', 'COVER200');
-- Expected: returns 200; status auto-settles to 'paid'

select status from public.payments where id = '<payment-uuid>';
-- Expected: 'paid'
```

### Verify `apply_wallet_to_payment` due-check accounts for promo

```sql
-- Payment: amount=800, wallet_applied=0, promo_discount=300; remaining=500
-- Attempt to apply 600 (exceeds due of 500):
select public.apply_wallet_to_payment('<payment-uuid>', 600);
-- Expected: ERROR P0001 Exceeds amount due

-- Wallet and payment unchanged:
select wallet_applied from public.payments where id = '<payment-uuid>';
-- Expected: 0 (unchanged)
```

---

## 10. M-Pesa Charge: `amount − wallet_applied − promo_discount`

`mpesa-stk-push` computes `amountDue = amount − wallet_applied − promo_discount` (both default 0). The STK push charges only `amountDue`. `promo_discount` defaults to 0 for all pre-Slice-27 payments — no change in charge behavior for existing rows.

### Verify the charge logic (inspect function body)

The relevant lines in `supabase/functions/mpesa-stk-push/index.ts`:

```ts
// Fetch includes wallet_applied and promo_discount:
.select('id, amount, wallet_applied, promo_discount, booking_id, status')

// Compute amount due (both default 0 → backward-compat):
const amountDue = Number(payment.amount)
  - Number(payment.wallet_applied ?? 0)
  - Number(payment.promo_discount ?? 0);
if (amountDue <= 0) {
  return json({ ok: false, error: 'Nothing due on this payment.' }, 400);
}

// All 3 charge sites use amountDue:
mockStkResult({ phone: phone!, amount: amountDue })
buildStkPushPayload({ ..., amount: amountDue, ... })
admin.from('payment_attempts').insert({ ..., amount: amountDue, ... })
```

### Confirm backward-compat: existing payments charge full amount

For any payment row where `wallet_applied` and `promo_discount` are both 0 (all pre-Slice-27 rows):
```
amountDue = amount − 0 − 0 = amount  ← behavior unchanged
```

No change to M-Pesa credentials, callback URL, `DARAJA_SHORTCODE`, `DARAJA_PASSKEY`, or `DARAJA_CALLBACK_URL`. Only the charge amount computation changed.

---

## 11. Provider Payout / Share — Unchanged

`provider_share` and `quickserve_share` are set at quote-accept time by `create_payment_on_accept` trigger and are never recomputed. Promo discounts (and wallet credit) reduce only what QuickServe collects externally. QuickServe absorbs all promo discounts from its own share.

### Verify shares constraint still enforces `provider_share + quickserve_share = amount`

```sql
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.payments'::regclass
  and conname = 'payments_shares_check';
-- Expected: 1 row; definition: CHECK (provider_share >= 0 AND quickserve_share >= 0
--   AND provider_share + quickserve_share = amount)
-- NOTE: constraint is on `amount`, NOT on `wallet_applied` or `promo_discount`.
-- Promo and wallet credits do NOT affect these shares.
```

### Verify `pay_payment`, `create_earning_on_paid`, `override_payment_status` are unchanged

```sql
-- pay_payment — no promo_discount reference:
select prosrc from pg_proc
where proname = 'pay_payment' and pronamespace = 'public'::regnamespace;
-- Expected: body references payments.status + bookings.status only (no promo field)

-- create_earning_on_paid — uses new.provider_share (unchanged):
select prosrc from pg_proc
where proname = 'create_earning_on_paid' and pronamespace = 'public'::regnamespace;
-- Expected: inserts provider_earnings with amount = new.provider_share

-- override_payment_status — no promo_discount reference:
select prosrc from pg_proc
where proname = 'override_payment_status' and pronamespace = 'public'::regnamespace;
-- Expected: no wallet_applied or promo_discount reference
```

### No-payout-change audit

The following files are **NOT in the Slice 27 diff** (`git diff 881311c..HEAD --name-only`):

- `supabase/migrations/0010_payments.sql` (shares / pay_payment / create_earning_on_paid / override_payment_status)
- `supabase/migrations/0023_wallet.sql` (wallet schema — NOT modified by Slice 27)
- `src/auth/**` (no auth change)
- Any chat / ChatThread / tracking file
- `supabase/functions/mpesa-callback/**` (credentials / callback unchanged)
- `payment_attempts` table schema (column list unchanged)
- `provider_earnings` schema

---

## 12. Existing Flow — Backward-Compatible

### `payments.promo_discount` column defaults to 0

```sql
select column_name, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'payments'
  and column_name in ('promo_discount', 'promo_code_id')
order by column_name;
-- Expected:
--   promo_code_id  | null (nullable, FK, no default)
--   promo_discount | 0    (not null, check >= 0)
-- All pre-Slice-27 payment rows have promo_discount=0 and promo_code_id=null.
```

### `payment_attempts` schema unchanged

```sql
select column_name from information_schema.columns
where table_schema = 'public'
  and table_name = 'payment_attempts'
order by ordinal_position;
-- Expected: same columns as before Slice 27 (no new promo column added)
```

### Cash and card flow unchanged

The `pay_payment` RPC (cash/card path) is unchanged. It sets `status='paid'` independently of `promo_discount`. A customer who applied a promo before paying via cash/card has a reduced display `amountDue` in the UI — the payout path is unaffected.

### Wallet-only payments unchanged (promo_discount = 0)

For a payment with no promo applied, `apply_wallet_to_payment` receives `v_promo = 0`. The due-check becomes `p_amount > (amount - applied - 0)` — identical to the Slice-26 body.

---

## 13. No Referral Engine

`wallet_credit` is one of three `discount_type` values in `promo_codes`. It is **not** generated automatically. No trigger, function, or application code issues promo codes or wallet credits automatically. An admin creates a campaign code via the Promos screen and customers redeem it manually.

```sql
-- Confirm discount_type check constraint:
select pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.promo_codes'::regclass
  and conname like '%discount_type%';
-- Expected: CHECK (discount_type IN ('percentage','fixed','wallet_credit'))
-- This is a static admin-created list — no dynamic referral/marketing pipeline.
```

---

## 14. Rollback Plan

### Option A — Per-task git revert (UI hidden; schema dormant)

Revert newest-first. Existing promo codes / redemptions remain dormant. M-Pesa reverts to charging `amount − wallet_applied`.

Order (newest first):

1. `f87ecea` — admin promos screen (T4)
2. `29c88f0` — mpesa promo amount_due + booking promo entry (T3)
3. `6fd801e` — promotions lib + wallet amountDue promo term (T2)
4. `a3595aa` — promotions schema + redeem_promo + promo-aware apply_wallet (T1)

Reverting T3 alone restores full-amount M-Pesa charge (minus wallet) and removes the promo input from the payment screen — the safest single-task rollback.

### Kill-switch: `is_active = false`

```sql
-- Disable all active promo codes immediately:
update public.promo_codes set is_active = false;
-- No code can be redeemed by any customer; no code change is needed.
```

### Option B — Forward rollback migration `0025_rollback_promotions.sql`

Run after reverting application code:

```sql
-- Restore apply_wallet_to_payment to the Slice-26 body (promo-unaware):
create or replace function public.apply_wallet_to_payment(
  p_payment_id uuid, p_amount numeric
) returns void language plpgsql security definer set search_path = public as $$
-- ... Slice-26 body (omit v_promo; due-check = p_amount > amount-applied; settle = applied+p_amount==amount) ...
$$;

-- Drop the promo RPC and tables:
drop function if exists public.redeem_promo(uuid, text);
drop table if exists public.promo_redemptions cascade;
drop table if exists public.promo_codes cascade;

-- Remove promo columns from payments:
alter table public.payments
  drop column if exists promo_discount,
  drop column if exists promo_code_id;
```

This migration is safe at any time because:

- `payments.provider_share`, `payments.quickserve_share`, `payments_shares_check` are **not dropped**.
- `create_earning_on_paid` / `pay_payment` / `override_payment_status` are **not dropped**.
- `trg_create_earning_on_paid` is **not dropped**.
- `wallets`, `wallet_transactions`, and all wallet RPCs are **not affected**.
- `payment_attempts` is **not affected**.

---

## 15. Isolation Diff

`git diff 881311c..HEAD --stat` output (run 2026-07-04):

```
 src/__tests__/admin-web-promos.test.tsx    | 194 ++++++++++++
 src/__tests__/booking-detail.test.tsx      | 117 +++++++-
 src/app/(admin-web)/promos/index.tsx       | 455 +++++++++++++++++++++++++++++
 src/app/booking/[id].tsx                   |  42 +++
 src/components/admin-web/admin-sidebar.tsx |   1 +
 src/components/ui/input.tsx                |   2 +-
 src/lib/payments.ts                        |   4 +
 src/lib/promotions.test.ts                 | 231 +++++++++++++++
 src/lib/promotions.ts                      | 133 +++++++++
 src/lib/wallet.test.ts                     |  24 ++
 src/lib/wallet.ts                          |   9 +-
 supabase/functions/mpesa-stk-push/index.ts |   8 +-
 supabase/migrations/0024_promotions.sql    | 178 +++++++++++
 13 files changed, 1386 insertions(+), 12 deletions(-))
```

### Files changed — all in scope

| File | Task | Purpose |
|---|---|---|
| `supabase/migrations/0024_promotions.sql` | T1 | promo_codes + promo_redemptions + payments columns + redeem_promo + promo-aware apply_wallet_to_payment |
| `src/lib/promotions.ts` | T2 | Types + customer/admin helpers (redeemPromo, getMyPromoRedemptions, adminGetPromoCodes, adminCreatePromoCode, adminUpdatePromoCode, adminGetPromoRedemptions) |
| `src/lib/promotions.test.ts` | T2 | 15 tests for all promo helpers |
| `src/lib/payments.ts` | T2 | Additive: +optional `promo_discount?`, `promo_code_id?` fields on Payment type |
| `src/lib/wallet.ts` | T2 | Additive: `amountDue` updated to `Math.max(0, amount - wallet_applied - promo_discount)` |
| `src/lib/wallet.test.ts` | T2 | +6 amountDue tests (promo term, defaults, discount > amount → floor 0) |
| `src/app/booking/[id].tsx` | T3 | Promo input + apply button + discount display; promo before wallet; promo-aware amountDue |
| `src/__tests__/booking-detail.test.tsx` | T3 | +3 tests (Cases L, L2, L3: apply/already-applied/discount-display) |
| `supabase/functions/mpesa-stk-push/index.ts` | T3 | Additive: fetch `promo_discount`; compute `amountDue`; charge at 3 sites |
| `src/components/ui/input.tsx` | T3 | Additive: adds `'characters'` to `autoCapitalize` union type (required by promo input) |
| `src/app/(admin-web)/promos/index.tsx` | T4 | Admin promo management screen: create form + codes table + redemption history |
| `src/__tests__/admin-web-promos.test.tsx` | T4 | 10 tests (list, create, enable/disable, redemptions) |
| `src/components/admin-web/admin-sidebar.tsx` | T4 | +1 nav entry: Promotions → `/(admin-web)/promos` |

### Out-of-scope files — confirmed absent from diff

- `supabase/migrations/0010_payments.sql` — NOT in diff (shares / pay_payment / create_earning_on_paid / override_payment_status unchanged)
- `supabase/migrations/0023_wallet.sql` — NOT in diff (wallet schema unchanged by Slice 27)
- Any migration other than `0024_promotions.sql` — NOT in diff
- `src/auth/**` — NOT in diff
- Any chat / ChatThread / tracking file — NOT in diff
- `supabase/functions/mpesa-callback/**` — NOT in diff (credentials/callback unchanged)
- `DARAJA_SHORTCODE`, `DARAJA_PASSKEY`, `DARAJA_CALLBACK_URL` — not changed
- `payment_attempts` table schema — NOT in diff (no new column added)
- `provider_earnings` schema — NOT in diff
- `provider_share` / `quickserve_share` / `payments_shares_check` constraint — NOT in diff
- `pay_payment` / `create_earning_on_paid` / `override_payment_status` — NOT in diff
- `assignProvider` / dispatch logic — NOT in diff

### `mpesa-stk-push` change — additive only

The 8-line net diff on `mpesa-stk-push/index.ts` adds `promo_discount` to the SELECT, updates the `amountDue` formula, and substitutes `amountDue` at 3 charge sites. No credential, env var, callback URL, or auth logic changed.

### `input.tsx` change — additive type fix

The 2-line diff adds `'characters'` to the `autoCapitalize` prop union type. No behavior change; no test impact.

### No-payout-change audit

`provider_share` / `quickserve_share` / `payments_shares_check` and `create_earning_on_paid` are defined in `0010_payments.sql`. That file is not in the diff. `provider_earnings` schema is unchanged. `pay_payment`, `override_payment_status`, `assignProvider` are unchanged. Promo discount reduces only the externally collected charge — provider payout path is untouched.

Isolation: **CLEAN**.

---

## 16. Final Gate Results (2026-07-04)

| Check | Result |
|---|---|
| `npm test` | PASS — 120 suites, 1038 tests, 0 failures |
| `npx tsc --noEmit` | PASS — no errors |
| `npx expo export --platform web` | PASS — exported to `dist/` |
| `npx expo export --platform android` | PASS — exported to `dist/` |
| `git status` (after doc commit) | CLEAN — only `supabase/.temp/` untracked |

---

## 17. Operator Checklist — Deploying Slice 27

### Pre-deploy

- [ ] Apply migration `0024_promotions.sql` via Supabase SQL Editor or `supabase db push`.
  - Requires Slice 26 (`0023_wallet.sql`) to be already applied (depends on `_wallet_post`).

### Post-deploy verification

```sql
-- 1. Confirm promo_codes and promo_redemptions tables exist with RLS enabled
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('promo_codes', 'promo_redemptions');
-- Expected: 2 rows; both relrowsecurity = true

-- 2. Confirm promo_codes has exactly 3 policies (admin-only)
select policyname, cmd from pg_policies
where tablename = 'promo_codes'
order by policyname;
-- Expected: 3 rows — promo_codes_insert (INSERT), promo_codes_select (SELECT), promo_codes_update (UPDATE)

-- 3. Confirm promo_redemptions has exactly 1 policy (SELECT own or admin)
select policyname, cmd from pg_policies
where tablename = 'promo_redemptions';
-- Expected: 1 row — promo_redemptions_select (SELECT)

-- 4. Confirm payments columns added
select column_name, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'payments'
  and column_name in ('promo_discount', 'promo_code_id')
order by column_name;
-- Expected: promo_code_id (nullable), promo_discount (default '0', not null)

-- 5. Confirm redeem_promo and updated apply_wallet_to_payment exist
select proname from pg_proc
where proname in ('redeem_promo', 'apply_wallet_to_payment')
  and pronamespace = 'public'::regnamespace
order by proname;
-- Expected: 2 rows

-- 6. Smoke test: create a promo code (as admin) and verify a customer cannot see it
insert into public.promo_codes (code, discount_type, discount_value, per_user_limit)
values ('SMOKE10', 'fixed', 100, 1);
-- Expected: success (as admin)
-- As customer: select * from public.promo_codes; → 0 rows

-- 7. Confirm provider earnings, pay_payment, override_payment_status unchanged
select proname from pg_proc
where proname in ('pay_payment', 'create_earning_on_paid', 'override_payment_status')
  and pronamespace = 'public'::regnamespace;
-- Expected: 3 rows (all present and unchanged)

-- 8. Confirm shares constraint unchanged
select conname from pg_constraint
where conrelid = 'public.payments'::regclass
  and conname = 'payments_shares_check';
-- Expected: 1 row
```
