# M-PESA operations runbook — attempts, reconciliation, alerts

Audience: KwikServe admins/operators. Scope: M-PESA Express (STK Push) payment attempts.
Source of truth for the rules below: migrations 0036 (timeout aging), 0045 (settlement hardening
and the two reconciliation RPCs), 0046 (one-blocking-attempt invariant), 0050 (fail-closed
callback), 0053 (operational review + alert sweep). Nothing in this runbook changes those rules.

## 1. Non-negotiable rules

1. **Synchronous STK acceptance is not payment.** "ok / pending / CheckoutRequestID returned"
   means Safaricom accepted the request, nothing more.
2. **Only verified collection evidence settles a payment**: a success callback whose Amount and
   MpesaReceiptNumber parse and match the attempt, or an admin `confirm_payment_attempt` with the
   exact amount and the genuine receipt number.
3. **A missing callback, a transport timeout and a `timed_out` attempt are AMBIGUOUS, not failed.**
   The customer may or may not have been charged.
4. **An explicit failure callback (e.g. 1032 cancelled, 1038 no response) is terminal.** It never
   settles, and retry is allowed.
5. **DO NOT RETRY** (do not ask the customer to pay again, do not start a new STK) while any
   attempt for that payment is `initiated`, `pending` or `timed_out`. The database refuses it
   (`Payment has an open external attempt`); do not work around it.
6. Manual reconciliation is one-shot per attempt: a second call is rejected by the RPC. Never
   attempt to "fix" a settled payment by reconciling again; a callback that arrives after a manual
   settlement is recorded as a discrepancy, never re-settled.
7. Never infer collection from: an STK prompt being displayed, elapsed time, absence of a callback,
   or the customer's word alone.

## 2. Where to look

Admin web → **Payment attempts** (M-PESA reconciliation). The queue shows attempts that need an
operator (`Reconciliation required`, `Investigate discrepancy`); "Show all" reveals history.
Each row shows: operational state, urgency, age, whether retry is blocked, amount, attempt and
payment status, masked phone (last 3 digits — correlate with the customer's SMS), provider
references (Checkout/Merchant request IDs, ResultCode/ResultDesc, callback time), payment and
booking IDs. **Details** separates *callback evidence* (what Safaricom sent) from *operator
evidence* (what an admin recorded).

Thresholds (single source: `mpesa_ops_callback_window()` = 5 min, `mpesa_ops_stale_after()` = 60 min):

| Urgency | Meaning |
|---|---|
| Normal | younger than the callback window, or already terminal |
| Past callback window | initiated/pending for ≥ 5 min; the cron will age it to timed_out |
| Action due | timed_out or discrepancy — a human decision is needed |
| Stale (over 1 hour) | still blocking after 60 min — escalate |

Admin notifications (one per attempt per kind, never repeated): `admin_attempt_timed_out`,
`admin_attempt_discrepancy`, `admin_attempt_stale`, plus the existing `admin_payment_failed`.

## 3. Evidence standards

**Sufficient for `confirm_payment_attempt` (money DID move):** the genuine M-PESA receipt number
for this exact request (from the Safaricom business portal transaction, the customer's M-PESA SMS
cross-checked against the portal, or the statement), **and** the collected amount equals the
attempt amount exactly. The RPC also requires the booking to be completed, the payment pending,
no other blocking or successful attempt, and a unique receipt. Enter a note saying where the
receipt was verified.

**Sufficient for `reconcile_payment_attempt_no_collection` (money did NOT move):** the Safaricom
business portal shows no transaction for this request/phone/amount in the window (state that
explicitly in the note and tick the portal-checked declaration, recorded as evidence source
`portal_lookup`), **or** a Safaricom enquiry/case reference confirming no debit (recorded as
`provider_reference` with the reference). Since migration 0053 the RPC itself refuses a call
without one of these two structured sources, so a direct call with only a note cannot release a
blocking attempt. Customer assertion alone is not evidence. The payment stays pending; the
customer may retry afterwards.

**Contradictory evidence after settlement or after no-collection.** A callback that conflicts
with an already-settled attempt is recorded as a discrepancy and the attempt shows
`Investigate discrepancy` even though the payment is paid; a delayed *success* callback for an
attempt an operator closed as no-collection is settled by the callback rules (the receipt and
amount are authoritative) and flagged `late_success_from_cancelled`; if a newer attempt already
exists it is refused and flagged `sibling_attempt_exists_double_collection_risk`. In every case:
check the portal, then record your conclusion with **Mark discrepancy reviewed** (mandatory
note). The review changes nothing financial; any later discrepancy re-opens the attempt.

## 4. Situations

**Customer says money was deducted but the app shows unpaid.** Find the attempt. If a success
callback was refused you will see `Investigate discrepancy` with a type (`amount_mismatch`,
`missing_or_invalid_callback_evidence`, `settlement_reference_already_used`, ...). Check the
portal transaction for this request. If it exists with the exact attempt amount and a receipt not
yet used: **Confirm collected** with that receipt. If the portal amount differs from the attempt
amount, do not confirm; escalate (the difference must be settled outside this flow, e.g. refund).

**Attempt is timed out (`Reconciliation required`).** Wait no longer than the stale threshold.
Check the portal for a transaction matching the request. Found with exact amount → **Confirm
collected** with the receipt. Not found → **No collection** with the portal declaration. Never
retry while it is timed out.

**Callback never arrives but Safaricom accepted the request.** Same as timed out. If the portal
shows the customer *cancelled* or the request expired, that is "no collection".

**Callback says failure (1032/1038) but the customer claims a debit.** The attempt is `failed`
and terminal. Verify in the portal: a debit against *this* request cannot exist after a failure
callback; a debit with a different reference belongs to another request (check for a sibling
attempt or a manual transfer). Do not confirm the failed attempt; the RPC refuses it. If money
genuinely moved outside any attempt, handle as an off-system payment/refund case.

**Duplicate callback.** An identical repeat of a settled callback is ignored. A conflicting one
(different receipt or amount) is recorded as `conflicting_callback_after_settlement` and the
attempt shows `Investigate discrepancy`; review, then no action if the original settlement is
correct.

**Amount mismatch.** The callback's Amount differed from the attempt amount. Nothing settled.
Check the portal: if the customer paid a different amount, escalate for refund/top-up handling;
do not confirm an amount that does not equal the attempt amount (the RPC rejects it anyway).

**Safaricom reference is available (portal/SMS).** Use it as the transaction reference in
**Confirm collected**. It must be the receipt for this request; a reused receipt is rejected.

**No collection can be conclusively proven.** Only then use **No collection** with the portal
declaration or case reference. If evidence conflicts (SMS says paid, portal shows nothing),
leave the attempt blocking and escalate; do not resolve.

## 5. Kill switch

Set `MPESA_MODE=mock` on the Production Edge secrets to stop initiating live STK requests.
Callbacks for already-sent requests are still processed (the callback function does not read
`MPESA_MODE`).

## 6. Unmatched / orphan callback procedure (migration 0054)

Since 0054, every callback that passes the callback-token check but cannot be applied to an
attempt is stored as **evidence** in `mpesa_callback_events` and shown on the Payment attempts
page under **Unmatched M-PESA callback evidence**, with one admin alert per new piece of
evidence (`admin_mpesa_orphan_callback`). Classifications: `unknown_checkout_request_id`
(no attempt carries that id — including a callback that arrived before the attempt's id was
saved), `missing_checkout_request_id`, `malformed_authenticated_callback` (valid JSON that is
not a Daraja callback, **or** bytes that are not JSON at all — those are kept only as a SHA-256
of the raw bytes, with no fields). Identical redeliveries only increase the delivery count; a
callback with the same CheckoutRequestID but different content is a second row and its own
alert. "Identical" means the same JSON value: object-key order and whitespace do not matter;
a different number, a different string, or a re-ordered array counts as different evidence (a
conservative second row, never a lost one). The raw body and full phone are never stored; the
phone shows as its last three digits. Unauthenticated traffic creates nothing. The callback is
acknowledged to Safaricom only after the evidence row is written; if the alert itself fails
(for example the push fan-out), the evidence row still stands and simply appears in the queue
without a notification — so check the page, not only your notifications.

**These records never settle anything.** There is no confirm/settle control on an orphan.

- **Never retry** an STK request because of an orphan, and never match an orphan to a payment
  from phone or amount alone. The only acceptable link is an exact CheckoutRequestID.
- **Unknown success (ResultCode 0 with amount/receipt, shown as High urgency):** money may have
  moved. Search the attempts (Show all) for that exact CheckoutRequestID; the page also shows
  "Exact attempt match" automatically when one exists. Check the Safaricom business portal for
  the receipt. If an attempt matches and the portal confirms the receipt and the exact attempt
  amount, resolve it through that attempt's **Confirm collected** workflow with the receipt. If no
  attempt matches, do not create one and do not confirm anything; escalate with the portal
  evidence.
- **Unknown failure (non-zero code):** no money moved for that request. Record the review with
  the portal result. If an exact attempt match appears later, that attempt is handled by its own
  callback/reconciliation rules; the orphan record stays as history.
- **Missing / malformed:** record what the portal shows for the time window; escalate if a
  transaction exists that QuickServe cannot correlate.
- **`reconcile_payment_attempt_no_collection`** applies to an *attempt*, never to an orphan, and
  only when the portal shows no transaction for that attempt's request.
- **Mark evidence reviewed** (mandatory note) records who examined it and what was concluded; it
  changes no payment, attempt or evidence. A new conflicting callback re-raises attention on its
  own.
- **Receipt number.** The page shows only whether a receipt was recorded. The number itself is
  retained as financial evidence and is available to an admin through the
  `admin_mpesa_callback_events()` read model (admin session only; it is never in notifications
  or logs). Prefer the Safaricom business portal — search by the CheckoutRequestID or the time
  window — as the authoritative source; use the stored number only to cross-check the portal.
- **Escalate rather than act** whenever portal evidence and callback evidence disagree, or when a
  success-like callback has no exact attempt match.

## 7. Not yet available

- STK Push **Query** (`/mpesa/stkpushquery/v1/query`) is not implemented. Operators must use
  the Safaricom business portal for disambiguation. If added later it must feed the same
  evidence checks as the callback path and never settle on its own.
