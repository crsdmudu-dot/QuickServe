#!/usr/bin/env node
/**
 * partial-release-reflects-unresolved.mjs — local PostgreSQL regression for migration 0061
 * (review finding on 0059 as applied to QA: a partial hold release whose released intent fails in
 * the same worker pass left the account falsely complete_with_retained; a successful partial
 * release never refreshed retained_exception_ref).
 *
 * Runs the REAL routines on a LOCAL database only (refuses any non-local host). Mirrors the
 * worker's stage order exactly: intents stage first (here the released intent is driven to
 * needs_operator through the real state machine: claim → authorize → record_destroy_result with
 * 'api_permission'), then list_cleanup_candidates, then try_complete_cleanup for each candidate.
 *
 * Scenario A (failing released intent): expect the account to be selected and to become
 *   needs_operator with reason 'intent_needs_operator' while the other intent stays held.
 * Scenario B (successful partial release): expect the account to be selected once, re-finalised
 *   as complete_with_retained with retained_exception_ref = the remaining hold's reference, then
 *   NOT selected again while nothing changes; a full release then finalises as 'complete'.
 *
 * Prerequisites: `supabase start` (migrations 0001–0061 applied), `npm i --no-save pg`,
 * DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
 * Exit 0 = both scenarios hold; 1 = regression; 2 = cleanup failure. Exact-id cleanup in `finally`.
 */
import { randomUUID } from 'node:crypto';

const url = process.env.DATABASE_URL ?? '';
const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
if (!['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host)) {
  console.error('REFUSED: DATABASE_URL must point at a LOCAL database.'); process.exit(2);
}
let pg; try { pg = await import('pg'); } catch { console.error('Run: npm i --no-save pg'); process.exit(2); }
const { Client } = pg.default ?? pg;
const c = new Client({ connectionString: url });
const q = (sql, params = []) => c.query(sql, params);
const marker = `qa-0061-${randomUUID().slice(0, 8)}`;
const created = { users: [], bookings: [], deletions: [], holds: [], intents: [] };
let exit = 1;

async function fixtureAccount(label) {
  const user = randomUUID(), provider = randomUUID();
  await q(`insert into auth.users (id, email) values ($1,$2), ($3,$4) on conflict do nothing`, [user, `${marker}-${label}-c@example.com`, provider, `${marker}-${label}-p@example.com`]).catch(() => {});
  await q(`insert into public.profiles (id, role, full_name, phone) values ($1,'customer',$2,'+254700000009') on conflict (id) do nothing`, [user, marker]);
  await q(`insert into public.profiles (id, role, full_name, phone, approval_status) values ($1,'provider',$2,'+254700000009','approved') on conflict (id) do nothing`, [provider, marker]);
  created.users.push(user, provider);
  const bookings = [];
  for (let i = 0; i < 2; i += 1) {
    const b = randomUUID();
    await q(`insert into public.bookings (id, customer_id, assigned_provider_id, service_id, address, scheduled_for, status) values ($1,$2,$3,'house_cleaning',$4,now(),'completed')`, [b, user, provider, marker]);
    created.bookings.push(b); bookings.push(b);
  }
  const d = await q(`insert into public.account_deletions (user_id, role, status, db_completed_at, access_state, auth_state, cleanup_state, cleanup_eligible_at, cleanup_boundary_at, auth_deleted_at)
                     values ($1,'customer','deleted',now() - interval '2 days','revoked','deleted','pending',now() - interval '2 days',now() - interval '1 day',now() - interval '2 days') returning id`, [user]);
  const deletion = d.rows[0].id; created.deletions.push(deletion);
  const holds = [], intents = [];
  for (const [i, b] of bookings.entries()) {
    const h = await q(`insert into public.legal_holds (scope, booking_id, source, reference) values ('booking',$1,'legal',$2) returning id`, [b, `${marker}-hold-${label}-${i}`]);
    holds.push({ id: h.rows[0].id, reference: `${marker}-hold-${label}-${i}` }); created.holds.push(h.rows[0].id);
    const it = await q(`insert into public.deletion_photo_intents (account_deletion_id, user_id, booking_id, bucket_id, object_path, state, hold_id, expected_object_id)
                        values ($1,$2,$3,'booking-photos',$4,'held',$5,$6) returning id`, [deletion, user, b, `${b}/${marker}-${i}.png`, h.rows[0].id, randomUUID()]);
    intents.push(it.rows[0].id); created.intents.push(it.rows[0].id);
  }
  // Settle as complete_with_retained through the real routine (boundary already passed).
  const tc = await q(`select public.try_complete_cleanup($1) as r`, [deletion]);
  if (tc.rows[0].r.cleanup_state !== 'complete_with_retained') throw new Error(`fixture: expected complete_with_retained, got ${JSON.stringify(tc.rows[0].r)}`);
  return { user, deletion, holds, intents };
}
const isCandidate = async (deletion) => (await q(`select deletion_id from public.list_cleanup_candidates(100)`)).rows.some((r) => r.deletion_id === deletion);
const account = async (deletion) => (await q(`select cleanup_state, retained_exception_ref, closed_at from public.account_deletions where id = $1`, [deletion])).rows[0];
const intent = async (id) => (await q(`select state, last_error_class from public.deletion_photo_intents where id = $1`, [id])).rows[0];

try {
  await c.connect();
  await q("set statement_timeout = '30s'");

  // ── Scenario A ────────────────────────────────────────────────────────────────────────────
  const A = await fixtureAccount('A');
  await q(`select public.release_hold($1, null, 'partial release')`, [A.holds[0].id]);
  if ((await intent(A.intents[0])).state !== 'planned') throw new Error('A: released intent not re-planned');
  // Worker stage 1, real state machine: claim → authorize (object absent? no: expected id is random, the
  // object does not exist locally → authorize would report 'absent'). To reach needs_operator through
  // the real routines we drive the permission path: mark the intent destroying under a real lease and
  // record an api_permission result.
  const claimed = (await q(`select intent_id, lease_id from public.claim_deletion_work(100)`)).rows.find((r) => r.intent_id === A.intents[0]);
  if (!claimed) throw new Error('A: released intent not claimable');
  await q(`update public.deletion_photo_intents set state = 'destroying', destroy_authorized_at = now() where id = $1`, [A.intents[0]]);
  const rec = (await q(`select public.record_destroy_result($1, $2, 'api_permission', 'local regression') as r`, [A.intents[0], claimed.lease_id])).rows[0].r;
  if (rec.state !== 'needs_operator') throw new Error(`A: expected needs_operator, got ${JSON.stringify(rec)}`);
  // Worker stage 2: candidates, then completion.
  const selectedA = await isCandidate(A.deletion);
  const beforeA = await account(A.deletion);
  const tcA = selectedA ? (await q(`select public.try_complete_cleanup($1) as r`, [A.deletion])).rows[0].r : null;
  const afterA = await account(A.deletion);
  const okA = selectedA && tcA && tcA.reason === 'intent_needs_operator' && afterA.cleanup_state === 'needs_operator' && afterA.closed_at === null && (await intent(A.intents[1])).state === 'held';
  console.log(JSON.stringify({ scenarioA: { selected_as_candidate: selectedA, before: beforeA, try_complete: tcA, after: afterA, other_intent: await intent(A.intents[1]), ok: okA } }, null, 2));

  // ── Scenario B ────────────────────────────────────────────────────────────────────────────
  const B = await fixtureAccount('B');
  await q(`select public.release_hold($1, null, 'partial release')`, [B.holds[0].id]);
  // Stage 1: the released intent completes (object absent locally → authorize reports absent → finish).
  const cl = (await q(`select intent_id, lease_id from public.claim_deletion_work(100)`)).rows.find((r) => r.intent_id === B.intents[0]);
  const auth = (await q(`select public.authorize_destroy($1, $2) as r`, [B.intents[0], cl.lease_id])).rows[0].r;
  if (auth.reason !== 'absent') throw new Error(`B: expected absent, got ${JSON.stringify(auth)}`);
  const fin = (await q(`select public.finish_intent($1, $2) as r`, [B.intents[0], cl.lease_id])).rows[0].r;
  if (!fin.verified) throw new Error(`B: finish failed ${JSON.stringify(fin)}`);
  // Stage 2: selected once, re-finalised with the remaining reference; then stable.
  const selB1 = await isCandidate(B.deletion);
  const tcB = selB1 ? (await q(`select public.try_complete_cleanup($1) as r`, [B.deletion])).rows[0].r : null;
  const afterB = await account(B.deletion);
  const selB2 = await isCandidate(B.deletion);
  await q(`select public.release_hold($1, null, 'full release')`, [B.holds[1].id]);
  const cl2 = (await q(`select intent_id, lease_id from public.claim_deletion_work(100)`)).rows.find((r) => r.intent_id === B.intents[1]);
  await q(`select public.authorize_destroy($1, $2)`, [B.intents[1], cl2.lease_id]);
  await q(`select public.finish_intent($1, $2)`, [B.intents[1], cl2.lease_id]);
  const selB3 = await isCandidate(B.deletion);
  const tcB2 = selB3 ? (await q(`select public.try_complete_cleanup($1) as r`, [B.deletion])).rows[0].r : null;
  const finalB = await account(B.deletion);
  const okB = selB1 && afterB.cleanup_state === 'complete_with_retained' && afterB.retained_exception_ref === B.holds[1].reference && selB2 === false && selB3 && finalB.cleanup_state === 'complete' && finalB.retained_exception_ref === null;
  console.log(JSON.stringify({ scenarioB: { selected_after_partial_release: selB1, refinalised: tcB, after_partial: afterB, selected_again_while_unchanged: selB2, selected_after_full_release: selB3, final: tcB2, final_account: finalB, ok: okB } }, null, 2));
  exit = okA && okB ? 0 : 1;
} catch (err) {
  console.error('REGRESSION:', err.message); exit = 1;
} finally {
  const failures = [];
  const del = async (sql, params) => { try { await q(sql, params); } catch (e) { failures.push(e.message); } };
  if (created.intents.length) { await del(`delete from public.legal_hold_items where intent_id = any($1)`, [created.intents]); await del(`delete from public.deletion_photo_intents where id = any($1)`, [created.intents]); }
  if (created.holds.length) { await del(`delete from public.legal_hold_items where hold_id = any($1)`, [created.holds]); await del(`delete from public.legal_holds where id = any($1)`, [created.holds]); }
  if (created.deletions.length) await del(`delete from public.account_deletions where id = any($1)`, [created.deletions]);
  if (created.bookings.length) await del(`delete from public.bookings where id = any($1)`, [created.bookings]);
  if (created.users.length) { await del(`delete from public.profiles where id = any($1)`, [created.users]); await del(`delete from auth.users where id = any($1)`, [created.users]); }
  await c.end().catch(() => {});
  if (failures.length) { console.error('CLEANUP FAILURES:\n' + failures.join('\n')); exit = 2; }
  process.exit(exit);
}
