// bookings.ts — Supabase helpers for creating and reading bookings.
import { supabase } from '@/lib/supabase';
import type { QuoteStatus } from '@/lib/quotes';
import type { SchedulingType, TimeWindow, Recurrence } from '@/lib/scheduling';

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

export type NewBooking = {
  serviceId: string;
  address: string;
  scheduledFor: string;
  notes?: string;
  // Slice 20 structured address fields (all optional; undefined → stored as null)
  address_label?: string;
  latitude?: number;
  longitude?: number;
  building_name?: string;
  floor?: string;
  door_number?: string;
  landmark?: string;
  access_notes?: string;
  // Slice 24 scheduling fields (all optional; old callers unaffected)
  scheduling_type?: SchedulingType;
  time_window?: TimeWindow | null;
  window_start?: string | null;
  window_end?: string | null;
  recurrence?: Recurrence;
};

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
  // Slice 14 chat field
  customer_id: string;
  // Slice 20 structured address fields (all nullable)
  address_label: string | null;
  latitude: number | null;
  longitude: number | null;
  building_name: string | null;
  floor: string | null;
  door_number: string | null;
  landmark: string | null;
  access_notes: string | null;
  // Slice 24 scheduling fields
  scheduling_type: string;
  time_window: string | null;
  window_start: string | null;
  window_end: string | null;
  recurrence: string;
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
    // Slice 20 structured address fields
    address_label: input.address_label ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    building_name: input.building_name ?? null,
    floor: input.floor ?? null,
    door_number: input.door_number ?? null,
    landmark: input.landmark ?? null,
    access_notes: input.access_notes ?? null,
    // Slice 24 scheduling fields
    scheduling_type: input.scheduling_type ?? 'datetime',
    time_window: input.time_window ?? null,
    window_start: input.window_start ?? null,
    window_end: input.window_end ?? null,
    recurrence: input.recurrence ?? 'one_time',
  }).select('id').single();
  if (error) return { ok: false, error: 'Could not create booking. Please try again.' };
  return { ok: true, id: row.id };
}

// ── Customer queries ───────────────────────────────────────────────────────

export async function getCustomerBookings(page?: number, pageSize?: number): Promise<Booking[]> {
  let q = supabase.from('bookings').select('*').order('created_at', { ascending: false });
  if (page != null && pageSize != null) q = q.range(page * pageSize, page * pageSize + pageSize - 1);
  const { data } = await q;
  return (data as Booking[] | null) ?? [];
}

// ── Admin queries ──────────────────────────────────────────────────────────

/** Returns all bookings, newest first. Pass page + pageSize for pagination. */
export async function getAllBookings(page?: number, pageSize?: number): Promise<Booking[]> {
  let q = supabase.from('bookings').select('*').order('created_at', { ascending: false });
  if (page != null && pageSize != null) q = q.range(page * pageSize, page * pageSize + pageSize - 1);
  const { data } = await q;
  return (data as Booking[] | null) ?? [];
}

// ── Provider queries ───────────────────────────────────────────────────────

/** Returns bookings assigned to the signed-in provider, newest first. Pass page + pageSize for pagination. */
export async function getProviderJobs(page?: number, pageSize?: number): Promise<Booking[]> {
  let q = supabase.from('bookings').select('*').order('created_at', { ascending: false });
  if (page != null && pageSize != null) q = q.range(page * pageSize, page * pageSize + pageSize - 1);
  const { data } = await q;
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
