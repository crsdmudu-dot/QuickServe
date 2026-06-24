# Slice 12 — Real Payment Integration: M-Pesa + Card Readiness (Design Spec)

**Date:** 2026-06-24
**Status:** Approved design → implementation plan
**Builds on:** Slice 11 (payments, provider_earnings, paid→earning trigger).
**Philosophy:** Customers pay QuickServe. QuickServe pays providers. Admin controls money. **Customers may only *initiate* payment; only an admin (or, later, a real provider callback) flips a payment to `paid`.**

---

## 1. Goal

Move from internal "mark paid" accounting to **real customer payment initiation**, M-Pesa first — but build the **integration-ready structure** without connecting the live Daraja API yet. Customers initiate an attempt; an admin confirms it; confirmation reuses Slice 11's paid→earning chain. The placeholder M-Pesa service is the seam where real STK Push drops in later.

### Out of scope
Live Daraja credentials/endpoints, real STK Push network calls, automatic callbacks/webhooks, Stripe live/card processing, refunds, taxes, payout automation. No secrets in the repo.

---

## 2. Updated Money Lifecycle

Slice 11 step "customer pays the completed job" is **replaced** by initiate → confirm:

1. (Slice 11) Admin quotes → customer accepts → `payment` row created (`pending`).
2. Provider completes job → booking `status='completed'`.
3. Customer taps **Pay with M-Pesa** (confirms phone) → a `payment_attempt` row is created (`pending`, `provider='mpesa'`). The mock M-Pesa service returns a fake `external_reference` + `raw_response`. **`payment` stays `pending`.**
4. Admin reviews attempts and **confirms** one → `confirm_payment_attempt` marks the attempt `successful`, sets `payment.status='paid'`, `payment.paid_at=now()`, `payment.payment_method=<attempt provider>`.
5. The existing Slice 11 `trg_create_earning_on_paid` trigger fires → `provider_earnings` row (`pending`).
6. (Slice 11) Admin marks payout paid.

**`cash`** and **`card`** follow the same shape: customer/admin records an attempt; admin confirmation is the only paid-trigger. Cash = admin confirms money received. Card = placeholder attempt now, real processor later.

**Retired:** Slice 11's `pay_payment` RPC and the customer self-pay button. Customers can no longer set `paid`.

---

## 3. Database — migration `0011_payment_attempts.sql`

Follows the established pattern (`0010_payments.sql`): table → `enable row level security` → policies → `security definer set search_path = public` functions/triggers, `public.is_admin()` guards.

### 3.1 `payments` — add method (ALTER)
```sql
alter table public.payments
  add column if not exists payment_method text
    check (payment_method in ('mpesa','card','cash'));   -- nullable until confirmed
```

### 3.2 `payment_attempts`

| column | type | notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| payment_id | uuid | FK → payments, `on delete cascade` |
| provider | text | check in (`mpesa`,`card`,`cash`) — the method |
| phone | text | nullable (required for mpesa; null for cash/card) |
| amount | numeric | copied from `payment.amount` at creation |
| status | text | check in (`initiated`,`pending`,`successful`,`failed`,`cancelled`), default `pending` |
| external_reference | text | nullable; mock ref now (e.g. `MOCK-…`), real CheckoutRequestID later |
| raw_response | jsonb | nullable; mock/real gateway payload |
| created_at | timestamptz | default `now()` |

A payment may have **many** attempts (retries). No uniqueness on `payment_id`.

### 3.3 Functions / triggers (all `security definer set search_path = public`)

- **`initiate_payment_attempt(p_payment_id, p_provider, p_phone, p_external_reference, p_raw_response)`** — customer-facing. Asserts caller owns the payment (`payment.customer_id = auth.uid()`), `payment.status='pending'`, booking `status='completed'`, and `p_provider in ('mpesa','card','cash')`. Inserts a `pending` attempt (amount copied from payment). Returns the new attempt id. Does **not** touch `payment.status`.
- **`confirm_payment_attempt(p_attempt_id)`** — admin only. Atomically: set the attempt `successful`; set its `payment` `status='paid'`, `paid_at=now()`, `payment_method=<attempt.provider>` (only if payment is currently `pending`); set sibling `pending`/`initiated` attempts on the same payment to `cancelled`. Raises if not admin or attempt not in a confirmable state. Payment→paid transition fires the Slice 11 earnings trigger.
- **`set_attempt_status(p_attempt_id, p_status)`** — admin only; allows `failed`/`cancelled` (and `pending`) on an attempt without confirming the payment. Validates the value.
- **DROP `pay_payment`** (retired): `drop function if exists public.pay_payment(uuid);`

### 3.4 RLS

**payment_attempts**
- `select`: `public.is_admin() OR exists (select 1 from public.payments p where p.id = payment_id and p.customer_id = auth.uid())`. **Providers cannot see attempts.**
- No direct write policies — all writes via the security-definer RPCs above.

`payments.payment_method` is covered by existing `payments` RLS (customer reads own; it is non-sensitive — the chosen method, not the split).

---

## 4. M-Pesa Placeholder Service — `src/lib/mpesa.ts`

The integration seam. **Pure, no network, no secrets.** Mimics the Daraja STK Push interface so a real call drops in later behind the same function.

```ts
export type StkPushParams = { phone: string; amount: number; accountReference: string };
export type StkPushResult = {
  ok: boolean;
  externalReference: string;     // mock CheckoutRequestID, e.g. `MOCK-<uuid>`
  raw: Record<string, unknown>;  // mock Daraja-shaped response
  error?: string;
};
// Returns a deterministic mock success now; real Daraja fetch later (behind env).
export function initiateStkPushMock(params: StkPushParams): StkPushResult;

// Kenyan MSISDN helpers (normalize 07.. / +2547.. / 2547.. → 2547XXXXXXXX).
export function normalizeKenyanPhone(input: string): string | null;
export function isValidKenyanPhone(input: string): boolean;
```

A code comment marks exactly where the real `fetch` to Daraja will live, and that credentials must come from env/Supabase secrets — never the repo.

---

## 5. Client Library Layer

Helpers return `{ ok, error? }` or typed rows, matching `payments.ts`. Money is KES; `formatKes` for display.

### `src/lib/payments.ts` (modify)
- Add `payment_method: 'mpesa' | 'card' | 'cash' | null` to the `Payment` type.
- **Remove** `payForBooking`/`payPayment` (retired with `pay_payment`).

### `src/lib/attempts.ts` (new, + test)
```ts
type PaymentAttempt = { id; payment_id; provider: 'mpesa'|'card'|'cash'; phone: string|null;
  amount: number; status: 'initiated'|'pending'|'successful'|'failed'|'cancelled';
  external_reference: string|null; raw_response: unknown|null; created_at: string };

// customer: validate/normalize phone, call mpesa mock for ref+raw, then initiate_payment_attempt RPC.
initiateMpesaPayment(input: { paymentId: string; amount: number; phone: string; accountReference: string }):
  Promise<{ ok: boolean; error?: string }>;
getAttemptsForPayment(paymentId): Promise<PaymentAttempt[]>;   // customer (own) or admin

// admin
adminGetAllAttempts(): Promise<PaymentAttempt[]>;
adminConfirmAttempt(attemptId): Promise<{ ok; error? }>;       // confirm_payment_attempt RPC
adminSetAttemptStatus(attemptId, status): Promise<{ ok; error? }>; // set_attempt_status RPC
```
`initiateMpesaPayment` rejects an invalid phone before any RPC call.

---

## 6. UI

Reuse `Card`, `Text`, `Button`, `Input`, `EmptyState`, `PaymentStatusBadge`. Add a small `AttemptStatusBadge` (5 statuses) for attempt rows.

### Customer — booking detail (`src/app/booking/[id].tsx`)
Replace the Slice 11 instant **Pay** button. When `payment.status='pending'` and booking `completed`:
- **Pay with M-Pesa** CTA → reveals a phone `Input` (prefilled from the customer's profile phone when available), a confirm button → `initiateMpesaPayment`.
- After initiation: show instructions/status — "Payment request sent. Awaiting confirmation." and the latest attempt's `AttemptStatusBadge` via `getAttemptsForPayment`.
- **Card**: shown as a disabled "Card — coming soon" affordance (placeholder).
- Customer never sees a control that sets `paid`.

### Admin — payment attempts (`src/app/admin/payment-attempts.tsx`, new)
- Lists `adminGetAllAttempts()`: payment ref (`#payment_id[:8]`), provider/method, phone, `formatKes(amount)`, `AttemptStatusBadge`, `external_reference`, date.
- On a `pending`/`initiated` attempt: **Confirm** → `adminConfirmAttempt` (flips payment paid), and **Mark failed** → `adminSetAttemptStatus`.
- Linked from the admin payments dashboard.

### Admin — payments dashboard (`src/app/admin/payments.tsx`, modify)
- Show `payment_method` on each payment row.
- Add a link to the attempts screen.

---

## 7. Testing

- **Lib unit tests:** `mpesa.ts` (mock returns ok + `MOCK-` ref + raw; `normalizeKenyanPhone`/`isValidKenyanPhone` across `07…`, `+2547…`, `2547…`, junk); `attempts.ts` (each function success/error; `initiateMpesaPayment` rejects bad phone *before* RPC; admin functions pass correct RPC name/args).
- **Component test:** `AttemptStatusBadge` renders the 5 status labels.
- **Update Slice 11 tests:** remove `payPayment` coverage; update `booking-detail.test.tsx` mocks to the new initiate flow; keep all other assertions.
- **Manual SQL/RLS verification** (`docs/superpowers/verification/slice-12-attempts.sql`): customer can initiate only on own pending+completed payment; customer cannot confirm; non-admin cannot call `confirm_payment_attempt`/`set_attempt_status`; provider cannot select attempts; customer B cannot see customer A's attempts; confirm sets payment paid + method + fires earning exactly once; confirm cancels sibling pending attempts; `pay_payment` no longer exists.
- Merge gate: `npm test` green, `npx tsc --noEmit` clean, Android bundle builds.

---

## 8. Guardrails / Invariants

- Customers can only **initiate** attempts; no client path sets `payment.status='paid'` (enforced by RLS + retiring `pay_payment`).
- Only `confirm_payment_attempt` (admin) sets a payment `paid` this slice; it sets `payment_method` at the same time.
- `payment_method ∈ {mpesa,card,cash}`; attempt `provider` same set; attempt `status ∈ {initiated,pending,successful,failed,cancelled}`.
- Earnings still created only by the Slice 11 paid-transition trigger — unchanged.
- Providers never see payments or attempts; customers see only their own attempts.
- No live credentials, endpoints, or network calls; `mpesa.ts` is a mock with a documented real-integration seam.

---

## 9. Deliverables

1. `supabase/migrations/0011_payment_attempts.sql` (method column, attempts table, RLS, 3 RPCs, drop `pay_payment`).
2. `src/lib/mpesa.ts` (+ test) — placeholder STK service + phone helpers.
3. `src/lib/attempts.ts` (+ test); `src/lib/payments.ts` updated (`payment_method`, remove `payPayment`).
4. `src/components/ui/attempt-status-badge.tsx` (+ test).
5. Customer booking-detail M-Pesa initiation UI; Slice 11 detail/test updates.
6. Admin payment-attempts screen + payments-dashboard method/link.
7. `docs/superpowers/verification/slice-12-attempts.sql`.
