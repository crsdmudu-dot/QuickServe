// cancellation-rules.ts — Update 74: pure rules for in-app cancellation (no network, no Supabase client).
//
// These only decide what the app SHOWS (Cancel booking, Get help, or nothing) and which consequence lines
// apply. The server function customer_cancel_booking decides for real, under a row lock, and can refuse
// even when this says "cancel" (for example when the provider starts work at the same moment).
import type { BookingStatus } from '@/constants/booking-status';
import { CANCELLABLE_STATUSES, SHOW_NO_FEE_LINE } from '@/constants/cancellation';
import {
  CQ_MANUAL_PROVIDER,
  CQ_MANUAL_TRAVELLING,
  CQ_NO_FEE,
  CQ_NO_PROVIDER,
  CQ_NOTHING_TO_PAY,
  CQ_PROVIDER,
  CQ_QUOTE,
  CQ_REBOOK,
  CQ_TRAVELLING,
} from '@/constants/cancellation-copy';

/** The booking fields these rules read. */
export type CancelBooking = {
  id: string;
  status: BookingStatus;
  assigned_provider_id: string | null;
  assigned_provider_name: string | null;
  quote_status?: string | null;
};
/** The payment fields these rules read (null when the booking has no payment row). */
export type CancelPayment = {
  status: string;
  wallet_applied?: number | null;
  promo_discount?: number | null;
  promo_code_id?: string | null;
} | null;
/** The attempt fields these rules read. */
export type CancelAttempt = { status: string };

/** What the booking screen offers. */
export type CancelOption = 'cancel' | 'help' | 'none';

/** Why the customer is sent to Get help (chooses the help screen's text). */
export type HelpSituation = 'work_started' | 'completed' | 'money' | 'general';

/** Attempt states that may still collect money, or already did (the server uses the same set). */
const OPEN_OR_COLLECTED: readonly string[] = ['initiated', 'pending', 'timed_out', 'successful'];

/**
 * A provider recorded only by name, with no app account on the booking (manual dispatch). Such bookings have
 * the same eligibility as any other (owner decision 2026-10-03, item 3); this only changes who tells the
 * provider (an admin phones them) and so the confirmation wording.
 */
export function isManualDispatch(b: Pick<CancelBooking, 'assigned_provider_id' | 'assigned_provider_name'>): boolean {
  return b.assigned_provider_id == null && (b.assigned_provider_name ?? '').trim() !== '';
}

/** The server's refusal codes that the app can foresee from what it has loaded. */
export type ExpectedRefusal = 'work_started' | 'completed' | 'needs_support' | 'payment_in_progress' | 'payment_recorded';

function moneyApplied(payment: NonNullable<CancelPayment>): boolean {
  return (payment.wallet_applied ?? 0) > 0 || (payment.promo_discount ?? 0) > 0 || payment.promo_code_id != null;
}

/**
 * The code customer_cancel_booking would answer, in the same order as the server checks, or null when the
 * app expects the server to cancel (a cancelled booking returns null too: nothing to refuse).
 */
export function expectedRefusal(
  b: CancelBooking,
  payment: CancelPayment,
  attempts: readonly CancelAttempt[],
): ExpectedRefusal | null {
  if (b.status === 'cancelled') return null;
  if (b.status === 'in_progress') return 'work_started';
  if (b.status === 'completed') return 'completed';
  if (!CANCELLABLE_STATUSES.includes(b.status)) return 'needs_support';
  if (payment) {
    if (payment.status === 'paid' || payment.status === 'refunded') return 'payment_recorded';
    if (payment.status === 'pending') {
      if (attempts.some((a) => OPEN_OR_COLLECTED.includes(a.status))) return 'payment_in_progress';
      if (moneyApplied(payment)) return 'needs_support';
    }
  }
  return null;
}

/**
 * Why the customer should use Get help instead of Cancel booking (it chooses the help screen's text), or
 * null when the app expects the server to accept a cancellation, or the booking is already cancelled.
 */
export function helpSituation(
  b: CancelBooking,
  payment: CancelPayment,
  attempts: readonly CancelAttempt[],
): HelpSituation | null {
  const code = expectedRefusal(b, payment, attempts);
  if (code === null) return null;
  if (code === 'work_started' || code === 'completed') return code;
  if (code === 'payment_recorded' || code === 'payment_in_progress') return 'money';
  if (payment && payment.status === 'pending' && moneyApplied(payment)) return 'money';
  return 'general';
}

/** What the booking screen offers for this booking. */
export function cancellationOption(
  b: CancelBooking,
  payment: CancelPayment,
  attempts: readonly CancelAttempt[],
): CancelOption {
  if (b.status === 'cancelled') return 'none';
  return helpSituation(b, payment, attempts) === null ? 'cancel' : 'help';
}

/** The booking reference shown to the customer: the Receipt's format, "#" and 8 characters. */
export function bookingReference(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

/** The consequence lines of the confirmation screen, in order, for this booking (DRAFT texts). */
export function consequenceLines(b: CancelBooking, providerName: string | null): string[] {
  const lines: string[] = [];
  const hasInAppProvider = b.assigned_provider_id != null;
  if (isManualDispatch(b)) {
    // An admin phones a manually dispatched provider, so no "straight away" or "in the app" here.
    const name = providerName ?? b.assigned_provider_name;
    lines.push(b.status === 'on_the_way' ? CQ_MANUAL_TRAVELLING(name) : CQ_MANUAL_PROVIDER(name));
  } else if (!hasInAppProvider) lines.push(CQ_NO_PROVIDER);
  else if (b.status === 'on_the_way') lines.push(CQ_TRAVELLING(providerName));
  else lines.push(CQ_PROVIDER(providerName));
  if (b.quote_status === 'sent' || b.quote_status === 'accepted') lines.push(CQ_QUOTE);
  lines.push(CQ_NOTHING_TO_PAY);
  if (SHOW_NO_FEE_LINE) lines.push(CQ_NO_FEE);
  lines.push(CQ_REBOOK);
  return lines;
}
