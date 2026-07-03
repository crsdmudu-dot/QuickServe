/**
 * tracking-map/index.ts — Supabase Edge Function (Deno).
 *
 * Builds a server-side Google Static Maps URL showing two markers
 * (provider "P" in blue, customer "C" in red) connected by a path line.
 *
 * Security: JWT verification is ENABLED (verify_jwt = true in config.toml).
 * The caller must supply a valid Supabase user JWT in the Authorization header.
 *
 * IMPORTANT: The Google Maps API key is read ONLY from the Deno environment
 * (`GOOGLE_PLACES_API_KEY` secret). It is NEVER exposed to the client or
 * included in the app bundle. The static map URL (which embeds the key as a
 * query param) is built server-side and returned as an opaque string.
 *
 * Graceful degradation: a missing key, invalid coordinates, or any error
 * returns `{ ok: true, mapUrl: null }` (always HTTP 200) so the app's
 * no-image fallback renders without crashing.
 */

import { staticMapUrl } from '../_shared/places.ts';

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Send a JSON response with the given HTTP status code. */
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GOOGLE_BASE_URL = 'https://maps.googleapis.com/maps/api';

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  try {
    // 1. Parse body — safe try/catch so a bad JSON body falls back to {}.
    let body: {
      providerLat?: unknown;
      providerLng?: unknown;
      customerLat?: unknown;
      customerLng?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const { providerLat, providerLng, customerLat, customerLng } = body;

    // 2. Validate: all four must be finite numbers.
    // Any missing or non-numeric field → safe null so the app degrades gracefully.
    if (
      typeof providerLat !== 'number' || !Number.isFinite(providerLat) ||
      typeof providerLng !== 'number' || !Number.isFinite(providerLng) ||
      typeof customerLat !== 'number' || !Number.isFinite(customerLat) ||
      typeof customerLng !== 'number' || !Number.isFinite(customerLng)
    ) {
      return json({ ok: true, mapUrl: null });
    }

    // 3. Read the Google Maps API key from the server-side environment.
    // Missing key → safe null so the app still renders its no-image fallback.
    const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!key) {
      return json({ ok: true, mapUrl: null });
    }

    // 4. Build a static map URL with two markers and a connecting path.
    // The key is embedded inside the returned URL only — never logged or
    // returned separately.
    const mapUrl = staticMapUrl({
      baseUrl: GOOGLE_BASE_URL,
      key,
      markers: [
        { lat: providerLat, lng: providerLng, label: 'P', color: 'blue' },
        { lat: customerLat, lng: customerLng, label: 'C', color: 'red' },
      ],
      path: [
        { lat: providerLat, lng: providerLng },
        { lat: customerLat, lng: customerLng },
      ],
      size: '600x300',
    });

    return json({ ok: true, mapUrl });
  } catch {
    // Any unexpected error → safe null result (200) so the app can fall back.
    return json({ ok: true, mapUrl: null }, 200);
  }
});
