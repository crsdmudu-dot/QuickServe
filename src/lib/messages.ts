// messages.ts — Supabase helpers for in-app chat on bookings.
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

/** A row from the booking_messages table. */
export type BookingMessage = {
  id: string;
  booking_id: string;
  sender_id: string;
  message_text: string;
  created_at: string;
  read_at: string | null;
};

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * Returns all messages for a booking in oldest-first (chat) order.
 * Participant or admin; RLS scopes which rows are visible.
 * Returns [] on error.
 */
export async function getBookingMessages(bookingId: string): Promise<BookingMessage[]> {
  const { data } = await supabase
    .from('booking_messages')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });
  return (data as BookingMessage[] | null) ?? [];
}

// ── Mutations ──────────────────────────────────────────────────────────────

/**
 * Sends a message on a booking. Sender id is taken from the signed-in user.
 * - Trims text; rejects empty WITHOUT calling Supabase.
 * - RLS rejects after completed/cancelled or for non-participants.
 */
export async function sendBookingMessage(
  bookingId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  // 1. Trim; reject empty immediately — no Supabase call.
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Enter a message.' };

  // 2. Require a signed-in user.
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: 'You must be signed in.' };

  // 3. Insert the message.
  const { error } = await supabase.from('booking_messages').insert({
    booking_id: bookingId,
    sender_id: data.user.id,
    message_text: trimmed,
  });

  // 4. Map error to a friendly message.
  if (error) return { ok: false, error: 'Could not send message. Please try again.' };
  return { ok: true };
}

// ── RPC helpers ────────────────────────────────────────────────────────────

/**
 * Returns the display name of the counterpart in the chat (via RPC).
 * Returns null on error or when not available.
 */
export async function getChatPeerName(bookingId: string): Promise<string | null> {
  const { data } = await supabase.rpc('get_chat_peer_name', { p_booking_id: bookingId });
  return (data as string | null) ?? null;
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Labels a message sender for the admin read-only chat viewer.
 * Returns 'Customer', 'Provider', or 'Unknown'.
 */
export function labelSender(
  senderId: string,
  booking: { customer_id: string; assigned_provider_id: string | null },
): 'Customer' | 'Provider' | 'Unknown' {
  if (senderId === booking.customer_id) return 'Customer';
  if (senderId === booking.assigned_provider_id) return 'Provider';
  return 'Unknown';
}
