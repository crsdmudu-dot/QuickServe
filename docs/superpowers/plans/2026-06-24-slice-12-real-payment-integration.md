# Slice 12 — Real Payment Integration (M-Pesa + Card Readiness) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Slice 11's instant self-pay with real customer payment *initiation* (M-Pesa first) via a `payment_attempts` table and a mock M-Pesa service, where only admin confirmation flips a payment to paid.

**Architecture:** Customer initiates an attempt (`pending`); admin `confirm_payment_attempt` sets the payment `paid` + `payment_method`, reusing the Slice 11 paid→earning trigger. `mpesa.ts` is a pure mock at the Daraja seam. All state changes via `security definer` RPCs; RLS keeps customers/providers out of each other's data. `pay_payment` is retired.

**Tech Stack:** Expo React Native, TypeScript, Expo Router, Supabase (Postgres + RLS), Jest + RNTL.

## Global Constraints

- Money is KES; display via `formatKes` (`src/lib/currency.ts`). Never hardcode "KES".
- Migration pattern mirrors `0010_payments.sql`: table → `enable row level security` → policies → `security definer set search_path = public` functions, `public.is_admin()` guards, `drop trigger if exists; create`.
- Lib mutations return `{ ok, error? }` with friendly strings; queries return typed rows / `[]` / null — matching `payments.ts`/`attempts` siblings.
- **Customers may only initiate attempts. No client path may set `payment.status='paid'`.** Only `confirm_payment_attempt` (admin) does, and it sets `payment_method` at the same time.
- `mpesa.ts`: pure mock, **no network, no secrets, no env credentials**; a comment marks the real-Daraja seam.
- Allowed values: `payment_method`/attempt `provider` ∈ `{mpesa,card,cash}`; attempt `status` ∈ `{initiated,pending,successful,failed,cancelled}`.
- Earnings creation stays owned solely by the Slice 11 paid-transition trigger — do not duplicate it.
- Every lib function and new component gets a co-located test. Merge gate: `npm test` green, `npx tsc --noEmit` clean, Android bundle builds.
- Beginner-friendly; explain each file; ADD/modify without breaking existing sections.

---

## File Structure

**Create**
- `supabase/migrations/0011_payment_attempts.sql` — method column, attempts table, RLS, 3 RPCs, drop `pay_payment`.
- `src/lib/mpesa.ts` (+ test) — mock STK Push + Kenyan phone helpers.
- `src/lib/attempts.ts` (+ test) — initiate (customer) + admin attempt helpers.
- `src/components/ui/attempt-status-badge.tsx` (+ test) — 5-status badge.
- `src/app/admin/payment-attempts.tsx` — admin attempts list + confirm/fail.
- `docs/superpowers/verification/slice-12-attempts.sql` — manual RLS/RPC/trigger script.

**Modify**
- `src/lib/payments.ts` — add `payment_method` to `Payment`; remove `payForBooking`/`payPayment`.
- `src/app/booking/[id].tsx` — replace instant Pay with M-Pesa initiation UI.
- `src/app/admin/payments.tsx` — show `payment_method` + link to attempts screen.
- `src/__tests__/booking-detail.test.tsx` — update mocks to initiate flow (remove payPayment).
- `src/__tests__/customer-payments.test.tsx` / `payments.test.ts` — drop `payPayment` references if present.

---

## Task Order (dependency-ordered)

1. **T1** — Migration `0011` (DB foundation: method column, attempts, RLS, RPCs, drop `pay_payment`).
2. **T2** — `mpesa.ts` mock service + phone helpers (+ tests). Independent of T1.
3. **T3** — `payments.ts` update (add `payment_method`, remove `payPayment`) (+ fix its test).
4. **T4** — `attempts.ts` lib (+ tests). Depends on T2 (mpesa) + T1 (RPC names).
5. **T5** — `AttemptStatusBadge` component (+ test).
6. **T6** — Customer booking-detail M-Pesa initiation UI + Slice 11 detail test update. Depends on T3,T4,T5.
7. **T7** — Admin payments-dashboard method/link + admin payment-attempts screen. Depends on T4,T5.
8. **T8** — Verification (RLS/RPC/trigger script + Expo Go smoke) + final gate.

T2 is parallelizable with T1/T3. T4–T7 depend on the libs/components.

---

### Task 1: DB migration `0011_payment_attempts.sql`

**Files:** Create `supabase/migrations/0011_payment_attempts.sql`

**Build (in order):**
- **ALTER payments:** add `payment_method text check (payment_method in ('mpesa','card','cash'))` (nullable).
- **`payment_attempts` table** per spec §3.2: `id`, `payment_id` FK→payments `on delete cascade`, `provider` (check mpesa/card/cash), `phone` nullable, `amount numeric not null`, `status` (check initiated/pending/successful/failed/cancelled, default `pending`), `external_reference` nullable, `raw_response jsonb`, `created_at`. `enable row level security`. (No unique on `payment_id` — retries allowed.)
- **RLS:** attempts `select` = `public.is_admin() or exists (select 1 from public.payments p where p.id = payment_id and p.customer_id = auth.uid())`. No write policies.
- **`initiate_payment_attempt(p_payment_id uuid, p_provider text, p_phone text, p_external_reference text, p_raw_response jsonb)`** — assert payment owned by `auth.uid()`, payment `status='pending'`, booking `status='completed'`, provider in set; insert `pending` attempt (amount from payment); `returns uuid`. Does NOT change payment.
- **`confirm_payment_attempt(p_attempt_id uuid)`** — `is_admin()`; set attempt `successful`; if its payment is `pending` set `status='paid'`, `paid_at=now()`, `payment_method=<attempt.provider>`; set sibling `pending`/`initiated` attempts → `cancelled`; raise if not admin / attempt not confirmable.
- **`set_attempt_status(p_attempt_id uuid, p_status text)`** — `is_admin()`; validate value in set; update attempt status only.
- **`drop function if exists public.pay_payment(uuid);`**

**Checks:**
- [ ] Migration applies cleanly (`supabase db reset`/push); `\d payment_attempts` shows columns/constraints/RLS; `pay_payment` gone.
- [ ] Commit `feat: slice12 payment_attempts schema (0011)`.

> Behavioral RLS/trigger verification is in **T8**.

---

### Task 2: `mpesa.ts` mock service + phone helpers

**Files:** Create `src/lib/mpesa.ts`, `src/lib/mpesa.test.ts`

**Produces:**
- `type StkPushParams = { phone: string; amount: number; accountReference: string }`
- `type StkPushResult = { ok: boolean; externalReference: string; raw: Record<string, unknown>; error?: string }`
- `initiateStkPushMock(params): StkPushResult` — returns ok with `externalReference` = `MOCK-<uuid-ish>` and a Daraja-shaped `raw`. Pure, no network. Comment marks real-Daraja seam (env-sourced creds later).
- `normalizeKenyanPhone(input): string | null` — `07XXXXXXXX`/`+2547XXXXXXXX`/`2547XXXXXXXX` → `2547XXXXXXXX`; else null.
- `isValidKenyanPhone(input): boolean` — `normalizeKenyanPhone(input) != null`.

**Tests:** normalize across the three valid forms + junk→null; `isValidKenyanPhone` true/false; mock returns `ok` + `MOCK-` prefix + object `raw`; mock is deterministic/synchronous (no network).

**Steps:** TDD cycle → `tsc` → commit `feat: slice12 mpesa mock service`.

---

### Task 3: `payments.ts` update (method + retire pay)

**Files:** Modify `src/lib/payments.ts`; fix `src/lib/payments.test.ts`

**Build:**
- Add `payment_method: 'mpesa' | 'card' | 'cash' | null` to `Payment`.
- **Remove** `payForBooking`/`payPayment` and any `pay_payment` RPC call.
- Remove their tests from `payments.test.ts`; keep the rest green.

**Checks:** `npm test`, `tsc`; commit `refactor: slice12 payments method + retire pay_payment`.

---

### Task 4: `attempts.ts` lib

**Files:** Create `src/lib/attempts.ts`, `src/lib/attempts.test.ts`

**Consumes:** `initiateStkPushMock`, `normalizeKenyanPhone`, `isValidKenyanPhone` (T2); RPCs `initiate_payment_attempt`, `confirm_payment_attempt`, `set_attempt_status` (T1).

**Produces:**
- `type PaymentAttempt` (spec §5).
- `initiateMpesaPayment(input: { paymentId: string; amount: number; phone: string; accountReference: string }): Promise<{ ok; error? }>` — validate/normalize phone (reject `{ ok:false, error:'Enter a valid M-Pesa phone number.' }` **before** any RPC); call `initiateStkPushMock`; call `initiate_payment_attempt` RPC with `provider:'mpesa'`, normalized phone, `external_reference`, `raw_response`.
- `getAttemptsForPayment(paymentId): Promise<PaymentAttempt[]>`.
- `adminGetAllAttempts(): Promise<PaymentAttempt[]>`.
- `adminConfirmAttempt(attemptId): Promise<{ ok; error? }>` → `confirm_payment_attempt`.
- `adminSetAttemptStatus(attemptId, status): Promise<{ ok; error? }>` → `set_attempt_status`.

**Tests:** `initiateMpesaPayment` rejects bad phone with no RPC call (assert RPC mock not called); success passes normalized phone + ref + raw to the RPC; admin functions assert correct RPC name/args; queries return `[]`/rows; error → friendly string.

**Steps:** TDD cycle → `tsc` → commit `feat: slice12 attempts lib`.

---

### Task 5: `AttemptStatusBadge`

**Files:** Create `src/components/ui/attempt-status-badge.tsx` (+ test)

**Build:** mirror `payment-status-badge.tsx`. Map: `initiated`→'Initiated'/'warning', `pending`→'Pending'/'warning', `successful`→'Successful'/'success', `failed`→'Failed'/'error', `cancelled`→'Cancelled'/'textSecondary'. Props `{ status }`.

**Tests:** renders the 5 labels. Commit `feat: slice12 attempt status badge`.

---

### Task 6: Customer M-Pesa initiation UI

**Files:** Modify `src/app/booking/[id].tsx`; update `src/__tests__/booking-detail.test.tsx`

**Build:**
- Remove the instant **Pay** button (and `payPayment` import).
- When `payment.status='pending'` and booking `completed`: a **Pay with M-Pesa** button reveals a phone `Input` (prefill from profile phone when available), confirm → `initiateMpesaPayment({ paymentId, amount, phone, accountReference: booking.id })`.
- After initiation / on load: `getAttemptsForPayment` → show latest `AttemptStatusBadge` + "Payment request sent. Awaiting confirmation."
- **Card**: disabled "Card — coming soon" affordance.
- No control that sets `paid`.

**Checks:** update detail test mocks (`@/lib/attempts`, remove `payPayment`); keep assertions; add a focused assertion that the bad-phone path shows the validation error and does not call the initiate RPC (if feasible in the screen test, else cover in attempts.test). `npm test`, `tsc`; commit `feat: slice12 customer mpesa initiation`.

---

### Task 7: Admin attempts screen + dashboard method

**Files:** Create `src/app/admin/payment-attempts.tsx`; Modify `src/app/admin/payments.tsx`

**Build:**
- Attempts screen: `adminGetAllAttempts()` list — `#payment_id[:8]`, provider, phone, `formatKes(amount)`, `AttemptStatusBadge`, `external_reference`, date. On `pending`/`initiated`: **Confirm** → `adminConfirmAttempt` (updates row + ideally reflects paid), **Mark failed** → `adminSetAttemptStatus(id,'failed')`. `EmptyState` when none.
- Payments dashboard: render `payment_method` (or '—') per row; add a **Payment attempts** nav button → `router.push('/admin/payment-attempts')`.

**Checks:** `npm test`, `tsc`; commit `feat: slice12 admin attempts + method`.

---

### Task 8: Verification & final gate

**Files:** Create `docs/superpowers/verification/slice-12-attempts.sql`

**RPC / trigger / RLS verification** (script + run against Supabase, document results):
- [ ] Customer initiates only on own `pending` payment with booking `completed`; rejected otherwise.
- [ ] Customer cannot confirm; non-admin `confirm_payment_attempt`/`set_attempt_status` → rejected.
- [ ] Provider cannot `select` any `payment_attempts`; customer B cannot see customer A's attempts.
- [ ] `confirm_payment_attempt` (admin): attempt→`successful`, payment→`paid` + `paid_at` + `payment_method`; sibling `pending` attempts → `cancelled`; **exactly one** `provider_earnings` row created (Slice 11 trigger); re-confirm is a no-op.
- [ ] `confirm` on a payment with no assigned provider → payment paid, no earning (trigger guard).
- [ ] `set_attempt_status` (admin) sets `failed`/`cancelled` without changing payment.
- [ ] `pay_payment` function no longer exists.

**Expo Go verification** (manual, document):
- [ ] `npx expo start --tunnel`; complete a booking + accepted quote (Slice 11 path).
- [ ] Customer: **Pay with M-Pesa**, confirm phone → attempt shows pending; payment stays pending.
- [ ] Admin: payment-attempts screen shows the attempt + method → **Confirm** → payment shows `paid`, method `mpesa`; provider balance moves to pending earning.
- [ ] Bad phone shows validation error, no attempt created.

**Final gate:**
- [ ] `npm test` green, `npx tsc --noEmit` clean, Android bundle exports.
- [ ] Commit `test: slice12 verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-12-payments` (created at execution). Abandon = `git checkout main` + delete branch; `main` untouched.
- **Single task regression:** `git revert <task-commit>` — tasks are independently committed and ordered.
- **Schema rollback:** forward-only; if needed add `0012_rollback_attempts.sql`: `drop table if exists public.payment_attempts cascade;` `alter table public.payments drop column if exists payment_method;` `drop function if exists public.initiate_payment_attempt, public.confirm_payment_attempt, public.set_attempt_status;` and **re-create `pay_payment`** from `0010` if reverting the customer flow. Do not edit `0011` after it is applied to a shared environment.
- **Data note:** `payment_attempts` are internal/mock records — safe to drop in dev; export before any destructive rollback in a shared env.

---

## Self-Review

- **Spec coverage:** method column + attempts table (T1), RLS (T1/T8), 3 RPCs + drop pay_payment (T1/T8), mpesa mock + phone (T2), payments type/retire (T3), attempts lib (T4), badge (T5), customer M-Pesa UI (T6), admin attempts + method (T7), testing + Expo Go + rollback (T8 + sections) — all mapped.
- **Placeholder scan:** none; verification items are concrete.
- **Type consistency:** `PaymentAttempt`, `StkPushResult`/`StkPushParams`, `Payment.payment_method`, RPC names (`initiate_payment_attempt`/`confirm_payment_attempt`/`set_attempt_status`) consistent across T1–T8.
