# Phase B1 — durable deletion work: QA certification record

**Date:** 2026-09-24 · **Target:** the certified QA project (reference verified against the CLI's
linked project before every step; Production never contacted) · **Result: PASS** — 17 of 18 new
cases passed, 1 skipped by design (opt-in observational case); both existing certifications passed
unchanged (9 and 13). Restoration delta zero against the baseline captured before the migrations
were applied. **Tested commit:** `56c898b9ba35b07438b3a2bedca718cf55383512` (Phase B1 revision 4 plus the two
harness corrections recorded below). **The full `qa:release` gate passed on this exact commit on
2026-09-24** (see §7); the earlier full-gate result at `e85c3764ff027dc60b91b59aa49edc02c70b8303`
stands as the previous certified head.

## 1. What was applied to QA (authorised step by step)

| Step | Action | Evidence |
|---|---|---|
| Pre-check | `db push --dry-run` listed exactly `0059_deletion_work.sql` and `0060_delete_account_durable_work.sql`; pre-state: 0 executed deletions, 0 bucket objects, 0 tombstones, 3 bucket policies | CLI output |
| Migrations | `db push --linked`: 0059 then 0060 applied | migration list shows 0056, 0058, 0059, 0060 remote |
| Post-check | 0 backfilled rows (no prior executed deletions), 3 bucket policies, 4 new routines present, 0 cron jobs named for the worker, tick disabled (null URL and secret) | SQL read |
| Secret | `DELETION_WORKER_SECRET` generated locally (43 chars), set on the QA function, recorded in the operator's `qa/.env`; never displayed | CLI: `count: 1` |
| Functions | `delete-account` deployed; `deletion-worker` deployed with `--no-verify-jwt` (matches `config.toml`, this function only) | CLI output |

Scheduling stays disabled on QA: no `cron.schedule`, `private.deletion_worker_config` untouched.

## 2. Runs

| Run | Command | Outcome |
|---|---|---|
| 1 | `deletion-work.spec.ts`, default workers | **Aborted in `beforeAll`**: the baseline counter selected `id` on `account_deletion_attempts`, which is keyed by `user_id`; PostgREST 400. No case body executed. QA residue: none (verified by exact-category counts and baseline delta zero). Harness fix: explicit key column; offline regression added. |
| 2 | `deletion-work.spec.ts`, default workers (parallel) | 10 passed, 7 failed, 1 skipped. All seven failures traced to parallel workers: each `worker()` call processes every claimable intent on the shared project (C3a, C3c, C6b lost their object to another case's call before the hold applied) and per-worker baselines were captured with other workers' fixtures present (C2a, C2d, C4, C5c failed only in restoration). Per-worker teardown still restored QA: residue none, baseline delta zero. Harness fix: `test.describe.configure({ mode: 'serial' })` and `--workers=1` mandatory. |
| 3 | `deletion-work.spec.ts --workers=1 --retries=0 --reporter=list,json` | **17 passed, 1 skipped (C2e opt-in), 5.6 min.** Residue none; baseline delta zero. |
| C7a | `account-deletion.spec.ts --workers=1` | **9 passed** (1.7 min) |
| C7b | `deleted-payer-redaction.spec.ts --workers=1` | **13 passed** (3.5 min) |
| Final | Residue and independent 22-measure baseline after all suites | Zero residue in every category; delta zero; 8 fixed profiles, 0 tombstones |

Runs 1 and 2 were each stopped and reported before the next was authorised; no automatic retry.

## 3. Per-case results (run 3) and what each proves

| Case | Result | Proves | Class |
|---|---|---|---|
| C0 | pass | Deployed gateway: 401 without or with a wrong secret and with a user JWT alone; 200 with the secret only | connected |
| C1 | pass | Own photos removed with database-verified absence; counterparty photo etag unchanged; `provisional` with `final_sweep_at` null; Auth deleted; `complete` only after the boundary with `final_sweep_at` and `closed_at` | connected |
| C2a | pass | A tombstoned identity's upload is refused (policy); object absent | connected |
| C2b | pass | An owned object the inventory missed (intent row dropped) is rediscovered by the sweep and removed | seeded simulation |
| C2c | pass | A metadata row reappearing on an inventoried path → `needs_operator`, never complete | connected |
| C2d | pass | A late metadata row reopens a provisional account to `pending`; the late intent verifies as `absent`; provisional again; `complete` only after boundary + final sweep | seeded simulation |
| C2f | pass | Boundary and last sweep three days past, one run → `complete` with `final_sweep_at` | connected |
| C2e | skipped | Opt-in observational (`QA_DW_INFLIGHT=1` not set) | not run by design |
| C3a | pass | Legal hold → held, provisional with reference; release → account stays provisional until the worker's next pass (lazy reopen) → verified → complete after boundary, reference cleared | connected |
| C3b | pass | `{authorized_before_hold:1, held:1}` then `{already_removed:2}` | connected |
| C3c | pass | Case on A: A held, B planned; move to B: A released "case reassigned", B held, A still held by its legal hold; close: B released, A held; legal release → both verified | connected |
| C4 | pass | Two concurrent invocations over 20 intents: per-deletion states `{verified:removed: 20}`; expired-lease `destroying` intent resumed | connected |
| C5a | pass | **Platform fact U4: Auth deletion succeeded immediately while the identity still owned a Storage object (HTTP 200, `auth_state: deleted`)**; object then removed | connected |
| C5b | pass | Because the platform did not refuse, the held-object escalation was exercised through `record_auth_result` (**labelled simulated**): `needs_operator`/`dependency`, no further Auth attempt | simulated |
| C5c | pass | Identity established gone; retry answering 404 → `deleted` | connected |
| C5d | pass | `not_started` untouched inside the grace period; then `deleted`, identity 404 | connected |
| C6a | pass | Verified EMPTY retired path: counterparty upload, upsert, copy and move refused; fresh path under the same booking allowed (control) | connected |
| C6b | pass | Held path: admin-JWT delete returned `200 []` with the object still present (admin credentials were configured); service-role replacement → `identity_mismatch`, replacement etag unchanged, metadata row kept; fresh path still allowed | connected |

## 4. U1–U8 after this certification

| # | Status |
|---|---|
| U1 | C4 passed on QA; the completion-vs-release interleaving passed the two-connection regression on a local PostgreSQL (2026-09-24) |
| U2 | Proven on QA (C2a, C6a, C6b incl. the admin-JWT refusal) |
| U3 | Proven on QA for the seeded simulations and the real reappearing row (C2b, C2c, C2d); a real in-flight upload remains observational only |
| U4 | **Answered:** Auth deletes an identity that still owns objects (C5a). The dependency-refusal path therefore did not occur on this platform; its escalation rule is proven by the routine (C5b, simulated) and offline |
| U5 | Proven on QA (C1) |
| U6 | Proven on QA (C3c) |
| U7 | **Outstanding**: zero eligible rows on QA, so the backfill's transformation was not exercised |
| U8 | **Outstanding**: scheduling stays disabled; C0 proves the secret-only path the tick would use |

## 5. Harness corrections made during certification (local, offline-verified)

1. `ServiceApi.count(table, filter, keyCol)`: explicit key column; `account_deletion_attempts` counted by `user_id`. Regression in `deletion-work-cleanup.test.ts`.
2. `test.describe.configure({ mode: 'serial' })` in `deletion-work.spec.ts`; run sheet makes `--workers=1` mandatory and adds the JSON reporter so platform annotations are preserved.

No migration, function, policy or product code changed during certification.

## 6. Explicitly not done

No Production contact; no merge; no website publication; no mobile build; no scheduler enabled.
(The full `qa:release` gate was run afterwards on this exact commit and passed; see §7.) The website
verification route, transactional email, wallet refunds, `access_closed` and every unresolved
retention rule remain outside this increment.

## 7. Full `qa:release` gate on `56c898b` (2026-09-24, 01:17–01:35 local, one run, no retry)

| Stage | Result |
|---|---|
| `test:release` (Jest) | 260 suites, 4575 tests passed (including the customer-search case that was intermittent earlier the same night) |
| `test:admin:release` | 40 suites, 557 tests passed |
| root `tsc --noEmit`, `typecheck:admin` | clean |
| `expo export` web and android, `build:admin` | exported and built |
| `qa:test:certification` (all certification files, one worker, on QA) | **155 passed, 1 skipped by design** (C2e opt-in observational), 11.5 min |
| `qa:test:browsers:noncert` (three browsers) | **277 passed**, 50 `@certification` cases skipped by that stage's grep-invert, 3.5 min |
| npm error lines in the log | 0 |
| Independent 22-measure baseline, captured before launch and after completion | **delta zero** |
| Working tree after the gate | unchanged (`56c898b`, only the two untracked pilot drafts) |

Launched detached from the account-deletion worktree at `56c898b`; the CLI-linked project was the
certified QA project throughout; Production was not contacted.

## 8. Migration 0061 on QA (2026-09-24, 11:20–11:36 local) — post-certification review fix

**Finding (confirmed):** with 0059 as applied, a `complete_with_retained` account whose released
intent failed in the same worker pass (intents stage runs before candidates) was never selected
again because the candidate rule required open work or no held intent; it stayed falsely
complete and closed with a stale reference. A successful partial release never refreshed
`retained_exception_ref`. Reproduced on a local PostgreSQL against 0059
(`qa/sql/partial-release-reflects-unresolved.mjs`, both scenarios failed) and fixed by 0061 (both
passed, exit 0). The local script keeps its local-only target guard; QA was exercised through the
certified harness instead.

| Step | Evidence |
|---|---|
| Preflight | linked reference = env host = certified QA; independent baseline captured; residue zero in every category; pinned hashes of 0056, 0058, 0059, 0060 verified; `db push --dry-run` listed exactly `0061_cleanup_state_reflects_unresolved_intents.sql` |
| Apply | 0061 applied; `pg_proc` shows the two replaced routines contain the new rule and reason; 0 cron jobs; tick disabled; **no function redeployed, scheduling untouched** |
| Regressions on real QA | C3d (released intent → `needs_operator` via the real `record_destroy_result`, labelled injected failure class): account `needs_operator`, `closed_at` null, other intent still held, object present. C3e (released intent completes): reference refreshed to the remaining hold in the same pass, stable on the next pass, full release → `complete`, reference null, `closed_at` set. **2 passed, 1.5 min** |
| Full suite, serial, no retries | `deletion-work.spec.ts` **19 passed, 1 skipped by design** (C2e opt-in), 6.3 min; `account-deletion.spec.ts` 9 passed; `deleted-payer-redaction.spec.ts` 13 passed |
| Restoration | residue zero; independent 22-measure baseline **delta zero against the ORIGINAL pre-run capture** |
| Platform annotations | U4 unchanged: Auth deleted the identity immediately (HTTP 200); C5b took the labelled simulated branch |

**Hashes under test (normalised SHA-256):** `0059` `32aa4c0ce62c20b93eb2c97ee0ce4985d4855c2843550dea1c111087331418ca`;
`0060` `0136c6bc143bc922ccc8e5cf20944d835d5bdf2a677c6cde35e2f17f90230deb`;
`0061` `dfdaeb9829a9de92617bb0e8812e9e0ef5a866f74a04f2807be1ef2c08a27a9e` (all three pinned by the
guard test). Harness `deletion-work.spec.ts` `9592d4c67ac760d80a629db3b9f30f5de77d807853dc3b09c945b0ef92f2f6d5`.
The source commit is recorded in §9 once the fix is committed; the full gate result for that
commit is recorded there too. The gate result in §7 belongs to `56c898b` alone.

