/**
 * places-autocomplete/index.ts — Supabase Edge Function (Deno).
 *
 * Returns Google **Places API (New)** autocomplete suggestions for a query string.
 *
 * Security: JWT verification is ENABLED (verify_jwt = true in config.toml).
 * The caller must supply a valid Supabase user JWT in the Authorization header.
 *
 * IMPORTANT: The Google Places API key is read ONLY from the Deno environment
 * (`GOOGLE_PLACES_API_KEY` secret) and sent to Google via the `X-Goog-Api-Key`
 * header. It is NEVER exposed to the client or included in the app bundle.
 *
 * App contract (unchanged): request `{ query, sessionToken? }` → response
 * `{ ok, suggestions }`. The optional session token, when supplied, is forwarded
 * to Places so autocomplete + the following Place Details call bill as one session.
 *
 * Graceful degradation: a missing key, empty query, or any fetch error all return
 * `{ ok: true, suggestions: [] }` so the app's manual address entry keeps working.
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

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  try {
    // 1. Parse body — safe try/catch so a bad JSON body returns empty, not 500.
    let body: { query?: unknown; sessionToken?: unknown };
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const { query, sessionToken } = body;

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

    // 3. Optional session token (billing correlation) — only a non-empty string is used.
    const token =
      typeof sessionToken === 'string' && sessionToken ? sessionToken : undefined;

    // 4. Build the Places API (New) request, call Google, and parse the response.
    const { url, method, headers, body: reqBody } = buildAutocompleteRequest(
      key,
      query.trim(),
      token,
    );
    const res = await fetch(url, { method, headers, body: reqBody });
    const data = await res.json();
    const suggestions = parseAutocomplete(data);

    // 5. Return suggestions (may be empty if Google returned no predictions).
    return json({ ok: true, suggestions });
  } catch {
    // Any unexpected error → safe empty result (200) so the app can fall back.
    return json(
      { ok: false, error: 'Address search unavailable.', suggestions: [] },
      200,
    );
  }
});
