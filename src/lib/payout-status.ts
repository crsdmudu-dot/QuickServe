/**
 * Payout status presentation — derived from the ledger AMOUNTS, never from the stored label.
 *
 * Why this exists: `provider_earnings.payout_status` is a stored projection maintained only by
 * the payout RPCs. Two shapes leave it stale at 'pending' although nothing is owed:
 *   - a zero-share earning (provider_share 0 → amount 0) is inserted with the column default;
 *   - before migration 0051, a fully-deducted earning derived 'pending' because nothing had been
 *     disbursed, even though net payable was 0.
 * Every screen that shows a payout status must go through `resolvePayoutStatus` so a KES 0
 * liability is never presented as money awaiting payout. This mirrors the 0051 SQL derivation.
 *
 * This module deliberately has no Supabase import so screen tests that mock '@/lib/earnings'
 * keep the real resolver.
 */
import type { PayoutStatus } from '@/lib/earnings';

/** The subset of a provider_payout_ledger row the resolver needs. */
export interface PayoutAmounts {
  amount_disbursed: number;
  outstanding_provider_liability: number;
}

/**
 * Settled ('paid') when the outstanding liability is exactly zero — including a zero-value
 * earning and an earning whose deductions consumed the whole entitlement. Otherwise 'pending'
 * until the first payout and 'partially_paid' after one, exactly as `_provider_earning_state`
 * derives it.
 *
 * Exactly zero, never "<= 0": the RPCs make a negative liability impossible (deductions never
 * exceed entitlement, net never falls below what was disbursed, payouts never exceed the
 * outstanding amount, all under a row lock). A negative value can therefore only be corrupt
 * data and must stay visible as an anomaly rather than vanish behind a "paid" label.
 */
export function resolvePayoutStatus(row: PayoutAmounts): PayoutStatus {
  const outstanding = Number(row.outstanding_provider_liability);
  const disbursed = Number(row.amount_disbursed);
  if (outstanding === 0) return 'paid';
  if (disbursed === 0) return 'pending';
  return 'partially_paid';
}

/** True only when real money is still owed to the provider on this earning. */
export function isAwaitingPayout(row: PayoutAmounts): boolean {
  return resolvePayoutStatus(row) !== 'paid';
}
