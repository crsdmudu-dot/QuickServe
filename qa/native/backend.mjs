#!/usr/bin/env node
/**
 * Phase 3F backend helper — QA Supabase REST via service role, for SETUP VERIFICATION,
 * the ADMIN ASSIGNMENT prerequisite, and CLEANUP only. The behaviours under test (booking
 * creation, provider progression, review submission) are driven through the native UI
 * (Maestro), never here.
 *
 * Never prints keys. Reads credentials from qa/.env locally, or from process.env in CI
 * (process.env overlays the file, so GitHub Actions secrets work with no secrets file). Usage:
 *   node qa/native/backend.mjs provider-id provider1
 *   node qa/native/backend.mjs find <marker>
 *   node qa/native/backend.mjs read <bookingId>
 *   node qa/native/backend.mjs assign <bookingId> <providerId> <name> <phone>
 *   node qa/native/backend.mjs review <bookingId>
 *   node qa/native/backend.mjs provider-rating <providerId>
 *   node qa/native/backend.mjs cleanup <marker>
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const __dir = dirname(fileURLToPath(import.meta.url));
// Locally: parse qa/.env with dotenv (matches the certified Playwright helpers — handles
// inline comments / quoting on the long JWT lines). In CI (GitHub Actions macOS runner):
// qa/.env is absent, so use process.env (secrets) instead. process.env overlays the file
// so either source works with no code change.
let fileEnv = {};
try {
  const require = createRequire(import.meta.url);
  const dotenv = require(resolve(__dir, '../node_modules/dotenv'));
  const raw = (await import('node:fs')).readFileSync(resolve(__dir, '../.env'), 'utf8');
  fileEnv = dotenv.parse(raw);
} catch {
  /* no qa/.env (e.g. CI) — fall through to process.env */
}
const env = { ...fileEnv, ...process.env };
const URL = env.QA_SUPABASE_URL;
const ANON = env.QA_SUPABASE_ANON_KEY;
const SR = env.QA_SERVICE_ROLE_KEY;
const svc = { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' };

async function j(method, path, { headers = {}, body } = {}) {
  const res = await fetch(URL + path, { method, headers: { ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, text };
}

const [cmd, ...args] = process.argv.slice(2);

async function providerId(role) {
  const emailKey = role === 'provider2' ? 'QA_PROVIDER2_EMAIL' : role === 'customer' ? 'QA_CUSTOMER_EMAIL' : 'QA_PROVIDER1_EMAIL';
  const pwKey = role === 'provider2' ? 'QA_PROVIDER2_PASSWORD' : role === 'customer' ? 'QA_CUSTOMER_PASSWORD' : 'QA_PROVIDER1_PASSWORD';
  const r = await j('POST', '/auth/v1/token?grant_type=password', {
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: { email: env[emailKey], password: env[pwKey] },
  });
  if (r.status !== 200) throw new Error(`sign-in ${role} HTTP ${r.status}`);
  const id = r.data.user.id;
  const p = await j('GET', `/rest/v1/profiles?id=eq.${id}&select=id,full_name,phone,average_rating,review_count`, { headers: svc });
  const prof = (p.data || [])[0] || {};
  return { id, full_name: prof.full_name ?? null, phone: prof.phone ?? null, average_rating: prof.average_rating ?? null, review_count: prof.review_count ?? null };
}

function pickBooking(b) {
  return b && {
    id: b.id, customer_id: b.customer_id, service_id: b.service_id, status: b.status,
    address: b.address, scheduled_for: b.scheduled_for, notes: b.notes,
    assigned_provider_id: b.assigned_provider_id, assigned_provider_name: b.assigned_provider_name,
    created_at: b.created_at, updated_at: b.updated_at,
  };
}

const out = (o) => console.log(JSON.stringify(o, null, 2));

try {
  if (cmd === 'provider-id') out(await providerId(args[0] || 'provider1'));
  else if (cmd === 'find') {
    const r = await j('GET', `/rest/v1/bookings?notes=like.*${encodeURIComponent(args[0])}*&select=*&order=created_at.desc`, { headers: svc });
    out({ count: (r.data || []).length, bookings: (r.data || []).map(pickBooking) });
  } else if (cmd === 'read') {
    const r = await j('GET', `/rest/v1/bookings?id=eq.${args[0]}&select=*`, { headers: svc });
    out(pickBooking((r.data || [])[0]) || { error: 'not found' });
  } else if (cmd === 'assign') {
    const [id, pid, name, phone] = args;
    const r = await j('PATCH', `/rest/v1/bookings?id=eq.${id}`, {
      headers: { ...svc, Prefer: 'return=representation' },
      body: { assigned_provider_id: pid, assigned_provider_name: name, assigned_provider_phone: phone || null, status: 'provider_assigned' },
    });
    out({ status: r.status, row: pickBooking((r.data || [])[0]) });
  } else if (cmd === 'review') {
    const r = await j('GET', `/rest/v1/reviews?booking_id=eq.${args[0]}&select=id,booking_id,customer_id,provider_id,rating,comment,is_hidden`, { headers: svc });
    out({ count: (r.data || []).length, reviews: r.data || [] });
  } else if (cmd === 'provider-rating') {
    const r = await j('GET', `/rest/v1/profiles?id=eq.${args[0]}&select=id,average_rating,review_count`, { headers: svc });
    out((r.data || [])[0] || { error: 'not found' });
  } else if (cmd === 'cleanup') {
    const marker = args[0];
    const b = await j('GET', `/rest/v1/bookings?notes=like.*${encodeURIComponent(marker)}*&select=id`, { headers: svc });
    const ids = (b.data || []).map((x) => x.id);
    let delReviews = 0;
    for (const id of ids) {
      const dr = await j('DELETE', `/rest/v1/reviews?booking_id=eq.${id}`, { headers: { ...svc, Prefer: 'return=representation' } });
      delReviews += (dr.data || []).length;
    }
    const db = await j('DELETE', `/rest/v1/bookings?notes=like.*${encodeURIComponent(marker)}*`, { headers: { ...svc, Prefer: 'return=representation' } });
    // residual verification
    const rb = await j('GET', `/rest/v1/bookings?notes=like.*${encodeURIComponent(marker)}*&select=id`, { headers: svc });
    out({ deletedBookings: (db.data || []).length, deletedReviews: delReviews, residualBookings: (rb.data || []).length });
  } else {
    console.error('unknown command:', cmd);
    process.exit(2);
  }
} catch (e) {
  console.error('ERROR', e.message);
  process.exit(1);
}
