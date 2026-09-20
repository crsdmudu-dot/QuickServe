// quotes-admin.ts — admin-only quote mutation, split out of the shared @/lib/quotes module.
//
// Setting a quote is an administrator action (the set_quote RPC raises unless is_admin()), so the
// wrapper lives with the admin application and is no longer compiled into the consumer bundle.
// Customer-facing quote reads and accept/decline stay in @/lib/quotes and are imported from there.
import { supabase } from '@/lib/supabase';

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
