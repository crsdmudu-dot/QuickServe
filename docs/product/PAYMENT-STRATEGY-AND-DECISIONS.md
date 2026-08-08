# Payment Strategy & Product Decisions

> **Purpose:** capture the payment product decisions that emerged from the Phase 4A/4B
> readiness work and the first full manual test pass (Aug 2026). This is a **decisions +
> backlog** record — no code was changed by this document. Distinguishes *implemented* from
> *decided/planned*.

## 1. Context

The first end‑to‑end manual test (customer → assign → provider progression → review → quote)
passed on the QA sandbox. Testing surfaced how payment currently works and where the gaps are,
which prompted the decisions below.

## 2. Current state (as‑built)

- **Quote → accept → payment row.** Admin sends a quote (`quoted_amount`); customer accepts;
  a DB trigger (`create_payment_on_accept`, migration `0010`) creates a `payments` row with
  `status = pending`. *(Verified in QA: one pending payment of KES 3,000 after acceptance.)*
- **Pay‑on‑completion.** The "Pay" UI appears only when `payment.status === 'pending' &&
  booking.status === 'completed'` (`src/app/booking/[id].tsx`). So the customer settles at the
  end of the service.
- **Methods:** **M‑Pesa STK Push** (`initiateMpesaPayment` → `mpesa-stk-push` Edge Function)
  and **Wallet credit**. No card support.
- **Gaps (confirmed):**
  - **No payment enforcement** — the provider can mark a job **Completed** whether or not the
    customer pays; a customer can simply never pay. (Provider‑walk‑away / revenue‑leakage risk.)
  - **No refund / reversal flow** anywhere.
  - **M‑Pesa is mock‑only** (`MPESA_MODE=mock`) and the Edge Functions are **not deployed** on
    QA — so real/mock payment can't be exercised in the sandbox today.

## 3. Decisions

### Decision 1 — Keep **pay‑on‑completion** as the customer‑facing default ✅
For a new home‑services brand, settling *after* the service maximizes trust and booking
conversion; customers dislike pre‑paying an unknown provider. **Keep the experience** — but add
enforcement (Decision 2).

### Decision 2 — **Customer Payment Authorization** (STRATEGIC RECOMMENDATION — required before public launch) ⭐
*Adopted product direction.* Instead of merely *allowing* payment after completion, the
customer **authorizes a payment method at booking time** (not necessarily charged then), and
collection happens automatically at the end. Target flow:

1. Customer **books** the service.
2. Customer **authorizes payment** — an **M‑Pesa mandate** (where supported) **or** a **saved
   card** (pre‑authorization/hold). No immediate charge.
3. Provider **completes** the work.
4. Customer **confirms completion** — **or** a confirmation **timeout expires** (auto‑release).
5. Payment is **collected automatically** from the authorized method.

**Why:** preserves the customer‑friendly pay‑on‑completion feel *and* dramatically reduces the
risk of providers finishing jobs unpaid. This is the escrow / hold‑and‑release pattern used by
mature marketplaces (rides, deliveries, home services).

### Decision 3 — Add **Card payments** (auto‑charge, holds, refunds) ✅
The enforcement mechanism for Decision 2. A **card‑on‑file captured at booking → auto‑charged
on completion** guarantees collection, and cards natively support **pre‑authorization holds**
and **clean refunds** (which M‑Pesa does not). Integrate a processor
(**Stripe / Flutterwave / Paystack / DPO**) with card **tokenization** (PCI handled by the
processor). **Add alongside M‑Pesa, not instead of it** (card penetration in Kenya is lower
than M‑Pesa). Net‑new: no card support or refund flow exists today.

### Decision 4 — **Subscription ("QuickServe Plus")** — later growth play 🕒
Monthly membership for perks (service discounts, priority dispatch, N free cleanings, free
delivery) → recurring revenue + retention/LTV. **Depends on recurring rails first** (card
recurring via a PSP, or **M‑Pesa Ratiba** standing orders). Phase‑2 monetization, **not** a
launch blocker.

## 4. Technical considerations & honest caveats

- **M‑Pesa has no card‑style pre‑auth hold.** True *authorize‑now / capture‑later* is a **card**
  capability. For M‑Pesa the practical "authorization" options are: (a) **M‑Pesa Ratiba**
  (a recurring mandate the customer approves once, then debited per mandate rules); (b) a small
  **refundable deposit** at booking; or (c) fall back to **STK‑push on confirmation** (charge at
  completion, no pre‑guarantee). So Decision 2's "M‑Pesa mandate where supported" ≈ Ratiba/deposit;
  full pre‑auth is card‑only.
- **Confirmation window + disputes.** Needs an explicit **timeout** (e.g., 24–48 h) for
  auto‑capture, a **dispute window**, and a **dispute/refund path** (customer says "not done" →
  hold funds, escalate to Ops). Ties to the operations portal.
- **Refunds/reversals** must be built for both rails (card refund via PSP; M‑Pesa reversal is
  manual/limited).
- **PCI/tokenization** handled by the processor; never store PANs. **Service‑role stays
  server‑side** (already enforced). Callback/webhook secrets already validated in code.
- **Edge Functions** for payments must be **deployed** to each environment (currently absent on
  QA) with the correct secrets.

## 5. Backlog & sequencing (maps to the deployment phases)

1. **4C — Deploy Edge Functions** (incl. M‑Pesa) to the provisioned environments.
2. **4D — M‑Pesa sandbox → live certification** (STK, callback, reconciliation, **refunds**).
3. **4D.1 — Payment Authorization (Decision 2)** ← *pre‑public‑launch gate*: PSP card
   integration (pre‑auth/capture/void/refund) + M‑Pesa mandate/deposit + confirm‑or‑timeout
   auto‑collect + dispute handling.
4. **Later — Subscriptions ("QuickServe Plus")** once recurring rails exist.

## 6. Open decisions (need product/owner input)

- **Which processor** (Stripe / Flutterwave / Paystack / DPO) — Kenya support, single M‑Pesa+card
  rail, fees, payout timing.
- **Authorization strength for M‑Pesa** — Ratiba mandate vs refundable deposit vs charge‑on‑confirm.
- **Confirmation timeout length** and **dispute policy**.
- **Refund policy** (window, who approves, partial refunds).
- Whether authorization is **mandatory** for all bookings or only above a value threshold.

## 7. Status

- **Implemented:** pay‑on‑completion (M‑Pesa mock + wallet), quote→accept→pending‑payment.
- **Decided:** keep pay‑on‑completion; adopt **Customer Payment Authorization**; add card
  auto‑charge; subscriptions later.
- **Not built / not certified:** card payments, refunds, payment authorization/hold, real
  M‑Pesa, subscriptions.
- **Full Platform Certification is NOT claimed.**

This document records decisions only; it changes no runtime behavior.
