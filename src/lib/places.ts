// places.ts — Client-side helpers for address autocomplete and place details.
// All Google API calls are proxied through Edge Functions; no key lives in the app.
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * A single autocomplete suggestion returned by the places-autocomplete Edge Function.
 * Shape mirrors supabase/functions/_shared/places.ts PlaceSuggestion.
 */
export type PlaceSuggestion = {
  placeId: string;
  primaryText: string;
  secondaryText: string;
};

/**
 * Resolved address, coordinates, and a static map image URL
 * returned by the place-details Edge Function.
 */
export type PlaceDetailsWithMap = {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  mapUrl: string;
};

// ── Session tokens ───────────────────────────────────────────────────────────

/**
 * Create a Places API (New) autocomplete session token.
 *
 * A session token only needs to be unique per search session (it correlates the
 * autocomplete requests with the Place Details call for billing) — it does NOT need
 * to be cryptographically strong. We prefer the platform UUID when available and fall
 * back to a v4-shaped string, so no extra dependency is required.
 */
export function newSessionToken(): string {
  // Prefer the platform UUID, but be defensive: in some runtimes (Hermes without a
  // crypto polyfill, jsdom) `crypto.randomUUID` is absent or throws. Never let token
  // creation break address search — always fall back to a v4-shaped string.
  try {
    const g = globalThis as { crypto?: { randomUUID?: () => string } };
    if (typeof g.crypto?.randomUUID === 'function') {
      const id = g.crypto.randomUUID();
      if (id) return id;
    }
  } catch {
    // fall through to the manual generator
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Functions ──────────────────────────────────────────────────────────────────

/**
 * Address autocomplete via the places-autocomplete Edge Function.
 * Pass the same `sessionToken` for every keystroke-batch of one search session, then
 * pass it to getPlaceDetails on selection, so the session bills as one unit.
 * Returns [] on empty query, transport error, or unconfigured backend. Never throws.
 */
export async function searchPlaces(
  query: string,
  sessionToken?: string,
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase.functions.invoke('places-autocomplete', {
    body: sessionToken ? { query: q, sessionToken } : { query: q },
  });
  if (error) return [];
  return (data?.suggestions as PlaceSuggestion[] | undefined) ?? [];
}

/**
 * Resolve a place id → formatted address, lat/lng, and static map URL.
 * Pass the SAME `sessionToken` used for the autocomplete requests to complete the
 * billing session. Returns null on transport error, backend error, or empty placeId.
 * Never throws.
 */
export async function getPlaceDetails(
  placeId: string,
  sessionToken?: string,
): Promise<PlaceDetailsWithMap | null> {
  if (!placeId) return null;
  const { data, error } = await supabase.functions.invoke('place-details', {
    body: sessionToken ? { placeId, sessionToken } : { placeId },
  });
  if (error) return null;
  return (data?.details as PlaceDetailsWithMap | null | undefined) ?? null;
}
