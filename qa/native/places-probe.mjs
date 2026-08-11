#!/usr/bin/env node
/**
 * QA runtime probe for the address-autocomplete backend (Phase 4E.2 address investigation).
 *
 * Signs in as the QA customer and calls the `places-autocomplete` / `place-details`
 * Edge Functions exactly as the app does (supabase.functions.invoke → POST
 * /functions/v1/<fn> with the user JWT). Prints ONLY HTTP status + shape — never keys.
 *
 * Usage: node qa/native/places-probe.mjs "Westlands"
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
const query = process.argv[2] || 'Westlands';

const signIn = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.QA_CUSTOMER_EMAIL, password: env.QA_CUSTOMER_PASSWORD }),
});
if (signIn.status !== 200) { console.log(JSON.stringify({ step: 'sign-in', status: signIn.status }, null, 2)); process.exit(1); }
const jwt = (await signIn.json()).access_token;

async function invoke(fn, body) {
  const res = await fetch(`${URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return {
    function: fn,
    httpStatus: res.status,
    okField: json?.ok ?? null,
    suggestionsCount: Array.isArray(json?.suggestions) ? json.suggestions.length : null,
    detailsPresent: json?.details != null ? true : json?.details === null ? false : null,
    // First 120 chars of the raw body, so a 404/HTML error is visible WITHOUT leaking anything.
    bodyPreview: (text || '').slice(0, 120),
  };
}

console.log(JSON.stringify({
  query,
  autocomplete: await invoke('places-autocomplete', { query }),
  details: await invoke('place-details', { placeId: 'ChIJ_placeholder_test' }),
}, null, 2));
