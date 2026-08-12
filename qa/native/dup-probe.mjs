#!/usr/bin/env node
/**
 * Booking idempotency behaviour probe (Phase 4E.2). Proves, against QA, the DB-level semantics
 * after migration 0034 (idempotency key replaces the coarse active-dedup index). Creates the
 * MINIMUM disposable QA data as the QA customer (faithful to createBooking + RLS), asserts, then
 * DELETES everything (service role; customers have no delete RLS). No payment / provider / status
 * change → no push. Prints only sanitized status — never keys.
 *
 *   1. OVER-BLOCK GONE: same service + same scheduled_for, DIFFERENT unit, no keys → BOTH create.
 *   2. Case I: same service/time/address, DIFFERENT idempotency keys → BOTH create (two jobs).
 *   3. Case H: same service/time/address, SAME idempotency key → one create + one 23505 (dedup).
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
} catch { /* CI */ }
const env = { ...fileEnv, ...process.env };
const BASEURL = env.QA_SUPABASE_URL, ANON = env.QA_SUPABASE_ANON_KEY, SR = env.QA_SERVICE_ROLE_KEY;

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0; const v = c === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16);
});

const signIn = await fetch(`${BASEURL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.QA_CUSTOMER_EMAIL, password: env.QA_CUSTOMER_PASSWORD }),
});
const s = await signIn.json();
const jwt = s.access_token, uid = s.user.id;
const H = { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };

const marker = `DUP-NEW-${Date.now()}`;
const scheduled_for = '2026-09-02T08:00:00.000Z';

async function insert(extra) {
  const res = await fetch(`${BASEURL}/rest/v1/bookings`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify({ customer_id: uid, service_id: 'house-cleaning', scheduled_for, notes: marker,
      address: 'Yaya Towers, Nairobi', address_label: 'Yaya Towers', ...extra }),
  });
  const t = await res.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch {}
  return { status: res.status, code: (Array.isArray(j) ? null : j?.code) ?? null, id: Array.isArray(j) ? j[0]?.id : undefined };
}

const out = { marker };
// 1. Over-block gone: same service+time, different unit, no idempotency key.
out.case1_overblock_gone = {
  A_unit7B: await insert({ building_name: 'Yaya Towers', floor: '7', door_number: '7B' }),
  B_unit8A: await insert({ building_name: 'Yaya Towers', floor: '8', door_number: '8A' }),
};
// 2. Different keys, identical destination → two jobs.
const k1 = uuid(), k2 = uuid();
out.case2_diff_keys = {
  C: await insert({ door_number: '9C', idempotency_key: k1 }),
  D: await insert({ door_number: '9C', idempotency_key: k2 }),
};
// 3. Same key twice → one booking, second deduped (23505).
const k3 = uuid();
out.case3_same_key = {
  E: await insert({ door_number: '10D', idempotency_key: k3 }),
  F_retry: await insert({ door_number: '10D', idempotency_key: k3 }),
};

// Count + cleanup (service role).
const svc = { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' };
const cnt = await fetch(`${BASEURL}/rest/v1/bookings?notes=eq.${encodeURIComponent(marker)}&select=id`, { headers: svc });
out.rowsCreated = (await cnt.json()).length;
const del = await fetch(`${BASEURL}/rest/v1/bookings?notes=eq.${encodeURIComponent(marker)}`, { method: 'DELETE', headers: { ...svc, Prefer: 'return=representation' } });
const res2 = await fetch(`${BASEURL}/rest/v1/bookings?notes=eq.${encodeURIComponent(marker)}&select=id`, { headers: svc });
out.cleanup = { deleted: (await del.json()).length, residual: (await res2.json()).length };

console.log(JSON.stringify(out, null, 2));
