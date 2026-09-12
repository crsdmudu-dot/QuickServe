// bookings.ts — Supabase helpers for creating and reading bookings.
import { supabase } from '@/lib/supabase';
import type { QuoteStatus } from '@/lib/quotes';
import type { SchedulingType, TimeWindow, Recurrence } from '@/lib/scheduling';
import { serviceDetailsPrimaryValue, type ServiceDetailsSnapshot } from '@/lib/service-details';

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
  // Phase 4E.2 — one client-generated key per logical submission (retry-stable). Optional so
  // existing callers/tests keep working; when present it makes creation idempotent.
  idempotencyKey?: string;
  // Service Details V1 — immutable snapshot of the structured answers. Optional so existing
  // callers/tests are unaffected; omitted or null is stored as null (pre-V1 behaviour).
  service_details?: ServiceDetailsSnapshot | null;
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
  // Service Details V1 — null for every booking created before the feature. Typed as unknown
  // rather than the snapshot type because the database may hold a snapshot written by a NEWER
  // app version; narrow it with isServiceDetailsSnapshot() before reading.
  service_details?: unknown;
};

// ── Customer mutations ─────────────────────────────────────────────────────

/**
 * Creates a booking. When `idempotencyKey` is supplied, creation is idempotent: a duplicate
 * submission (same key — double-tap, retry, timeout-then-retry) raises a unique-violation on
 * the server, and we RECOVER the already-created booking instead of failing or creating a
 * second row. One logical submission → at most one booking.
 */
export async function createBooking(
  input: NewBooking,
): Promise<{ ok: boolean; id?: string; recovered?: boolean; error?: string }> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: 'You must be signed in to book.' };
  const idempotency_key = input.idempotencyKey ?? null;
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
    // Phase 4E.2 — submission idempotency key (null when a caller omits it)
    idempotency_key,
    // Service Details V1 — structured snapshot (null when a caller omits it)
    service_details: input.service_details ?? null,
  }).select('id').single();

  if (error) {
    // Idempotent-retry recovery: the same key already created a booking (unique_violation
    // 23505). Recover it via the owner-scoped select policy — never a spurious failure or a
    // second row. The recovered row is the customer's own (the key was generated on-device).
    if (idempotency_key && (error.code === '23505' || /duplicate key/i.test(error.message ?? ''))) {
      const { data: existing } = await supabase
        .from('bookings')
        .select('id')
        .eq('idempotency_key', idempotency_key)
        .maybeSingle();
      if (existing?.id) return { ok: true, id: existing.id, recovered: true };
    }
    return { ok: false, error: 'Could not create booking. Please try again.' };
  }
  return { ok: true, id: row.id };
}

// ── Business-level duplicate detection (advisory warning; NOT the idempotency guard) ──

/** Fields used to compare a new booking's destination against existing ones. */
export type DuplicateMatchInput = {
  serviceId: string;
  address: string;
  building_name?: string | null;
  floor?: string | null;
  door_number?: string | null;
  /**
   * The new booking's Service Details snapshot, if it has one. Typed `unknown` for the same
   * reason `Booking.service_details` is: it may be a shape a newer app version wrote.
   * Optional — callers that omit it get exactly the pre-V1.5 behaviour.
   */
  serviceDetails?: unknown;
};

/** Trim + lowercase; null/undefined/'' all normalize to '' so they compare equal. */
function normField(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase();
}

/**
 * PURE — is `existing` a LIKELY duplicate of the new booking `input`? True only when it is the
 * same service, still ACTIVE (not cancelled/completed), at the same destination: the address
 * text must match, AND building/floor/door must match (so a different unit is NOT a duplicate).
 * A blank new address never matches (manual/empty addresses aren't force-collapsed). Never throws.
 */
export function isLikelyDuplicateBooking(existing: Booking, input: DuplicateMatchInput): boolean {
  if (existing.service_id !== input.serviceId) return false;
  if (existing.status === 'cancelled' || existing.status === 'completed') return false;
  const addr = normField(input.address);
  if (!addr || normField(existing.address) !== addr) return false;
  if (
    normField(existing.building_name) !== normField(input.building_name) ||
    normField(existing.floor) !== normField(input.floor) ||
    normField(existing.door_number) !== normField(input.door_number)
  ) {
    return false;
  }
  return sameRequest(existing, input);
}

/**
 * Service Details V1.5 — do the two bookings ask for the same THING?
 *
 * Same service at the same address is not enough on its own: "standard cleaning" and "laundry
 * only", or a battery fault and a brake fault, are legitimately separate requests that the
 * customer should not have to argue past a duplicate warning.
 *
 * The comparison is deliberately narrow and conservative:
 *  - only the PRIMARY machine value is compared — the one stable, non-cosmetic identifier of what
 *    was requested. Never the whole snapshot, never a mutable display label, and (in V1.5) never
 *    add-ons or follow-up answers, which vary for what is genuinely the same job;
 *  - two requests count as DIFFERENT only when BOTH sides produced a usable primary value and
 *    those values disagree. Anything else — a legacy booking with `service_details = null`, a
 *    malformed snapshot, a future shape whose primary is not a string — falls through to the
 *    existing service/address heuristic. Missing history must never quietly switch duplicate
 *    protection off.
 *
 * This is display-side advice only. It does not touch the database idempotency key (migration
 * 0034), which remains the authoritative one-submission-one-booking guarantee.
 */
function sameRequest(existing: Booking, input: DuplicateMatchInput): boolean {
  const existingPrimary = serviceDetailsPrimaryValue(existing.service_details);
  const incomingPrimary = serviceDetailsPrimaryValue(input.serviceDetails);
  if (existingPrimary === null || incomingPrimary === null) return true; // not comparable → warn as before
  return existingPrimary === incomingPrimary;
}

/**
 * Returns the customer's own newest ACTIVE booking that looks like a duplicate of `input`, or
 * null. Reads only the caller's rows (getCustomerBookings is RLS owner-scoped) — a customer can
 * never learn about another user's booking. Best-effort: returns null on any read error.
 */
export async function findActiveDuplicateBooking(input: DuplicateMatchInput): Promise<Booking | null> {
  try {
    const mine = await getCustomerBookings(0, 50);
    return mine.find((b) => isLikelyDuplicateBooking(b, input)) ?? null;
  } catch {
    return null;
  }
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
