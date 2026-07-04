# Slice 26 — Customer Wallet: Operator & Verification Guide

Accurate as of migration `0023_wallet.sql` and commit range `7d003f0..HEAD`.

---

## 1. Overview

The Customer Wallet is a **stored-credit ledger** that lets customers apply pre-loaded balance toward pending payments, reducing what QuickServe collects externally via M-Pesa.

Two tables form the foundation:

| Table | Role |
|---|---|
| `wallets` | One row per customer; holds the authoritative `balance`; RLS anchors ownership. |
| `wallet_transactions` | Append-only ledger; every balance change is a signed row that snapshots `balance_after`. |

**Key design invariants:**

- `wallets.balance` changes **ONLY via SECURITY DEFINER RPCs** — no direct-write policy exists on either table.
- `wallet_transactions` is **append-only** — no update or delete policy exists.
- The **no-overdraw** guard is enforced at the row-lock level inside `_wallet_post`.
- Providers see **0 rows** from both tables — no provider RLS policy exists.
- `wallet_applied` on `payments` defaults to 0 → **fully backward-compatible** with existing payment rows.
- `payments.wallet_applied` **never affects `provider_share` or `quickserve_share`** — those columns are fixed at quote-accept time and never recomputed.

```
Customer applies wallet credit
    │
    ├─ apply_wallet_to_payment(p_payment_id, p_amount) ← SECURITY DEFINER RPC
    │       │
    │       ├─ _wallet_post: SELECT balance FOR UPDATE → v_new = bal - amount
    │       │       → raises 'Insufficient wallet balance' if v_new < 0
    │       │       → UPDATE wallets SET balance = v_new
    │       │       → INSERT wallet_transactions (type='payment_applied', amount=-p_amount, balance_after=v_new)
    │       │
    │       ├─ UPDATE payments SET wallet_applied += p_amount
    │       │
    │       └─ Auto-settle: if wallet_applied = amount AND booking.status = 'completed'
    │               → UPDATE payments SET status='paid', paid_at=now()
    │               → trg_create_earning_on_paid fires → INSERT provider_earnings (UNCHANGED)
    │               → tg_notify_payment_paid fires → notification to customer (UNCHANGED)

Admin adjusts wallet
    │
    └─ admin_wallet_adjust(p_customer_id, p_type, p_amount[signed], p_note) ← SECURITY DEFINER RPC
            │
            ├─ is_admin() gate; note-required gate; type allowlist gate
            └─ _wallet_post(created_by=auth.uid()) → balance update + ledger row

M-Pesa STK push
    └─ amountDue = payment.amount − payment.wallet_applied (default 0 → amount, backward-compat)
            → charges amountDue; blocks if amountDue <= 0 ('Nothing due on this payment')
```

---

## 2. Balance via RPC Only — Direct Writes Rejected

Both `wallets` and `wallet_transactions` have **SELECT-only RLS policies**. No insert, update, or delete policy exists. Any direct write attempt by an authenticated user is rejected by Postgres.

### Verify that only SELECT policies exist

```sql
-- Confirm wallets has exactly 1 policy (SELECT)
select policyname, cmd
from pg_policies
where tablename = 'wallets'
order by policyname;
-- Expected: exactly 1 row
--   wallets_select | SELECT
-- NO insert, update, or delete policy.

-- Confirm wallet_transactions has exactly 1 policy (SELECT)
select policyname, cmd
from pg_policies
where tablename = 'wallet_transactions'
order by policyname;
-- Expected: exactly 1 row
--   wallet_txn_select | SELECT
-- NO insert, update, or delete policy.
```

### Prove direct insert is rejected

```sql
-- As any authenticated user, attempt a direct balance insert:
insert into public.wallets (customer_id, balance)
values (auth.uid(), 500);
-- Expected: ERROR 42501 new row violates row-level security policy for table "wallets"

-- Attempt a direct transaction insert:
insert into public.wallet_transactions
  (wallet_id, customer_id, type, amount, balance_after)
values
  ('<any-uuid>', auth.uid(), 'admin_credit', 100, 100);
-- Expected: ERROR 42501 new row violates row-level security policy for table "wallet_transactions"
```

### Prove RPC writes succeed (balance + ledger)

```sql
-- Via admin_wallet_adjust (as admin):
select public.admin_wallet_adjust(
  '<customer-uuid>',
  'admin_credit',
  500,
  'Pilot welcome credit'
);
-- Expected: void (no error)

-- Confirm balance updated:
select balance from public.wallets where customer_id = '<customer-uuid>';
-- Expected: 500

-- Confirm ledger row appended:
select type, amount, balance_after, note
from public.wallet_transactions
where customer_id = '<customer-uuid>'
order by created_at desc limit 1;
-- Expected: type='admin_credit', amount=500, balance_after=500, note='Pilot welcome credit'
```

---

## 3. Ledger Append-Only — Update and Delete Rejected

`wallet_transactions` has no update or delete policy. Once posted, ledger rows are permanent.

### Prove update is rejected

```sql
-- As any authenticated user (even admin), attempt to update a ledger row:
update public.wallet_transactions
set amount = 9999
where customer_id = '<customer-uuid>';
-- Expected: 0 rows affected (RLS denies UPDATE — no policy exists for this cmd)
-- NOTE: Postgres silently filters rather than raising for UPDATE/DELETE with no policy.
```

### Prove delete is rejected

```sql
-- Attempt to delete a ledger row:
delete from public.wallet_transactions
where customer_id = '<customer-uuid>';
-- Expected: 0 rows affected (no DELETE policy exists)
```

### Verify immutability via function introspection

```sql
-- Confirm no trigger or function references an UPDATE on wallet_transactions:
select tgname, tgenabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relnamespace = 'public'::regnamespace
  and c.relname = 'wallet_transactions';
-- Expected: 0 rows (no triggers on the ledger table)
```

---

## 4. No-Overdraw Guard

Both `admin_wallet_adjust` (via `_wallet_post`) and `apply_wallet_to_payment` enforce balance >= 0. Debit beyond balance or application beyond amount_due raises an exception.

### `admin_wallet_adjust` — debit beyond balance raises

```sql
-- Customer has balance 500. Attempt to debit 600:
select public.admin_wallet_adjust(
  '<customer-uuid>',
  'admin_debit',
  -600,
  'Test overdraw'
);
-- Expected: ERROR P0001 Insufficient wallet balance
-- Balance remains 500; no ledger row appended.

-- Confirm balance unchanged:
select balance from public.wallets where customer_id = '<customer-uuid>';
-- Expected: 500
```

### `apply_wallet_to_payment` — amount exceeds balance raises

```sql
-- Customer has balance 200. Payment has amount=800, wallet_applied=0.
-- Attempt to apply 300 (exceeds balance):
select public.apply_wallet_to_payment('<payment-uuid>', 300);
-- Expected: ERROR P0001 Insufficient wallet balance

-- Confirm payments.wallet_applied unchanged:
select wallet_applied from public.payments where id = '<payment-uuid>';
-- Expected: 0
```

### `apply_wallet_to_payment` — amount exceeds amount_due raises

```sql
-- Customer has balance 1000. Payment has amount=800, wallet_applied=300 → due=500.
-- Attempt to apply 600 (exceeds due of 500):
select public.apply_wallet_to_payment('<payment-uuid>', 600);
-- Expected: ERROR P0001 Exceeds amount due

-- Confirm wallet balance unchanged:
select balance from public.wallets where customer_id = '<customer-uuid>';
-- Expected: 1000
```

---

## 5. RLS / Privacy — The Key Privacy Test

Customer sees only their own rows. Admin sees all rows. **Providers see 0 rows** from both `wallets` and `wallet_transactions` — no provider policy exists.

### Customer reads own wallet and transactions

```sql
-- As the wallet owner (customer_id = auth.uid()):
select balance, currency from public.wallets;
-- Expected: 1 row — own wallet

select type, amount, balance_after, created_at
from public.wallet_transactions
order by created_at desc;
-- Expected: own ledger rows only
```

### Another customer reads 0 rows

```sql
-- As a different customer (customer_id != wallet owner):
select * from public.wallets;
-- Expected: 0 rows

select * from public.wallet_transactions;
-- Expected: 0 rows
```

### Provider reads 0 rows — no provider policy

```sql
-- As any provider (role='provider' in profiles; auth.uid() != any customer_id):
select * from public.wallets;
-- Expected: 0 rows (no provider SELECT policy on wallets)

select * from public.wallet_transactions;
-- Expected: 0 rows (no provider SELECT policy on wallet_transactions)
```

### Admin reads all rows

```sql
-- As a user where is_admin() = true:
select count(*) from public.wallets;
-- Expected: N rows (all customers who have a wallet row)

select count(*) from public.wallet_transactions;
-- Expected: M rows (entire ledger)
```

### Verify RLS policies (authoritative check)

```sql
-- Confirm wallets SELECT policy: customer_id = auth.uid() OR is_admin()
select policyname, cmd, qual
from pg_policies
where tablename = 'wallets';
-- Expected: 1 row; cmd=SELECT; qual includes auth.uid() and is_admin()
-- NO provider clause.

-- Confirm wallet_transactions SELECT policy: customer_id = auth.uid() OR is_admin()
select policyname, cmd, qual
from pg_policies
where tablename = 'wallet_transactions';
-- Expected: 1 row; cmd=SELECT; qual includes auth.uid() and is_admin()
-- NO provider clause.
```

---

## 6. Admin Adjustment Requires Note + is_admin()

`admin_wallet_adjust` enforces three guards before delegating to `_wallet_post`:
1. Caller must satisfy `is_admin()`.
2. `p_note` must be non-empty after trimming.
3. `p_type` must be one of 7 allowed adjustment types (not `payment_applied`).

### Empty note raises 'Note required'

```sql
-- As admin, omit note (empty string):
select public.admin_wallet_adjust('<customer-uuid>', 'admin_credit', 100, '');
-- Expected: ERROR P0001 Note required

-- Whitespace-only note also raises:
select public.admin_wallet_adjust('<customer-uuid>', 'admin_credit', 100, '   ');
-- Expected: ERROR P0001 Note required
```

### Non-admin caller raises 'Admin only'

```sql
-- As a customer or provider (is_admin() = false):
select public.admin_wallet_adjust('<any-uuid>', 'admin_credit', 100, 'A note');
-- Expected: ERROR P0001 Admin only
```

### `created_by` records the admin actor

```sql
-- As admin (auth.uid() = '<admin-uuid>'), apply a credit:
select public.admin_wallet_adjust('<customer-uuid>', 'admin_credit', 100, 'Test note');

-- Confirm created_by = admin's uid:
select created_by, note from public.wallet_transactions
where customer_id = '<customer-uuid>'
order by created_at desc limit 1;
-- Expected: created_by = '<admin-uuid>', note = 'Test note'
```

---

## 7. Payment Application — Partial and Full Coverage

### Partial application — payment remains pending, amount_due reduced

```sql
-- Payment: amount=800, wallet_applied=0, status='pending'; booking status='completed'
-- Customer has balance 300.
select public.apply_wallet_to_payment('<payment-uuid>', 300);
-- Expected: void (no error)

-- Payment remains pending with updated wallet_applied:
select status, wallet_applied, amount
from public.payments where id = '<payment-uuid>';
-- Expected: status='pending', wallet_applied=300, amount=800
-- amount_due = 800 - 300 = 500 (displayed in UI as "Amount due")

-- Wallet balance reduced:
select balance from public.wallets where customer_id = '<customer-uuid>';
-- Expected: 0 (was 300, now 300-300=0)

-- Ledger row posted:
select type, amount, balance_after
from public.wallet_transactions
where customer_id = '<customer-uuid>' order by created_at desc limit 1;
-- Expected: type='payment_applied', amount=-300, balance_after=0
```

### Full coverage — payment auto-settles to 'paid', earning + notification fire

```sql
-- Payment: amount=500, wallet_applied=0, status='pending'; booking status='completed'
-- Customer has balance 500.
select public.apply_wallet_to_payment('<payment-uuid>', 500);
-- Expected: void (no error)

-- Payment auto-settled:
select status, wallet_applied, paid_at
from public.payments where id = '<payment-uuid>';
-- Expected: status='paid', wallet_applied=500, paid_at IS NOT NULL

-- Provider earning created (reusing create_earning_on_paid trigger):
select provider_id, amount, payout_status
from public.provider_earnings where booking_id = '<booking-uuid>';
-- Expected: 1 row; amount = provider_share (from original payment row); payout_status='pending'

-- Notification sent (reusing tg_notify_payment_paid trigger):
select type from public.notifications
where booking_id = '<booking-uuid>'
order by created_at desc limit 1;
-- Expected: type = 'payment_paid' (or platform-equivalent)
```

### Partial does NOT settle — booking must be completed + full coverage required

```sql
-- Even if booking is completed, partial wallet application leaves status='pending':
-- Payment: amount=800, wallet_applied=300; wallet covers 500 more = exactly 800 total.
-- First partial (300 already applied):
select public.apply_wallet_to_payment('<payment-uuid>', 500);
-- Expected: void — wallet_applied becomes 800 = amount → auto-settles to 'paid'.

-- But partial (wallet_applied < amount) NEVER settles:
-- Payment: amount=800, wallet_applied=400.
-- Apply 300 more (total=700 < 800):
select public.apply_wallet_to_payment('<payment-uuid>', 300);
-- Expected: void; status still 'pending'; wallet_applied=700.
```

---

## 8. M-Pesa Charge: `amount − wallet_applied`

`mpesa-stk-push` selects `wallet_applied` from the payment row and computes `amountDue = amount − wallet_applied`. The STK push charges only `amountDue`. `wallet_applied` defaults to 0 for existing payments, so the behavior is unchanged for any payment that has never had wallet credit applied.

### Verify the charge logic (inspect function body)

The relevant lines in `supabase/functions/mpesa-stk-push/index.ts`:

```ts
// Fetch includes wallet_applied:
.select('id, amount, wallet_applied, booking_id, status')

// Compute amount due:
const amountDue = Number(payment.amount) - Number(payment.wallet_applied ?? 0);
if (amountDue <= 0) {
  return json({ ok: false, error: 'Nothing due on this payment.' }, 400);
}

// All 3 charge sites use amountDue (mock, real, payment_attempts insert):
mockStkResult({ phone: phone!, amount: amountDue })
buildStkPushPayload({ ..., amount: amountDue, ... })
admin.from('payment_attempts').insert({ ..., amount: amountDue, ... })
```

### Confirm backward-compat: existing payments charge full amount

For any payment row where `wallet_applied` is NULL or 0 (all pre-Slice-26 rows):
```
amountDue = amount − 0 = amount   ← behavior unchanged
```

No change to M-Pesa credentials, callback URL, `DARAJA_SHORTCODE`, `DARAJA_PASSKEY`, or `DARAJA_CALLBACK_URL`. Only the charge amount computation changed.

---

## 9. Provider Share / Payout — Unchanged

`provider_share` and `quickserve_share` are set at quote-accept time by `create_payment_on_accept` trigger and are never recomputed. Wallet credit reduces only what QuickServe collects externally via M-Pesa.

### Verify shares constraint still enforces provider_share + quickserve_share = amount

```sql
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.payments'::regclass
  and conname = 'payments_shares_check';
-- Expected: 1 row; definition: CHECK (provider_share >= 0 AND quickserve_share >= 0
--   AND provider_share + quickserve_share = amount)
-- NOTE: this constraint is on `amount`, NOT on `wallet_applied` or `amountDue`.
-- Wallet credit does NOT affect these shares.
```

### Verify pay_payment, create_earning_on_paid, override_payment_status are unchanged

```sql
-- Confirm pay_payment function body (unchanged from 0010):
select prosrc from pg_proc
where proname = 'pay_payment' and pronamespace = 'public'::regnamespace;
-- Expected: body references only payments.status + bookings.status (no wallet_applied)

-- Confirm create_earning_on_paid body (unchanged from 0010):
select prosrc from pg_proc
where proname = 'create_earning_on_paid' and pronamespace = 'public'::regnamespace;
-- Expected: inserts provider_earnings with amount = new.provider_share (no wallet field)

-- Confirm override_payment_status body (unchanged from 0010):
select prosrc from pg_proc
where proname = 'override_payment_status' and pronamespace = 'public'::regnamespace;
-- Expected: no wallet_applied reference
```

### No-payout-change audit

The following files are **NOT in the Slice 26 diff** (`git diff 7d003f0..HEAD --name-only`):

- `supabase/migrations/0010_payments.sql` (shares / pay_payment / create_earning_on_paid / override_payment_status)
- `src/lib/bookings.ts` (assignProvider / dispatch)
- `src/lib/earnings.ts` (if it exists — no payout logic changed)
- `src/auth/**` (no auth change)
- Any chat / tracking file

---

## 10. Existing Flow — Backward-Compatible

### payments.wallet_applied column defaults to 0

```sql
-- Verify the column default:
select column_name, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'payments'
  and column_name = 'wallet_applied';
-- Expected: column_default = '0', is_nullable = 'NO', data_type includes 'numeric'
-- CHECK constraint: wallet_applied >= 0
```

All payment rows created before Slice 26 have `wallet_applied = 0`. Every consumer of `amountDue` treats this as `amount − 0 = amount` — full backward-compat with no data migration.

### payment_attempts schema unchanged

```sql
-- Confirm payment_attempts schema has no new columns from Slice 26:
select column_name from information_schema.columns
where table_schema = 'public'
  and table_name = 'payment_attempts'
order by ordinal_position;
-- Expected: same columns as before Slice 26 (payment_id, provider, phone, amount, status,
--   external_reference, raw_response, merchant_request_id, checkout_request_id, created_at, id)
-- `amount` now records amountDue instead of payment.amount — semantically correct,
-- same column, same type.
```

### Cash / card flow unchanged

The `pay_payment` RPC (cash/card path) is unchanged. It sets `status='paid'` independently of `wallet_applied`. If a customer had already applied partial wallet credit before paying via M-Pesa or card, both paths are idempotent at the payment row level.

---

## 11. No Promo / Referral Engine

`promo_credit`, `referral_credit`, and `gift_credit` are **type strings** in the `wallet_transactions.type` CHECK constraint and in the `adminAdjustWallet` UI chip list. They are **not** generated automatically by any trigger, function, or application code. There is no promo/referral/gift earning pipeline.

These types are admin-only manual credits. An admin selects one from the adjustment form chip, provides a note, and calls `admin_wallet_adjust` — exactly the same path as `admin_credit`.

```sql
-- Confirm type constraint includes the promo/referral/gift names:
select pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.wallet_transactions'::regclass
  and conname like '%type%';
-- Expected: definition includes 'promo_credit', 'referral_credit', 'gift_credit'
-- (manual admin credits only — no automatic generation code)
```

---

## 12. Rollback Plan

### Option A — Per-task git revert (UI hidden; schema dormant)

Revert from T5 → T1 (newest first). `wallets` / `wallet_transactions` remain in the DB, balance at whatever it was. Existing wallet activity sits dormant. M-Pesa reverts to charging `payment.amount`.

Order (newest first):

1. `be597f0` — admin wallet panel (T5)
2. `327aa17` — mpesa amount_due + payment-step wallet apply (T4)
3. `6115065` — customer wallet screen + profile entry (T3)
4. `bdb58f6` — wallet lib + payment amountDue (T2)
5. `523fc8e` — wallet schema + ledger + RPCs (T1)

Reverting T4 alone restores full-amount M-Pesa charge and removes the customer's apply button — the safest single-task rollback.

### Option B — Forward rollback migration `0024_rollback_wallet.sql`

Run after reverting application code to clean up the schema:

```sql
-- Drop the RPCs
drop function if exists public.apply_wallet_to_payment(uuid, numeric);
drop function if exists public.admin_wallet_adjust(uuid, text, numeric, text);
drop function if exists public._wallet_post(uuid, text, numeric, text, uuid, uuid, uuid);
drop function if exists public._ensure_wallet(uuid);

-- Drop the tables (cascade removes their RLS policies and indexes)
drop table if exists public.wallet_transactions cascade;
drop table if exists public.wallets cascade;

-- Remove the wallet_applied column from payments
alter table public.payments drop column if exists wallet_applied;
```

This migration is safe at any time because:

- `payments.provider_share`, `payments.quickserve_share`, `payments_shares_check` are **not dropped**.
- `create_earning_on_paid` / `pay_payment` / `override_payment_status` are **not dropped**.
- `trg_create_earning_on_paid` is **not dropped**.
- `payment_attempts` is **not affected**.

---

## 13. Isolation Diff

`git diff 7d003f0..HEAD --stat` output (run 2026-07-04):

```
 src/__tests__/admin-wallet-panel.test.tsx         | 286 ++++++++++++++++++++
 src/__tests__/admin-web-bookings.test.tsx         |  24 ++
 src/__tests__/booking-detail.test.tsx             |  56 ++++
 src/__tests__/profile.test.tsx                    |   6 +
 src/__tests__/wallet-screen.test.tsx              | 107 ++++++++
 src/app/(admin-web)/bookings/[id].tsx             |   4 +
 src/app/(customer)/profile.tsx                    |   1 +
 src/app/booking/[id].tsx                          |  35 +++
 src/app/wallet.tsx                                | 157 +++++++++++
 src/components/admin-web/admin-wallet-panel.tsx   | 309 ++++++++++++++++++++++
 src/components/ui/wallet-transaction-row.test.tsx |  87 ++++++
 src/components/ui/wallet-transaction-row.tsx      |  70 +++++
 src/lib/payments.ts                               |   2 +
 src/lib/wallet.test.ts                            | 242 +++++++++++++++++
 src/lib/wallet.ts                                 | 179 +++++++++++++
 supabase/functions/mpesa-stk-push/index.ts        |  15 +-
 supabase/migrations/0023_wallet.sql               | 180 +++++++++++++
 17 files changed, 1756 insertions(+), 4 deletions(-)</
```

### Files changed — all in scope

| File | Task | Purpose |
|---|---|---|
| `supabase/migrations/0023_wallet.sql` | T1 | wallets + wallet_transactions + payments.wallet_applied + 4 RPCs |
| `src/lib/wallet.ts` | T2 | Types, helpers: getMyWallet, getMyWalletTransactions, applyWalletToPayment, adminGetWallet, adminGetWalletTransactions, adminAdjustWallet, amountDue |
| `src/lib/wallet.test.ts` | T2 | 20 tests for all wallet helpers |
| `src/lib/payments.ts` | T2 | Additive: +optional `wallet_applied?: number` field on Payment type |
| `src/components/ui/wallet-transaction-row.tsx` | T3 | Display component — read-only, no mutation |
| `src/components/ui/wallet-transaction-row.test.tsx` | T3 | 3 component tests |
| `src/app/wallet.tsx` | T3 | Customer wallet screen — read-only balance + history |
| `src/__tests__/wallet-screen.test.tsx` | T3 | 5 screen tests |
| `src/app/(customer)/profile.tsx` | T3 | +1 line: Wallet entry button → router.push('/wallet') |
| `src/__tests__/profile.test.tsx` | T3 | +1 test: Wallet navigation |
| `src/app/booking/[id].tsx` | T4 | Wallet balance display + apply-credit button in payment block |
| `src/__tests__/booking-detail.test.tsx` | T4 | Case K: apply wallet credit in booking detail |
| `supabase/functions/mpesa-stk-push/index.ts` | T4 | Additive: fetch wallet_applied; compute amountDue; charge amountDue at 3 sites |
| `src/components/admin-web/admin-wallet-panel.tsx` | T5 | Admin balance view + history + adjustment form |
| `src/__tests__/admin-wallet-panel.test.tsx` | T5 | 13 tests (balance/history/form/adjust/overdraw) |
| `src/app/(admin-web)/bookings/[id].tsx` | T5 | +4 lines: mount AdminWalletPanel (customer wallet section) |
| `src/__tests__/admin-web-bookings.test.tsx` | T5 | +1 test: wallet panel renders |

### Out-of-scope files — confirmed absent from diff

- `supabase/migrations/0010_payments.sql` — NOT in diff (shares/pay_payment/create_earning_on_paid/override_payment_status unchanged)
- Any migration other than `0023_wallet.sql` — NOT in diff
- `src/auth/**` — NOT in diff
- Any chat / ChatThread / tracking file — NOT in diff
- `supabase/functions/mpesa-callback/**` — NOT in diff (credentials/callback unchanged)
- `DARAJA_SHORTCODE`, `DARAJA_PASSKEY`, `DARAJA_CALLBACK_URL` references — not changed
- `payment_attempts` table schema — NOT in diff (column unchanged)
- `provider_earnings` / `provider_share` / `quickserve_share` / `payments_shares_check` — NOT in diff
- `assignProvider` / dispatch logic — NOT in diff

### mpesa-stk-push change — additive only

The 4-line diff on `mpesa-stk-push/index.ts` adds `wallet_applied` to the SELECT, computes `amountDue`, guards `amountDue <= 0`, and substitutes `amountDue` at 3 charge sites. No credential, env var, callback URL, or auth logic changed.

### No-payout-change audit

`provider_share` / `quickserve_share` / `payments_shares_check` constraint and `create_earning_on_paid` are defined in `0010_payments.sql`. That file is not in the diff. `provider_earnings` schema is unchanged. `pay_payment`, `override_payment_status`, `assignProvider` are unchanged. Wallet reduces only the externally collected amount — provider payout path is untouched.

Isolation: **CLEAN**.

---

## 14. Final Gate Results (2026-07-04)

| Check | Result |
|---|---|
| `npm test` | PASS — 118 suites, 1004 tests, 0 failures |
| `npx tsc --noEmit` | PASS — no errors |
| `npx expo export --platform web` | PASS — exported to `dist/` |
| `npx expo export --platform android` | PASS — exported to `dist/` |
| `git status` (after doc commit) | CLEAN — only `supabase/.temp/` untracked |

---

## 15. Operator Checklist — Deploying Slice 26

### Pre-deploy

- [ ] Apply migration `0023_wallet.sql` via Supabase SQL Editor or `supabase db push`.

### Post-deploy verification

```sql
-- 1. Confirm wallets table exists with RLS enabled
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname = 'wallets';
-- Expected: 1 row; relrowsecurity = true

-- 2. Confirm wallet_transactions table exists with RLS enabled
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname = 'wallet_transactions';
-- Expected: 1 row; relrowsecurity = true

-- 3. Confirm payments.wallet_applied column exists with default 0
select column_name, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'payments'
  and column_name = 'wallet_applied';
-- Expected: column_default = '0', is_nullable = 'NO'

-- 4. Confirm exactly 1 SELECT-only policy on wallets (no write policy)
select policyname, cmd from pg_policies
where tablename = 'wallets';
-- Expected: 1 row; wallets_select (SELECT only)

-- 5. Confirm exactly 1 SELECT-only policy on wallet_transactions (no write policy)
select policyname, cmd from pg_policies
where tablename = 'wallet_transactions';
-- Expected: 1 row; wallet_txn_select (SELECT only)

-- 6. Confirm all 4 RPCs exist
select proname from pg_proc
where proname in ('_ensure_wallet', '_wallet_post', 'admin_wallet_adjust', 'apply_wallet_to_payment')
  and pronamespace = 'public'::regnamespace
order by proname;
-- Expected: 4 rows

-- 7. Smoke-test: admin credit + balance check
select public.admin_wallet_adjust('<customer-uuid>', 'admin_credit', 100, 'Post-deploy smoke test');
select balance from public.wallets where customer_id = '<customer-uuid>';
-- Expected: 100 (or prior balance + 100)

-- 8. Confirm provider privacy: run as a provider role
-- (Switch to a provider's JWT and run:)
select count(*) from public.wallets;
-- Expected: 0

-- 9. Confirm trg_create_earning_on_paid and pay_payment still present (unchanged)
select proname from pg_proc
where proname in ('pay_payment', 'create_earning_on_paid', 'override_payment_status')
  and pronamespace = 'public'::regnamespace;
-- Expected: 3 rows (all unchanged)
```
