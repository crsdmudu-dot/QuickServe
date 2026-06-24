// bookings.ts — Supabase helpers for creating and reading bookings.
import { supabase } from '@/lib/supabase';
import type { QuoteStatus } from '@/lib/quotes';

/** Curated provider details returned for a booking's assigned professional. */
export type Professional = {
  full_name: string | null;
  skills: string[] | null;
  is_verified: boolean;
  completed_jobs_count: number;
  profile_photo_url: string | null;
};

// BookingStatus lives in booking-status.ts; re-export it from here so
// other files only need one import path.
export type { BookingStatus } from '@/constants/booking-status';
import type { BookingStatus } from '@/constants/booking-status';

export type NewBooking = { serviceId: string; address: string; scheduledFor: string; notes?: string };

export type Booking = {
  id: string;
  service_id: string;
  address: string;
  scheduled_for: string;
  notes: string | null;
  status: BookingStatus;
  created_at: string;
  // Slice 5 admin fields
  assigned_provider_name: string | null;
  assigned_provider_phone: string | null;
  admin_notes: string | null;
  // Slice 6 provider fields
  assigned_provider_id: string | null;
  // Slice 11 quote fields
  quoted_amount: number | null;
  provider_share: number | null;
  quote_status: QuoteStatus;
};

// ── Customer mutations ─────────────────────────────────────────────────────

export async function createBooking(input: NewBooking): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: 'You must be signed in to book.' };
  const { data: row, error } = await supabase.from('bookings').insert({
    customer_id: data.user.id,
    service_id: input.serviceId,
    address: input.address,
    scheduled_for: input.scheduledFor,
    notes: input.notes ?? null,
  }).select('id').single();
  if (error) return { ok: false, error: 'Could not create booking. Please try again.' };
  return { ok: true, id: row.id };
}

// ── Customer queries ───────────────────────────────────────────────────────

export async function getCustomerBookings(): Promise<Booking[]> {
  const { data } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });
  return (data as Booking[] | null) ?? [];
}

// ── Admin queries ──────────────────────────────────────────────────────────

/** Returns all bookings, newest first. */
export async function getAllBookings(): Promise<Booking[]> {
  const { data } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });
  return (data as Booking[] | null) ?? [];
}

// ── Provider queries ───────────────────────────────────────────────────────

/** Returns bookings assigned to the signed-in provider, newest first. */
export async function getProviderJobs(): Promise<Booking[]> {
  const { data } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });
  return (data as Booking[] | null) ?? [];
}

/** Returns a single booking by id, or null if not found. */
export async function getBookingById(id: string): Promise<Booking | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data ?? null;
}

// ── Admin mutations ────────────────────────────────────────────────────────

/** Changes the status of a booking. */
export async function updateBookingStatus(
  id: string,
  status: BookingStatus,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', id);
  if (error) return { ok: false, error: 'Could not update booking. Please try again.' };
  return { ok: true };
}

/** Assigns a provider and sets status to provider_assigned.
 *  Pass providerId when dispatching an in-app provider; omit for manual dispatch. */
export async function assignProvider(
  id: string,
  p: { name: string; phone: string; providerId?: string },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('bookings')
    .update({
      assigned_provider_id: p.providerId ?? null,
      assigned_provider_name: p.name,
      assigned_provider_phone: p.phone,
      status: 'provider_assigned' as BookingStatus,
    })
    .eq('id', id);
  if (error) return { ok: false, error: 'Could not assign provider. Please try again.' };
  return { ok: true };
}

// ── Professional card ──────────────────────────────────────────────────────

/** Returns curated professional details for a booking's assigned provider,
 *  or null if not assigned / caller is not the booking owner or admin. */
export async function getBookingProfessional(bookingId: string): Promise<Professional | null> {
  const { data, error } = await supabase.rpc('get_booking_professional', { p_booking_id: bookingId });
  if (error) return null;
  const rows = data as Professional[] | null;
  return rows?.[0] ?? null;
}

/** Saves admin notes on a booking. */
export async function updateAdminNotes(
  id: string,
  notes: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('bookings')
    .update({ admin_notes: notes })
    .eq('id', id);
  if (error) return { ok: false, error: 'Could not update notes. Please try again.' };
  return { ok: true };
}
