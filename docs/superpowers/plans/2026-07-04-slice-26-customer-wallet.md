# Slice 26 — Customer Wallet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer wallet — immutable credit ledger + maintained balance, a customer wallet view, applying wallet credit to a pending payment (reducing amount due, auto-settling on full coverage), and admin audited adjustments.

**Architecture:** A `wallets` row per customer (maintained `balance`, never negative — row-lock/RLS anchor) + an append-only `wallet_transactions` ledger. All balance changes go through row-locked SECURITY DEFINER RPCs. Payments gain an additive `wallet_applied` column (amount_due = `amount − wallet_applied`); M-Pesa charges the reduced amount. Provider share/earnings untouched.

**Tech Stack:** Supabase (Postgres, RLS, SECURITY DEFINER RPCs, Deno Edge Function), Expo RN + TS, Expo Router, Jest + RNTL.

## Global Constraints

- **`wallets.balance` changes ONLY through SECURITY DEFINER RPCs** (row-locked). No customer/provider/admin direct INSERT/UPDATE policy on `wallets`. **`wallet_transactions` is APPEND-ONLY** — no update/delete/insert policy (RPC-only writes); each row snapshots `balance_after`.
- **No-overdraw:** every mutation enforces resulting `balance >= 0` (rejects admin_debit / payment_applied beyond balance). `payments.wallet_applied` never exceeds `amount`.
- **Auto-settle:** `apply_wallet_to_payment` marks the payment `paid` ONLY when `wallet_applied = amount` AND the booking is `completed` (same guard as `pay_payment`) — reusing `create_earning_on_paid` + `tg_notify_payment_paid`. Partial coverage leaves it `pending` with reduced due.
- **Providers cannot read customer wallets/transactions** — RLS `customer_id = auth.uid() OR public.is_admin()`, NO provider policy on either table.
- **No provider payout/share change** — `provider_share`/`quickserve_share`/shares-constraint/`provider_earnings` untouched; wallet reduces what QuickServe collects externally.
- **No M-Pesa credential change** — the ONLY M-Pesa touch is the STK **charge amount** = `amount − wallet_applied` (additive; default `0` → existing payments unchanged). `payment_attempts`, `create_payment_on_accept`, `pay_payment`, `override_payment_status`, mpesa-callback untouched.
- **No promo/referral engine** (types reserved, no earning logic). No auth/tracking/chat change. Backward-compatible: existing payments/queries/UI work with `wallet_applied = 0`.
- Gate every task: `npm test` green, `npx tsc --noEmit` clean, `expo export --platform web` AND `--platform android` succeed.

---

## File Structure

**Create**
- `supabase/migrations/0023_wallet.sql` — tables + RLS + `payments.wallet_applied` + RPCs.
- `src/lib/wallet.ts` (+ `wallet.test.ts`) — types, `WALLET_TXN_TYPES`, helpers.
- `src/components/ui/wallet-transaction-row.tsx` (+ test) — one ledger row.
- `src/app/(customer)/wallet.tsx` — customer wallet screen.
- `src/components/admin-web/admin-wallet-panel.tsx` (+ test) — admin balance + history + adjust form.
- `docs/pilot/wallet.md` — verification doc.

**Modify**
- `src/lib/payments.ts` — extend `Payment` with `wallet_applied`; `amountDue` (or in wallet.ts).
- `supabase/functions/mpesa-stk-push/index.ts` — charge `amount − wallet_applied`.
- `src/app/booking/[id].tsx` — payment-step wallet application.
- `src/app/(customer)/profile.tsx` — wallet entry.
- `src/app/(admin-web)/customers/[id].tsx` (or the web-admin customer/payment view) — mount the admin wallet panel.

**Reuse (do not modify):** `payment_attempts`, `create_payment_on_accept`, `pay_payment`, `create_earning_on_paid`, `override_payment_status`, `mpesa-callback`, `is_admin()`.

---

## Task Order (dependency-ordered)

1. **T1** — Migration `0023`: `wallets` + `wallet_transactions` + RLS + `payments.wallet_applied` + RPCs.
2. **T2** — `src/lib/wallet.ts` helpers + `WALLET_TXN_TYPES` + `Payment.wallet_applied`/`amountDue` (+ tests).
3. **T3** — `WalletTransactionRow` + customer wallet screen + profile entry (+ tests).
4. **T4** — M-Pesa `amount_due` charge + payment-step wallet application (+ tests).
5. **T5** — Admin wallet panel (balance + history + adjust form) mounted in the web-admin customer view (+ tests).
6. **T6** — Verification `docs/pilot/wallet.md` + RLS/privacy + backward-compat + isolation + final gate.

Each task ends green (tests / tsc / both exports).

---

### Task 1: Migration `0023_wallet.sql`

**Files:** Create `supabase/migrations/0023_wallet.sql`

**Build (mirror `0010`/`0015` RPC + `0019` RLS style):**
- **`wallets`** (spec §3a): `customer_id` unique FK→profiles cascade, `balance numeric default 0 check (balance >= 0)`, `currency`, timestamps. `enable rls`. Policy `wallets_select` `using (customer_id = auth.uid() or public.is_admin())`. NO insert/update/delete policy.
- **`wallet_transactions`** (spec §3b): id, `wallet_id` FK, `customer_id` FK, `type` check (the 8 types), `amount numeric` (signed), `balance_after numeric`, `booking_id`/`payment_id` nullable FKs (on delete set null), `note`, `created_by` FK, `created_at`. `enable rls`. Policy `wallet_txn_select` `using (customer_id = auth.uid() or public.is_admin())`. NO update/delete/insert policy (append-only, RPC writes).
- **`payments.wallet_applied`**: `alter table public.payments add column if not exists wallet_applied numeric not null default 0 check (wallet_applied >= 0);`.
- **`_ensure_wallet(p_customer_id uuid) returns uuid`** SECURITY DEFINER: `insert into wallets (customer_id) values (p_customer_id) on conflict (customer_id) do nothing; select id ...`.
- **`_wallet_post(p_customer_id uuid, p_type text, p_amount numeric, p_note text, p_booking_id uuid, p_payment_id uuid, p_created_by uuid) returns void`** SECURITY DEFINER: `perform _ensure_wallet(p_customer_id); select balance into v_bal from wallets where customer_id = p_customer_id for update; v_new := v_bal + p_amount; if v_new < 0 then raise exception 'Insufficient wallet balance'; end if; update wallets set balance = v_new, updated_at = now() where customer_id = p_customer_id; insert into wallet_transactions (wallet_id, customer_id, type, amount, balance_after, booking_id, payment_id, note, created_by) values (...);`.
- **`admin_wallet_adjust(p_customer_id uuid, p_type text, p_amount numeric, p_note text) returns void`** SECURITY DEFINER: `if not public.is_admin() then raise exception 'Admin only'; end if; if coalesce(btrim(p_note),'') = '' then raise exception 'Note required'; end if; if p_type not in ('admin_credit','admin_debit','refund_credit','promo_credit','referral_credit','gift_credit','adjustment') then raise ...; end if; perform _wallet_post(p_customer_id, p_type, p_amount, p_note, null, null, auth.uid());` (caller passes signed amount: credits +, debits −).
- **`apply_wallet_to_payment(p_payment_id uuid, p_amount numeric) returns void`** SECURITY DEFINER: load `payments` (`customer_id, amount, wallet_applied, status, booking_id`); `if customer_id <> auth.uid() then raise; if status <> 'pending' then raise; if p_amount <= 0 then raise; if p_amount > (amount - wallet_applied) then raise 'Exceeds amount due';` `perform _wallet_post(customer_id, 'payment_applied', -p_amount, 'Applied to booking', booking_id, p_payment_id, null);` (rejects if over balance) `update payments set wallet_applied = wallet_applied + p_amount where id = p_payment_id;` **`if (wallet_applied + p_amount) = amount and exists (select 1 from bookings b where b.id = booking_id and b.status = 'completed') then update payments set status='paid', paid_at=now() where id = p_payment_id; end if;`**

**Checks:** SQL well-formed; `npm test` (~963), `tsc`, both exports. Commit `feat: slice26 wallet schema + ledger + RPCs (0023)`.
> DB not applied locally — behavioral RLS/RPC/overdraw/auto-settle verify in T6.

---

### Task 2: `src/lib/wallet.ts` helpers

**Files:** Create `src/lib/wallet.ts` (+ `wallet.test.ts`); Modify `src/lib/payments.ts`

**Build:**
- Types `Wallet` (`id, customer_id, balance, currency, updated_at`), `WalletTxnType` (the 8), `WalletTransaction` (`id, type, amount, balance_after, booking_id, payment_id, note, created_by, created_at`).
- **`WALLET_TXN_TYPES: Record<WalletTxnType, { label: string; direction: 'credit'|'debit' }>`** — labels: admin_credit "Admin credit", admin_debit "Admin debit", refund_credit "Refund", promo_credit "Promo credit", referral_credit "Referral reward", gift_credit "Gift credit", payment_applied "Applied to booking", adjustment "Adjustment"; direction per type (payment_applied/admin_debit = debit; rest credit; adjustment = credit-or-debit → treat by amount sign).
- `getMyWallet(): Promise<Wallet>` — `from('wallets').select('*').maybeSingle()`; `{ balance: 0, currency: 'KES', ... }` default when none.
- `getMyWalletTransactions(): Promise<WalletTransaction[]>` — own ledger `.order('created_at', desc)`; `[]` on error.
- `applyWalletToPayment(paymentId, amount): Promise<{ ok; error? }>` — `rpc('apply_wallet_to_payment', { p_payment_id, p_amount })`; map error to a friendly message.
- `adminGetWallet(customerId)`, `adminGetWalletTransactions(customerId)` (admin RLS), `adminAdjustWallet(customerId, type, amount, note): Promise<{ ok; error? }>` — `rpc('admin_wallet_adjust', { p_customer_id, p_type, p_amount, p_note })`.
- `payments.ts`: extend `Payment` with `wallet_applied: number` (default via `?? 0` at read sites); add `amountDue(p) = p.amount - (p.wallet_applied ?? 0)`.

**Tests:** `getMyWallet` (row / default); `getMyWalletTransactions` (rows / []); `applyWalletToPayment` + `adminAdjustWallet` RPC name+args + `{ ok }`/error; `amountDue`; `WALLET_TXN_TYPES` has 8 entries with directions.

**Steps:** TDD → `tsc` → commit `feat: slice26 wallet lib + payment amountDue`.

---

### Task 3: Customer wallet screen + row + profile entry

**Files:** Create `src/components/ui/wallet-transaction-row.tsx` (+ test), `src/app/(customer)/wallet.tsx`; Modify `src/app/(customer)/profile.tsx`; Test a `wallet-screen.test.tsx`

**Build:**
- **`WalletTransactionRow`** props `{ txn: WalletTransaction }`: type label (via `WALLET_TXN_TYPES`), signed amount (credit green `+KES`, debit red `−KES`), date, optional note. Token-driven.
- **Wallet screen** (`(customer)/wallet.tsx`, pushable — mirror `saved-addresses.tsx`): load `getMyWallet` + `getMyWalletTransactions` on mount; a large **Available balance** header (formatKes) + **Recent activity** list of `WalletTransactionRow` (EmptyState when none); loading skeleton; back button. Read-only.
- `profile.tsx`: add a **"Wallet"** button → `router.push('/wallet')` (near Saved addresses / Notification settings). Additive.

**Tests:** row renders label + signed amount + note; wallet screen renders balance + activity from mocked lib (empty state when none); profile "Wallet" navigates to `/wallet`. Keep existing profile tests green.

**Steps:** `expo export --platform android` (new route) → `tsc` → `npm test` → `expo export --platform web` → commit `feat: slice26 customer wallet screen + profile entry`.

---

### Task 4: M-Pesa amount_due + payment-step wallet application

**Files:** Modify `supabase/functions/mpesa-stk-push/index.ts`, `src/app/booking/[id].tsx`; Test `booking-detail.test.tsx`

**Build:**
- **`mpesa-stk-push`** (additive, backward-compatible): select `wallet_applied` alongside `amount`; charge `amount − (wallet_applied ?? 0)` everywhere the amount is used (STK amount + the attempt/log amount). Default `0` → unchanged for existing payments. No credential/other change.
- **Payment step** (`booking/[id].tsx`): in the pending-payment section, load `getMyWallet` (+ the payment's `wallet_applied`); show **wallet balance**; when balance > 0 and `amountDue > 0`, show **"Apply wallet credit"** (apply up to `min(balance, amountDue)` — an amount input or a one-tap "Apply KES X") → `applyWalletToPayment(payment.id, amt)` → on ok, reload the payment (+ wallet). Show **Amount due: KES amountDue** and a "Wallet applied: −KES wallet_applied" line. The existing M-Pesa/cash pay button stays (now charges the reduced due); if the payment auto-settled to `paid`, the existing paid UI shows. Change nothing else (scheduling/review/chat/track).

**Tests:** `booking-detail.test.tsx` — mock `@/lib/wallet` (`getMyWallet` → balance; `applyWalletToPayment` → `{ ok:true }`); with a pending payment + balance, "Apply wallet credit" calls `applyWalletToPayment` with the payment id + amount and the due updates; zero balance → no apply control; keep existing payment/review cases (F/G/H/J) green (mock the new lib; the existing pay button still present). Never weaken.

**Steps:** `tsc` → `npm test` → both exports → commit `feat: slice26 mpesa amount_due + payment-step wallet apply`.

---

### Task 5: Admin wallet panel

**Files:** Create `src/components/admin-web/admin-wallet-panel.tsx` (+ test); Modify the web-admin customer detail (`src/app/(admin-web)/customers/[id].tsx` or nearest customer/payment view) to mount it

**Build:**
- **`AdminWalletPanel`** props `{ customerId: string }`: load `adminGetWallet` + `adminGetWalletTransactions`; show **balance**, a **transaction history** table (type/amount/date/note/`created_by`), and an **adjustment form** — type select (`admin_credit`/`admin_debit`/`refund_credit`/`promo_credit`/`referral_credit`/`gift_credit`/`adjustment`), amount input, **required note** (submit disabled until note non-empty) → `adminAdjustWallet(customerId, type, signedAmount, note)` (debit types send a negative amount) → refresh on success; show the error on failure. Read + adjust only.
- Mount `<AdminWalletPanel customerId={id} />` in the web-admin customer detail view (a "Wallet" section).

**Tests:** panel renders balance + history from mocked lib; submit gated on required note; submitting calls `adminAdjustWallet` with the right type/amount(sign)/note; history shows `created_by`/note (audit). Keep existing admin-web customer tests green.

**Steps:** `tsc` → `npm test` → both exports → commit `feat: slice26 admin wallet panel (balance/history/adjust)`.

---

### Task 6: Verification, RLS/privacy, backward-compat, isolation, final gate

**Files:** Create `docs/pilot/wallet.md`

- **Verification (documented SQL + manual):** credit/debit/apply update `balance` + append an immutable `wallet_transactions` row with correct `balance_after`; **overdraw rejected** (admin_debit / apply beyond balance or beyond due → raises); `apply_wallet_to_payment` reduces `wallet_applied`, **full coverage on a completed booking auto-settles to `paid`** (+ provider earning via existing trigger + payment notification), partial stays `pending` with reduced due; `admin_wallet_adjust` requires admin + non-empty note + records `created_by`.
- **RLS/privacy:** customer reads own wallet/txns only; another customer/**a provider (any) reads 0 rows**; admin reads all; ledger rows can't be UPDATE/DELETEd (no policy); `wallets.balance`/`wallet_transactions` have no direct write path (RPC-only).
- **Backward-compat:** existing payments (`wallet_applied = 0`) unchanged; M-Pesa charges `amount − 0 = amount`; `payment_attempts`/`pay_payment`/`create_earning_on_paid`/`override_payment_status` untouched; provider share/earnings unchanged.
- **Isolation:** `git diff <base>..HEAD --stat` — only wallet files + the single additive `mpesa-stk-push` charge edit changed; NO mpesa credentials, NO `payment_attempts`/earnings/payout logic change, NO `src/auth/**`, NO tracking/chat, NO provider-share change; only migration `0023`.
- **No-engine audit:** promo/referral/gift types exist but no earning-generation code (admin-only manual credit).
- **Final gate:** `expo export` web + android, `tsc` clean, `npm test` green, `git status` clean.
- Commit `test: slice26 wallet verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-26-wallet`. Abandon = `git checkout main` + delete branch.
- **Per-task revert:** independent commits — `git revert <commit>` rolls back one. Reverting T4 restores the full-amount M-Pesa charge + removes the payment-step apply (the wallet tables go unused; payments keep `wallet_applied = 0`). Reverting T3/T5 removes the wallet UIs; the ledger stays dormant.
- **Disable without schema revert:** revert the T4 commit → M-Pesa charges the full `amount` again and no wallet is applied; balances/ledger remain but inert.
- **Schema rollback:** forward-only `0024_rollback_wallet.sql` — `drop function apply_wallet_to_payment, admin_wallet_adjust, _wallet_post, _ensure_wallet; drop table wallet_transactions; drop table wallets; alter table payments drop column wallet_applied;`. Payments/earnings/mpesa unaffected.
- **No provider-payout / mpesa-credential / auth / tracking / chat involvement** — rollback confined to wallet tables + `wallet_applied` + the STK charge edit.

---

## Self-Review

- **Spec coverage:** tables + RLS + `wallet_applied` + RPCs (T1); lib + `WALLET_TXN_TYPES` + `amountDue` (T2); wallet screen + row + profile entry (T3); M-Pesa amount_due + payment-step apply (T4); admin panel balance/history/adjust (T5); verification + RLS + backward-compat + isolation + no-engine audit (T6). No-overdraw (T1 `_wallet_post`; T6 verify). Append-only ledger + RPC-only writes (T1 policies; T6). Auto-settle on full coverage + completed (T1 `apply_wallet_to_payment`; T6). Providers can't read (T1 RLS no-provider; T6). No provider payout / mpesa-credential / promo-referral-engine / auth-tracking-chat change (constraints; T6 isolation).
- **Placeholder scan:** none; concrete SQL/signatures/tests per task.
- **Name consistency:** `wallets`/`wallet_transactions`/`wallet_applied` (T1) used by T2/T4/T5/T6; `_ensure_wallet`/`_wallet_post`/`admin_wallet_adjust`/`apply_wallet_to_payment` (T1) called by T2 (`applyWalletToPayment`/`adminAdjustWallet`); `WALLET_TXN_TYPES`/`WalletTxnType`/`Wallet`/`WalletTransaction` (T2) consumed by T3/T5; `amountDue` (T2) used by T4; `getMyWallet`/`getMyWalletTransactions`/`adminGetWallet`/`adminGetWalletTransactions` consistent T2↔T3↔T5.
