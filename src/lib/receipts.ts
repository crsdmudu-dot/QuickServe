// receipts.ts — PURE display-only receipt builder.
// No I/O, no network, no mutation, no Supabase import.
// Composes entirely from existing Payment fields — never fabricates data.
// Never throws — deterministic for any input including null payment.

import type { Payment } from '@/lib/payments';
import { amountDue } from '@/lib/wallet';

// ── Types ──────────────────────────────────────────────────────────────────

/** A single line-item on a receipt. */
export type ReceiptLine = { label: string; amount: number };

/**
 * A fully composed receipt for display.
 * `feesTaxes` is OMITTED — the Payment type has no fee/tax fields.
 * `canDownloadReceipt` is a future-ready placeholder.
 */
export type Receipt = {
  currency: string;
  status: Payment['status'] | null;
  method: Payment['payment_method'];
  paidAt: string | null;
  lines: ReceiptLine[];
  subtotal: number;
  walletApplied: number;
  promoDiscount: number;
  amountDue: number;
  /** Omitted when the payment has no fee/tax fields (currently always absent). */
  feesTaxes?: number;
  total: number;
  bookingId?: string;
  serviceId?: string;
};

// ── Placeholder ────────────────────────────────────────────────────────────

/**
 * Future-ready placeholder — download/share of receipts is not yet implemented.
 * Set to `false` so UIs can gate the download affordance with `canDownloadReceipt`.
 */
export const canDownloadReceipt = false;

// ── Builder ────────────────────────────────────────────────────────────────

/**
 * Builds a display receipt from a booking and payment.
 * PURE — no network, no mutation, never throws.
 *
 * Math:
 *   total         = payment.amount (the raw charged amount)
 *   walletApplied = payment.wallet_applied ?? 0
 *   promoDiscount = payment.promo_discount ?? 0
 *   subtotal      = total + walletApplied + promoDiscount  (pre-discount price)
 *   amountDue     = max(0, total - walletApplied - promoDiscount)
 *
 * Lines: Subtotal always shown; Wallet credit shown when > 0; Promo discount shown when > 0; Total always shown.
 * feesTaxes: OMITTED — no fee/tax field exists on the Payment type.
 * paidAt: mapped from payment.paid_at (the actual paid timestamp, nullable).
 */
export function buildReceipt(input: {
  booking?: { id?: string; service_id?: string } | null;
  payment: Payment | null;
}): Receipt {
  const { booking, payment } = input;

  const total         = payment?.amount ?? 0;
  const walletApplied = payment?.wallet_applied ?? 0;
  const promoDiscount = payment?.promo_discount ?? 0;
  const subtotal      = total + walletApplied + promoDiscount;
  const due           = amountDue({ amount: total, wallet_applied: walletApplied, promo_discount: promoDiscount });

  // Build line items
  const lines: ReceiptLine[] = [];
  lines.push({ label: 'Subtotal', amount: subtotal });
  if (walletApplied > 0) {
    lines.push({ label: 'Wallet credit', amount: -walletApplied });
  }
  if (promoDiscount > 0) {
    lines.push({ label: 'Promo discount', amount: -promoDiscount });
  }
  lines.push({ label: 'Total', amount: total });

  const receipt: Receipt = {
    currency:      'KES',
    status:        payment?.status ?? null,
    method:        payment?.payment_method ?? null,
    // Use paid_at when present (it exists on the Payment type); fallback to created_at
    paidAt:        payment?.paid_at ?? payment?.created_at ?? null,
    lines,
    subtotal,
    walletApplied,
    promoDiscount,
    amountDue:     due,
    total,
  };

  if (booking?.id)         receipt.bookingId  = booking.id;
  if (booking?.service_id) receipt.serviceId  = booking.service_id;

  // feesTaxes intentionally omitted — Payment type has no fee/tax fields

  return receipt;
}
