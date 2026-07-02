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

// ── Functions ──────────────────────────────────────────────────────────────────

/**
 * Address autocomplete via the places-autocomplete Edge Function.
 * Returns [] on empty query, transport error, or unconfigured backend.
 * Never throws.
 */
export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase.functions.invoke('places-autocomplete', {
    body: { query: q },
  });
  if (error) return [];
  return (data?.suggestions as PlaceSuggestion[] | undefined) ?? [];
}

/**
 * Resolve a place id → formatted address, lat/lng, and static map URL.
 * Returns null on transport error, backend error, or empty placeId.
 * Never throws.
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceDetailsWithMap | null> {
  if (!placeId) return null;
  const { data, error } = await supabase.functions.invoke('place-details', {
    body: { placeId },
  });
  if (error) return null;
  return (data?.details as PlaceDetailsWithMap | null | undefined) ?? null;
}
