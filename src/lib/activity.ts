// activity.ts — Supabase helpers for reading a booking's activity timeline.
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

/** A single event in a booking's activity timeline. Written by DB triggers. */
export type BookingActivity = {
  id: string;
  booking_id: string;
  actor_id: string | null;
  event_type: string;
  message: string;
  metadata: unknown | null;
  created_at: string;
};

// ── Queries ────────────────────────────────────────────────────────────────

/** Returns all activity events for a booking, oldest first. */
export async function getBookingActivity(bookingId: string): Promise<BookingActivity[]> {
  const { data } = await supabase
    .from('booking_activity')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });
  return (data as BookingActivity[] | null) ?? [];
}
