/**
 * places-autocomplete/index.ts — Supabase Edge Function (Deno).
 *
 * Returns Google Places autocomplete suggestions for a given query string.
 *
 * Security: JWT verification is ENABLED (verify_jwt = true in config.toml).
 * The caller must supply a valid Supabase user JWT in the Authorization header.
 *
 * IMPORTANT: The Google Places API key is read ONLY from the Deno environment
 * (`GOOGLE_PLACES_API_KEY` secret). It is NEVER exposed to the client or
 * included in the app bundle.
 *
 * Graceful degradation: a missing key, empty query, or any fetch error all
 * return `{ ok: true, suggestions: [] }` so the app's manual address entry
 * path keeps working.
 */

import {
  buildAutocompleteRequest,
  parseAutocomplete,
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

const GOOGLE_BASE_URL = 'https://maps.googleapis.com/maps/api';

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  try {
    // 1. Parse body — safe try/catch so a bad JSON body returns empty, not 500.
    let body: { query?: unknown };
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const { query } = body;

    // Guard: query must be a non-empty string.
    if (!query || typeof query !== 'string' || !query.trim()) {
      return json({ ok: true, suggestions: [] });
    }

    // 2. Read the Google Places API key from the server-side environment.
    // Missing key → safe empty result so manual address entry still works.
    const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!key) {
      return json({ ok: true, suggestions: [] });
    }

    // 3. Build request URL, call Google, and parse the response.
    const { url } = buildAutocompleteRequest(GOOGLE_BASE_URL, key, query.trim());
    const res = await fetch(url);
    const data = await res.json();
    const suggestions = parseAutocomplete(data);

    // 4. Return suggestions (may be empty if Google returned no predictions).
    return json({ ok: true, suggestions });
  } catch {
    // Any unexpected error → safe empty result (200) so the app can fall back.
    return json(
      { ok: false, error: 'Address search unavailable.', suggestions: [] },
      200,
    );
  }
});
