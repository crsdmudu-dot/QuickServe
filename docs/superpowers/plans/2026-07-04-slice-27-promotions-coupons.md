# Slice 27 — Promotions & Coupons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-created promo codes (percentage / fixed / wallet-credit), redeemed by customers at the payment step to reduce amount due (or grant wallet credit), with an immutable redemption ledger and admin management + audit.

**Architecture:** `promo_codes` (admin-managed) + immutable `promo_redemptions`; `payments` gains `promo_discount`/`promo_code_id`; `amount_due = amount − wallet_applied − promo_discount` (floored ≥ 0). `redeem_promo` validates + applies by type; the Slice-26 `apply_wallet_to_payment` and `mpesa-stk-push` become promo-aware (additive). QuickServe absorbs the discount — provider share/earnings untouched.

**Tech Stack:** Supabase (Postgres, RLS, SECURITY DEFINER RPCs, Deno Edge Function), Expo RN + TS, Expo Router, Jest + RNTL.

## Global Constraints

- **`amount_due = amount − wallet_applied − promo_discount`, floored ≥ 0** — NO negative due (every discount capped at the remaining due via `least(...)`; percentage optionally capped by `max_discount`).
- **Promo + wallet STACK; wallet applies AFTER the promo discount.** The Slice-26 `apply_wallet_to_payment` due-check + auto-settle become promo-aware (`wallet_applied + promo_discount`) — additive: `promo_discount` default 0 → identical wallet-only behavior. Full combined coverage on a completed booking auto-settles to `paid` (reuses `create_earning_on_paid` + `tg_notify_payment_paid`).
- **`wallet_credit` promo does NOT discount the payment** — it posts `promo_credit` (+value) to the wallet via the Slice-26 `_wallet_post`, records a redemption, and only sets `promo_code_id` on the payment (to block a 2nd promo). percentage/fixed set `promo_discount`.
- **One promo per payment** — `redeem_promo` raises if `promo_code_id` already set. Bounded by `max_redemptions` (total) + `per_user_limit` (per customer) + `is_active` + `starts_at`/`ends_at` window.
- **No provider payout/share change** — `provider_share`/`quickserve_share`/shares-constraint/`provider_earnings`/`pay_payment` untouched (QuickServe absorbs the discount). **No M-Pesa credential change** — only the STK **charge amount** = `amount − wallet_applied − promo_discount`.
- **No referral/marketing engine** (codes admin-created only). No auth/tracking/chat change. Backward-compatible: existing payments/wallet flow works with `promo_discount = 0`.
- `promo_codes` admin-only RLS (customers redeem by exact code via the RPC, never enumerate). `promo_redemptions` owner+admin readable, NO provider policy, append-only (RPC-only writes).
- Gate every task: `npm test` green, `npx tsc --noEmit` clean, `expo export --platform web` AND `--platform android` succeed.

---

## File Structure

**Create**
- `supabase/migrations/0024_promotions.sql` — tables + RLS + payments cols + `redeem_promo` + promo-aware `apply_wallet_to_payment`.
- `src/lib/promotions.ts` (+ `promotions.test.ts`) — customer + admin helpers.
- `src/components/admin-web/promo-form.tsx` (+ test) — admin create form (optional split; may inline in the screen).
- `src/app/(admin-web)/promos/index.tsx` — admin promo management + redemption history.
- `docs/pilot/promotions.md` — verification doc.

**Modify**
- `src/lib/payments.ts` — `Payment` += `promo_discount`/`promo_code_id`.
- `src/lib/wallet.ts` — `amountDue` = `amount − wallet_applied − promo_discount`.
- `supabase/functions/mpesa-stk-push/index.ts` — charge `amount − wallet_applied − promo_discount`.
- `src/app/booking/[id].tsx` — payment-step promo entry + "amount saved" / reduced-due.
- `src/components/admin-web/admin-sidebar.tsx` — "Promotions" nav entry.

**Reuse (do not modify):** `_wallet_post`, `wallets`/`wallet_transactions`, `create_earning_on_paid`, `pay_payment`, `payment_attempts`, mpesa-callback, `is_admin()`.

---

## Task Order (dependency-ordered)

1. **T1** — Migration `0024`: `promo_codes` + `promo_redemptions` + RLS + `payments.promo_discount`/`promo_code_id` + `redeem_promo` + promo-aware `apply_wallet_to_payment`.
2. **T2** — `src/lib/promotions.ts` helpers + `Payment` fields + `amountDue` update (+ tests).
3. **T3** — M-Pesa `amount_due` (with promo) + payment-step promo entry (+ tests).
4. **T4** — Admin promos screen (create / enable-disable / redemption history) + nav entry (+ tests).
5. **T5** — Verification `docs/pilot/promotions.md` + RLS/privacy + backward-compat + isolation + final gate.

Each task ends green (tests / tsc / both exports).

---

### Task 1: Migration `0024_promotions.sql`

**Files:** Create `supabase/migrations/0024_promotions.sql`

**Build (mirror `0023_wallet.sql` RPC/RLS style; reuse `_wallet_post`, `is_admin()`):**
- **`promo_codes`** (spec §3a): `code text unique` (UPPERCASE), `discount_type` check (`percentage`/`fixed`/`wallet_credit`), `discount_value > 0`, `max_discount`, `max_redemptions`, `per_user_limit int default 1`, `starts_at`/`ends_at`, `is_active default true`, `created_by`, `created_at`. RLS **admin-only**: `promo_codes_select`/`_insert`/`_update` all `is_admin()`. No customer/provider policy, no delete policy.
- **`promo_redemptions`** (spec §3b): id, `promo_code_id` FK cascade, `customer_id`, `booking_id`/`payment_id` nullable FK (on delete set null), `discount_type` snapshot, `discount_amount`, `created_at`. RLS `promo_redemptions_select` `using (customer_id = auth.uid() or public.is_admin())`. NO update/delete/insert policy (append-only). NO provider policy.
- **`payments`**: `add column if not exists promo_discount numeric not null default 0 check (promo_discount >= 0), add column if not exists promo_code_id uuid references public.promo_codes(id);`.
- **`redeem_promo(p_payment_id uuid, p_code text) returns numeric`** SECURITY DEFINER (full body in spec §3d):
  - load payment; owner check (`customer_id = auth.uid()`); `status='pending'`; `promo_code_id is null` (else raise 'Promo already applied').
  - load `promo_codes where code = upper(btrim(p_code))`; require `is_active`, window (`starts_at is null or <= now()`; `ends_at is null or >= now()`) → else raise 'Promo not valid'.
  - `max_redemptions`: total count `>= max_redemptions` → raise 'Promo fully redeemed'. `per_user_limit`: per-customer count `>= per_user_limit` → raise 'Promo limit reached'.
  - `v_remaining := amount - wallet_applied - promo_discount;`
  - percentage → `v_disc := least( amount*discount_value/100 [, max_discount], v_remaining )`; fixed → `least(discount_value, v_remaining)`; wallet_credit → `perform _wallet_post(auth.uid(), 'promo_credit', discount_value, 'Promo: '||code, booking_id, null, null); v_disc := discount_value;`.
  - percentage/fixed → `update payments set promo_discount = v_disc, promo_code_id = pc.id`; wallet_credit → `update payments set promo_code_id = pc.id`.
  - insert `promo_redemptions (...)`. Auto-settle (percentage/fixed): `if (wallet_applied + v_disc) = amount and booking completed then set status='paid', paid_at=now()`. `return v_disc;`.
- **Recreate `apply_wallet_to_payment`** promo-aware (additive): due-check `p_amount > (amount − wallet_applied − promo_discount)` → raise; auto-settle `if (wallet_applied + p_amount + promo_discount) = amount and booking completed`. (Everything else identical to Slice 26.)

**Checks:** SQL well-formed; `npm test` (~1004), `tsc`, both exports. Commit `feat: slice27 promotions schema + redeem_promo + promo-aware apply_wallet (0024)`.
> DB not applied locally — behavioral RLS/RPC/limits/no-negative verify in T5.

---

### Task 2: `src/lib/promotions.ts` helpers

**Files:** Create `src/lib/promotions.ts` (+ `promotions.test.ts`); Modify `src/lib/payments.ts`, `src/lib/wallet.ts`

**Build:**
- Types `DiscountType` (`'percentage'|'fixed'|'wallet_credit'`), `PromoCode`, `PromoRedemption`.
- **Customer:** `redeemPromo(paymentId, code): Promise<{ ok; discount?: number; error? }>` → `rpc('redeem_promo', { p_payment_id: paymentId, p_code: code })` → `{ ok:true, discount: data }`; error → `{ ok:false, error: <friendly> }` (surface the raise message when present, else generic). `getMyPromoRedemptions(): Promise<PromoRedemption[]>` (own, newest first).
- **Admin:** `adminGetPromoCodes()`; `adminCreatePromo(input): Promise<{ ok; error? }>` — `from('promo_codes').insert({ ...input, code: input.code.trim().toUpperCase() })`; `adminUpdatePromo(id, patch): Promise<{ ok; error? }>` (e.g. `{ is_active }`); `adminGetPromoRedemptions(promoCodeId?)` (all, or filtered).
- `payments.ts`: `Payment` += `promo_discount?: number`, `promo_code_id?: string | null` (optional, backward-compatible).
- `wallet.ts`: update `amountDue(p) = p.amount − (p.wallet_applied ?? 0) − (p.promo_discount ?? 0)` (accept the extended `Pick`).

**Tests:** `redeemPromo` (rpc name+args → `{ok:true,discount}`; error → `{ok:false}`); `getMyPromoRedemptions`; `adminCreatePromo` (uppercases code; insert); `adminUpdatePromo` (is_active); `adminGetPromoCodes`/`adminGetPromoRedemptions`; `amountDue` (amount − wallet − promo; missing → defaults). Keep the existing `wallet.test.ts` amountDue test green (update it for the promo term).

**Steps:** TDD → `tsc` → commit `feat: slice27 promotions lib + amountDue promo term`.

---

### Task 3: M-Pesa amount_due (promo) + payment-step promo entry

**Files:** Modify `supabase/functions/mpesa-stk-push/index.ts`, `src/app/booking/[id].tsx`; Test `booking-detail.test.tsx`

**Build:**
- **`mpesa-stk-push`** (additive): select `promo_discount` too; `amountDue = amount − (wallet_applied ?? 0) − (promo_discount ?? 0)`; keep the `amountDue <= 0` guard; use `amountDue` at the 3 charge sites. Default 0 → unchanged.
- **Payment step** (`booking/[id].tsx`, in the pending+completed block, next to the Slice-26 wallet apply): a **promo code `Input` + "Apply promo"** Button → `redeemPromo(payment.id, code)`; on `ok`, `reloadPayment()` and show **"Promo applied — you saved `formatKes(res.discount)`"** (wallet_credit → "KES X added to your wallet"); on error, show the message. Show **Promo discount: −`formatKes(payment.promo_discount)`** when > 0, and the updated **Amount due: `amountDue(payment)`** (already promo-aware from T2). Promo + wallet stack; the existing M-Pesa/cash pay + auto-settle behavior is preserved. Don't allow a 2nd promo when `payment.promo_code_id` is set (hide the input / show "Promo applied").

**Tests:** `booking-detail.test.tsx` — mock `@/lib/promotions` (`redeemPromo` → `{ ok:true, discount: 200 }`); with a pending+completed payment, entering a code + "Apply promo" calls `redeemPromo(payment.id, code)` then reloads (`getPaymentForBooking` re-called); the input is hidden when `promo_code_id` is set. Keep existing payment/wallet cases (incl. Slice-26 Case K) green (mock the new lib). Never weaken.

**Steps:** `tsc` → `npm test` → both exports → commit `feat: slice27 mpesa promo amount_due + payment-step promo entry`.

---

### Task 4: Admin promos screen + nav entry

**Files:** Create `src/app/(admin-web)/promos/index.tsx` (+ optional `src/components/admin-web/promo-form.tsx`); Modify `src/components/admin-web/admin-sidebar.tsx`; Test `admin-web-promos.test.tsx`

**Build:**
- **Admin promos screen** (mirror `(admin-web)/reviews/index.tsx` / `notifications/index.tsx`): 
  - a **create form** — code, discount_type (chips percentage/fixed/wallet_credit), discount_value, optional max_discount / max_redemptions / per_user_limit / starts_at / ends_at, is_active → `adminCreatePromo` (validates required fields; refresh on success).
  - a **codes list** (via `adminGetPromoCodes`) — code, type, value, limits, window, active — with an **Enable/Disable** toggle → `adminUpdatePromo(id, { is_active })`.
  - a **redemption history** (via `adminGetPromoRedemptions`) — customer/booking/payment id refs + discount amount + date (the audit trail).
- **`admin-sidebar.tsx`**: add ONE `NAV_ITEMS` entry `{ label: 'Promotions', route: '/(admin-web)/promos', segment: 'promos' }`.

**Tests:** `admin-web-promos.test.tsx` — mock `@/lib/promotions`; the create form submits → `adminCreatePromo` with the code (uppercased) + type/value; the codes list renders + Disable calls `adminUpdatePromo(id, { is_active:false })`; redemption history renders. Keep other admin-web tests green (the added NAV_ITEM is additive — update a sidebar count assertion if any, minimally).

**Steps:** `expo export --platform android` (new route) → `tsc` → `npm test` → `expo export --platform web` → commit `feat: slice27 admin promos screen + redemption history`.

---

### Task 5: Verification, RLS/privacy, backward-compat, isolation, final gate

**Files:** Create `docs/pilot/promotions.md`

- **Verification (documented SQL + manual):** `redeem_promo` percentage/fixed sets `promo_discount` (capped at remaining due; `max_discount` caps percentage) + a redemption row + `promo_code_id`; wallet_credit posts `promo_credit` to the wallet + a redemption (payment discount stays 0); **one promo per payment** (2nd → 'Promo already applied'); `max_redemptions`/`per_user_limit`/window/`is_active` enforced (raise); **no negative due** (discount floored to remaining); promo+wallet full cover on a completed booking **auto-settles** paid (+ earning + notification); M-Pesa charges `amount − wallet_applied − promo_discount`.
- **RLS/privacy:** `promo_codes` admin-only (customer/provider select → 0 rows; only admin manages); `promo_redemptions` customer reads own, admin all, **provider 0 rows**, immutable (no update/delete/insert path). 
- **Backward-compat:** existing payments (`promo_discount = 0`) unchanged; `apply_wallet_to_payment` identical for wallet-only; M-Pesa charges `amount − wallet_applied − 0`; `payment_attempts`/cash/card unchanged.
- **Isolation:** `git diff <base>..HEAD --stat` — only promotions files + the additive `mpesa-stk-push`/`apply_wallet_to_payment`/`amountDue` edits; NO provider share/earnings/`pay_payment` change, NO mpesa credentials, NO `payment_attempts` schema change, NO `src/auth/**`, NO tracking/chat; only migration `0024`.
- **No-payout / no-referral audit:** provider share/earnings untouched; `wallet_credit` is admin-created (no referral engine).
- **Final gate:** `expo export` web + android, `tsc` clean, `npm test` green, `git status` clean.
- Commit `test: slice27 promotions verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-27-promotions`. Abandon = `git checkout main` + delete branch.
- **Per-task revert:** independent commits — `git revert <commit>` rolls back one. Reverting T3 restores the wallet-only M-Pesa charge + removes payment-step promo entry (promo tables go unused; `promo_discount = 0`). Reverting T4 removes the admin screen.
- **Disable without schema revert:** set every promo `is_active = false` (no code redeems) — instant kill-switch; or revert T3 → no promo entry, columns inert.
- **Schema rollback:** forward-only `0025_rollback_promotions.sql` — restore `apply_wallet_to_payment` to the Slice-26 (non-promo) body; `drop function redeem_promo; drop table promo_redemptions; drop table promo_codes; alter table payments drop column promo_discount, drop column promo_code_id;`. Payments/wallet/earnings/mpesa unaffected.
- **No provider-payout / mpesa-credential / auth / tracking / chat involvement** — rollback confined to promo tables + payment promo columns + the additive charge/apply edits.

---

## Self-Review

- **Spec coverage:** promo_codes + promo_redemptions + RLS + payments cols + redeem_promo + promo-aware apply_wallet (T1); promotions lib + Payment fields + amountDue (T2); mpesa promo charge + payment-step promo entry (T3); admin promos screen + redemption history + nav (T4); verification + RLS + backward-compat + isolation + no-payout/no-referral audit (T5). No-negative-due (T1 `least`; T5 verify). Promo+wallet stack, wallet after promo (T1 apply_wallet promo-aware; T3 UI). wallet_credit → wallet not payment (T1 redeem_promo; T5). One-promo-per-payment + max_redemptions + per_user_limit + window (T1; T5). No provider payout / mpesa-credential / referral change (constraints; T5 isolation).
- **Placeholder scan:** none; concrete SQL/signatures/tests per task.
- **Name consistency:** `promo_codes`/`promo_redemptions`/`promo_discount`/`promo_code_id` (T1) used by T2/T3/T4/T5; `redeem_promo` (T1) → `redeemPromo` (T2) used by T3; `adminCreatePromo`/`adminUpdatePromo`/`adminGetPromoCodes`/`adminGetPromoRedemptions` (T2) consumed by T4; `amountDue` (T2, promo-aware) used by T3; reuses `_wallet_post`/`apply_wallet_to_payment`/`amountDue`/`is_admin()`.
