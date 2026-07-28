# Phase 2B — Payments DB-State Integrity Report

> Connected certification of the **existing** payment database-state lifecycle in
> **mock mode** — no real money, no Daraja/M-Pesa, no edge function, no secret, no
> schema change. Results observed 2026-07-28 against the dedicated, non-production QA
> project. No secrets or account identifiers appear here.

## 1. Executive Summary

**17 new connected tests** were added for the payment DB-state lifecycle, raising the
connected certification suite **48 → 65**, all passing serially with deterministic
cleanup (**0 residual** payment/booking rows verified). The tests drive the **real**
payment RPCs and RLS of the QA project — quote → payment creation, attempt initiation,
admin confirmation (success), cancellation (failure), status override, authorization,
amount/referential integrity, idempotency, and the callback's DB idempotency — **without
moving any money**. No product defect was found; no migration or feature was added.

**This certifies mock-mode DB-state only.** Real M-Pesa sandbox initiation, the
secret-gated `mpesa-callback` edge, actual external settlement, and refunds/reversals are
**explicitly NOT certified** here. **Full Platform Certification is not claimed.**

## 2. Starting Baseline

| Item | Value |
|---|---|
| Branch | `qa/phase-2b-payments-db-state` |
| Pre-work main | `73a9ae56d0e72da65b3971cd70dac13b773c9154` |
| Node / npm | v24.14.1 / 11.11.0 |
| Playwright / supabase-js | 1.61.1 / 2.108.2 |
| Connected certification (before) | 48 |
| Payment env vars (by name) | `MPESA_MODE`, `MPESA_CALLBACK_SECRET`, `DARAJA_*` — **none set in `qa/.env`** (no callback secret) |

## 3. Existing Payment Architecture

All payment writes go through **SECURITY DEFINER RPCs** (no direct table-write RLS);
reads are RLS-scoped. Verified from migrations `0010`–`0012`:

- **`payments`** — `booking_id UNIQUE` (one per booking), `customer_id`, `amount`,
  `currency` (default `KES`), `status` ∈ `{pending,paid,refunded,cancelled}`,
  `provider_share`, `quickserve_share`, `payment_method`; constraint
  **`provider_share + quickserve_share = amount`**. RLS select: customer own / admin.
- **`provider_earnings`** — `booking_id UNIQUE`, `provider_id`, `amount`, `payout_status`.
  RLS select: provider own / admin.
- **`payment_attempts`** — `payment_id` FK, `provider` ∈ `{mpesa,card,cash}`, `amount`,
  `status` ∈ `{initiated,pending,successful,failed,cancelled}`, Daraja columns; **no unique
  on `payment_id`** (retries allowed). RLS select: admin / owning customer.
- **RPCs:** `set_quote` (admin), `accept_quote`/`decline_quote` (customer-own),
  `initiate_payment_attempt` (customer-own; server-derived amount), `confirm_payment_attempt`
  /`cancel_payment_attempt` (admin), `override_payment_status` (admin; validates status),
  `mark_payout_paid` (admin), and **`apply_mpesa_callback`** (service-role-only; idempotent).
- **Triggers:** `trg_create_payment_on_accept` (payment on quote accept, `ON CONFLICT
  booking_id DO NOTHING`), `trg_create_earning_on_paid` (earning when payment paid).
- **App path:** production initiation goes through the `mpesa-stk-push` edge (mock/real) and
  settlement through the `mpesa-callback` edge → `apply_mpesa_callback`. This phase drives the
  same underlying DB logic directly (RPCs + the callback's service-role DB path).

## 4. Payment Lifecycle Verified

`booking → assign provider → provider completes → admin set_quote (status 'sent') → customer
accept_quote → payments row (pending) → customer initiate_payment_attempt (attempt pending) →
admin confirm_payment_attempt OR apply_mpesa_callback(result 0) → payment paid + provider
earning`. Failure branches: `cancel_payment_attempt` / `apply_mpesa_callback(result≠0)` → attempt
terminal, payment stays pending. All exercised connected, mock mode.

### Internal coverage matrix (implemented → covered)

| Operation | Authorized actor | Transition | Persisted | Constraint | New connected coverage |
|---|---|---|---|---|---|
| set_quote | admin | booking→quote 'sent' | bookings quote fields | amount≥0, share∈[0,amount] | ✅ + negative + authz |
| accept_quote | customer (own) | 'sent'→'accepted' | payments (pending) | one-per-booking | ✅ + non-owner + re-accept |
| initiate_payment_attempt | customer (own) | attempt 'pending' | payment_attempts | pending + booking completed; server amount | ✅ + cross-user + bad id + non-pending |
| confirm_payment_attempt | admin | payment→'paid' | earnings | idempotent (where pending) | ✅ + customer-denied + re-confirm |
| cancel_payment_attempt | admin | attempt→'cancelled' | — | terminal guard | ✅ |
| override_payment_status | admin | status set | payments | status allowlist | ✅ + invalid + customer-denied |
| apply_mpesa_callback | service (callback) | settle/fail | payments/attempts/earnings | idempotent, terminal guard | ✅ success replay + failure |
| RLS select | customer/provider/admin | — | — | tenant isolation | ✅ payments + earnings + anon |

## 5. Connected Coverage Added

17 tests in `qa/playwright/certification/payments.spec.ts` (helper
`qa/playwright/support/connected/qa-payments.ts`): creation/shares, amount-integrity,
set_quote authz, quote idempotency, initiation (+cross-user, +bad-ref, +non-pending),
success transition + earning, confirm authz, re-confirm idempotency, cancel/terminal,
invalid-status override, override authz, RLS, and two callback-DB tests. Existing helpers
(`qa-client`, `qa-bookings`, `qa-accounts`) reused; no existing test modified.

## 6. Authorization and RLS Coverage

- **Denied to non-admin:** `set_quote`, `confirm_payment_attempt`, `override_payment_status`
  (each → "Permission denied").
- **Customer-own only:** `accept_quote` (non-owner denied); `initiate_payment_attempt`
  (cross-user → "Permission denied").
- **RLS reads:** customer sees only their own payment; a non-assigned provider and anon see
  **none**; admin sees all. Provider earnings visible only to the assigned provider and admin
  (customer/other provider/anon see none). All asserted with role/anon tokens (never service role).

## 7. Amount and Referential Integrity

- **Server-controlled amount:** `initiate_payment_attempt` persists the **payment's** amount
  (no client amount parameter exists to alter); asserted equal to the payment amount.
- **`set_quote` validation:** negative amount → rejected; `provider_share > amount` → rejected.
- **Shares constraint:** created payment satisfies `provider_share + quickserve_share = amount`.
- **Referential:** initiating against an unknown `payment_id` → "Payment not found".

## 8. Idempotency and Duplicate Handling

- **One payment per booking:** `accept_quote` only from 'sent'; re-accept rejected; exactly one
  `payments` row (`ON CONFLICT booking_id DO NOTHING`).
- **Duplicate success:** re-confirming a successful (terminal) attempt is rejected; payment stays
  paid; exactly **one** earning.
- **Callback replay:** `apply_mpesa_callback(result 0)` twice → settles once, **no duplicate
  earning** (terminal-state guard).

## 9. Success and Failure State Transitions

- **Success:** `confirm_payment_attempt` → attempt 'successful', payment 'paid' + `paid_at` +
  `payment_method='mpesa'`, and a `provider_earnings` row (amount = provider_share, payout
  'pending').
- **Failure:** `cancel_payment_attempt` → attempt 'cancelled', payment **stays pending** (never
  falsely paid); re-cancel hits the terminal-state guard. A failed callback marks the attempt
  'failed' and never marks the payment paid (no earning).
- **Invalid:** `override_payment_status` rejects unsupported status values.

## 10. Callback-Related Coverage

Covered via the **service-role-only `apply_mpesa_callback`** RPC — the callback's real DB path
(execute is revoked from `anon`/`authenticated`; the secret-gated `mpesa-callback` **edge is NOT
invoked** because no `MPESA_CALLBACK_SECRET` is present in QA). Verified: success settlement,
**idempotent replay**, and failure handling. **Real external callback delivery and signature
verification are NOT certified.**

## 11. Cleanup and Residual Data

Every created booking is tracked and deleted in `afterAll`; `payments`, `payment_attempts`, and
`provider_earnings` all `ON DELETE CASCADE` from the booking, so teardown is complete. Verified
after the full certification run: **0 residual QA-CERT bookings, 0 residual qa-p2b payment
attempts.**

## 12. Files Changed

| File | Type |
|---|---|
| `qa/playwright/certification/payments.spec.ts` | new — 17 connected tests |
| `qa/playwright/support/connected/qa-payments.ts` | new — payment RPC/read/setup helpers |
| `docs/qa/PHASE-2B-PAYMENTS-DB-STATE-REPORT.md` | new — this report |

No `src/`, `supabase/`, migrations, existing tests, QA scripts, configuration, or deployment
files changed. No new dependency.

## 13. Validation Matrix

| Command | Status | Exit | Result |
|---|---|---|---|
| Payments spec alone (serial) | **Pass** | 0 | 17/17 (~57 s) |
| Full connected certification (serial) | **Pass** | 0 | **65/65** (48 + 17), ~2.4 m; 0 residual |
| Root Jest | **Pass** | 0 | 220/220, 2943/2943 |
| Website Vitest | **Pass** | 0 | 7 files, 102 tests |
| TypeScript (root) | **Pass** | 0 | 0 errors |
| TypeScript (qa) | **Pass** | 0 | 0 errors |
| Lint | **Deterministic; unchanged** | 1 | 489 pre-existing (qa/ ignored; no new findings) |
| Health | **Pass** | 0 | 19/19 |
| `qa:release` | **Pass** | 0 | 460s: jest 2943 → tsc 0 → web+android exports → serial cert **65/65** → non-cert browsers 130 passed / 56 skipped / 0 failed; 2 deterministic teardowns |
| Deterministic cleanup / residual | **Clean** | — | 0 residual bookings / attempts |

## 14. Defects or Limitations Found

**No product defect found.** Limitations (environment / by-design, not defects):

- The **secret-gated `mpesa-callback` edge** is not exercisable (no QA `MPESA_CALLBACK_SECRET`);
  its DB idempotency is covered via `apply_mpesa_callback` instead.
- **Real M-Pesa sandbox settlement** requires Daraja creds + `MPESA_MODE=sandbox` — not run.
- **Refunds/reversals** are record-only in the product (no automated money reversal); nothing to
  certify beyond the `refunded` status transition (covered by override validation).

## 15. Remaining Payment Gaps

- Real M-Pesa **sandbox** STK-push initiation (`mpesa-stk-push` edge, mock/real) end-to-end.
- Real **callback** signature verification + delivery (secret-gated edge).
- Actual external **settlement** and reconciliation.
- Refund/reversal **money movement** (not implemented).
- `mark_payout_paid` payout flow beyond the DB flag (no real disbursement).

## 16. Pilot-Readiness Impact

The **payments DB-state safety** gate (Phase 2A §17) moves from *Not yet* → **Met for a limited
internal pilot in mock mode**: creation, authorization, integrity, idempotency, and success/
failure transitions are certified without real money. **External-pilot** payment gates
(real sandbox settlement + real callback) remain **Not met** (blocked on Daraja creds + callback
secret). No settlement claim is made.

## 17. Recommended Phase 2C Scope

Per the Phase 2A sequence, **Phase 2C — Reviews & Ratings (connected)**: eligibility (customer of
a completed booking), one-review-per-booking, role enforcement, rating bounds + tag allowlist,
provider-rating aggregation, private-feedback ownership. Highest readiness, deterministic, no
external dependency. (Chat and provider-location authorization follow as 2D/2E.)

## 18. Final Status

Connected certification **65/65** (payments DB-state added), release gate green, **0 residual**.
Mock-mode payment DB-state integrity is certified; **real settlement, real callback, and
refunds are not**. No migration or feature was introduced, **no real payment was triggered**, and
**Full Platform Certification is not claimed**.
