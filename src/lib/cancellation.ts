// cancellation.ts — Update 74: the customer's cancel call and the admin's read of the cancellation record.
//
// The server function customer_cancel_booking (supabase/migrations/0076_customer_booking_cancellation) decides everything
// under a row lock and answers with a stable code. This module turns that answer into one of five results
// the screens handle. Nothing here retries by itself: the screen offers "Try again" with the SAME key, so
// a repeat of a request that already went through returns "already cancelled" and changes nothing.
import { supabase } from '@/lib/supabase';
import type { CancelReasonCode } from '@/constants/cancellation';

/** The server's "cannot cancel in the app" codes. */
export type CancelRefusal =
  | 'work_started'
  | 'completed'
  | 'needs_support'
  | 'payment_in_progress'
  | 'payment_recorded'
  | 'not_found'
  | 'invalid_request';

export type CancelResult =
  | { kind: 'cancelled'; providerNotified: boolean; manualProvider: boolean; paymentClosed: boolean }
  | { kind: 'already_cancelled'; by: 'you' | 'kwikserve'; sameRequest: boolean }
  | { kind: 'refused'; code: CancelRefusal }
  /** The function is missing or refused (for example the emergency off-switch): send the customer to Get help. */
  | { kind: 'unavailable' }
  /** No usable answer (connection dropped, server error): offer "Try again" with the same key. */
  | { kind: 'network' };

const REFUSALS: readonly CancelRefusal[] = [
  'work_started',
  'completed',
  'needs_support',
  'payment_in_progress',
  'payment_recorded',
  'not_found',
  'invalid_request',
];

/** Error codes that mean "this call cannot work for you now", as opposed to "the answer was lost". */
const UNAVAILABLE_CODES = new Set(['PGRST202', '42883', '42501']);

/** Reads the function's jsonb answer. Exported for tests. */
export function parseCancelAnswer(data: unknown): CancelResult {
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok === true && d.outcome === 'cancelled') {
    return {
      kind: 'cancelled',
      providerNotified: d.provider_notified === true,
      manualProvider: d.manual_provider === true,
      paymentClosed: d.payment === 'cancelled',
    };
  }
  if (d.ok === true && d.outcome === 'already_cancelled') {
    return { kind: 'already_cancelled', by: d.cancelled_by === 'you' ? 'you' : 'kwikserve', sameRequest: d.same_request === true };
  }
  if (d.ok === false && typeof d.code === 'string' && (REFUSALS as readonly string[]).includes(d.code)) {
    return { kind: 'refused', code: d.code as CancelRefusal };
  }
  return { kind: 'unavailable' };
}

/**
 * Customer: cancel one of their bookings. `idempotencyKey` must be created once per confirmation screen and
 * reused for every retry of it (src/lib/idempotency.ts).
 */
export async function cancelBooking(
  bookingId: string,
  reasonCode: CancelReasonCode | null,
  idempotencyKey: string,
): Promise<CancelResult> {
  try {
    const { data, error } = await supabase.rpc('customer_cancel_booking', {
      p_booking_id: bookingId,
      p_reason_code: reasonCode,
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      const code = (error as { code?: string }).code ?? '';
      if (UNAVAILABLE_CODES.has(code) || /not_authenticated|not_allowed|permission denied/i.test(error.message ?? '')) {
        return { kind: 'unavailable' };
      }
      return { kind: 'network' };
    }
    return parseCancelAnswer(data);
  } catch {
    return { kind: 'network' };
  }
}

/** One row of public.booking_cancellations (readable by the customer who cancelled and by active admins). */
export type BookingCancellation = {
  booking_id: string;
  cancelled_by: string;
  actor_role: 'customer';
  from_status: string;
  reason_code: string | null;
  provider_id: string | null;
  manual_provider: boolean;
  quote_status: string;
  payment_id: string | null;
  payment_status_before: 'pending' | 'cancelled' | null;
  location_cleared: boolean;
  cancelled_at: string;
};

/** Admin web: the customer's cancellation record for a booking, or null (none, or not readable). */
export async function getBookingCancellation(bookingId: string): Promise<BookingCancellation | null> {
  const { data, error } = await supabase
    .from('booking_cancellations')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (error) return null;
  return (data as BookingCancellation | null) ?? null;
}
