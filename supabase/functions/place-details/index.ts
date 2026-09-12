/**
 * place-details/index.ts — Supabase Edge Function (Deno).
 *
 * Returns resolved address, coordinates, and a server-side static map URL for a
 * given Google Place ID, via **Places API (New)** Place Details.
 *
 * Security: JWT verification is ENABLED (verify_jwt = true in config.toml).
 * The caller must supply a valid Supabase user JWT in the Authorization header.
 *
 * IMPORTANT: The Google Places API key is read ONLY from the Deno environment
 * (`GOOGLE_PLACES_API_KEY` secret) and sent to Google via the `X-Goog-Api-Key`
 * header. It is NEVER exposed to the client or included in the app bundle. Even the
 * static map URL (which embeds the key as a query param) is built server-side and
 * returned as an opaque string.
 *
 * App contract (unchanged): request `{ placeId, sessionToken? }` → response
 * `{ ok, details }`. The optional session token MUST be the same one used for the
 * autocomplete requests so Places bills the whole search as one session. The field
 * mask is pinned to `formattedAddress,location` (cheapest Place Details Essentials SKU).
 *
 * Graceful degradation: a missing key, missing placeId, or any fetch error all
 * return `{ ok: true, details: null }` so the app's manual address entry keeps working.
 */

import {
  buildDetailsRequest,
  parseDetails,
  staticMapUrl,
} from '../_shared/places.ts';

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Send a JSON response with the given HTTP status code. */
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Static Maps still uses the classic maps host (Maps Static API is not legacy).
const STATIC_MAPS_BASE = 'https://maps.googleapis.com/maps/api';

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  try {
    // 1. Parse body — safe try/catch so a bad JSON body returns null, not 500.
    let body: { placeId?: unknown; sessionToken?: unknown };
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const { placeId, sessionToken } = body;

    // Guard: placeId must be a non-empty string.
    if (!placeId || typeof placeId !== 'string') {
      return json({ ok: true, details: null });
    }

    // 2. Read the Google Places API key from the server-side environment.
    // Missing key → safe null result so manual address entry still works.
    const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!key) {
      return json({ ok: true, details: null });
    }

    // 3. Optional session token — must match the autocomplete session to bill as one.
    const token =
      typeof sessionToken === 'string' && sessionToken ? sessionToken : undefined;

    // 4. Build the Places API (New) request, call Google, and parse the response.
    const { url, method, headers } = buildDetailsRequest(key, placeId, token);
    const res = await fetch(url, { method, headers });
    const data = await res.json();
    const details = parseDetails(data);

    // 4a. Google returned no usable result.
    if (!details) {
      return json({ ok: true, details: null });
    }

    // 4b. Build server-side static map URL (key stays server-side).
    const mapUrl = staticMapUrl({
      baseUrl: STATIC_MAPS_BASE,
      key,
      lat: details.latitude,
      lng: details.longitude,
    });

    return json({
      ok: true,
      details: {
        formattedAddress: details.formattedAddress,
        latitude: details.latitude,
        longitude: details.longitude,
        mapUrl,
      },
    });
  } catch {
    // Any unexpected error → safe null result (200) so the app can fall back.
    return json(
      { ok: false, error: 'Could not load address details.', details: null },
      200,
    );
  }
});
