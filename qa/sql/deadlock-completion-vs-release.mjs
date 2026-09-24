#!/usr/bin/env node
/**
 * deadlock-completion-vs-release.mjs — deterministic two-connection PostgreSQL regression for
 * the Phase B1 lock order (finding 2 of the revision-3 review).
 *
 * STATUS: PREPARED, NOT RUN on this machine (no local PostgreSQL/Supabase available: Docker
 * daemon down, no psql, no `pg` module). It refuses any non-local database.
 *
 * The interleaving under test:
 *   T1 (try_complete_cleanup side)  takes the user advisory lock, then the account_deletions row
 *                                   lock, then requests the booking advisory lock (inventory).
 *   T2 (release_hold side)          takes the booking advisory lock, then the intent row locks,
 *                                   then — under the OLD design — updated account_deletions.
 * With the old design T1 waits for the booking lock T2 holds while T2 waits for the account row
 * T1 holds: PostgreSQL reports 40P01 on one of them. Under 0059 revision 4, release_hold never
 * touches account_deletions, so T2 completes and T1 proceeds.
 *
 * The script mirrors each routine's FIRST locking steps explicitly on its own connection (that is
 * what makes the ordering deterministic), then issues the real routine on the second connection
 * and a real inventory-equivalent lock request on the first, with bounded timeouts.
 *
 * Prerequisites (local only):
 *   1. A local database with migrations 0001–0060 applied, e.g. `supabase start && supabase db reset`
 *      (Docker required), or any local PostgreSQL 15+ with the migrations applied in order.
 *   2. `npm i --no-save pg` in the repository root (not a project dependency).
 *   3. DATABASE_URL pointing at that LOCAL database, e.g.
 *        postgresql://postgres:postgres@127.0.0.1:54322/postgres
 *
 * Run:  node qa/sql/deadlock-completion-vs-release.mjs
 * Exit 0 = no deadlock, T2 completed while T1 held the account row; T1 then acquired the booking
 * lock and completed. Exit 1 = deadlock or timeout (regression). Fixtures are created inside the
 * script with a run marker and removed by exact id in a `finally` block; a cleanup failure exits 2.
 */
import { randomUUID } from 'node:crypto';

const url = process.env.DATABASE_URL ?? '';
const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
if (!['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host)) {
  console.error('REFUSED: DATABASE_URL must point at a LOCAL database (localhost / 127.0.0.1). Never a shared project.');
  process.exit(2);
}
let pg;
try { pg = await import('pg'); } catch { console.error('The `pg` module is not installed. Run: npm i --no-save pg'); process.exit(2); }
const { Client } = pg.default ?? pg;

const marker = `qa-deadlock-${randomUUID().slice(0, 8)}`;
const ids = { user: randomUUID(), provider: randomUUID(), booking: randomUUID(), deletion: null, hold: null, intent: null };
const c0 = new Client({ connectionString: url }); // fixture + cleanup
const t1 = new Client({ connectionString: url });
const t2 = new Client({ connectionString: url });

const q = (c, sql, params = []) => c.query(sql, params);
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label}: timeout after ${ms} ms`)), ms))]);

let exit = 1;
try {
  await Promise.all([c0.connect(), t1.connect(), t2.connect()]);
  await q(c0, "set statement_timeout = '20s'");

  // ── fixtures (service-level inserts; no auth identity needed for the lock test) ───────────
  await q(c0, `insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [ids.user, `${marker}-c@example.com`]).catch(() => {});
  await q(c0, `insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [ids.provider, `${marker}-p@example.com`]).catch(() => {});
  await q(c0, `insert into public.profiles (id, role, full_name, phone) values ($1,'customer',$2,'+254700000009') on conflict (id) do nothing`, [ids.user, marker]);
  await q(c0, `insert into public.profiles (id, role, full_name, phone, approval_status) values ($1,'provider',$2,'+254700000009','approved') on conflict (id) do nothing`, [ids.provider, marker]);
  await q(c0, `insert into public.bookings (id, customer_id, assigned_provider_id, service_id, address, scheduled_for, status) values ($1,$2,$3,'house_cleaning',$4,now(),'completed')`, [ids.booking, ids.user, ids.provider, marker]);
  const d = await q(c0, `insert into public.account_deletions (user_id, role, status, db_completed_at, access_state, auth_state, cleanup_state, cleanup_eligible_at, cleanup_boundary_at)
                         values ($1,'customer','deleted',now() - interval '1 hour','revoked','deleted','provisional',now() - interval '1 hour',now() + interval '23 hours') returning id`, [ids.user]);
  ids.deletion = d.rows[0].id;
  const h = await q(c0, `insert into public.legal_holds (scope, booking_id, source, reference) values ('booking',$1,'legal',$2) returning id`, [ids.booking, marker]);
  ids.hold = h.rows[0].id;
  const i = await q(c0, `insert into public.deletion_photo_intents (account_deletion_id, user_id, booking_id, bucket_id, object_path, state, hold_id)
                         values ($1,$2,$3,'booking-photos',$4,'held',$5) returning id`, [ids.deletion, ids.user, ids.booking, `${ids.booking}/${marker}.png`, ids.hold]);
  ids.intent = i.rows[0].id;

  // ── the interleaving ──────────────────────────────────────────────────────────────────────
  await q(t1, "begin; set local lock_timeout = '8s'; set local statement_timeout = '12s'");
  await q(t2, "begin; set local lock_timeout = '8s'; set local statement_timeout = '12s'");

  // T1 = try_complete_cleanup's first steps: user advisory lock, then the account_deletions row.
  await q(t1, `select pg_advisory_xact_lock(hashtext('deletion:user:' || $1::text))`, [ids.user]);
  await q(t1, `select id from public.account_deletions where id = $1 for update`, [ids.deletion]);

  // T2 = release_hold's first steps: booking advisory lock, then the held intent row.
  await q(t2, `select pg_advisory_xact_lock(hashtext('deletion:booking:' || $1::text))`, [ids.booking]);
  await q(t2, `select id from public.deletion_photo_intents where hold_id = $1 and state = 'held' order by id for update`, [ids.hold]);

  // T1 now needs the booking lock (the inventory would take it). It must WAIT on T2, not fail.
  const t1Wait = q(t1, `select pg_advisory_xact_lock(hashtext('deletion:booking:' || $1::text))`, [ids.booking]);

  // T2 runs the REAL routine. Under revision 4 it never touches account_deletions → completes.
  const t2Result = await withTimeout(q(t2, `select public.release_hold($1, null, $2) as r`, [ids.hold, marker]), 10_000, 'T2 release_hold');
  await q(t2, 'commit');
  await withTimeout(t1Wait, 10_000, 'T1 booking lock after T2 commit');
  await q(t1, 'commit');

  const r = t2Result.rows[0].r;
  const intent = await q(c0, `select state, hold_id from public.deletion_photo_intents where id = $1`, [ids.intent]);
  const acct = await q(c0, `select cleanup_state from public.account_deletions where id = $1`, [ids.deletion]);
  const ok = r && r.released === true && r.replanned === 1 && intent.rows[0].state === 'planned' && acct.rows[0].cleanup_state === 'provisional';
  console.log(JSON.stringify({ release_hold: r, intent: intent.rows[0], account_after_release: acct.rows[0], deadlock: false }, null, 2));
  // The reopen happens lazily and under the correct order: candidates → try_complete_cleanup.
  const cand = await q(c0, `select deletion_id from public.list_cleanup_candidates(50)`);
  const selected = cand.rows.some((x) => x.deletion_id === ids.deletion);
  const tc = await q(c0, `select public.try_complete_cleanup($1) as r`, [ids.deletion]);
  console.log(JSON.stringify({ selected_as_candidate: selected, try_complete: tc.rows[0].r }, null, 2));
  exit = ok && selected && tc.rows[0].r.reason === 'reopened' ? 0 : 1;
} catch (err) {
  console.error('REGRESSION:', err.code === '40P01' ? 'deadlock detected (40P01)' : err.message);
  for (const c of [t1, t2]) await q(c, 'rollback').catch(() => {});
  exit = 1;
} finally {
  // Exact-id cleanup, dependency order. A failure here is reported and exits 2.
  const failures = [];
  const del = async (sql, params) => { try { await q(c0, sql, params); } catch (e) { failures.push(`${sql.split(' ')[2]}: ${e.message}`); } };
  if (ids.intent) await del(`delete from public.legal_hold_items where intent_id = $1`, [ids.intent]);
  if (ids.intent) await del(`delete from public.deletion_photo_intents where id = $1`, [ids.intent]);
  if (ids.hold) await del(`delete from public.legal_hold_items where hold_id = $1`, [ids.hold]);
  if (ids.hold) await del(`delete from public.legal_holds where id = $1`, [ids.hold]);
  if (ids.deletion) await del(`delete from public.account_deletions where id = $1`, [ids.deletion]);
  await del(`delete from public.bookings where id = $1`, [ids.booking]);
  await del(`delete from public.profiles where id in ($1, $2)`, [ids.user, ids.provider]);
  await del(`delete from auth.users where id in ($1, $2)`, [ids.user, ids.provider]);
  for (const c of [c0, t1, t2]) await c.end().catch(() => {});
  if (failures.length) { console.error('CLEANUP FAILURES:\n' + failures.join('\n')); exit = 2; }
  process.exit(exit);
}
