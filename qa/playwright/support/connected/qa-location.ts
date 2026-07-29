import { type APIRequestContext } from '@playwright/test';
import { createCustomerBooking, assignProvider, setBookingStatus, type ProviderInfo } from './qa-bookings';
import { rpc } from './qa-payments';

/**
 * qa-location.ts — connected provider-location primitives (Phase 2E).
 *
 * `provider_locations` is one row per booking (booking_id PK, cascade). Writes go
 * only through the SECURITY DEFINER RPCs `upsert_provider_location` (the booking's
 * assigned provider, only while status is 'on_the_way'/'in_progress'; provider_id is
 * server-set to auth.uid()) and `clear_provider_location` (assigned provider or
 * admin). Reads are participant-scoped RLS. Cleanup reuses booking teardown (the row
 * cascades on booking delete).
 */

/** A booking assigned to a provider and progressed to 'on_the_way' — i.e. trackable. */
export async function makeTrackableBooking(opts: {
  customerCtx: APIRequestContext;
  customerId: string;
  providerCtx: APIRequestContext;
  adminCtx: APIRequestContext;
  provider: ProviderInfo;
}): Promise<string> {
  const booking = await createCustomerBooking(opts.customerCtx, opts.customerId);
  await assignProvider(opts.adminCtx, booking.id, opts.provider);
  const r = await setBookingStatus(opts.providerCtx, booking.id, 'on_the_way');
  if (!r.changed) throw new Error(`progress to on_the_way failed: HTTP ${r.status} — ${r.text}`);
  return booking.id;
}

export const upsertLocation = (
  ctx: APIRequestContext,
  bookingId: string,
  lat: unknown,
  lng: unknown,
  heading: number | null = null,
  speed: number | null = null,
) =>
  rpc(ctx, 'upsert_provider_location', {
    p_booking_id: bookingId,
    p_lat: lat,
    p_lng: lng,
    p_heading: heading,
    p_speed: speed,
  });

export const clearLocation = (ctx: APIRequestContext, bookingId: string) =>
  rpc(ctx, 'clear_provider_location', { p_booking_id: bookingId });

/** Read the location row(s) visible to ctx for a booking (RLS applies). */
export async function getLocation(ctx: APIRequestContext, bookingId: string): Promise<Record<string, unknown>[]> {
  const res = await ctx.get(
    `/rest/v1/provider_locations?booking_id=eq.${bookingId}&select=booking_id,provider_id,latitude,longitude,heading,speed,updated_at`,
  );
  if (res.status() !== 200) throw new Error(`getLocation HTTP ${res.status()} — ${await res.text()}`);
  return (await res.json()) as Record<string, unknown>[];
}

/** Direct table INSERT (to prove there is no write RLS policy) — returns HTTP status. */
export async function directInsertRaw(
  ctx: APIRequestContext,
  bookingId: string,
  providerId: string,
): Promise<number> {
  const res = await ctx.post('/rest/v1/provider_locations', {
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    data: { booking_id: bookingId, provider_id: providerId, latitude: 0, longitude: 0 },
  });
  return res.status();
}

/** Direct table DELETE (to prove there is no delete RLS policy) — returns rows deleted. */
export async function directDeleteRaw(ctx: APIRequestContext, bookingId: string): Promise<{ status: number; deleted: number }> {
  const res = await ctx.delete(`/rest/v1/provider_locations?booking_id=eq.${bookingId}`, {
    headers: { Prefer: 'return=representation' },
  });
  const status = res.status();
  const deleted = status === 200 ? ((await res.json()) as unknown[]).length : 0;
  return { status, deleted };
}
