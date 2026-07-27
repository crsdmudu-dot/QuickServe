import { type APIRequestContext } from '@playwright/test';
import { serviceContext } from './qa-client';

/**
 * qa-bookings.ts — reusable connected helpers for booking certification.
 *
 * Creates REAL bookings against the QA backend via the same PostgREST path the
 * app's `createBooking` uses (`POST /rest/v1/bookings`, RLS: customer_id =
 * auth.uid()). Cleanup uses the service-role context (bookings has no DELETE RLS
 * policy) and is idempotent — a marker-prefix sweep guarantees a clean DB across
 * repeated runs.
 */

/** Stable prefix so any leaked certification booking can be swept, per milestone. */
export const BOOKING_MARKER_PREFIX = 'QA-CERT-M3';

/** A unique, sweepable marker stored in `notes` (uuid keeps parallel runs isolated). */
export function makeBookingMarker(): string {
  return `${BOOKING_MARKER_PREFIX}-${crypto.randomUUID()}`;
}

export type CreatedBooking = { id: string; marker: string; row: Record<string, unknown> };

export type BookingOverrides = {
  serviceId?: string;
  address?: string;
  scheduledFor?: string;
  marker?: string;
};

/**
 * Create a booking as the authenticated customer (same fields the app sends).
 * Requires an authed customer context + that customer's user id (RLS insert
 * requires customer_id = auth.uid()). Returns the persisted row.
 */
export async function createCustomerBooking(
  customerCtx: APIRequestContext,
  customerId: string,
  overrides: BookingOverrides = {},
): Promise<CreatedBooking> {
  const marker = overrides.marker ?? makeBookingMarker();
  const payload = {
    customer_id: customerId,
    service_id: overrides.serviceId ?? 'house-cleaning',
    address: overrides.address ?? 'QA Certification Address, Nairobi',
    // Deterministic far-future slot so the value is stable across runs.
    scheduled_for: overrides.scheduledFor ?? '2030-01-01T09:00:00.000Z',
    notes: marker,
    scheduling_type: 'datetime',
    recurrence: 'one_time',
  };
  const res = await customerCtx.post('/rest/v1/bookings', {
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    data: payload,
  });
  if (res.status() !== 201) {
    throw new Error(`createCustomerBooking failed: HTTP ${res.status()} — ${await res.text()}`);
  }
  const body = (await res.json()) as Record<string, unknown> | Record<string, unknown>[];
  const row = (Array.isArray(body) ? body[0] : body) as Record<string, unknown>;
  return { id: row.id as string, marker, row };
}

/** Read bookings visible to `ctx` filtered to a single id (RLS applies). */
export async function readBookingById(
  ctx: APIRequestContext,
  id: string,
): Promise<Record<string, unknown>[]> {
  const res = await ctx.get(`/rest/v1/bookings?id=eq.${id}&select=*`);
  if (res.status() !== 200) {
    throw new Error(`readBookingById failed: HTTP ${res.status()} — ${await res.text()}`);
  }
  return (await res.json()) as Record<string, unknown>[];
}

// ── Admin dispatch (same PostgREST path as the app's assignProvider/updateBookingStatus) ──

export type ProviderInfo = { providerId: string; name: string; phone: string };

export type PatchResult = {
  status: number;
  /** True only when the UPDATE actually changed a row (200 + a returned row). */
  changed: boolean;
  row: Record<string, unknown> | null;
  text: string;
};

/**
 * Generic authenticated PATCH on a booking (mirrors the app's PostgREST updates).
 * Distinguishes three outcomes so callers can assert them honestly:
 *  - success: 200 + a returned row (`changed: true`)
 *  - RLS USING excluded the row (e.g., not owner/assigned): 200 + `[]` (`changed: false`)
 *  - RLS WITH CHECK / constraint violation: 4xx (`changed: false`, `text` has detail)
 */
export async function patchBooking(
  ctx: APIRequestContext,
  bookingId: string,
  body: Record<string, unknown>,
): Promise<PatchResult> {
  const res = await ctx.patch(`/rest/v1/bookings?id=eq.${bookingId}`, {
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    data: body,
  });
  const status = res.status();
  if (status === 200) {
    const row = ((await res.json()) as Record<string, unknown>[])[0] ?? null;
    return { status, changed: !!row, row, text: '' };
  }
  return { status, changed: false, row: null, text: await res.text() };
}

/**
 * Admin assigns a provider — mirrors the app's `assignProvider`: sets
 * assigned_provider_id/name/phone and status='provider_assigned' in one UPDATE.
 * Requires an authed ADMIN context (RLS bookings_update_admin). Returns the row.
 */
export async function assignProvider(
  adminCtx: APIRequestContext,
  bookingId: string,
  p: ProviderInfo,
): Promise<Record<string, unknown>> {
  const r = await patchBooking(adminCtx, bookingId, {
    assigned_provider_id: p.providerId,
    assigned_provider_name: p.name,
    assigned_provider_phone: p.phone,
    status: 'provider_assigned',
  });
  if (!r.changed || !r.row) throw new Error(`assignProvider failed: HTTP ${r.status} — ${r.text}`);
  return r.row;
}

/**
 * Set a booking status — mirrors the app's `updateBookingStatus`. Works for any
 * authed role; the returned `changed`/`status` reflect RLS. Callers assert both
 * accepted transitions (changed) and rejected ones (not changed / 4xx).
 */
export async function setBookingStatus(
  ctx: APIRequestContext,
  bookingId: string,
  status: string,
): Promise<PatchResult> {
  return patchBooking(ctx, bookingId, { status });
}

/** Create a booking as customer then assign a provider as admin (returns the booking). */
export async function createAssignedBooking(
  customerCtx: APIRequestContext,
  customerId: string,
  adminCtx: APIRequestContext,
  provider: ProviderInfo,
): Promise<CreatedBooking> {
  const created = await createCustomerBooking(customerCtx, customerId);
  await assignProvider(adminCtx, created.id, provider);
  return created;
}

/** Read booking_activity audit rows for a booking (app-created on status change). */
export async function readBookingActivity(
  ctx: APIRequestContext,
  bookingId: string,
): Promise<Record<string, unknown>[]> {
  const res = await ctx.get(
    `/rest/v1/booking_activity?booking_id=eq.${bookingId}&select=event_type,message,actor_id,created_at&order=created_at.asc`,
  );
  if (res.status() !== 200) {
    throw new Error(`readBookingActivity failed: HTTP ${res.status()} — ${await res.text()}`);
  }
  return (await res.json()) as Record<string, unknown>[];
}

/** Read notifications for a booking that are visible to `ctx` (RLS: user_id = auth.uid()). */
export async function readBookingNotifications(
  ctx: APIRequestContext,
  bookingId: string,
): Promise<Record<string, unknown>[]> {
  const res = await ctx.get(
    `/rest/v1/notifications?booking_id=eq.${bookingId}&select=id,user_id,type,title,created_at&order=created_at.asc`,
  );
  if (res.status() !== 200) {
    throw new Error(`readBookingNotifications failed: HTTP ${res.status()} — ${await res.text()}`);
  }
  return (await res.json()) as Record<string, unknown>[];
}

/** Delete specific bookings by id via the service role (guaranteed teardown). */
export async function deleteBookingsByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const svc = await serviceContext();
  try {
    const list = ids.map((i) => `"${i}"`).join(',');
    await svc.delete(`/rest/v1/bookings?id=in.(${list})`);
  } finally {
    await svc.dispose();
  }
}

/**
 * Safety-net sweep: delete every booking whose notes start with the milestone
 * marker prefix. Guarantees repeated certification runs leave the DB clean even
 * if a previous run crashed before per-test cleanup.
 */
export async function sweepCertificationBookings(prefix = BOOKING_MARKER_PREFIX): Promise<void> {
  const svc = await serviceContext();
  try {
    // PostgREST `like` uses `*` as the wildcard.
    await svc.delete(`/rest/v1/bookings?notes=like.${encodeURIComponent(prefix + '*')}`);
  } finally {
    await svc.dispose();
  }
}
