# Slice 26 — Customer Wallet (Design Spec)

**Date:** 2026-07-04
**Status:** Approved design → (implementation plan pending approval)
**Builds on:** Slice 11 payments (`payments` table with `amount`/`provider_share`/`quickserve_share`, `provider_share + quickserve_share = amount`; `create_payment_on_accept`, `pay_payment`, `create_earning_on_paid` trigger, `override_payment_status`), Slice 12/13 M-Pesa (`payment_attempts`, `mpesa-stk-push` which charges `payment.amount`), Slice 23 payment notifications (`tg_notify_payment_paid`).

---

## 1. Goal & Non-Goals

Add a customer wallet: an immutable credit ledger (refunds, promo/gift/referral, admin adjustments) with a maintained balance, a customer wallet view (balance + activity), the ability to apply wallet credit to a pending payment (reducing amount due), and admin tools to view balances/history and make audited adjustments.

**Non-goals / out of scope (rules):** NO promo-code engine, referral engine, gift-card purchase, provider wallet, automated payout, loyalty points, or full refund/dispute workflow. NO M-Pesa **credential** change, auth change, tracking/chat change, or provider-payout change. Wallet is **ready for** future promotions/referrals (types exist; no earning logic). The existing M-Pesa/cash/card + `payment_attempts` flow keeps working; admin remains the authority over **external** payment success.

---

## 2. Architecture — ledger + maintained balance; additive to payments

- **`wallets`** (one row per customer): the maintained `balance` (never negative) + the row-lock/RLS anchor. **`wallet_transactions`** is an **immutable** signed ledger (credits +, debits/applied −), each row snapshotting `balance_after` for audit. All mutations go through **SECURITY DEFINER RPCs** that row-lock the wallet, enforce `balance >= 0`, insert the ledger row, and update the balance atomically. No direct client/admin write to balances.
- **Payments integration is additive:** a `payments.wallet_applied numeric default 0` column; **amount_due = `amount − wallet_applied`**. The `provider_share`/`quickserve_share`/shares-constraint and provider earnings are **untouched** (wallet reduces what QuickServe collects externally, not the provider's share). `apply_wallet_to_payment` reduces `wallet_applied`; when it fully covers the total **and the booking is completed**, it **auto-settles** the payment to `paid` (internal wallet settlement) — reusing the existing `create_earning_on_paid` trigger + `tg_notify_payment_paid` notification.
- **M-Pesa charges the reduced amount:** `mpesa-stk-push` charges `amount − wallet_applied` (single additive edit; default `0` → unchanged for existing payments). No credentials/flow-structure change.

---

## 3. Database — migration `0023_wallet.sql`

### 3a. `wallets` (one per customer)
```sql
create table if not exists public.wallets (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.profiles(id) on delete cascade,
  balance     numeric not null default 0 check (balance >= 0),
  currency    text not null default 'KES',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.wallets enable row level security;
-- SELECT: own or admin. NO provider policy. NO client insert/update policy (RPC-only writes).
create policy "wallets_select" on public.wallets for select using (customer_id = auth.uid() or public.is_admin());
```

### 3b. `wallet_transactions` (immutable ledger)
```sql
create table if not exists public.wallet_transactions (
  id            uuid primary key default gen_random_uuid(),
  wallet_id     uuid not null references public.wallets(id) on delete cascade,
  customer_id   uuid not null references public.profiles(id),
  type          text not null check (type in
                  ('admin_credit','admin_debit','refund_credit','promo_credit',
                   'referral_credit','gift_credit','payment_applied','adjustment')),
  amount        numeric not null,               -- signed: credits +, debits/payment_applied −
  balance_after numeric not null,               -- audit snapshot
  booking_id    uuid references public.bookings(id) on delete set null,
  payment_id    uuid references public.payments(id) on delete set null,
  note          text,
  created_by    uuid references public.profiles(id),  -- admin actor (null for customer/system)
  created_at    timestamptz not null default now()
);
alter table public.wallet_transactions enable row level security;
-- SELECT: own or admin. NO provider policy. NO update/delete policy (immutable). NO insert policy (RPC-only).
create policy "wallet_txn_select" on public.wallet_transactions for select using (customer_id = auth.uid() or public.is_admin());
```

### 3c. `payments` addition (additive, backward-compatible)
```sql
alter table public.payments add column if not exists wallet_applied numeric not null default 0 check (wallet_applied >= 0);
```
`amount_due = amount − wallet_applied`. Shares constraint + provider earnings unchanged.

### 3d. RPCs (SECURITY DEFINER, `set search_path = public`, wallet row-locked)
- **`_ensure_wallet(p_customer_id) returns uuid`** — get-or-create the wallet row; returns its id.
- **Internal `_wallet_post(p_customer_id, p_type, p_amount, p_note, p_booking_id, p_payment_id, p_created_by)`** — `select ... from wallets where customer_id = p_customer_id for update` (create if absent); `v_new := balance + p_amount`; `if v_new < 0 then raise 'Insufficient wallet balance'`; update balance + `updated_at`; insert a `wallet_transactions` row with `balance_after = v_new`. (Signed `p_amount`.)
- **`admin_wallet_adjust(p_customer_id uuid, p_type text, p_amount numeric, p_note text) returns void`** — `if not public.is_admin() then raise`; require `p_note` non-empty (every adjustment needs a reason); `p_type` in the admin set (`admin_credit`/`admin_debit`/`refund_credit`/`promo_credit`/`referral_credit`/`gift_credit`/`adjustment`); call `_wallet_post(...)` with `created_by = auth.uid()` (sign as passed — credits positive, debits negative). Non-negative enforced by `_wallet_post`.
- **`apply_wallet_to_payment(p_payment_id uuid, p_amount numeric) returns void`** — load the payment; `if payment.customer_id <> auth.uid() then raise`; require `status = 'pending'`, `p_amount > 0`, `p_amount <= (amount − wallet_applied)` (can't exceed due); call `_wallet_post(customer, 'payment_applied', −p_amount, note, booking_id, p_payment_id, null)` (rejects if over balance); `update payments set wallet_applied = wallet_applied + p_amount`; **if `wallet_applied = amount` AND the booking is `completed` → set `status='paid', paid_at=now()`** (same guard as `pay_payment`; fires the existing paid-trigger + notification).

No provider policy anywhere; no direct balance writes; ledger immutable.

---

## 4. Client — `src/lib/wallet.ts` (+ tests)

- Types `Wallet`, `WalletTransaction`, `WalletTxnType`; **`WALLET_TXN_TYPES`** constant mapping each type → `{ label, direction: 'credit'|'debit' }` (labels: Admin credit / Admin debit / Refund / Promo credit / Referral reward / Gift credit / Applied to booking / Adjustment).
- `getMyWallet(): Promise<Wallet>` — own wallet (RLS); a `{ balance: 0 }` default when no row yet.
- `getMyWalletTransactions(): Promise<WalletTransaction[]>` — own ledger, newest first.
- `applyWalletToPayment(paymentId, amount): Promise<{ ok; error? }>` — `rpc('apply_wallet_to_payment', …)`.
- **Admin:** `adminGetWallet(customerId)`, `adminGetWalletTransactions(customerId)`, `adminAdjustWallet(customerId, type, amount, note): Promise<{ ok; error? }>` → `rpc('admin_wallet_adjust', …)`.
- Helper `amountDue(payment) = payment.amount − (payment.wallet_applied ?? 0)`. Extend the `Payment` type with `wallet_applied`.

---

## 5. UI

- **Customer wallet screen** (`src/app/(customer)/wallet.tsx`, linked from the customer profile): **Available balance** (large), **Recent activity** (transaction rows: type label, signed amount, date, note; credits/debits color-coded) via `getMyWalletTransactions`. Simple, read-only.
- **Payment step** (`src/app/booking/[id].tsx` payment section — where the pending payment + pay action live): show the **wallet balance** + an **"Apply wallet credit"** control (apply up to `amountDue`); after applying, show **amount due** = `amountDue(payment)` and a note "Wallet credit applied: −KES X"; the existing M-Pesa/cash pay handles the remainder (STK now charges `amount_due`). If fully covered (auto-settled → `paid`), show the paid state. Existing pay flow otherwise unchanged.
- **Admin** (`src/app/(admin-web)/…` customer/payment view + mobile `admin/…`): a **wallet panel** per customer — **balance** + **transaction history** (`adminGetWalletTransactions`) + an **adjustment form** (type select `admin_credit`/`admin_debit`/`refund_credit`/`promo_credit`/`referral_credit`/`gift_credit`/`adjustment`, amount, **required note**) → `adminAdjustWallet`. Every adjustment shows `created_by` + note = the **audit trail**.

---

## 6. Backward Compatibility & Guardrails

- `payments.wallet_applied` defaults `0` → existing payments/queries/UI unchanged; M-Pesa charges `amount − 0 = amount` for them. `payment_attempts`, `create_payment_on_accept`, `pay_payment`, `create_earning_on_paid`, `override_payment_status`, and mpesa **credentials** are untouched (only the STK **charge amount** is `amount − wallet_applied`).
- Provider payout unchanged (`provider_share`/earnings from the full amount). Admin remains authority over external success (wallet settlement is internal-only). Balance never negative (RPC-enforced). Ledger immutable (no update/delete/insert policies; RPC-only writes).
- Wallets/transactions are **owner + admin readable only — no provider access** (RLS). No promo/referral **engine** (types reserved for future). No auth/tracking/chat change.

---

## 7. Testing

- **DB (`docs/pilot/wallet.md`):** credit/debit/apply update balance + append an immutable ledger row with `balance_after`; overdraw (admin_debit or apply beyond balance/due) **rejected**; `apply_wallet_to_payment` reduces `wallet_applied`, full coverage on a completed booking **auto-settles** to `paid` (+ provider earning + notification), partial leaves `pending` with reduced due; RLS: customer reads own wallet/txns, admin reads all, **provider reads none**; `admin_wallet_adjust` requires admin + non-empty note + records `created_by`; ledger rows can't be updated/deleted.
- **Lib (`wallet.test.ts`, mocked supabase):** `getMyWallet`/`getMyWalletTransactions`; `applyWalletToPayment`/`adminAdjustWallet` RPC names+args + `{ ok }`; `amountDue`; `WALLET_TXN_TYPES` shape.
- **UI (RNTL):** wallet screen (balance + activity); payment step (apply credit → amount due drops; existing pay still works; zero-balance hides/disables apply); admin adjustment form (required note gates submit; history renders). Keep existing payment/booking/admin tests green (additive).
- **Gate:** `npm test`, `npx tsc --noEmit`, `expo export --platform web` + `--platform android`.

---

## 8. Deliverables

1. `supabase/migrations/0023_wallet.sql` — `wallets` + immutable `wallet_transactions` + RLS + `payments.wallet_applied` + RPCs (`_ensure_wallet`, `_wallet_post`, `admin_wallet_adjust`, `apply_wallet_to_payment`).
2. `src/lib/wallet.ts` (+ tests) — types, `WALLET_TXN_TYPES`, customer + admin helpers, `amountDue`, `Payment.wallet_applied`.
3. `mpesa-stk-push` — charge `amount − wallet_applied` (additive, backward-compatible).
4. Customer wallet screen (balance + activity) + profile entry.
5. Payment-step wallet application (reduce amount due; existing pay for remainder; auto-settled paid state).
6. Admin wallet panel — balance + history + audited adjustment form (web + mobile).
7. `docs/pilot/wallet.md` — verification, RLS, backward-compat, isolation; green gate.
