// quotes.ts — Supabase helpers for reading and responding to booking quotes.
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

export type QuoteStatus = 'pending' | 'sent' | 'accepted' | 'declined';

/** The quote fields a customer is allowed to see on a booking. */
export type BookingQuote = {
  quoted_amount: number | null;
  quote_status: QuoteStatus;
};

// ── Mutations ──────────────────────────────────────────────────────────────

/** Admin: set or replace the quote on a booking via the set_quote RPC. */
export async function setBookingQuote(
  bookingId: string,
  amount: number,
  providerShare: number,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('set_quote', {
    p_booking_id: bookingId,
    p_amount: amount,
    p_provider_share: providerShare,
  });
  if (error) return { ok: false, error: 'Could not send quote. Please try again.' };
  return { ok: true };
}

/** Customer: accept a sent quote. The DB trigger creates the payment row. */
export async function acceptQuote(
  bookingId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('accept_quote', {
    p_booking_id: bookingId,
  });
  if (error) return { ok: false, error: 'Could not accept quote. Please try again.' };
  return { ok: true };
}

/** Customer: decline a sent quote. */
export async function declineQuote(
  bookingId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('decline_quote', {
    p_booking_id: bookingId,
  });
  if (error) return { ok: false, error: 'Could not decline quote. Please try again.' };
  return { ok: true };
}

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * Returns the quote amount and status for a booking.
 * NOTE: provider_share is intentionally excluded — customers must never see the split.
 */
export async function getQuoteForBooking(bookingId: string): Promise<BookingQuote | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('quoted_amount, quote_status')
    .eq('id', bookingId)
    .maybeSingle();
  if (error) return null;
  return data ?? null;
}
