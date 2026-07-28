# Phase 0 — Baseline Verification Report

> Read-only baseline. No product code, tests, configuration, database objects, or behavior
> were changed. Where a documented historical figure exists, it is shown separately from the
> result **observed during this Phase 0 run**. Secret values are never included; environment
> variables are referenced by name only.

## 1. Executive Summary

The repository has a **trustworthy, reproducible local baseline**. All independently-run gates
pass:

- **Root Jest:** 220/220 suites, **2943/2943** tests passed (exit 0).
- **Website (vitest):** 7/7 files, **102/102** tests passed (exit 0).
- **Type-check (`tsc --noEmit`):** 0 errors (exit 0).
- **Builds:** Expo web export, Expo **android** export, and website `next build` all succeeded.
- **Health verification:** **19/19** passed against the dedicated QA project (exit 0).
- **Connected certification (serial, `--workers=1`):** **21/21** passed, deterministic teardown
  completed (exit 0).

Two execution issues and three minor items were found. **None is a product defect** and **none
blocks Phase 1**:

- **`qa:release` fails (exit 1)** — its `qa:test:all-browsers` step runs the certification
  specs at **`--workers=2`** (parallel). The certification suite shares 4 persistent QA accounts
  and is designed to run **serially**; parallel execution causes cross-test contention (7
  chromium failures, including a *correct* B2 duplicate-active-booking `409`). The identical 21
  tests pass **21/21 serially** (§12). → **P1, test-infrastructure**.
- **`npm run lint` not runnable cleanly** — `expo lint` finds ESLint uninstalled, auto-installs
  it (mutating `package.json`/lockfile), then fails `Cannot find module 'eslint'` (exit 1). All
  side effects were reverted. → **P2, test-infrastructure**.
- Remote migration alignment **Blocked** (no Supabase CLI). → **P2, environment**.
- Root Jest worker teardown warning (open handle). → **P3, test defect**.
- Docs say "Website **Jest** … **30** tests"; actual is **vitest, 102** tests. → **P3, docs**.

**This baseline is not Full Platform Certification** and does not imply the platform is fully
tested. Only the backend booking spine is certified; large areas remain untested (see
`docs/engineering/qa/README.md` §10).

## 2. Repository State

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD (observed) | `2da28aa7f34aecf91427df3461cf2a1469f52bef` (matches required) |
| `main` == `origin/main` | Yes (0 ahead / 0 behind) |
| Working tree | Clean; no untracked files affecting testing |
| Pending commits | None |
| Mobile doc present on main | Yes |

## 3. Environment and Tooling

| Tool | Value / Status |
|---|---|
| OS | Windows 11 (10.0.26200); shell MINGW64 (Git Bash) |
| Node | v24.14.1 |
| npm | 11.11.0 |
| git | 2.53.0.windows.2 |
| `tsc` | via `npx` (local, v6.0.3) |
| Playwright browsers | Installed (chromium, firefox, webkit, headless shell) |
| `eas` CLI | On PATH (v18.8.1) — not used for remote builds |
| `supabase` CLI | **Absent** (blocks remote migration alignment) |
| `vercel` CLI | Absent (not needed; no deploy performed) |
| node_modules | Present in root, `qa/`, `apps/website/` |

**Environment variables (presence by name only — no values):**

- App `.env` (present): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` set.
- `qa/.env` (present): `QA_SUPABASE_URL`, `QA_SUPABASE_ANON_KEY`, `QA_SERVICE_ROLE_KEY`,
  and the four account pairs `QA_CUSTOMER_*`, `QA_ADMIN_*`, `QA_PROVIDER1_*`, `QA_PROVIDER2_*`
  all set. `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` **unset** (admin-dashboard connected tests skip).
- **Non-production confirmed:** `QA_SUPABASE_URL` host is **distinct** from the app URL host, so
  the `assertNotProduction()` guard (`qa/playwright/support/connected/qa-accounts.ts`) is
  satisfied. QA project host/values are intentionally omitted from this report.

## 4. Command Inventory

| Command | Classification | Phase 0 action |
|---|---|---|
| `npm test` (root Jest) | Safe to run locally (mocked) | Run (§5) |
| `npm --prefix apps/website test` (`vitest run`) | Safe to run locally | Run (§6) |
| `npx tsc --noEmit` | Safe to run locally | Run (§7) |
| `npm run lint` (`expo lint`) | Requires ESLint (auto-installs → mutates config) | Attempted; **Blocked**, reverted (§7) |
| `npx expo export --platform web` | Build-only (local; `dist/` git-ignored) | Run (§8) |
| `npx expo export --platform android` | Build-only (local; git-ignored) | Run via `qa:release` chain (§8) |
| `npm --prefix apps/website run build` (`next build`) | Build-only (local; git-ignored) | Run (§8) |
| Android/iOS store submit; remote **EAS build** | External service / paid | **Not run** (rules) |
| `supabase db push` / migration repair / reset | Destructive | **Not run** (rules) |
| `supabase migration list` (remote alignment) | Requires CLI + linked project | **Blocked** (no CLI) (§9) |
| `node qa/scripts/provision-accounts.mjs` | Mutates QA accounts | **Not run** (re-provision forbidden) (§10) |
| `npm --prefix qa run qa:health` | Requires QA backend (non-destructive) | Run (§11) |
| `npm --prefix qa run qa:test:certification` | Requires QA backend; deterministic cleanup | Run (§12) |
| `npm run qa:release` | Composite (builds + all-browser QA); no deploy/migration | Run (§13) |
| `npx expo prebuild` (native generation) | Modifies tree | **Not run** (rules) |

No destructive command was run.

## 5. Root Test Results

| Field | Result |
|---|---|
| Command | `npm test` (→ `jest`) |
| Status | **Passed** |
| Exit code | 0 |
| Duration | ~50.4 s (Jest-reported); ~56 s wall |
| Suites | **220 passed** / 220 total |
| Tests | **2943 passed** / 2943 total; 0 failed |
| Skipped | 0 |
| Snapshots | 0 |
| Coverage | Not produced by the default command (no `--coverage`) |
| Warnings | 1 — "A worker process has failed to exit gracefully and has been force exited" (open-handle / teardown; non-failing) |

Historical documented: ~2,943 tests / 220 suites (mocked). **Observed this run: identical.**

## 6. Website Test Results

| Field | Result |
|---|---|
| Command | `npm --prefix apps/website test` (→ `vitest run`) |
| Status | **Passed** |
| Exit code | 0 |
| Duration | ~7.7 s (vitest); ~12 s wall |
| Files | **7 passed** / 7 |
| Tests | **102 passed** / 102; 0 failed |
| Warnings | None material |

**Discrepancy:** engineering docs describe this as "Website **Jest** … **30** tests". The actual
runner is **vitest** and the observed count is **102** tests across 7 files. (File count 7 is
correct.) Recorded as a documentation finding (§14/§15); not fixed in Phase 0.

## 7. Static Validation Results

| Command | Status | Exit | Notes |
|---|---|---|---|
| `npx tsc --noEmit` | **Passed** | 0 | 0 `error TS…`; ~14 s |
| `npm run lint` (`expo lint`) | **Blocked** | 1 | ESLint not installed → `expo lint` auto-installed `eslint`/`eslint-config-expo` (added ~210 pkgs; wrote `eslint.config.js`; changed `package.json`+lock), then failed `Cannot find module 'eslint'`. **All side effects reverted** (`git checkout -- package.json package-lock.json`; removed `eslint.config.js`). Blocker: **test-infrastructure defect** (ESLint absent from devDependencies; managed auto-install fails in this env). |
| Formatting check | **Not run** | — | No format/prettier check script exists in `package.json` (N/A). |

No lint/format auto-fix was performed.

## 8. Build Verification

| Build | Status | Exit | Duration | Notes |
|---|---|---|---|---|
| Expo web export (`expo export --platform web`) | **Passed** | 0 | ~17 s | `dist/` produced (127 files); git-ignored, untracked |
| Expo android export (`expo export --platform android`) | **Passed** | 0 | — | Ran as a subcommand of `qa:release`; "Exported: dist" reached before the QA step |
| Website build (`next build`) | **Passed** | 0 | ~34 s | 17 static pages exported; output git-ignored |
| Android config validation | **Passed** | — | — | `app.json`/`eas.json` valid JSON; `package com.quickserve.app`, `versionCode 1`, dev/preview `buildType apk`, production `autoIncrement true` |
| iOS config validation | **Passed** | — | — | `bundleIdentifier com.quickserve.app`, `buildNumber 1`; `associatedDomains` = placeholder `applinks:REPLACE_ME.quickserve.app` |
| Local native compilation | **Not run** | — | — | Managed workflow (no `android/`, `ios/` dirs); would require `expo prebuild` (forbidden) |
| Remote EAS build | **Not run** | — | — | Paid/external; also `extra.eas.projectId` is empty |
| Store submission | **Not run** | — | — | Forbidden |

Distinction honored: only **local configuration validation** and **local export/build** were
executed for mobile; no local native compilation, no remote EAS build, no store submission.

## 9. Database and Migration Verification

| Check | Result |
|---|---|
| Migration files present | **34** (`supabase/migrations/`) |
| Numbering | Contiguous **0001 … 0034** |
| Duplicate numbers | **None** |
| Gaps | **None** |
| First / last | `0001_profiles.sql` / `0034_provider_terminal_states.sql` |
| Local consistency | **Verified** |
| Remote alignment (`supabase migration list`) | **Blocked** — Supabase CLI not on PATH; no local↔remote drift check possible |

No destructive, push, repair, reset, or mutation command was run.

## 10. QA Accounts and Seed Verification

| Item | Result |
|---|---|
| Expected persistent QA role count | **4** |
| Expected roles | customer, admin, provider1, provider2 |
| Credentials present (by name) | Yes — all four `QA_*_EMAIL`/`QA_*_PASSWORD` pairs set in `qa/.env` |
| Production protection | `assertNotProduction()` guard present; QA host distinct from app host |
| Existence / authentication | **Verified** — certification test "all four persistent QA accounts authenticate" passed (§12), and every certification spec authenticated its role |
| Seed / account state | **Verified** (read-only, via the existing certification run; no re-provisioning) |

No QA account was created, deleted, mutated, or re-provisioned.

## 11. Health Verification

| Field | Result |
|---|---|
| Command | `npm --prefix qa run qa:health` (`playwright test playwright/tests --project=chromium`) |
| Target | Dedicated QA project (assertNotProduction-guarded; auto-started Expo web server) |
| Status | **Passed** |
| Exit code | 0 |
| Tests | **19 passed** / 19; 0 failed |
| Duration | ~42.6 s |
| Warnings | RN-web `useNativeDriver` fallback warning (expected on web; non-failing) |

Historical documented: 19. **Observed this run: 19/19.**

## 12. Connected Certification

| Field | Result |
|---|---|
| Command | `npm --prefix qa run qa:test:certification` (`playwright test playwright/certification --project=chromium --workers=1`) |
| Target | Dedicated QA project (assertNotProduction-guarded); **serial** (`--workers=1`) |
| Status | **Passed** |
| Exit code | 0 |
| Tests | **21 passed** / 21; 0 failed |
| Duration | ~70 s (1.1 m) |
| Cleanup | `global-teardown` logged "QA run complete"; deterministic teardown ran |
| Residual data | None reported |
| Warnings | `global-setup` skipped admin storageState (no `E2E_ADMIN_*`) — expected; unrelated to certification |

Historical documented: 21. **Observed this run: 21/21 (serial).**

## 13. Release Gate Verification

**Composition** (`package.json` `qa:release`): `jest && tsc --noEmit && expo export --platform web
&& expo export --platform android && npm --prefix qa run qa:test:all-browsers`. Static analysis:
**no deploy, no migration, no infrastructure mutation** — only deterministic QA test cleanup.
Judged safe/non-production and run exactly as defined.

| Subcommand | Status | Key result |
|---|---|---|
| `jest` | **Passed** | 2943/2943 (same worker-teardown warning) |
| `tsc --noEmit` | **Passed** | 0 errors |
| `expo export --platform web` | **Passed** | "Exported: dist" |
| `expo export --platform android` | **Passed** | "Exported: dist" |
| `qa:test:all-browsers` (`playwright test --workers=2`) | **Failed** | 249 tests / 2 workers → **144 passed, 7 failed, 98 skipped** |
| **Overall `qa:release`** | **Failed** | Exit 1; ~388 s (all-browsers ~5.0 m) |

**Nature of the 7 failures — not a product defect:**

- All **7 are chromium certification specs** (admin-dispatch, golden-path, integrity ×4,
  provider-progression). Firefox/webkit certification specs are skipped (certification is
  chromium-only), so the specs ran **in parallel at `--workers=2`**.
- The certification suite shares the **4 persistent QA accounts** and is designed to run
  **serially** (`qa:test:certification` pins `--workers=1`; documented in `qa/docs/FLAKES.md`).
  Parallel execution causes cross-test contention. Representative errors:
  `assignProvider failed: HTTP 200 —` (row not visible due to a concurrent write) and, tellingly,
  `createCustomerBooking failed: HTTP 409 — bookings_active_dedup` — two parallel tests on the
  **same** QA customer account collided and the **B2 dedup constraint (migration 0033) correctly
  rejected** the second active booking.
- The identical 21 specs passed **21/21 serially** (§12). Root cause = **release-gate composition
  runs a serial-only suite in parallel** (test-infrastructure), not application behavior.

**`qa:release` passing is not Full Platform Certification** — and here it did not pass at all in
this environment.

## 14. Documentation Validation

Read-only across `docs/engineering/` (no edits made):

| Check | Result |
|---|---|
| Broken relative links | **None** |
| Missing cited repository paths | **None** |
| Unbalanced Mermaid fences | **None** (all 13 docs balanced) |
| Stale placeholder / "not yet populated" language | **None** ("scaffolding" in `operations/` is legitimate content; "placeholder" in `qa/`/`mobile/` are accurate references) |
| Inconsistent testing counts | **One** — `qa/README.md` states "Website **Jest** … **30** tests"; observed is **vitest, 102** tests (7 files). Shared certification/health/Jest counts (21, 19, 43, 2943/220, 44/45, 4 accounts) remain internally consistent. |

## 15. Failures and Blockers

| # | Finding | Evidence | Cause |
|---|---|---|---|
| F1 | `qa:release` fails: `qa:test:all-browsers` runs certification at `--workers=2`, 7 chromium contention failures | §13; passes 21/21 serially (§12) | Test infrastructure defect |
| F2 | `npm run lint` not runnable cleanly (auto-installs config, then `Cannot find module 'eslint'`, exit 1) | §7; side effects reverted | Test infrastructure defect |
| F3 | Remote migration alignment unverifiable | §9; no Supabase CLI | Environment blocker |
| F4 | Root Jest worker force-exit (open-handle/teardown) | §5; tests still 2943/2943 | Test defect |
| F5 | Docs mislabel website suite ("Jest, 30") vs observed (vitest, 102) | §6, §14 | Documentation issue |

## 16. Severity Classification

| Finding | Severity | Rationale |
|---|---|---|
| F1 — release-gate parallel certification | **P1** | Composite gate is red in this environment; major reliability gap. Not P0 — a trustworthy baseline is obtainable via the serial certification command, and it is not a product defect. |
| F2 — lint not runnable | **P2** | Useful static gate unavailable out-of-the-box; does not block Phase 1 (tsc + tests pass). |
| F3 — remote migration alignment blocked | **P2** | Cannot confirm local↔remote drift here; local migrations are clean. |
| F4 — Jest worker teardown warning | **P3** | Informational; no test failures. |
| F5 — website test doc mismatch | **P3** | Documentation accuracy only. |

No finding is **P0**. No finding was fixed.

## 17. Phase 1 Entry Criteria

Proposed criteria (all currently **met** unless noted):

1. `main` clean and aligned with `origin/main` at a known HEAD. ✔
2. Root Jest green (2943/2943). ✔
3. Website vitest green (102/102). ✔
4. `tsc --noEmit` clean. ✔
5. Expo web + android exports and website build succeed. ✔
6. Health **19/19** and connected certification **21/21 (serial)** against the dedicated,
   non-production QA project. ✔
7. QA accounts (4) present and authenticating. ✔
8. Known non-blocking issues F1–F5 recorded and acknowledged (no fix required to enter Phase 1). ✔
9. *(Deferred)* remote migration alignment — remains **Blocked** until a Supabase CLI is
   available; not required to enter Phase 1.

## 18. Recommended Phase 1 Scope

Grounded in this baseline and the already-documented gaps (`docs/engineering/qa/README.md` §10) —
no new plans invented:

- **Stabilize the release-gate composition (F1):** run certification serially within
  `qa:release`/all-browsers, or exclude certification specs from the `--workers=2` matrix, so the
  composite gate reflects the serial certified result. (Decision/fix deferred — not Phase 0.)
- **Restore a runnable lint baseline (F2)** and decide whether ESLint belongs in devDependencies.
- **Obtain Supabase CLI access** to close remote migration-alignment verification (F3).
- **Expand connected coverage toward the untested P0/P1 areas** already catalogued in the QA doc
  (payments settlement, push delivery, storage, signup, native journeys) — as the substantive
  Phase 1 testing work.
- **Correct the website test description** (F5) during the next documentation pass.

These are candidate scope items for approval, not work performed in Phase 0.

## 19. Final Baseline Status

**Baseline established and trustworthy.** Local unit/type/build gates, health (19/19), and
serial connected certification (21/21) are **green**; the composite `qa:release` gate is **red**
in this environment due to a parallel-execution composition issue (F1, P1), and lint (F2) and
remote migration alignment (F3) are unavailable here. **No product defect was found. The
platform is not fully tested and not Full Platform Certified.** No fixes or behavior changes were
made.

---

### Evidence note

Every result above was observed during this Phase 0 run on `2026-07-28`. Historical documented
figures are labelled as such and are shown only alongside a matching observed rerun. No secret
values, keys, tokens, QA hostnames, or account identifiers are included in this report.
