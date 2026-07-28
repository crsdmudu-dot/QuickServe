# Phase 1A — Testing Infrastructure Stabilization Report

> Scope: stabilize the existing testing/release-validation infrastructure for the five Phase 0
> findings (F1–F5). No new product features, no new test coverage for payments/push/storage/
> signup/native/offline/perf/a11y, no product-behavior or database changes. All results below
> were **observed during this Phase 1A run** (2026-07-28); historical figures are labelled as
> such. No secret values, keys, tokens, QA hostnames, or account identifiers appear here.

## 1. Executive Summary

Four of the five findings are resolved or materially improved; one is investigated and left open
with better evidence.

- **F1 (P1) — RESOLVED.** The release gate now runs the connected certification suite
  **serially** and the remaining suites in parallel. **`qa:release` passes end-to-end (exit 0).**
- **F2 (P2) — Partially resolved.** `npm run lint` now runs **deterministically** (declared
  ESLint deps + committed flat config; no auto-install, no auto-generated config). The run
  surfaces **489 pre-existing findings** (a latent backlog) whose remediation is out of Phase 1A
  scope (would require broad refactoring / rule changes).
- **F3 (P2) — Partially resolved.** The Supabase CLI is now a **pinned project-local
  devDependency** (`supabase@2.110.0`), so it is reproducibly available. **Remote** migration
  alignment remains **Blocked** (no access token / QA DB password; local link target unverified
  as non-production).
- **F4 (P3) — Unresolved (investigated).** Under `--detectOpenHandles` the suite reports **0 open
  handles** and the warning does not appear; it is **benign jest worker-pool teardown behavior**,
  not a provable leak. No safe, proven small fix exists; forcing exit/sleeps/suppression are
  disallowed, so it is left open with better evidence. Tests remain **2943/2943**.
- **F5 (P3) — RESOLVED.** The QA doc now states the website runner is **Vitest** with **102 tests
  across 7 files** (historical figure 30 noted).

**This is not Full Platform Certification** and asserts no product readiness beyond the observed
results.

## 2. Starting Baseline

| Item | Value |
|---|---|
| Branch | `qa/phase-1a-infrastructure` |
| Pre-work main commit | `afb078b4e3a1322cfdb0b5231200af14d8065ed8` |
| Node / npm | v24.14.1 / 11.11.0 |
| Test CLIs | Playwright 1.61.1, Jest 29.7.0, Vitest 3.2.6, tsc 6.0.3 |

## 3. Findings Reproduced

Each finding was reproduced before any change (Step 2):

| Finding | Command | Observed | Root-cause hypothesis |
|---|---|---|---|
| F1 | `playwright test playwright/certification --project=chromium --workers=2` | **7 failed / 14 passed** (contention: `bookings_active_dedup` 409, `assignProvider HTTP 200`) | Serial-only suite run in parallel across 4 shared QA accounts |
| F1 (control) | `… --workers=1` | **21 passed** | Serial execution avoids contention |
| F2 | `npm run lint` (`expo lint`) | Auto-generates `eslint.config.js`; **489 problems**, exit 1; ESLint later pruned by clean install (undeclared) | ESLint deps + config not committed → auto-install/auto-config, non-deterministic |
| F4 | `npm test` (parallel) vs `jest --detectOpenHandles` | Warning present in parallel; **0 handles / no warning** under detect | jest worker-pool teardown, not a resource leak |
| F5 | `npm --prefix apps/website test` | **Vitest, 7 files, 102 tests** | Docs said "Jest / 30" |
| F3 | `command -v supabase` | Absent globally; not a declared dependency | No project-local CLI |

## 4. F1 — Release-Gate Orchestration

**Root cause:** root `qa:release` ended with `npm --prefix qa run qa:test:all-browsers`
(`playwright test --workers=2`), which ran the **`@certification`** specs in parallel. Those 21
specs share the 4 persistent QA accounts and require serial execution (as `qa:test:certification`
already pins `--workers=1`; documented in `qa/docs/FLAKES.md`). Parallelism caused cross-test
contention (e.g. two tests creating active bookings on the same QA customer → the B2 dedup
constraint correctly returned `409`).

**Fix (smallest safe, explicit composition):**

- `qa/package.json` — two new scripts:
  - `qa:test:browsers:noncert` = `playwright test --grep-invert @certification --workers=2`
    (the multi-browser suites **excluding** certification).
  - `qa:release:e2e` = `npm run qa:test:certification && npm run qa:test:browsers:noncert`
    (serial certification **then** parallel non-cert).
- `package.json` — `qa:release` now ends with `npm --prefix qa run qa:release:e2e` (was
  `qa:test:all-browsers`).

The `@certification` tag cleanly partitions the suite (verified: 21 cert + 62 non-cert = 83
chromium specs; all `@certification` specs live under `playwright/certification/`). No assertions
weakened, no tests skipped, no retries added, no new QA accounts, no browser coverage removed
(certification was already chromium-only; non-cert still runs on all browsers). Deterministic
cleanup is preserved (global setup/teardown run for each invocation). Existing
`qa:test:all-browsers` and `qa:test:certification` are unchanged for other uses.

**Verification (observed):**

- Serial certification: **21/21 passed** (workers=1), teardown "QA run complete".
- `qa:release:e2e`: **exit 0** — cert 21/21 + non-cert **130 passed / 56 skipped / 0 failed**.
- **Full `qa:release`: exit 0** (see §10). The previously-failing stage now passes; no residual
  test records (two deterministic teardowns logged).

**Status: RESOLVED.**

## 5. F2 — Lint Baseline

**Root cause:** neither ESLint nor a lint config was committed (only 29 "unused eslint-disable
directive" warnings hint at a former, now-missing config). `expo lint` therefore auto-installed
ESLint and auto-generated `eslint.config.js` on each run — non-deterministic and mutating.

**Fix (infrastructure only):**

- `package.json` — declared devDependencies `eslint@^9.0.0` and `eslint-config-expo@~56.0.4`
  (the versions `expo lint` expects); lockfile updated.
- Committed an explicit flat config `eslint.config.js` using the standard **eslint-config-expo**
  ruleset, with `ignores` for separately-tooled / generated dirs (`dist`, `.expo`, `coverage`,
  `qa`, `apps/website`) — mirroring the existing `tsconfig.json` / `jest.config.js` exclusions.
  No rules were weakened or disabled.

**Result (observed):** `npm run lint` now runs **deterministically** — **no auto-install, no
config regeneration, no untracked files**, exit 1, ~10 s. It reports **489 problems (59 errors,
430 warnings)**, dominated by `import/first` (262), `@typescript-eslint/no-require-imports` (78),
`@typescript-eslint/no-unused-vars` (32), and React-compiler hooks rules (~54). Many are
idiomatic test-file patterns (e.g. `jest.mock()` placed before imports) and stylistic rules.

**Findings classification & decision:** reaching a green lint would require broad
formatting/refactoring across app and test files, or rule overrides for test files — both
**explicitly out of Phase 1A scope** ("do not perform broad formatting or refactoring", "do not
disable meaningful rules merely to force a pass"). **No source files were changed for lint.** The
489-finding backlog is documented for a separate, approval-gated cleanup.

**Status: Partially resolved** — the infrastructure defect (non-deterministic, auto-mutating
lint) is fixed; a lint-clean baseline is deferred.

## 6. F3 — Migration Alignment Tooling

**Fix:** pinned `supabase@2.110.0` as a **project-local devDependency** (`package.json` +
lockfile), so the CLI is reproducibly available (`npx supabase --version` → 2.110.0). No global
install, no interactive login.

**Remote alignment attempt:** `supabase migration list` requires `--linked` (needs
`SUPABASE_ACCESS_TOKEN`) or `--db-url`/`--password` (needs the QA Postgres password). None are
present — `qa/.env` holds only API keys (URL/anon/service-role). A local `supabase/.temp/`
linkage exists but its target is **not verified as the non-production QA project**, so running a
remote command would risk hitting a non-QA project and/or prompt for login — **disallowed**.
Remote alignment was therefore **not run**.

**Local verification (observed):** migrations remain **0001–0034**, contiguous, **no duplicates,
no gaps** (34 files).

**Status: Partially resolved** — CLI available and pinned; **remaining prerequisite** for remote
alignment: a verified non-production QA link plus `SUPABASE_ACCESS_TOKEN` (or the QA DB
connection string/password). Not converted to a pass.

## 7. F4 — Jest Teardown Warning

**Investigation (observed):**

- Normal parallel `npm test`: **2943/2943 pass**, plus the warning "A worker process has failed
  to exit gracefully and has been force exited."
- `jest --detectOpenHandles` (runInBand): **2943/2943 pass, 0 open handles detected, no
  warning** (223 s).

Because `--detectOpenHandles` identifies **no** leaking timer/socket/handle and the warning only
manifests under the multi-worker pool, this is **benign jest worker-pool teardown behavior**, not
a provable application/test leak. No specific resource was identified to close with a small,
behavior-preserving fix. Forcing exit (`--forceExit`), adding sleeps, or globally suppressing the
warning are disallowed by the phase rules.

**Status: Unresolved (investigated).** Left open with better evidence; no code change made. Tests
are fully green either way.

## 8. F5 — Website Test Documentation

**Fix:** `docs/engineering/qa/README.md` updated in three places — the layer description, the
Mermaid node, and the testing-layers bullet — to state the runner is **Vitest** and the observed
count is **102 tests across 7 files** (historical figure 30 noted). No other docs required
changes (historical `docs/superpowers/*` plans/specs are out of scope). Reconfirmed this phase:
`npm --prefix apps/website test` → **Vitest, 7 files, 102 tests, exit 0**.

**Status: RESOLVED.**

## 9. Files Changed

| File | Change | Finding |
|---|---|---|
| `package.json` | +devDeps `eslint`, `eslint-config-expo`, `supabase`; `qa:release` → `qa:release:e2e` | F1, F2, F3 |
| `package-lock.json` | Lockfile for the three added devDependencies | F2, F3 |
| `qa/package.json` | +scripts `qa:test:browsers:noncert`, `qa:release:e2e` | F1 |
| `eslint.config.js` (new) | Committed flat ESLint config (eslint-config-expo + ignores) | F2 |
| `docs/engineering/qa/README.md` | Website runner/count corrected (Vitest, 102/7) | F5 |
| `docs/qa/PHASE-1A-INFRASTRUCTURE-REPORT.md` (new) | This report | — |

No `src/`, `supabase/`, migrations, tests, QA scripts, deployment files, `app.json`,
`jest.config.js`, `tsconfig.json`, `eas.json`, or `vercel.json` were changed. No product behavior
or database object changed.

## 10. Validation Matrix

| # | Command | Status | Exit | Duration | Result |
|---|---|---|---|---|---|
| 1 | `npm test` (root Jest) | **Pass** | 0 | ~48 s | 220/220 suites, 2943/2943 tests (benign worker-teardown warning) |
| 2 | `npm --prefix apps/website test` (Vitest) | **Pass** | 0 | ~9 s | 7 files, 102 tests |
| 3 | `npx tsc --noEmit` | **Pass** | 0 | ~16 s | 0 errors |
| 4 | `npm run lint` | **Deterministic; not clean** | 1 | ~10 s | 489 problems (59 err / 430 warn); no install/regeneration |
| 5 | `npm --prefix qa run qa:health` | **Pass** | 0 | ~38 s | 19/19 |
| 6 | Connected certification (serial, workers=1) | **Pass** | 0 | ~1.2 m | 21/21; teardown complete |
| 7 | `npm run qa:release` | **Pass** | 0 | ~413 s | jest 2943 → tsc 0 → web export → android export → cert 21/21 → non-cert 130 passed/56 skipped/0 failed |
| 8 | `expo export --platform web` (in qa:release) | **Pass** | 0 | — | "Exported: dist" |
| 9 | `expo export --platform android` (in qa:release) | **Pass** | 0 | — | "Exported: dist" |
| 10 | `npm --prefix apps/website run build` | **Pass** | 0 | ~29 s | 17 static pages exported |
| 11 | Local migration order | **Pass** | — | — | 0001–0034 contiguous; no dup/gap |
| 12 | Remote QA migration alignment | **Blocked** | — | — | No access token / QA DB password; link target unverified as non-prod (not run) |
| 13 | Doc validation (changed `qa/README.md`) | **Pass** | — | — | Links resolve; Mermaid balanced (2/4); Vitest/102 present; shared counts (21/19/43/2943/220/44-45) consistent |

**qa:release result:** **Pass (exit 0)**. **Connected certification:** **21/21 (serial)**.
**Lint:** deterministic, 489 findings. **Migration alignment:** local clean; remote blocked.
**Jest warning:** benign, unresolved.

## 11. Remaining Risks and Blockers

- **Lint backlog (from F2):** 489 pre-existing findings; the lint gate is deterministic but red.
  Remediation needs an approved, scoped cleanup (or test-file-specific rule scoping) — broad
  changes are out of Phase 1A scope.
- **Remote migration alignment (F3):** still unverifiable without a confirmed non-production QA
  link and `SUPABASE_ACCESS_TOKEN` / QA DB password.
- **Jest teardown warning (F4):** benign, cosmetic; no proven safe fix.
- **`package-lock.json` churn:** large, but solely from the three approved devDependencies;
  runtime dependencies are unchanged.

## 12. Phase 1B Entry Recommendation

Proceed to Phase 1B (expanded coverage) is **reasonable**: the release gate is green end-to-end,
unit/type/build/health/serial-certification all pass, and the pipeline is reproducible. Recommended
before or alongside Phase 1B (not blocking):

- Decide on the lint backlog remediation (dedicated approved pass, or test-file rule scoping).
- Provision a confirmed non-production QA link + access token to close remote migration alignment.
- Optionally revisit F4 if the worker warning ever correlates with a real failure (none observed).

Phase 1B substantive coverage targets remain the documented untested P0/P1 areas
(`docs/engineering/qa/README.md` §10) — payments settlement, push delivery, storage, signup,
native — **not started here**.

## 13. Final Status

| Finding | Severity | Status |
|---|---|---|
| F1 — release-gate orchestration | P1 | **Resolved** |
| F2 — reproducible lint baseline | P2 | **Partially resolved** (command deterministic; findings backlog deferred) |
| F3 — Supabase CLI / migration alignment | P2 | **Partially resolved** (CLI pinned; remote blocked) |
| F4 — Jest teardown warning | P3 | **Unresolved (investigated; benign)** |
| F5 — website test documentation | P3 | **Resolved** |

The testing/release pipeline is **reproducible and the release gate is green**. No product
features, coverage, or database migrations were introduced. Full Platform Certification is not
claimed.
