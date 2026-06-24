# Slice 11 — Payments & Wallets (Design Spec)

**Date:** 2026-06-24
**Status:** Approved design → implementation plan
**Philosophy:** Customers pay QuickServe. Providers work for QuickServe. Admin controls the money. Cash is collected first; provider liabilities are recorded second.

---

## 1. Goal

Internal accounting for money flow. No real payment gateway this slice.

- **Customer** — accept a quote, pay for completed jobs, see payment status & history.
- **Provider** — see an earnings balance and history. No direct customer payments. No self-withdrawals.
- **Admin** — set quotes (amount + provider share), view all payments and earnings, mark payouts paid, override payment status.

### Out of scope
M-Pesa, Stripe, card processing, auto payouts, refund workflows, taxes. `refunded` / `cancelled` payment statuses exist as data values an admin can set, but no automated refund flow is built.

---

## 2. Money Lifecycle

The quote axis (`quote_status`) is **orthogonal** to the existing booking lifecycle (`status`). A booking can be quoted while still `pending`, and is paid for once `completed`.

1. Customer creates booking → `quote_status='pending'`, `quoted_amount=NULL`.
2. Admin reviews details/photos, sets `quoted_amount` **and** `provider_share` → `quote_status='sent'`.
3. Customer sees the quote, accepts → `quote_status='accepted'`.
4. A **payment row is created** (trigger) → `status='pending'`, `amount=quoted_amount`, `provider_share`, `quickserve_share = amount − provider_share`.
   - (Customer may instead decline → `quote_status='declined'`; no payment row.)
5. Provider completes the work → booking `status='completed'`.
6. Customer pays the completed job → payment `status='paid'`, `paid_at=now()`.
7. A **provider_earnings row is created** (trigger, only on transition into `paid`) → `amount=provider_share`, `payout_status='pending'`.
8. Admin later marks the payout → `payout_status='paid'`.

**Key rule:** earnings are generated *only* when a payment becomes `paid` — never on job completion alone. QuickServe never owes a provider until the customer's cash is collected.

---

## 3. Database

New migration: `supabase/migrations/0010_payments.sql`. Follows the existing pattern (`0008_reviews.sql`): table → `enable row level security` → policies → triggers, all `security definer set search_path = public`.

### 3.1 Bookings — quote columns (ALTER)

```sql
alter table public.bookings
  add column if not exists quoted_amount numeric,           -- KES, nullable until admin quotes
  add column if not exists provider_share numeric,          -- KES, set with the quote
  add column if not exists quote_status text not null default 'pending'
    check (quote_status in ('pending','sent','accepted','declined'));
```

Validation (enforced in the set-quote RPC, see 3.4): `quoted_amount >= 0` and `0 <= provider_share <= quoted_amount`.

### 3.2 `payments`

| column | type | notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| booking_id | uuid | `unique`, FK → bookings, `on delete cascade` |
| customer_id | uuid | FK → profiles |
| amount | numeric | = booking `quoted_amount` at creation |
| currency | text | not null default `'KES'` |
| status | text | check in (`pending`,`paid`,`refunded`,`cancelled`), default `pending` |
| provider_share | numeric | copied from booking |
| quickserve_share | numeric | = `amount − provider_share` |
| paid_at | timestamptz | nullable; set when status → `paid` |
| created_at | timestamptz | default `now()` |

Check constraint: `provider_share >= 0 and quickserve_share >= 0 and provider_share + quickserve_share = amount`.

### 3.3 `provider_earnings`

| column | type | notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| provider_id | uuid | FK → profiles (the booking's `assigned_provider_id`) |
| booking_id | uuid | `unique`, FK → bookings |
| amount | numeric | = payment `provider_share` |
| payout_status | text | check in (`pending`,`paid`), default `pending` |
| created_at | timestamptz | default `now()` |

### 3.4 Functions / triggers / RPCs

All `security definer`, fixed `search_path`, mirroring `recompute_provider_rating`.

- **`set_quote(p_booking_id, p_amount, p_provider_share)`** — admin only (`is_admin()` guard inside). Validates amounts, writes `quoted_amount`, `provider_share`, sets `quote_status='sent'`. Rejects if not admin.
- **Trigger `trg_create_payment_on_accept`** — `after update on bookings`, fires when `quote_status` transitions to `'accepted'`. Inserts the `payments` row (`pending`) from the booking's quote fields. Idempotent (no-op if a payment already exists for the booking — the `unique(booking_id)` also guards this).
- **`pay_payment(p_payment_id)`** — customer-facing. Asserts caller owns the payment, current `status='pending'`, and the booking is `completed`. Sets `status='paid'`, `paid_at=now()`. Returns success/error.
- **Trigger `trg_create_earning_on_paid`** — `after update on payments`, fires only when `status` transitions into `'paid'` and the booking has a non-null `assigned_provider_id`. Inserts the `provider_earnings` row (`pending`). Idempotent via `unique(booking_id)`.
- **`override_payment_status(p_payment_id, p_status)`** — admin only. Sets any valid status (incl. `refunded`/`cancelled`); manages `paid_at` consistently.
- **`mark_payout_paid(p_earning_id)`** — admin only. Sets `payout_status='paid'`.

> Using RPCs for state changes (rather than raw table writes) keeps the client simple and prevents customers from setting their own amounts/shares — the same reasoning as the reviews slice.

### 3.5 RLS

**payments**
- `select`: `customer_id = auth.uid() OR is_admin()`. **Providers cannot see payments.**
- No direct `insert`/`update`/`delete` policies — all writes go through the security-definer RPCs/triggers above.

**provider_earnings**
- `select`: `provider_id = auth.uid() OR is_admin()`. **Customers cannot see earnings.**
- No direct write policies — created by trigger, updated by `mark_payout_paid`.

**bookings quote columns** — covered by existing booking RLS; quote-setting is admin-gated inside `set_quote`. Customer accept/decline is a narrow update (see 4) limited to flipping `quote_status` on their own booking.

---

## 4. Client Library Layer

Plain async helpers returning `{ ok, error? }` or typed rows, matching `reviews.ts` / `bookings.ts` style. All money is **KES integers**; format with the existing `formatKes` (`src/lib/currency.ts`).

### `src/lib/payments.ts`
```
type Payment = { id; booking_id; customer_id; amount; currency;
  status: 'pending'|'paid'|'refunded'|'cancelled';
  provider_share; quickserve_share; paid_at; created_at }

// customer
getMyPayments(): Payment[]                       // newest first
getPaymentForBooking(bookingId): Payment | null
payForBooking(paymentId): {ok,error?}            // → pay_payment RPC

// admin
getAllPayments(): Payment[]
overridePaymentStatus(paymentId, status): {ok,error?}
```

### `src/lib/quotes.ts` (or extend `bookings.ts`)
```
setQuote(bookingId, amount, providerShare): {ok,error?}   // admin → set_quote RPC
acceptQuote(bookingId): {ok,error?}                        // customer
declineQuote(bookingId): {ok,error?}                       // customer
```

### `src/lib/earnings.ts`
```
type ProviderEarning = { id; provider_id; booking_id; amount;
  payout_status: 'pending'|'paid'; created_at }

// provider
getMyEarnings(): ProviderEarning[]
getMyBalance(): { pending: number; paid: number }   // computed from rows

// admin
getAllEarnings(): ProviderEarning[]
getEarningsForProvider(providerId): ProviderEarning[]
markPayoutPaid(earningId): {ok,error?}
```

Each lib gets a co-located `*.test.ts` (unit tests with the existing Supabase mock pattern).

---

## 5. UI

Reuse existing components: `Card`, `Text`, `SectionHeader`, `Button`, `EmptyState`, `StatusBadge`. Add a small `PaymentStatusBadge` (or extend the existing badge mapping) for the 4 payment statuses, and a reusable `MoneyRow`/`QuoteCard` for amount displays.

### Customer
- **Payments tab** — new tab in `src/app/(customer)/_layout.tsx` + `src/app/(customer)/payments.tsx`. Lists the customer's payments (service title, amount, status badge, date). Tapping opens the related booking.
- **Quote + Pay on booking detail** — in `src/app/booking/[id].tsx`:
  - When `quote_status='sent'`: show a **QuoteCard** with the amount and **Accept / Decline** buttons (customer never sees the split).
  - When payment is `pending` and booking is `completed`: show a **Pay KES X** button → `payForBooking`.
  - Otherwise show the current payment status.

### Provider
- **Earnings section on profile** — in `src/app/provider/(tabs)/profile.tsx`: balance card showing **pending** and **paid** totals.
- **Earnings history** — `src/app/provider/earnings.tsx`: list of earnings (amount, payout status, date). Providers never see customer or QuickServe amounts beyond their own share.

### Admin
- **Payments dashboard** — `src/app/admin/payments.tsx`: all payments with amount, provider/QuickServe split, status; action to **override status**.
- **Set quote** — on `src/app/admin/booking/[id].tsx`: inputs for `quoted_amount` and `provider_share` (live-computed QuickServe share), **Send quote** action. Visible only before acceptance.
- **Provider earnings & payouts** — `src/app/admin/earnings.tsx` (or a section on the admin provider screen `src/app/admin/provider/[id].tsx`): list earnings grouped by provider with **Mark payout paid**.

---

## 6. Testing

- **Lib unit tests** for every function in `payments.ts`, `quotes.ts`, `earnings.ts` (success + error paths, balance math).
- **Component tests** for `PaymentStatusBadge`, `QuoteCard`, and the customer Pay button gating logic (only shows when `pending` + `completed`).
- **Manual SQL/RLS verification** (documented, run against Supabase): customer cannot read another customer's payment; provider cannot read payments; customer cannot read earnings; non-admin cannot call `set_quote` / `override_payment_status` / `mark_payout_paid`; payment auto-creates on accept; earning auto-creates on paid; earning does **not** create on completion alone.
- Whole suite green (`npm test`), `tsc` clean, Android bundle builds — same gate used at every prior slice merge.

---

## 7. Guardrails / Invariants

- `provider_share + quickserve_share == amount`, both ≥ 0 (DB check).
- Exactly one payment per booking; exactly one earning per booking (`unique(booking_id)`).
- Earnings only ever created via the paid-transition trigger.
- Customers never see the split; providers never see the amount or QuickServe share; providers never trigger payments or payouts.
- Quote/payment/payout state changes only through admin- or owner-gated RPCs.

---

## 8. Deliverables

1. `supabase/migrations/0010_payments.sql`
2. `src/lib/payments.ts` (+ test), `src/lib/quotes.ts` (+ test), `src/lib/earnings.ts` (+ test)
3. `PaymentStatusBadge` + `QuoteCard` components (+ tests)
4. Customer: Payments tab; quote/pay UI on booking detail
5. Provider: earnings section on profile; earnings history screen
6. Admin: payments dashboard; set-quote action; provider earnings + mark-payout screen
