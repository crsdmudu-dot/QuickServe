#!/usr/bin/env node
/**
 * QA runtime probe for the address-autocomplete backend (Places API New).
 *
 * Signs in as the QA customer and calls the `places-autocomplete` / `place-details`
 * Edge Functions exactly as the app does (POST /functions/v1/<fn> with the user JWT),
 * threading ONE session token through autocomplete → place details. Prints ONLY
 * sanitized status/shape — never the Google key (the mapUrl key param is redacted).
 *
 * Usage: node qa/native/places-probe.mjs            # runs the default Kenya query set
 *        node qa/native/places-probe.mjs "Karen"    # single query
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const __dir = dirname(fileURLToPath(import.meta.url));
let fileEnv = {};
try {
  const require = createRequire(import.meta.url);
  const dotenv = require(resolve(__dir, '../node_modules/dotenv'));
  const raw = (await import('node:fs')).readFileSync(resolve(__dir, '../.env'), 'utf8');
  fileEnv = dotenv.parse(raw);
} catch { /* CI: use process.env */ }
const env = { ...fileEnv, ...process.env };
const URL = env.QA_SUPABASE_URL, ANON = env.QA_SUPABASE_ANON_KEY;

const QUERIES = process.argv[2]
  ? [process.argv[2]]
  : ['Westlands', 'Kilimani', 'Karen', 'Lavington', 'Nairobi Hospital'];

// One session token for the whole probe run (autocomplete + the details call).
const sessionToken = 'probe-' + Math.random().toString(16).slice(2) + Date.now().toString(16);

const redactKey = (s) => (typeof s === 'string' ? s.replace(/key=[^&]+/i, 'key=[REDACTED]') : s);

const signIn = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.QA_CUSTOMER_EMAIL, password: env.QA_CUSTOMER_PASSWORD }),
});
if (signIn.status !== 200) { console.log(JSON.stringify({ step: 'sign-in', status: signIn.status })); process.exit(1); }
const jwt = (await signIn.json()).access_token;

async function invoke(fn, body) {
  const res = await fetch(`${URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { httpStatus: res.status, json, raw: text };
}

const kenya = (s) => /kenya|nairobi|mombasa|kisumu/i.test(String(s || ''));
const report = { sessionToken: sessionToken.slice(0, 10) + '…', autocomplete: [], details: null, keyLeakInJson: false };
let chosenPlaceId = null, chosenLabel = null;

for (const q of QUERIES) {
  const r = await invoke('places-autocomplete', { query: q, sessionToken });
  const sugg = r.json?.suggestions ?? [];
  const first = sugg[0] ?? null;
  report.autocomplete.push({
    query: q,
    httpStatus: r.httpStatus,
    ok: r.json?.ok ?? null,
    suggestionsCount: Array.isArray(sugg) ? sugg.length : null,
    firstPlaceIdPrefix: first ? String(first.placeId).slice(0, 8) + '…' : null,
    firstPrimaryText: first?.primaryText ?? null,
    firstSecondaryText: first?.secondaryText ?? null,
    kenyaRelevant: first ? kenya(first.primaryText + ' ' + first.secondaryText) : null,
  });
  // Detect any raw key leakage in the JSON payload the app receives (mapUrl is checked separately).
  if (/AIza[0-9A-Za-z_-]{10,}/.test(r.raw || '')) report.keyLeakInJson = true;
  if (!chosenPlaceId && first?.placeId) { chosenPlaceId = first.placeId; chosenLabel = first.primaryText; }
}

// Same session token → place details for the first real suggestion.
if (chosenPlaceId) {
  const d = await invoke('place-details', { placeId: chosenPlaceId, sessionToken });
  const det = d.json?.details ?? null;
  report.details = {
    forLabel: chosenLabel,
    httpStatus: d.httpStatus,
    ok: d.json?.ok ?? null,
    formattedAddress: det?.formattedAddress ?? null,
    latitude: det?.latitude ?? null,
    longitude: det?.longitude ?? null,
    hasCoordinates: typeof det?.latitude === 'number' && typeof det?.longitude === 'number',
    kenyaRelevant: kenya(det?.formattedAddress),
    mapUrlPresent: typeof det?.mapUrl === 'string' && det.mapUrl.length > 0,
    mapUrlHost: det?.mapUrl ? new (await import('node:url')).URL(det.mapUrl).host : null,
    mapUrlSample: redactKey(det?.mapUrl ?? null), // key redacted
    // The raw details payload must not leak the key EXCEPT inside mapUrl (by design).
    keyLeakOutsideMapUrl: /AIza[0-9A-Za-z_-]{10,}/.test((d.raw || '').replace(det?.mapUrl ?? '', '')),
  };
}

console.log(JSON.stringify(report, null, 2));
