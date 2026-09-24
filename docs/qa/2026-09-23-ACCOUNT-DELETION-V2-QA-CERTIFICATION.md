# 2026-09-23 — `delete-account` v2 QA certification

> **Status: PASS / CERTIFIED — focused scope.**
>
> The revised `delete-account` Edge Function was deployed to the certified QA project and passed the
> complete account-deletion certification, 9 of 9, including the `pending_auth_delete` retry. Every
> measured count returned to baseline.
>
> **Source under test:** PR #27, head `81de534bd0bbd210948f468e48d76f8553ea146b`.
>
> **Separately, the full `qa:release` gate passed with exit 0** on head
> `e85c3764ff027dc60b91b59aa49edc02c70b8303`, one run, no retry. See §6.1. The two results are
> independent: §4 certifies the Edge Function against QA, §6.1 is the wider repository gate. Neither
> subsumes the other.
>
> **Neither covers Production**, which holds neither `0056` nor this function, and neither makes
> Production ready. Read §7 before citing either.

---

## 1. Target verification

Performed before any write, and by reference rather than by project name.

| Step | Result |
|---|---|
| QA reference derived from `qa/.env` (`QA_SUPABASE_URL`) | `wjvjupl…ozws` |
| Corroborated independently against the repository provisioning record | matches |
| Distinct from the recorded Production reference | confirmed, different project |
| CLI linked projects | exactly one, the QA project |
| Every CLI command | carried an explicit `--project-ref` |
| Baseline tooling | refuses to run unless the resolved reference is the recorded QA one |
| Playwright global setup | independently reported application and database both resolving to the QA project before any test ran |

Full project references are deliberately **not** reproduced here. They are recorded in `qa/.env`
and in the Phase 4B provisioning record.

## 2. Pre-flight state

| Check | Expected | Observed |
|---|---|---|
| Migration count | 55 | 55 |
| Migration range | `0001`–`0054`, then `0056` | matches |
| `0055` present | no (reserved, renumbered to `0057` before that branch merges) | absent |
| Local vs remote alignment | every entry equal | every entry equal |
| `0056` applied | yes, already | yes — **not reapplied** |
| `delete-account` version | 1, the pre-revision build | 1 |

Because `0056` was already present, **no migration was applied, repaired or pushed in this run.**

## 3. Deployment

`supabase functions deploy delete-account --project-ref <QA>` — one function, explicitly targeted.

| | Before | After |
|---|---|---|
| Version | 1 | **2** |
| Content digest | `bf5a65f8…be75b829` | `68c2abe6…0a77a6f50` |
| Status | ACTIVE | ACTIVE |
| `verify_jwt` | true | true |

Both `index.ts` and `handler.ts` uploaded, which confirms the two-file split ships as one bundle and
that the relative `./handler.ts` import resolves in the real runtime. That import was the one thing
`deno check` could prove locally but only a deploy could exercise.

**Other functions untouched**, each still at its prior version: `mpesa-stk-push` v12,
`mpesa-callback` v12, `register-device` v7, `send-push` v6, `places-autocomplete` v3,
`place-details` v3.

## 4. Certification results — 9 / 9 PASS

`playwright/certification/account-deletion.spec.ts`, chromium, one worker, 1.9 minutes.

| # | Case | Result |
|---|---|---|
| 1 | Anonymous request → 401, nothing changes | PASS |
| 2 | Wrong password → 401 with zero mutation, and it is throttled | PASS |
| 3 | Admin request → 403 | PASS |
| 4 | Cross-user deletion impossible: a body naming another user is ignored | PASS |
| 5 | Every blocker → 409 with the code, and zero mutation | PASS |
| 6 | Customer deletion: tombstone, scrubbed booking, retained money, provider untouched | PASS |
| 7 | Provider deletion: earnings and payouts retained, denormalised fields scrubbed | PASS |
| 8 | **Forced auth-deletion failure → retry completes** | PASS |
| 9 | Repeat request on a fully deleted identity is idempotent | PASS |

### 4.1 The `pending_auth_delete` retry

Case 8 is the one the restructuring most endangered, because the new profile gate refuses a subject
whose profile cannot be read or does not exist, and a retry arrives after the profile has already
become a tombstone.

It passed. The tombstoned identity was denied every user-facing row **while still holding a valid
access token**, which is the restrictive-policy guarantee from `0056` operating independently of
auth state, and the retry then completed. The gate does not intercept it, because a tombstoned
account still has its profile row by design — that row is the referent financial history points at.

## 5. Before and after — 21 measures, all delta zero

Captured by tooling independent of the specification, so the result does not rest on the spec
asserting about itself. The spec's own `afterAll` delta-zero assertion also passed, giving two
separate confirmations.

| Measure | Before | After | Δ |
|---|---|---|---|
| bookings | 62 | 62 | 0 |
| payments | 37 | 37 | 0 |
| payment_attempts | 22 | 22 | 0 |
| provider_earnings | 32 | 32 | 0 |
| provider_payouts | 14 | 14 | 0 |
| provider_earning_deductions | 22 | 22 | 0 |
| wallet_transactions | 13 | 13 | 0 |
| wallets | 2 | 2 | 0 |
| notifications | 213 | 213 | 0 |
| admin_provider_pending | 31 | 31 | 0 |
| booking_activity | 66 | 66 | 0 |
| profiles | 8 | 8 | 0 |
| device_tokens | 2 | 2 | 0 |
| support_cases | 0 | 0 | 0 |
| tombstones (`deleted_at` set) | 0 | 0 | 0 |
| profiles `pending_auth_delete` | 0 | 0 | 0 |
| profiles `deleted` | 0 | 0 | 0 |
| account_deletions (audit) | 0 | 0 | 0 |
| account_deletion_attempts (throttle) | 0 | 0 | 0 |
| auth users under the run marker | 0 | 0 | 0 |
| profiles named as a QA subject | 0 | 0 | 0 |

Every disposable identity, tombstone, audit row, throttle row and seeded financial record created
during the run was removed. **No residue.**

## 6. Post-run state

Migrations re-listed after the run: still 55 entries ending `0054, 0056`, still no `0055`, still
fully aligned local to remote. Nothing about the schema changed.

## 6.1 Full release gate — `qa:release`, exit 0

Run once, later on 2026-09-23, after the certification above. **Not** a re-run of anything here;
a separate, wider gate.

| | |
|---|---|
| Head | `e85c3764ff027dc60b91b59aa49edc02c70b8303` |
| Working tree at launch | clean (precheck recorded an empty dirty list) |
| Head at finish | unchanged |
| Invocations | one, no retry |
| **Exit code** | **0** |
| Elapsed | 662 s |

| Stage | Result |
|---|---|
| `test:release` (Jest, root) | 254 suites, 4396 tests passed |
| `test:admin:release` (Jest, admin) | 40 suites, 557 tests passed |
| `tsc --noEmit` (root) | passed |
| `typecheck:admin` | passed |
| `expo export --platform web` | bundled |
| `expo export --platform android` | bundled |
| `build:admin` | bundled |
| `qa:test:certification` | 125 passed, 6.1 min |
| `qa:test:browsers:noncert` | 277 passed, **50 skipped**, 2.5 min |

The 50 skipped are the `@certification`-tagged cases, excluded by that stage's `--grep-invert`.
They are covered by the certification stage above them. **Zero failures in the whole run.**

A second 21-measure before/after comparison spanning the entire gate also returned delta zero, so
no suite in the gate left residue on QA. The QA target was re-verified before the run and
`delete-account` was still v2, digest `68c2abe6…`, afterwards.

### Provenance of this record

The gate result above belongs to head `e85c3764ff027dc60b91b59aa49edc02c70b8303`. **The commit that
adds this section is documentation only and has NOT itself been through `qa:release`**, nor has any
later commit. Do not read the gate result as applying to any SHA after `e85c376`. Documentation-only
commits are deliberately not re-gated; the gate covers code, tests, builds and QA behaviour, none of
which these change.

## 7. Scope — what this does NOT certify

Stated plainly so the result is not over-read.

- **This section certifies the function, not the gate.** The full `qa:release` gate was run
  separately, later the same day, and passed; see §6.1. The two ran on **different heads**: the
  function certification from the worktree at `81de534`, the gate at `e85c376`. The only difference
  between those commits is documentation, so the function source under test was identical. Neither
  result subsumes the other.
- **Production is not ready and was never contacted.** Production has neither `0056` nor this
  function. Both need separate authorisation.
- **No app layer was exercised.** No Android or iOS build, no device, no push, no website
  publication.
- **The two new refusal paths are not covered here.** Profile-read failure and missing profile
  cannot be induced in the certified QA project without breaking schema or RLS that other
  certifications depend on, and **no fault-injection hook may be added to the deployed function**,
  because anything that can force a failure in QA is reachable in production. They are covered
  offline by dependency injection in `src/__tests__/delete-account-handler.test.ts`, where four
  causes are exercised and reverting the gate fails twelve tests.
- **Nothing here bears on the retention procedure**, which remains **DRAFT FOR OWNER APPROVAL**.

## 8. Remaining decisions before release

1. **Owner approval of the public legal copy**, including the retention decision. Until the gate in
   `docs/pilot/data-retention-review.md` §9 is met, neither public page promises a deletion or
   anonymisation event, because nothing performs one.
2. **Production deployment** of `0056` and `delete-account` — separate authorisation.
3. **Website publication** of `/delete-account` before any Play submission.
4. **A new Android build.** The current artifact predates the entire feature.
5. **PR #27 needs one approving review.** Its blocked state is the review requirement, not a
   failing check.
6. **Migration `0055` → `0057`** on the privilege-hardening branch before it merges, so nothing
   arrives out of order and `--include-all` is never needed.

## 9. Reproduction

```
npx supabase migration list --linked
npx supabase functions list --project-ref <QA>
npx supabase functions deploy delete-account --project-ref <QA>
npx playwright test playwright/certification/account-deletion.spec.ts --project=chromium --workers=1
```

Run from `qa/` for the last command. The run sheet is
[ACCOUNT-DELETION-REVISED-FUNCTION-QA-RUN.md](ACCOUNT-DELETION-REVISED-FUNCTION-QA-RUN.md).

## 10. Related

- [Operations runbook](../engineering/operations/README.md) — the operator rule, migration
  numbering, deployment inventory and release items.
- [Legal and support](../pilot/legal-support.md) §8 — what deletion does.
- [Data retention review](../pilot/data-retention-review.md) — **DRAFT FOR OWNER APPROVAL**.
