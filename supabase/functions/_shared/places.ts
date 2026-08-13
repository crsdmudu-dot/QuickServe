/**
 * places.ts — Pure Google **Places API (New)** helper functions.
 *
 * PURE TypeScript — no network calls, no Deno-only APIs, no API key literals.
 * Uses only standard globals available in both Node and Deno.
 *
 * The builders return ready-to-send request descriptors (url/method/headers/body)
 * and the parsers read Places API (New) responses. They do NOT call fetch — the
 * Edge Functions do.
 *
 * Places API (New) endpoints used here:
 *   - Autocomplete:  POST https://places.googleapis.com/v1/places:autocomplete
 *   - Place Details: GET  https://places.googleapis.com/v1/places/{placeId}
 *
 * The API key is ALWAYS passed via the `X-Goog-Api-Key` header — never hardcoded,
 * never a URL query parameter. Results are restricted to Kenya via
 * `includedRegionCodes: ["ke"]`. An optional session token bundles the autocomplete
 * requests plus the following Place Details call into one billable session.
 *
 * Static Maps is intentionally UNCHANGED — it still uses the classic maps host and a
 * key query param, assembled server-side and returned to the app as an opaque string.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single autocomplete suggestion (app-facing shape — unchanged across the migration). */
export type PlaceSuggestion = {
  placeId: string;
  primaryText: string;
  secondaryText: string;
};

/** Resolved address and coordinates (app-facing shape — unchanged across the migration). */
export type PlaceDetails = {
  formattedAddress: string;
  latitude: number;
  longitude: number;
};

/** A ready-to-send HTTP request produced by the pure builders (no fetch here). */
export type PlacesRequest = {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  /** Present only for POST requests (autocomplete). */
  body?: string;
};

/** Base host for Places API (New). Static Maps still uses the classic maps host. */
const PLACES_NEW_BASE = 'https://places.googleapis.com/v1';

/** Read a Places API (New) localized text node `{ text: string }` → string ('' if absent). */
function readText(node: unknown): string {
  if (node === null || typeof node !== 'object') return '';
  const t = (node as Record<string, unknown>)['text'];
  return typeof t === 'string' ? t : '';
}

// ─── Autocomplete ─────────────────────────────────────────────────────────────

/**
 * Build a Places API (New) Autocomplete request.
 *
 * POST https://places.googleapis.com/v1/places:autocomplete
 * The key is sent via the `X-Goog-Api-Key` header — never hardcoded, never in the URL.
 * Results are restricted to Kenya via `includedRegionCodes: ["ke"]`. An optional
 * session token is included in the body when provided.
 */
export function buildAutocompleteRequest(
  key: string,
  query: string,
  sessionToken?: string,
): PlacesRequest {
  const payload: Record<string, unknown> = {
    input: query,
    includedRegionCodes: ['ke'],
  };
  if (sessionToken) payload.sessionToken = sessionToken;

  return {
    url: `${PLACES_NEW_BASE}/places:autocomplete`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask':
        'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat',
    },
    body: JSON.stringify(payload),
  };
}

/**
 * Parse a Places API (New) Autocomplete response into a list of suggestions.
 *
 * Reads `suggestions[].placePrediction`:
 *   - placeId       = placePrediction.placeId
 *   - primaryText   = placePrediction.structuredFormat.mainText.text
 *   - secondaryText = placePrediction.structuredFormat.secondaryText.text ?? ''
 *
 * Null-safe: malformed / missing data returns []; entries without a placeId are skipped.
 */
export function parseAutocomplete(json: unknown): PlaceSuggestion[] {
  if (json === null || typeof json !== 'object') return [];

  const suggestions = (json as Record<string, unknown>)['suggestions'];
  if (!Array.isArray(suggestions)) return [];

  const results: PlaceSuggestion[] = [];

  for (const item of suggestions) {
    if (item === null || typeof item !== 'object') continue;

    const prediction = (item as Record<string, unknown>)['placePrediction'];
    if (prediction === null || typeof prediction !== 'object') continue;

    const pred = prediction as Record<string, unknown>;
    const placeId = pred['placeId'];
    if (typeof placeId !== 'string' || placeId === '') continue;

    const sf = pred['structuredFormat'];
    const sfObj =
      sf !== null && typeof sf === 'object' ? (sf as Record<string, unknown>) : {};

    results.push({
      placeId,
      primaryText: readText(sfObj['mainText']),
      secondaryText: readText(sfObj['secondaryText']),
    });
  }

  return results;
}

// ─── Place Details ────────────────────────────────────────────────────────────

/**
 * Build a Places API (New) Place Details request.
 *
 * GET https://places.googleapis.com/v1/places/{placeId}
 * The key is sent via the `X-Goog-Api-Key` header. The field mask is REQUIRED and is
 * pinned to `formattedAddress,location` — exactly the two fields we consume, which
 * keeps billing on the cheapest Place Details "Essentials" SKU. The optional session
 * token MUST match the one used for autocomplete to complete/bill the session as one.
 */
export function buildDetailsRequest(
  key: string,
  placeId: string,
  sessionToken?: string,
): PlacesRequest {
  const qs = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : '';
  return {
    url: `${PLACES_NEW_BASE}/places/${encodeURIComponent(placeId)}${qs}`,
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'formattedAddress,location',
    },
  };
}

/**
 * Parse a Places API (New) Place Details response into a `PlaceDetails` object.
 *
 * Reads top-level `formattedAddress`, `location.latitude`, `location.longitude`.
 * Null-safe: any missing piece or malformed input returns null.
 */
export function parseDetails(json: unknown): PlaceDetails | null {
  if (json === null || typeof json !== 'object') return null;

  const obj = json as Record<string, unknown>;

  const formattedAddress = obj['formattedAddress'];
  if (typeof formattedAddress !== 'string') return null;

  const location = obj['location'];
  if (location === null || typeof location !== 'object') return null;

  const loc = location as Record<string, unknown>;
  if (typeof loc['latitude'] !== 'number') return null;
  if (typeof loc['longitude'] !== 'number') return null;

  return {
    formattedAddress,
    latitude: loc['latitude'] as number,
    longitude: loc['longitude'] as number,
  };
}

// ─── Static Map URL ───────────────────────────────────────────────────────────

/**
 * A single marker entry for multi-marker static map URLs.
 */
export type MapMarker = {
  lat: number;
  lng: number;
  /** Optional label character shown on the pin (e.g. 'P', 'C'). */
  label?: string;
  /** Optional pin color (e.g. 'blue', 'red', '0x00FFFF'). */
  color?: string;
};

/**
 * A single lat/lng point used when drawing a path on a static map.
 */
export type MapPathPoint = {
  lat: number;
  lng: number;
};

/**
 * Build a Google Static Maps image URL.
 *
 * The key is always a parameter — never hardcoded.
 * Defaults: zoom = 16, size = '600x300'.
 *
 * **Single-marker mode** (backward-compatible, Slice-20):
 *   Pass `lat` + `lng` only. Produces a centered, single-pin URL identical to
 *   the original output.
 *
 * **Multi-marker mode** (new):
 *   Pass `markers` array. One `&markers=` group is emitted per entry
 *   (`markers=color:<color>|label:<label>|<lat>,<lng>`; color/label omitted when
 *   not provided). The explicit `center`/`zoom` params are dropped so Google
 *   auto-fits all markers. `size` is still included.
 *
 * **Path** (new, optional):
 *   Pass `path` array (2+ points) to draw a polyline:
 *   `&path=<lat>,<lng>|<lat>,<lng>|...`.
 *
 * Examples:
 *   // Single marker (original, unchanged):
 *   staticMapUrl({ baseUrl, key: 'K', lat: -1.29, lng: 36.81 })
 *   → '…/staticmap?center=-1.29,36.81&zoom=16&size=600x300&markers=-1.29,36.81&key=K'
 *
 *   // Multiple markers:
 *   staticMapUrl({ baseUrl, key: 'K', markers: [{ lat: -1.29, lng: 36.81, label: 'P', color: 'blue' }] })
 *   → '…/staticmap?size=600x300&markers=color:blue|label:P|-1.29,36.81&key=K'
 */
export function staticMapUrl(params: {
  baseUrl: string;
  key: string;
  /** Used in single-marker mode. Optional when `markers` is provided. */
  lat?: number;
  /** Used in single-marker mode. Optional when `markers` is provided. */
  lng?: number;
  zoom?: number;
  size?: string;
  /** Multi-marker mode: one pin per entry. When present, overrides lat/lng centering. */
  markers?: MapMarker[];
  /** Optional polyline drawn over the map (2+ points). */
  path?: MapPathPoint[];
}): string {
  const { baseUrl, key } = params;
  const size = params.size ?? '600x300';

  // ── Multi-marker mode ──────────────────────────────────────────────────────
  if (params.markers && params.markers.length > 0) {
    let url = `${baseUrl}/staticmap?size=${size}`;

    for (const marker of params.markers) {
      let markerSpec = '';
      if (marker.color) markerSpec += `color:${marker.color}|`;
      if (marker.label) markerSpec += `label:${marker.label}|`;
      markerSpec += `${marker.lat},${marker.lng}`;
      url += `&markers=${markerSpec}`;
    }

    if (params.path && params.path.length >= 2) {
      const pathStr = params.path
        .map((p) => `${p.lat},${p.lng}`)
        .join('|');
      url += `&path=${pathStr}`;
    }

    url += `&key=${key}`;
    return url;
  }

  // ── Single-marker mode (backward-compatible) ───────────────────────────────
  const lat = params.lat as number;
  const lng = params.lng as number;
  const zoom = params.zoom ?? 16;

  return (
    `${baseUrl}/staticmap` +
    `?center=${lat},${lng}` +
    `&zoom=${zoom}` +
    `&size=${size}` +
    `&markers=${lat},${lng}` +
    `&key=${key}`
  );
}
