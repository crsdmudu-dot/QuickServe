// blocks.ts — blocking between customers and providers (store-compliance F5.2).
//
// A block works both ways: while it exists the two people cannot message each other and KwikServe
// will not assign them to the same booking. Everything is enforced by the 0066 database functions
// and rules; these helpers only call them.
import { supabase } from '@/lib/supabase';

/** One row of the signed-in user's block list. */
export type BlockedUser = {
  user_id: string;
  /** A provider's full name, or a customer's first name. */
  display_name: string | null;
  role: string | null;
  blocked_at: string;
};

/** Shown in place of the chat input while either person blocks the other. */
export const CHAT_BLOCKED_NOTICE =
  "Chat isn't available for this booking. You can still cancel the booking or contact support.";

export async function blockUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('block_user', { p_user_id: userId });
  if (error) return { ok: false, error: 'Could not block this person. Please try again.' };
  return { ok: true };
}

export async function unblockUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('unblock_user', { p_user_id: userId });
  if (error) return { ok: false, error: 'Could not unblock. Please try again.' };
  return { ok: true };
}

/** The signed-in user's blocks, newest first. Throws on error so the screen can offer Retry. */
export async function getMyBlockedUsers(): Promise<BlockedUser[]> {
  const { data, error } = await supabase.rpc('get_my_blocked_users');
  if (error) throw new Error('Could not load blocked people.');
  return (data as BlockedUser[] | null) ?? [];
}

/**
 * True when the booking's customer and provider block each other (either direction). Only the two
 * participants and admins get a real answer. This only decides what the screen shows: the server
 * refuses blocked messages whatever the app does, so a failed check (e.g. no connection) returns
 * false rather than telling the user chat is unavailable.
 */
export async function isBookingChatBlocked(bookingId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('booking_chat_blocked', { p_booking_id: bookingId });
  if (error) return false;
  return data === true;
}

/** Admin: providers who block this customer or whom this customer blocks. [] on error. */
export async function adminBlockedProviderIds(customerId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('admin_blocked_provider_ids', { p_customer_id: customerId });
  if (error) return [];
  return (data as string[] | null) ?? [];
}
