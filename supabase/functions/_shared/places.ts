/**
 * places.ts — Pure Google Places helper functions.
 *
 * PURE TypeScript — no network calls, no Deno-only APIs, no API key literals.
 * Uses only standard globals (`encodeURIComponent`) available in both Node and Deno.
 *
 * These builders return request URLs and parse Google Places API responses.
 * They do NOT call fetch. The Edge Functions consume these helpers.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single autocomplete suggestion from the Google Places API. */
export type PlaceSuggestion = {
  placeId: string;
  primaryText: string;
  secondaryText: string;
};

/** Resolved address and coordinates from the Google Place Details API. */
export type PlaceDetails = {
  formattedAddress: string;
  latitude: number;
  longitude: number;
};

// ─── Autocomplete ─────────────────────────────────────────────────────────────

/**
 * Build a Google Places Autocomplete request URL.
 *
 * The key is always a parameter — never hardcoded.
 * Results are biased to Kenya via `components=country:ke`.
 *
 * Example:
 *   buildAutocompleteRequest('https://maps.googleapis.com/maps/api', 'K', 'riverside dr')
 *   → { url: '...place/autocomplete/json?input=riverside%20dr&key=K&components=country:ke' }
 */
export function buildAutocompleteRequest(
  baseUrl: string,
  key: string,
  query: string,
): { url: string } {
  const url =
    `${baseUrl}/place/autocomplete/json` +
    `?input=${encodeURIComponent(query)}` +
    `&key=${key}` +
    `&components=country:ke`;
  return { url };
}

/**
 * Parse a Google Places Autocomplete JSON response into a list of suggestions.
 *
 * Reads `predictions[]` from the response object.
 * - `placeId`       = `prediction.place_id`
 * - `primaryText`   = `prediction.structured_formatting.main_text`
 * - `secondaryText` = `prediction.structured_formatting.secondary_text ?? ''`
 *
 * Null-safe: any malformed / missing data returns `[]`; entries without a
 * `place_id` are silently skipped.
 */
export function parseAutocomplete(json: unknown): PlaceSuggestion[] {
  // Guard: must be a plain object.
  if (json === null || typeof json !== 'object') return [];

  const obj = json as Record<string, unknown>;
  const predictions = obj['predictions'];

  // Guard: predictions must be an array.
  if (!Array.isArray(predictions)) return [];

  const results: PlaceSuggestion[] = [];

  for (const item of predictions) {
    // Each item must be a plain object.
    if (item === null || typeof item !== 'object') continue;

    const prediction = item as Record<string, unknown>;
    const placeId = prediction['place_id'];

    // Skip entries that have no place_id.
    if (typeof placeId !== 'string' || placeId === '') continue;

    // Safely read structured_formatting.
    const sf = prediction['structured_formatting'];
    const sfObj =
      sf !== null && typeof sf === 'object'
        ? (sf as Record<string, unknown>)
        : {};

    const primaryText =
      typeof sfObj['main_text'] === 'string' ? sfObj['main_text'] : '';
    const secondaryText =
      typeof sfObj['secondary_text'] === 'string'
        ? sfObj['secondary_text']
        : '';

    results.push({ placeId, primaryText, secondaryText });
  }

  return results;
}

// ─── Place Details ────────────────────────────────────────────────────────────

/**
 * Build a Google Place Details request URL.
 *
 * The key is always a parameter — never hardcoded.
 * Only the `formatted_address` and `geometry` fields are requested.
 *
 * Example:
 *   buildDetailsRequest('https://maps.googleapis.com/maps/api', 'K', 'p1')
 *   → { url: '...place/details/json?place_id=p1&key=K&fields=formatted_address,geometry' }
 */
export function buildDetailsRequest(
  baseUrl: string,
  key: string,
  placeId: string,
): { url: string } {
  const url =
    `${baseUrl}/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&key=${key}` +
    `&fields=formatted_address,geometry`;
  return { url };
}

/**
 * Parse a Google Place Details JSON response into a `PlaceDetails` object.
 *
 * Reads `result.formatted_address`, `result.geometry.location.lat`, and
 * `result.geometry.location.lng`.
 *
 * Null-safe: any missing piece or malformed input returns `null`.
 */
export function parseDetails(json: unknown): PlaceDetails | null {
  // Guard: must be a plain object.
  if (json === null || typeof json !== 'object') return null;

  const obj = json as Record<string, unknown>;
  const resultProp = obj['result'];

  // Guard: result must be a plain object.
  if (resultProp === null || typeof resultProp !== 'object') return null;

  const result = resultProp as Record<string, unknown>;

  // formatted_address
  if (typeof result['formatted_address'] !== 'string') return null;
  const formattedAddress = result['formatted_address'];

  // geometry → location → lat / lng
  const geometry = result['geometry'];
  if (geometry === null || typeof geometry !== 'object') return null;

  const geoObj = geometry as Record<string, unknown>;
  const location = geoObj['location'];
  if (location === null || typeof location !== 'object') return null;

  const locObj = location as Record<string, unknown>;

  if (typeof locObj['lat'] !== 'number') return null;
  if (typeof locObj['lng'] !== 'number') return null;

  return {
    formattedAddress,
    latitude: locObj['lat'] as number,
    longitude: locObj['lng'] as number,
  };
}

// ─── Static Map URL ───────────────────────────────────────────────────────────

/**
 * Build a Google Static Maps image URL.
 *
 * The key is always a parameter — never hardcoded.
 * Defaults: zoom = 16, size = '600x300'.
 *
 * Example:
 *   staticMapUrl({ baseUrl: 'https://maps.googleapis.com/maps/api', key: 'K', lat: -1.29, lng: 36.81 })
 *   → 'https://maps.googleapis.com/maps/api/staticmap?center=-1.29,36.81&zoom=16&size=600x300&markers=-1.29,36.81&key=K'
 */
export function staticMapUrl(params: {
  baseUrl: string;
  key: string;
  lat: number;
  lng: number;
  zoom?: number;
  size?: string;
}): string {
  const { baseUrl, key, lat, lng } = params;
  const zoom = params.zoom ?? 16;
  const size = params.size ?? '600x300';

  return (
    `${baseUrl}/staticmap` +
    `?center=${lat},${lng}` +
    `&zoom=${zoom}` +
    `&size=${size}` +
    `&markers=${lat},${lng}` +
    `&key=${key}`
  );
}
