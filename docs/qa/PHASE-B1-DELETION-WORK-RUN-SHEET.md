# Phase B1 — durable deletion work: QA deployment and certification run sheet (revision 4)

**Status: EXECUTED ON QA 2026-09-24 — PASS** (record: `2026-09-24-PHASE-B1-DELETION-WORK-QA-CERTIFICATION.md`).
0059 and 0060 are applied to QA and both functions are deployed there; run 3 passed 17 of 18 (one
opt-in case skipped by design) and both existing certifications passed. Not yet: commit, push,
merge, `qa:release` gate, Production. Production is not touched at any step. Applied migrations `0056` and `0058` are byte-identical to their pinned normalised SHA-256
hashes (`src/__tests__/delete-account-v2-migration-guard.test.ts`). Certification provenance is
unchanged: `delete-account` v2 at `81de534`, `0058` at `491c8d8`, full `qa:release` gate only at
`e85c3764ff027dc60b91b59aa49edc02c70b8303`.

## 1. Changed-file inventory and dependencies

| # | File | Change | Depends on |
|---|---|---|---|
| 1 | `supabase/migrations/0059_deletion_work.sql` (new) | State dimensions incl. `provisional`; intents; holds; service-only routines; `deletion_path_frozen` (path retirement); `_deletion_booking_of_path`; `deletion_object_exists`; storage INSERT/DELETE policies; support-case hold reconciliation; acyclic lock order (release_hold writes no account row; lazy reopen); disabled tick; health incl. bucket object count | 0056 (tables), 0015 (`private` schema, pg_net) |
| 2 | `supabase/migrations/0060_delete_account_durable_work.sql` (new) | Re-creates `delete_account` (atomic inventory, `cleanup_boundary_at`), `complete_account_deletion`, `record_auth_deletion_failure` | 0059 |
| 3 | `supabase/functions/deletion-worker/handler.ts`, `index.ts` (new) | Worker control flow; lease-budget check before any Storage call; bounded Storage client; secret-only authentication | 0059 routines; function secret `DELETION_WORKER_SECRET` |
| 4 | `supabase/config.toml` | `[functions.deletion-worker] verify_jwt = false` (this function only); `delete-account` unchanged (`true`) | — |
| 5 | `supabase/functions/delete-account/handler.ts` | Passes work state through (incl. `provisional`); "user not found" = identity gone | 0060 return shape |
| 6 | `src/lib/account.ts`, `src/app/account/delete.tsx` | Composed messages; accurate retained-records wording; truthful `provisional` copy | 5 |
| 7 | `tsconfig.json` | Excludes the worker's Deno entry from root tsc, like the other functions | — |
| 8 | `qa/playwright/support/connected/deletion-work-cleanup.ts` (new) | Exact-fixture teardown, validated HTTP, authoritative absence read, restoration proof (dependency-free; offline-tested) | 0059 `deletion_object_exists` |
| 9 | `qa/playwright/certification/deletion-work.spec.ts` (new), `qa/.env.example` | Connected harness C0–C6 (18 cases) | deployed 0059/0060 + both functions on QA; item 8 |
| 10 | `qa/sql/deadlock-completion-vs-release.mjs` (new) | Deterministic two-connection SQL regression for the lock order (local database only) | a local PostgreSQL/Supabase with 0001–0060; `pg` installed ad hoc |
| 11 | Tests (offline): `deletion-worker-handler.test.ts`, `deletion-work-migration-guard.test.ts`, `delete-account-v2-migration-guard.test.ts`, `account-deletion-messages.test.ts`, `deletion-work-cleanup.test.ts` (new); `delete-account-handler.test.ts`, `delete-account-function-guard.test.ts` (updated) | — | 1–8 |
| 12 | `docs/qa/2026-09-23-QA-COMPAT-PROBE-STORAGE-AUTH-REMOVAL.md` (new), this run sheet | Evidence and procedure | — |

| 13 | `supabase/migrations/0061_cleanup_state_reflects_unresolved_intents.sql` (new, **applied to QA 2026-09-24 and certified**: C3d/C3e plus the full suite and the two existing suites; record §8), `qa/sql/partial-release-reflects-unresolved.mjs` (new, local-only) | Post-certification review fix: a settled account is a cleanup candidate when any intent is `needs_operator` or its retained reference no longer matches the holds still holding intents; `try_complete_cleanup` escalates on a `needs_operator` intent before the uncovered-object check and clears `closed_at`. Local SQL regression reproduced the finding on 0059 and passed on 0061 (2026-09-24). | 0059 (re-creates two of its routines) |

Apply order: 0059 → 0060 → deploy `delete-account` and `deletion-worker` → app; **then 0061**
(re-creates `list_cleanup_candidates` and `try_complete_cleanup` only; no function redeploy
needed; re-run `deletion-work.spec.ts` C3a and the two existing certifications after applying). B1's `0055 → 0057`
renumber is independent and untouched. Excluded by decision: web verification route, transactional
email, wallet-refund implementation, `access_closed`, every unresolved retention rule.

## 2. Revision-3 review findings, as resolved (see the manifest for result classes)

### 2.1 Exact-run cleanup and reliable absence (finding 1)

Teardown is `cleanupRun` + `verifyRestoration` in `deletion-work-cleanup.ts`. Removed: the
type-and-time notification sweep and `sweepEphemeralUsers`. Ownership is proven by exact user id,
exact booking id (notifications carrying the run's `booking_id`), exact object path, exact
hold/case/intent id, or a dedup key composed from a run subject id. Every response is validated;
failures are collected and fail the run. Reads and counts throw on failed or malformed responses.
Object absence is established only by `deletion_object_exists` (service-only, boolean); a Storage
HTTP status is never proof. Restoration asserts every category by exact id (intents, hold items,
holds, cases, audit and throttle rows, profiles, notifications, objects, auth identities) plus the
totals baseline and `deletion_work_health` (`bucket_objects`, `retired_paths`, `active_holds`).
Offline regression: `deletion-work-cleanup.test.ts` (a) unrelated notification survives, (b) failed
request fails teardown, (c) 500/403/non-boolean never means absent, (d) malformed reads throw.

### 2.2 Lock order (finding 2) — confirmed and fixed

Confirmed by source: `try_complete_cleanup` took user advisory → `account_deletions` row →
booking advisory (inventory); `release_hold` took booking advisory → intent rows → **updated
`account_deletions`**. Two connections could each wait on the other (40P01). Fix: `release_hold`,
`apply_hold` and the support-case trigger never write `account_deletions`; a released hold is
picked up lazily: `list_cleanup_candidates` selects `provisional`/`complete_with_retained` accounts
with open intents or with nothing held any more, and `try_complete_cleanup` reopens or
re-finalises them under user → row → booking. Complete order now documented in the 0059 header
including row locks. The same inversion was checked in completion, inventory, hold release and
case reassignment paths (guard test: no `account_deletions` reference in any hold routine).
Deterministic regression: `qa/sql/deadlock-completion-vs-release.mjs` (two connections, explicit
first-step locks, real `release_hold`, bounded `lock_timeout`/`statement_timeout`, exact-id cleanup)
— **EXECUTED 2026-09-24 on a local Supabase stack** (Docker; `supabase start` applied 0001–0060
cleanly, the first real-PostgreSQL execution of 0059/0060): exit 0, no deadlock; `release_hold`
returned `{released:true, replanned:1}` while the other connection held the account row and the
user advisory lock; the intent was re-planned; `list_cleanup_candidates` selected the account and
`try_complete_cleanup` returned `reopened`; exact-id cleanup succeeded. This is local SQL
execution, not shared QA.

### 2.3 Both valid initial Auth outcomes (finding 3)

`deleteViaFunction` accepts exactly `200 {deleted, auth_state:'deleted'}` or
`202 {pending_auth_delete, auth_state:'pending_retry'}`, both with `access_state:'revoked'` and
`cleanup_state:'pending'`, and records which occurred. `ensureAuthDeleted` drives unheld accounts to
eventual Auth deletion by advancing only the run's own `auth_next_attempt_at`. C5b uses the real
refusal path when the platform refused and a clearly labelled simulated refusal otherwise.
Aggregate assertions read per-deletion intent states, never the worker's global counters.

### 2.4 Coverage strengthened (finding 4)

C6a: verified, EMPTY retired path; counterparty upload/upsert/copy/move refused while a fresh path
for the same caller succeeds (control), so refusal is retirement, not "exists" or unrelated
permission. C6b (separate): held path, admin delete refusal (NOT RUN without admin credentials),
service-role replacement → `identity_mismatch`. C2d: labelled late-metadata fixture reopens a
provisional account; completion then needs the boundary and a final sweep; C2f keeps the outage
regression. C3c: both bookings carry intents; A → B releases A's case hold (note), protects B, and
an independent legal hold on A keeps A held; closing the case releases only B.

### 2.5 Truthful provisional copy (finding 5)

Provisional now reads: "Photo cleanup is awaiting a final check for uploads that were already in
progress. Some photos may remain under a hold. We cannot confirm completion yet." No removal claim,
no deadline, three dimensions kept apart. Tests cover provisional with and without held items,
delayed finalisation, and both terminal states.

### 2.8 Post-certification review finding (0061) — confirmed, fixed, applied to QA and certified

Sequence: `complete_with_retained` with two held intents under two holds; one hold released
(intent re-planned, no account write by lock order); next worker pass: intents stage first, the
released intent becomes `needs_operator`; then `list_cleanup_candidates` (0059) selected settled
accounts only with open work or with no held intent — neither held → the account stayed
`complete_with_retained`, closed, with a stale reference. A successful partial release likewise
never refreshed `retained_exception_ref`. **Reproduced on a local PostgreSQL against 0059**
(`qa/sql/partial-release-reflects-unresolved.mjs`: both scenarios `ok: false`), **fixed by 0061**
(same script `ok: true`, exit 0, exact-id cleanup). Lock order preserved: no account-row write in
any hold routine; the account is selected lazily by the corrected candidate rule. Offline: model
regressions (two scenarios) and static guards; 0059/0060 hash-pinned now that they are on QA.

## 3. Offline verification (run 2026-09-23, revision 4)

| Check | Result | Class |
|---|---|---|
| `deletion-worker-handler.test.ts` | 50 passing | simulated (real handler, in-memory contract model) |
| `deletion-work-migration-guard.test.ts` | 70 passing | static guard |
| `delete-account-v2-migration-guard.test.ts` | 15 passing (hash pins, latest owner) | static guard |
| `account-deletion-messages.test.ts` | 10 passing | offline |
| `deletion-work-cleanup.test.ts` | 5 passing | offline (recording fake) |
| Whole Jest suite | 260 suites, 4574 tests, all passing | offline |
| root `tsc --noEmit`, `qa` `tsc --noEmit` | clean | offline |
| `npx deno@2 check delete-account/index.ts deletion-worker/index.ts` | clean | offline |
| `npx playwright test playwright/certification/deletion-work.spec.ts --list` | 18 cases discovered; **discovery is not execution** | — |
| `qa/sql/deadlock-completion-vs-release.mjs` | **PASS** (exit 0) on a local Supabase stack, 2026-09-24 | local SQL execution |
| `supabase start` / `db reset` locally | 0001–0060 applied without error (first real-PostgreSQL run of 0059/0060) | local SQL execution |

## 4. U1–U8: what each executable case proves, and what stays outstanding

| # | Claim | Case | Proves exactly | Outstanding |
|---|---|---|---|---|
| U1 | 0059 routines implement the contract under concurrency | C4 + local SQL regression | C4: two concurrent worker invocations process 20 real intents exactly once (per-deletion states), none escalated; an expired-lease `destroying` intent resumes. The completion-vs-release interleaving is proven by the two-connection regression, executed locally 2026-09-24 (PASS) | C4 remains NOT RUN on QA |
| U2 | Tombstoned identity cannot add an object; a retired path refuses writes | C2a, C6a, C6b | Policy refusals against the real Storage API; C6a proves retirement on an empty verified path with a positive control | Admin-JWT delete refusal (C6b) NOT RUN without `QA_ADMIN_*` |
| U3 | Inventory and sweeps find owned data; reappearing rows never complete | C2b, C2c, C2d | Seeded simulations (intent dropped; late metadata row) and a real reappearing row through the real routines | A real in-flight upload is only observed (C2e, opt-in) |
| U4 | `deleteUser` behaviour with owned objects | C1, C5a, C5b | The platform's initial answer is recorded; eventual Auth deletion is proven for unheld objects; held-object escalation is proven on the real path if the platform refused, else through the routine (labelled simulated) | Which branch ran is reported per run |
| U5 | Service-role Storage remove behaves as probed | C1 | Removal and database-verified absence | — |
| U6 | Support-case trigger applies, moves and releases holds atomically | C3c | Real trigger on real case updates, with an overlapping legal hold | — |
| U7 | Backfill transforms pre-0059 rows correctly | Pre-check only | QA is expected to have zero eligible rows: the backfill's transformation is **not exercised** by this certification | Outstanding; would need a seeded pre-0059-shaped row on a disposable project |
| U8 | Tick works when configured | — | Not exercised; scheduling stays disabled; C0 proves the secret-only path the tick would use | Outstanding |

Cases that require a credential the environment lacks are reported as NOT RUN, never as passed.
Annotations and observational cases are never acceptance passes.

## 5. Run sheet

### 5.1 Pre-checks (read-only)

```
supabase projects list                    # linked = QA reference; Production not linked
cat supabase/.temp/project-ref            # must equal the recorded QA reference
supabase migration list --linked          # expect 0001–0054, 0056, 0058; nothing pending
supabase db query --linked --output json -f pre.sql
```
`pre.sql`:
```sql
select (select count(*) from public.account_deletions where status <> 'blocked') as executed_deletions,
       (select count(*) from storage.objects where bucket_id = 'booking-photos') as objects,
       (select count(*) from public.profiles where deleted_at is not null) as tombstones,
       (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
          and policyname like 'booking_photos_obj_%') as bucket_policies;
```
Expected on QA: 0, 0, 0, 3. Keep the independent 22-measure baseline as well; the harness captures
its own (totals + `deletion_work_health()`) before the first fixture.

### 5.2 Apply and deploy (each step needs authorisation)

```
supabase db push --linked --dry-run                     # must list exactly 0059 and 0060; stop otherwise
supabase db push --linked
supabase migration list --linked                        # 0059, 0060 applied; 0055/0057 still absent
supabase db query --linked -f post.sql                  # bucket_policies still 3; deletion_path_frozen and deletion_object_exists exist; no cron job 'deletion-worker'
supabase secrets set DELETION_WORKER_SECRET=<32-byte value generated locally> --project-ref <QA ref>
supabase functions deploy delete-account --project-ref <QA ref>
supabase functions deploy deletion-worker --no-verify-jwt --project-ref <QA ref>
```
`--no-verify-jwt` matches `[functions.deletion-worker] verify_jwt = false`; never used for
`delete-account`. The secret is generated locally, set on the function and copied into `qa/.env` as
`QA_DELETION_WORKER_SECRET`; never pasted into chat, the repository or a migration. Do **not**
update `private.deletion_worker_config` and do **not** create a cron job on QA.

### 5.3 Worker invocation while scheduling is disabled

```
curl -sS -X POST "https://<QA ref>.supabase.co/functions/v1/deletion-worker" \
  -H "x-worker-secret: $DELETION_WORKER_SECRET" -H "Content-Type: application/json" \
  -d '{"limit": 25}'
```
No `Authorization` header. The harness advances time-gated steps by patching its own rows
(`cleanup_eligible_at`, `cleanup_boundary_at`, `last_sweep_at`, `leased_until`,
`auth_next_attempt_at`, `db_completed_at`); it never sleeps.

### 5.4 Certification commands

```
cd qa
npx playwright test playwright/certification/deletion-work.spec.ts --project=chromium --workers=1 --retries=0 --reporter=list,json   # C0–C6 (18 cases); serial: every worker() call acts on the whole project
npx playwright test playwright/certification/account-deletion.spec.ts --project=chromium       # C7: existing, 9 cases
npx playwright test playwright/certification/deleted-payer-redaction.spec.ts --project=chromium # C7: existing, 13 cases
```
`--workers=1` is mandatory (the suite also configures itself serial): a `worker()` call processes
every claimable intent on the shared project, so parallel cases interfere, and per-worker
baselines would be captured with other workers' fixtures present. The JSON reporter
(`PLAYWRIGHT_JSON_OUTPUT_NAME=reports/deletion-work.json`) preserves the U4 annotations.
Optional: `QA_DW_INFLIGHT=1` enables C2e (observational). `QA_ADMIN_EMAIL/QA_ADMIN_PASSWORD` enable
the admin-JWT refusal inside C6b; without them that step is reported NOT RUN.

**Local SQL regression (finding 2), local database only:**
```
supabase start && supabase db reset          # or any local PostgreSQL 15+ with 0001–0060 applied
npm i --no-save pg
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres node qa/sql/deadlock-completion-vs-release.mjs
```
Exit 0 = no deadlock and lazy reopen confirmed; 1 = regression; 2 = cleanup failure. The script
refuses any non-local host.

**Manual step M1 (finding 4 of revision 2, service role only):** upload three objects with the QA
service role at `not-a-uuid/x.png`, `<random valid uuid>/x.png` and `plain.png`, set `owner_id` to
a disposable user by direct SQL, delete that user through the function, confirm three intents with
`booking_id` null and states `verified/removed`; remove by exact path/id.

### 5.5 Acceptance criteria per case

| Case | Acceptance | Class |
|---|---|---|
| C0 | 401 without/with wrong secret and with a user JWT alone; 200 with the secret only | connected |
| C1 | Initial outcome is one of the two valid combinations; own objects absent by database read; counterparty etag unchanged; `provisional` with `final_sweep_at` null; Auth eventually deleted; `complete` only after the boundary with `final_sweep_at` and `closed_at` | connected |
| C2a | Upload with the tombstoned JWT ≥ 400; object absent | connected |
| C2b | Dropped intent rediscovered; object absent; `provisional` | seeded simulation |
| C2c | Reappearing row → `needs_operator`, `closed_at` null | connected |
| C2d | Late metadata row reopens to `pending`; late intent `verified/absent`; provisional again; `complete` only after boundary + final sweep | seeded simulation |
| C2f | Boundary and last sweep three days past, one run → `complete` with `final_sweep_at` | connected |
| C2e | Observations recorded; no assertion | platform, opt-in |
| C3a | Held → provisional with reference; release → provisional (lazy) → worker removes → complete after boundary, reference cleared | connected |
| C3b | `{authorized_before_hold:1, held:1}` then `{already_removed:2}` | connected |
| C3c | A held, B planned; move → A released "case reassigned", B held, A held by legal hold; close → B released, A held; legal release → both verified | connected (NOT RUN without an approved admin profile) |
| C4 | Per-deletion states `{verified:removed: 20}` after two concurrent runs; resume of an expired-lease `destroying` intent | connected |
| C5a | Initial outcome recorded; object removed; Auth eventually deleted | connected |
| C5b | `needs_operator`/`dependency`; `auth_attempts` unchanged by a further run; branch (real/simulated) annotated | connected / simulated |
| C5c | Identity established gone; retry with 404 → `deleted` | connected |
| C5d | `not_started` untouched in grace; then `deleted`, identity 404 | connected |
| C6a | Verified empty path: upload/upsert/copy/move ≥ 400; fresh path 200; theirs untouched | connected |
| C6b | Admin delete `200 []` with object still present (or NOT RUN); service-role replacement → `identity_mismatch`, etag unchanged, row kept | connected |

### 5.6 Exact-id cleanup and restoration (implemented in `deletion-work-cleanup.ts`)

Order: hold items → intents → case holds and cases → legal holds by id → holds on run bookings →
each object by exact path (remove, then `deletion_object_exists` must be false) → metadata rows on
those paths → payouts → earnings → payments → notifications carrying the run's booking id →
bookings → provider-pending notifications by exact dedup key → notifications, flags, favourites,
audit, throttle rows, wallets, profile by user id → auth identity. Every response validated; any
failure collected and the run fails. Restoration: every category asserted empty by exact id/path,
totals equal the baseline, health counts equal the baseline, every run identity 404.

### 5.7 Stop rules

Any failed assertion, teardown failure or restoration violation: stop, inventory by exact id,
report. No automatic retry. No second run without a separate decision.

### 5.8 After certification

Record the certified commit, migration numbers and function versions in the ops README's
deployment inventory; update the PR banner; the full `qa:release` gate must run on the exact PR
candidate head before any merge (Workers Builds deploy the admin app from `main` automatically).
Production application of 0059/0060 and the two functions is a separate authorisation.
