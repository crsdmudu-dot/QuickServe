// tracking.ts — Client seam for live provider-location tracking.
//
// Wraps:
//   • upsert_provider_location / clear_provider_location RPCs (SECURITY DEFINER, no RLS bypass in app)
//   • provider_locations table SELECT (RLS-gated)
//   • Supabase Realtime postgres_changes subscription
//   • tracking-map Edge Function (returns signed map URL — key never in app)
//
// Safe errors: reads → null/[]; mutations → { ok:false }; subscribe never throws.

import { REALTIME_POSTGRES_CHANGES_LISTEN_EVENT } from '@supabase/realtime-js';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

export type LatLng = { latitude: number; longitude: number };

export type ProviderLocation = {
  booking_id: string;
  provider_id: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  updated_at: string;
};

// ── Mutations ──────────────────────────────────────────────────────────────

/** Provider shares location for an active assigned booking (via SECURITY DEFINER RPC). Best-effort. */
export async function upsertProviderLocation(
  bookingId: string,
  coords: { latitude: number; longitude: number; heading?: number | null; speed?: number | null },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('upsert_provider_location', {
    p_booking_id: bookingId,
    p_lat: coords.latitude,
    p_lng: coords.longitude,
    p_heading: coords.heading ?? null,
    p_speed: coords.speed ?? null,
  });
  if (error) return { ok: false, error: 'Could not update location.' };
  return { ok: true };
}

/** Delete the shared location (assigned provider or admin) — on completion/cancellation. */
export async function clearProviderLocation(bookingId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('clear_provider_location', { p_booking_id: bookingId });
  if (error) return { ok: false, error: 'Could not clear location.' };
  return { ok: true };
}

// ── Queries ────────────────────────────────────────────────────────────────

/** Last-known provider location for a booking (RLS-gated SELECT). null on none/error. */
export async function getProviderLocationForBooking(bookingId: string): Promise<ProviderLocation | null> {
  const { data, error } = await supabase
    .from('provider_locations')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (error) return null;
  return (data as ProviderLocation | null) ?? null;
}

// ── Realtime ───────────────────────────────────────────────────────────────

/** Subscribe to live provider-location changes for a booking (Realtime postgres_changes).
 *  Calls onUpdate with the new row on insert/update; returns an unsubscribe fn. */
export function subscribeToProviderLocation(
  bookingId: string,
  onUpdate: (loc: ProviderLocation) => void,
): () => void {
  const channel = supabase
    .channel(`provider_loc:${bookingId}`)
    .on<ProviderLocation>(
      'postgres_changes',
      { event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.ALL, schema: 'public', table: 'provider_locations', filter: `booking_id=eq.${bookingId}` },
      (payload) => {
        const loc = (payload as { new?: ProviderLocation }).new;
        if (loc) onUpdate(loc);
      },
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

// ── Edge Function ──────────────────────────────────────────────────────────

/** Server-built static-map URL (provider + customer markers). null on error/unconfigured. */
export async function getTrackingMapUrl(provider: LatLng, customer: LatLng): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('tracking-map', {
    body: {
      providerLat: provider.latitude, providerLng: provider.longitude,
      customerLat: customer.latitude, customerLng: customer.longitude,
    },
  });
  if (error) return null;
  return (data?.mapUrl as string | null | undefined) ?? null;
}
