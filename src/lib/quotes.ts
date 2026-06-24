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

// ── Pure helpers ───────────────────────────────────────────────────────────

/** QuickServe's cut for a quote: amount minus the provider's share. */
export function computeQuickServeShare(amount: number, providerShare: number): number {
  return amount - providerShare;
}

/** Returns an error message if a quote input is invalid, else null. */
export function validateQuoteInput(amount: number, providerShare: number): string | null {
  if (Number.isNaN(amount) || amount < 0) return 'Enter a valid amount.';
  if (Number.isNaN(providerShare) || providerShare < 0) return 'Enter a valid provider share.';
  if (providerShare > amount) return 'Provider share cannot exceed the amount.';
  return null;
}

/** Admin may set/replace a quote only before the customer has acted on it. */
export function canEditQuote(status: QuoteStatus): boolean {
  return status === 'pending' || status === 'sent';
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
