# Slice 27 — Promotions & Coupons (Design Spec)

**Date:** 2026-07-04
**Status:** Approved design → (implementation plan pending approval)
**Builds on:** Slice 11 payments (`payments` `amount`/`provider_share`/`quickserve_share`, `create_earning_on_paid`, `pay_payment`), Slice 26 wallet (`wallets` + immutable `wallet_transactions` ledger, `_wallet_post`, `payments.wallet_applied`, `apply_wallet_to_payment` auto-settle, `mpesa-stk-push` charging `amount − wallet_applied`, `amountDue`), Slice 23 payment notifications.

---

## 1. Goal & Non-Goals

Add admin-created promo codes (percentage / fixed / wallet-credit), redeemable by customers at the payment step to reduce their amount due (or grant wallet credit), with immutable redemption history and admin management (create/enable-disable, max/per-user limits, date windows, redemption audit).

**Non-goals / out of scope (rules):** NO referral engine, gift cards, loyalty points, automated marketing, provider promotions, public promo landing pages. NO provider payout/share change (QuickServe absorbs the discount), NO M-Pesa **credential** change, NO auth/tracking/chat change. Backward-compatible; existing payments/wallet flow keeps working.

---

## 2. Architecture — additive to the payment/wallet model; QuickServe absorbs the discount

- **`promo_codes`** (admin-managed) + an **immutable `promo_redemptions`** ledger (who used what, on which booking/payment, how much). Balance-style safety via SECURITY DEFINER RPCs.
- **Payments gain `promo_discount` (default 0) + `promo_code_id`.** **`amount_due = amount − wallet_applied − promo_discount`, floored ≥ 0** (never negative). `provider_share`/`quickserve_share`/shares-constraint/`provider_earnings` are **untouched** — the discount reduces what QuickServe collects, exactly like wallet credit.
- **`redeem_promo(payment_id, code)`** RPC validates (active, window, `max_redemptions`, `per_user_limit`, one-per-payment) and applies by type: **percentage/fixed** → set `promo_discount` (capped at remaining due) + `promo_code_id`, record redemption; **wallet_credit** → `_wallet_post('promo_credit', +value)` to the customer's wallet (reuses Slice 26), record redemption (payment untouched beyond `promo_code_id` to block a 2nd promo).
- **Stacking + auto-settle:** promo and wallet stack; the Slice-26 `apply_wallet_to_payment` is extended to be **promo-aware** (due check + auto-settle use `wallet_applied + promo_discount`); a full percentage/fixed cover on a completed booking auto-settles too (reuses `create_earning_on_paid` + `tg_notify_payment_paid`).
- **M-Pesa charges `amount − wallet_applied − promo_discount`** (single additive edit; defaults `0` → unchanged).

---

## 3. Database — migration `0024_promotions.sql`

### 3a. `promo_codes` (admin-managed)
```sql
create table if not exists public.promo_codes (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,                                 -- stored UPPERCASE
  discount_type  text not null check (discount_type in ('percentage','fixed','wallet_credit')),
  discount_value numeric not null check (discount_value > 0),          -- pct (1–100) or KES
  max_discount   numeric,                                              -- optional cap for percentage (KES)
  max_redemptions int,                                                 -- optional total cap
  per_user_limit int not null default 1,
  starts_at      timestamptz,
  ends_at        timestamptz,
  is_active      boolean not null default true,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);
alter table public.promo_codes enable row level security;
-- ADMIN-ONLY (customers never enumerate codes; they redeem by exact code via the RPC):
create policy "promo_codes_select" on public.promo_codes for select using (public.is_admin());
create policy "promo_codes_insert" on public.promo_codes for insert with check (public.is_admin());
create policy "promo_codes_update" on public.promo_codes for update using (public.is_admin()) with check (public.is_admin());
```

### 3b. `promo_redemptions` (immutable ledger)
```sql
create table if not exists public.promo_redemptions (
  id            uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes(id) on delete cascade,
  customer_id   uuid not null references public.profiles(id),
  booking_id    uuid references public.bookings(id) on delete set null,
  payment_id    uuid references public.payments(id) on delete set null,
  discount_type text not null,                                         -- snapshot
  discount_amount numeric not null,                                    -- applied discount / credited amount (KES)
  created_at    timestamptz not null default now()
);
alter table public.promo_redemptions enable row level security;
-- SELECT own or admin. NO provider policy. NO update/delete/insert policy (append-only, RPC-only writes).
create policy "promo_redemptions_select" on public.promo_redemptions for select using (customer_id = auth.uid() or public.is_admin());
```

### 3c. `payments` additions (additive, backward-compatible)
```sql
alter table public.payments
  add column if not exists promo_discount numeric not null default 0 check (promo_discount >= 0),
  add column if not exists promo_code_id  uuid references public.promo_codes(id);
```
`amount_due = amount − wallet_applied − promo_discount` (floored ≥ 0). Shares/earnings unchanged.

### 3d. RPCs (SECURITY DEFINER, `set search_path = public`)
- **`redeem_promo(p_payment_id uuid, p_code text) returns numeric`** (returns the discount/credit applied):
  - load the payment (`customer_id, amount, wallet_applied, promo_discount, promo_code_id, status, booking_id`);
    `if customer_id <> auth.uid() then raise`; `if status <> 'pending' then raise`; `if promo_code_id is not null then raise 'Promo already applied'`.
  - load `promo_codes where code = upper(btrim(p_code))`; require `is_active`, `starts_at is null or starts_at <= now()`, `ends_at is null or ends_at >= now()` (else raise a clear message).
  - `max_redemptions`: `if max_redemptions is not null and (select count(*) from promo_redemptions where promo_code_id = pc.id) >= max_redemptions then raise 'Promo fully redeemed'`.
  - `per_user_limit`: `if (select count(*) from promo_redemptions where promo_code_id = pc.id and customer_id = auth.uid()) >= per_user_limit then raise 'Promo limit reached'`.
  - `v_remaining := amount − wallet_applied − promo_discount;` (promo_discount is 0 here).
  - **percentage:** `v_disc := amount * discount_value / 100; if max_discount is not null then v_disc := least(v_disc, max_discount); end if; v_disc := least(v_disc, v_remaining);`
  - **fixed:** `v_disc := least(discount_value, v_remaining);`
  - **wallet_credit:** `perform _wallet_post(auth.uid(), 'promo_credit', discount_value, 'Promo: '||code, booking_id, null, null); v_disc := discount_value;` (payment `promo_discount` stays 0; only `promo_code_id` is set to block a 2nd promo).
  - For **percentage/fixed:** `update payments set promo_discount = v_disc, promo_code_id = pc.id where id = p_payment_id;` For **wallet_credit:** `update payments set promo_code_id = pc.id where id = p_payment_id;`
  - `insert into promo_redemptions (promo_code_id, customer_id, booking_id, payment_id, discount_type, discount_amount) values (pc.id, auth.uid(), booking_id, p_payment_id, discount_type, v_disc);`
  - **Auto-settle** (percentage/fixed only): `if (wallet_applied + v_disc) = amount and exists (select 1 from bookings b where b.id = booking_id and b.status = 'completed') then update payments set status='paid', paid_at=now() where id = p_payment_id; end if;`
  - `return v_disc;`
- **Modify `apply_wallet_to_payment`** (recreate, promo-aware — additive; `promo_discount` default 0 → prior behavior unchanged):
  - due check: `if p_amount > (amount − wallet_applied − promo_discount) then raise 'Exceeds amount due'`.
  - auto-settle: `if (wallet_applied + p_amount + promo_discount) = amount and booking completed then … paid`.

---

## 4. Client — `src/lib/promotions.ts` (+ tests)

- Types `DiscountType` (`'percentage'|'fixed'|'wallet_credit'`), `PromoCode`, `PromoRedemption`.
- **Customer:** `redeemPromo(paymentId, code): Promise<{ ok; discount?: number; error? }>` → `rpc('redeem_promo', { p_payment_id, p_code })` (maps the raise messages to friendly text); `getMyPromoRedemptions()` (own ledger).
- **Admin:** `adminGetPromoCodes()`, `adminCreatePromo(input)` (insert; **uppercases `code`**; admin RLS), `adminUpdatePromo(id, patch)` (e.g. `is_active` toggle; admin RLS), `adminGetPromoRedemptions(promoCodeId?)`.
- **Payments:** extend `Payment` with `promo_discount?: number`, `promo_code_id?: string | null`; update `amountDue(p) = p.amount − (p.wallet_applied ?? 0) − (p.promo_discount ?? 0)` (in wallet.ts, floored ≥ 0).

---

## 5. UI

- **Payment step** (`src/app/booking/[id].tsx`, alongside Slice-26 wallet apply): a **promo code `Input` + "Apply promo"** → `redeemPromo(payment.id, code)`; on success show **"Promo applied — you saved KES X"** and the updated **Amount due** (`amountDue`); on error show the message. A wallet_credit promo shows "KES X added to your wallet" (and appears in wallet activity as `promo_credit`). Wallet + promo stack; the existing M-Pesa/cash pay handles the remaining due (STK charges it); full cover auto-settles → paid UI. Reload the payment after redeem.
- **Admin promo management** (`src/app/(admin-web)/promos/index.tsx` + a sidebar nav entry): a **create form** (code, type, value, optional max_discount, max_redemptions, per_user_limit, start/end, active) → `adminCreatePromo`; a **list** of codes with **enable/disable** (`adminUpdatePromo is_active`); and a **redemption history** (via `adminGetPromoRedemptions`) showing who redeemed on which booking/payment + the discount — the audit trail.

---

## 6. Backward Compatibility & Guardrails

- `promo_discount`/`promo_code_id` default 0/NULL → existing payments/queries/UI unchanged; M-Pesa charges `amount − 0 − 0`. The `apply_wallet_to_payment` change is additive (promo_discount 0 → identical wallet-only behavior).
- **No negative due** — every discount is capped at the remaining due (`least(..., remaining)`); percentage optionally capped by `max_discount`. **QuickServe absorbs** the discount — `provider_share`/`quickserve_share`/`provider_earnings`/`pay_payment` untouched; provider payout unchanged.
- `promo_codes` admin-only (customers can't enumerate; redeem via RPC). `promo_redemptions` owner+admin readable — **no provider access**; immutable (RPC-only writes). One promo per payment; bounded by `max_redemptions` + `per_user_limit`.
- **No referral/marketing engine** — codes are admin-created only; `wallet_credit` promo is a manual campaign type, not a referral system. No M-Pesa credential change (only the charge amount). No auth/tracking/chat change. Existing wallet flow intact.

---

## 7. Testing

- **DB (`docs/pilot/promotions.md`):** redeem percentage/fixed sets `promo_discount` (capped at due + `max_discount`) + a redemption row + `promo_code_id`; wallet_credit posts `promo_credit` to the wallet + a redemption (payment discount 0); one-per-payment (2nd code rejected), `max_redemptions`/`per_user_limit`/window/`is_active` enforced (raise); **no negative due** (discount floored to remaining); promo+wallet full cover on a completed booking **auto-settles** paid; M-Pesa charges `amount − wallet_applied − promo_discount`; RLS: customer reads own redemptions, **provider none**, admin all + manages codes; redemptions immutable; provider share/earnings + `payment_attempts` unchanged.
- **Lib (`promotions.test.ts`, mocked supabase):** `redeemPromo`/admin helpers RPC/insert names+args + `{ ok }`/error; `amountDue` with promo+wallet; `adminCreatePromo` uppercases the code.
- **UI (RNTL):** payment step (apply promo → "you saved" + due drops; wallet + promo together; invalid code error); admin promos (create form validates + calls create; enable/disable; redemption history renders). Keep existing payment/wallet/admin tests green (additive; never weaken).
- **Gate:** `npm test`, `npx tsc --noEmit`, `expo export --platform web` + `--platform android`.

---

## 8. Deliverables

1. `supabase/migrations/0024_promotions.sql` — `promo_codes` + immutable `promo_redemptions` + RLS + `payments.promo_discount`/`promo_code_id` + `redeem_promo` RPC + promo-aware `apply_wallet_to_payment`.
2. `mpesa-stk-push` — charge `amount − wallet_applied − promo_discount` (additive).
3. `src/lib/promotions.ts` (+ tests) — customer + admin helpers; `Payment.promo_discount`/`promo_code_id`; `amountDue` update.
4. Payment-step promo entry + "amount saved" / reduced-due display (stacks with wallet).
5. Admin promo management screen (create / enable-disable / redemption history) + nav entry.
6. `docs/pilot/promotions.md` — verification, RLS, backward-compat, isolation; green gate.
