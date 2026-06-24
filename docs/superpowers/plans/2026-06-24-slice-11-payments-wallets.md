# Slice 11 — Payments & Wallets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add internal payment & earnings accounting so customers accept quotes and pay completed jobs, providers see earnings, and admin controls quotes, payments, and payouts.

**Architecture:** A `quote` axis on bookings (orthogonal to booking status) drives money. Admin sets `quoted_amount` + `provider_share`; customer accept auto-creates a `payments` row; customer pay flips it to `paid`, which auto-creates a `provider_earnings` row. All state changes go through `security definer` RPCs/triggers; RLS keeps customers/providers from seeing each other's money. Client libs are thin async wrappers; UI reuses the existing component kit.

**Tech Stack:** Expo React Native, TypeScript, Expo Router, Supabase (Postgres + RLS), Jest + RNTL.

## Global Constraints

- Money is KES; display via existing `formatKes` (`src/lib/currency.ts`). Never hardcode "KES".
- Follow existing migration pattern (`supabase/migrations/0008_reviews.sql`): table → `enable row level security` → policies → functions/triggers, all `security definer set search_path = public`.
- Lib helpers return `{ ok, error? }` for mutations, typed rows for queries, matching `reviews.ts`/`bookings.ts`. User-facing errors are friendly strings.
- Every lib function and new component gets a co-located `*.test.ts(x)`.
- Merge gate (run every task and before merge): `npm test` green, `npx tsc --noEmit` clean, Android bundle builds.
- Beginner-friendly, one feature at a time. Explain every file changed.
- Customers never see the split; providers never see amount/QuickServe share; providers never trigger payments/payouts.

---

## File Structure

**Create**
- `supabase/migrations/0010_payments.sql` — quote columns, `payments`, `provider_earnings`, RLS, RPCs, triggers.
- `src/lib/payments.ts` (+ `.test.ts`) — customer + admin payment helpers.
- `src/lib/quotes.ts` (+ `.test.ts`) — set/accept/decline quote.
- `src/lib/earnings.ts` (+ `.test.ts`) — provider + admin earnings helpers.
- `src/components/payment-status-badge.tsx` (+ test) — 4-status badge.
- `src/components/quote-card.tsx` (+ test) — amount + Accept/Decline (customer) or read-only display.
- `src/app/(customer)/payments.tsx` — customer Payments tab.
- `src/app/provider/earnings.tsx` — provider earnings history.
- `src/app/admin/payments.tsx` — admin payments dashboard.
- `src/app/admin/earnings.tsx` — admin provider earnings + mark payout.
- `docs/superpowers/verification/slice-11-rls.sql` — manual RLS/trigger verification script.

**Modify**
- `src/app/(customer)/_layout.tsx` — add Payments tab.
- `src/app/booking/[id].tsx` — quote Accept/Decline + Pay button.
- `src/app/provider/(tabs)/profile.tsx` — earnings balance card.
- `src/app/admin/booking/[id].tsx` — set-quote action.

---

## Task Order (dependency-ordered)

1. **T1** — Migration `0010_payments.sql` (DB foundation; everything depends on it).
2. **T2** — `quotes.ts` lib + tests.
3. **T3** — `payments.ts` lib + tests.
4. **T4** — `earnings.ts` lib + tests.
5. **T5** — `payment-status-badge` + `quote-card` components + tests.
6. **T6** — Admin: set-quote on booking detail + payments dashboard.
7. **T7** — Customer: quote/pay on booking detail + Payments tab.
8. **T8** — Provider: earnings card on profile + earnings history.
9. **T9** — RLS/RPC/trigger verification + Expo Go smoke test + final gate.

Tasks T2–T4 are independent of each other (all depend only on T1) and may be parallelized. T6–T8 depend on the libs/components.

---

### Task 1: DB migration `0010_payments.sql`

**Files:** Create `supabase/migrations/0010_payments.sql`

**Build (in this order within the file):**
- **Bookings ALTER:** add `quoted_amount numeric`, `provider_share numeric`, `quote_status text not null default 'pending' check (quote_status in ('pending','sent','accepted','declined'))`.
- **`payments` table** per spec §3.2; `unique(booking_id)`; check `provider_share>=0 and quickserve_share>=0 and provider_share+quickserve_share=amount`; `enable row level security`.
- **`provider_earnings` table** per spec §3.3; `unique(booking_id)`; `enable row level security`.
- **RLS policies:**
  - `payments` select: `customer_id = auth.uid() or public.is_admin()`. No write policies.
  - `provider_earnings` select: `provider_id = auth.uid() or public.is_admin()`. No write policies.
- **Functions/triggers (all `security definer set search_path = public`):**
  - `set_quote(p_booking_id uuid, p_amount numeric, p_provider_share numeric)` — guard `is_admin()`; validate `p_amount>=0` and `0<=p_provider_share<=p_amount`; set quote fields + `quote_status='sent'`.
  - `trg_create_payment_on_accept` — `after update on bookings`, fires when `quote_status` → `'accepted'`; insert `payments` (pending) from booking quote fields; idempotent (guarded by `unique(booking_id)` / existence check).
  - `pay_payment(p_payment_id uuid)` — assert caller owns payment, `status='pending'`, booking `status='completed'`; set `status='paid'`, `paid_at=now()`.
  - `trg_create_earning_on_paid` — `after update on payments`, fires when `status` → `'paid'` and booking `assigned_provider_id is not null`; insert `provider_earnings` (pending).
  - `override_payment_status(p_payment_id uuid, p_status text)` — `is_admin()`; set status; null/set `paid_at` consistently.
  - `mark_payout_paid(p_earning_id uuid)` — `is_admin()`; set `payout_status='paid'`.

**Checks:**
- [ ] Apply locally (`supabase db reset` or push) — migration runs without error.
- [ ] `\d payments` / `\d provider_earnings` show columns, constraints, RLS enabled.
- [ ] Commit: `feat: slice11 payments schema (0010)`.

> Detailed RLS/trigger behavior is verified in **T9**, not here (here we only confirm it applies cleanly).

---

### Task 2: `quotes.ts` lib

**Files:** Create `src/lib/quotes.ts`, `src/lib/quotes.test.ts`

**Produces:**
- `setQuote(bookingId: string, amount: number, providerShare: number): Promise<{ok:boolean;error?:string}>` → `set_quote` RPC.
- `acceptQuote(bookingId: string): Promise<{ok:boolean;error?:string}>` → update booking `quote_status='accepted'`.
- `declineQuote(bookingId: string): Promise<{ok:boolean;error?:string}>` → `quote_status='declined'`.

**Tests (mock supabase like `reviews.test.ts`):** success path each; RPC error → friendly error; `setQuote` passes args through.

**Steps:** write failing tests → run (fail) → implement → run (pass) → `tsc` → commit `feat: slice11 quotes lib`.

---

### Task 3: `payments.ts` lib

**Files:** Create `src/lib/payments.ts`, `src/lib/payments.test.ts`

**Produces:**
- `type Payment` (spec §4).
- `getMyPayments(): Promise<Payment[]>` (newest first).
- `getPaymentForBooking(bookingId): Promise<Payment|null>`.
- `payForBooking(paymentId): Promise<{ok;error?}>` → `pay_payment` RPC.
- `getAllPayments(): Promise<Payment[]>` (admin).
- `overridePaymentStatus(paymentId, status): Promise<{ok;error?}>` → `override_payment_status` RPC.

**Tests:** query returns rows / `[]` on null; `payForBooking` success + error; `overridePaymentStatus` passes status.

**Steps:** TDD cycle → `tsc` → commit `feat: slice11 payments lib`.

---

### Task 4: `earnings.ts` lib

**Files:** Create `src/lib/earnings.ts`, `src/lib/earnings.test.ts`

**Produces:**
- `type ProviderEarning` (spec §4).
- `getMyEarnings(): Promise<ProviderEarning[]>`.
- `getMyBalance(): Promise<{pending:number;paid:number}>` (sum over rows).
- `getAllEarnings(): Promise<ProviderEarning[]>` (admin).
- `getEarningsForProvider(providerId): Promise<ProviderEarning[]>` (admin).
- `markPayoutPaid(earningId): Promise<{ok;error?}>` → `mark_payout_paid` RPC.

**Tests:** balance math (mixed pending/paid rows → correct totals; empty → `{pending:0,paid:0}`); `markPayoutPaid` success + error.

**Steps:** TDD cycle → `tsc` → commit `feat: slice11 earnings lib`.

---

### Task 5: Money components

**Files:** Create `src/components/payment-status-badge.tsx` (+ test), `src/components/quote-card.tsx` (+ test)

**Produces:**
- `<PaymentStatusBadge status />` — maps `pending/paid/refunded/cancelled` to label + theme color (reuse existing badge styling).
- `<QuoteCard amount onAccept? onDecline? />` — shows `formatKes(amount)`; renders Accept/Decline buttons only when handlers passed (customer never sees split).

**Tests (RNTL):** badge renders correct label per status; QuoteCard shows amount; buttons fire handlers; buttons absent when handlers omitted.

**Steps:** TDD cycle → `tsc` → commit `feat: slice11 payment components`.

---

### Task 6: Admin — set quote + payments dashboard

**Files:** Modify `src/app/admin/booking/[id].tsx`; Create `src/app/admin/payments.tsx` (+ link from `src/app/admin/index.tsx` if it's the admin hub)

**Build:**
- Booking detail: inputs for `quoted_amount` and `provider_share`, live `quickserve_share = amount − share` preview, **Send quote** → `setQuote`. Shown only while `quote_status` is `pending`/`sent`.
- Payments dashboard: `getAllPayments()` list — service, amount, provider/QuickServe split, `PaymentStatusBadge`; **Override status** action → `overridePaymentStatus`.

**Checks:** component test for split preview math + send-quote gating; `npm test`; `tsc`; commit `feat: slice11 admin quote + payments`.

---

### Task 7: Customer — quote/pay + Payments tab

**Files:** Modify `src/app/(customer)/_layout.tsx`, `src/app/booking/[id].tsx`; Create `src/app/(customer)/payments.tsx`

**Build:**
- Add **Payments** tab to customer tab layout.
- Booking detail: when `quote_status='sent'` → `<QuoteCard>` with Accept/Decline (`acceptQuote`/`declineQuote`). When payment `pending` and booking `completed` → **Pay {formatKes(amount)}** → `payForBooking`. Else show `PaymentStatusBadge`.
- Payments tab: `getMyPayments()` list, tap → booking.

**Checks:** test the Pay-button gating (only `pending` + `completed`); accept/decline calls; `npm test`; `tsc`; commit `feat: slice11 customer quote/pay + payments tab`.

---

### Task 8: Provider — earnings card + history

**Files:** Modify `src/app/provider/(tabs)/profile.tsx`; Create `src/app/provider/earnings.tsx`

**Build:**
- Profile: balance card showing `getMyBalance()` pending + paid totals; link to history.
- History screen: `getMyEarnings()` list — amount, `payout_status`, date. Provider sees only own share.

**Checks:** balance card renders totals; `npm test`; `tsc`; commit `feat: slice11 provider earnings`.

---

### Task 9: Verification & final gate

**Files:** Create `docs/superpowers/verification/slice-11-rls.sql`

**RPC / trigger / RLS verification** (script + run against Supabase, document results):
- [ ] `set_quote` as non-admin → rejected; as admin → booking gets `quote_status='sent'`, amounts set.
- [ ] `set_quote` with `provider_share > amount` → rejected.
- [ ] Customer accept (`quote_status='accepted'`) → exactly one `payments` row auto-created (`pending`, correct split). Re-accept → no duplicate (`unique(booking_id)`).
- [ ] Customer B cannot `select` customer A's payment (RLS).
- [ ] Provider cannot `select` any `payments` row (RLS).
- [ ] `pay_payment` before booking `completed` → rejected; after completed by owner → `status='paid'`, `paid_at` set.
- [ ] On paid transition → exactly one `provider_earnings` row (`pending`, `amount=provider_share`). Completion **without** payment → **no** earning.
- [ ] Customer cannot `select` `provider_earnings` (RLS); provider sees only own.
- [ ] `override_payment_status` / `mark_payout_paid` as non-admin → rejected; as admin → succeed.

**Expo Go verification** (manual, document steps in commit/handoff):
- [ ] `npx expo start --tunnel`, open in Expo Go (per memory: public Wi-Fi needs `--tunnel`).
- [ ] Admin: open a booking, send a quote (check QuickServe-share preview).
- [ ] Customer: see quote → Accept → payment shows `pending` in Payments tab.
- [ ] Provider completes booking → Customer taps **Pay** → status `paid`.
- [ ] Provider: profile balance shows the share as pending; history lists it.
- [ ] Admin: payments dashboard shows split; mark payout paid → provider balance moves pending→paid.

**Final gate:**
- [ ] `npm test` green, `npx tsc --noEmit` clean, Android bundle builds.
- [ ] Commit `test: slice11 verification`; then finishing-a-development-branch for merge.

---

## Rollback Plan

- **Pre-merge (feature branch):** all work is committed per task on a `feat/slice-11-payments` branch (created via worktree skill at execution). Abandon by `git checkout main` / delete branch — `main` untouched.
- **Single task regression:** `git revert <task-commit>` — tasks are independently committed and ordered so reverting a later UI task leaves libs/migration intact.
- **Schema rollback:** migrations are forward-only here, so add a `0011_rollback_payments.sql` if needed: `drop table if exists public.provider_earnings, public.payments cascade;` then `alter table public.bookings drop column if exists quoted_amount, drop column if exists provider_share, drop column if exists quote_status;` and `drop function if exists` the six functions. Do **not** edit `0010` after it's applied to any shared environment.
- **Data note:** because no real gateway exists, all payment/earning rows are internal accounting and safe to drop in dev; in any shared env, export `payments`/`provider_earnings` before a destructive rollback.

---

## Self-Review

- **Spec coverage:** quote columns (T1), payments table (T1), earnings table (T1), RLS (T1/T9), six RPCs/triggers (T1/T9), three libs (T2–T4), two components (T5), customer Payments tab + quote/pay (T7), provider earnings (T8), admin quote/payments/payouts (T6/T9), testing + Expo Go + rollback (T9 + this section) — all mapped.
- **Placeholder scan:** none; verification items are concrete checks.
- **Type consistency:** `Payment`/`ProviderEarning` defined in T3/T4 and consumed unchanged by T5–T8; RPC names (`set_quote`, `pay_payment`, `override_payment_status`, `mark_payout_paid`) consistent between T1 and T2–T4/T9.
