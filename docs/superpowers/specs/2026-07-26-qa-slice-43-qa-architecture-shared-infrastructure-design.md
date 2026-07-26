# QA Slice 43 — QA Automation Architecture & Shared Infrastructure — Spec

**Status:** Specification only. No implementation, no helper refactoring, no test creation, no
package-script changes, no production changes.
**Branch:** `qa/slice-43-qa-architecture`
**Baseline:** `main` @ `7da334e` (Slices 40–42 merged). Green: Playwright 109 passed / 50 skipped / 0
failed · Jest 2943/2943 · TS clean · Expo web+android exports OK.
**Toolchain (observed):** Playwright **1.61.1** (floor `^1.48.0`), Node 22 types, TypeScript `^5.6`,
Chromium/Firefox/WebKit projects, `fullyParallel: true`, local `workers` = auto (6 on this machine),
`retries` = 0 local / 2 CI.

> This slice **formalizes** the platform built in Slices 39–42. It adds architecture documentation, a
> small set of **justified** shared primitives, a **small** set of framework health-tests, and a
> sustainable gate/flake policy. It adds **no new application feature coverage**.

---

## 1. Audit summary — the `qa/` workspace

### 1.1 Inventory (source files, excluding node_modules/artifacts)

| Area | Files | Notes |
|---|---|---|
| Config | `package.json`, `playwright.config.ts`, `tsconfig.json`, `.env.example`, `.gitignore` | 3 browser projects; `webServer` auto-starts `npm run web` when `BASE_URL` unset |
| Shared (runner-agnostic) | `shared/env.ts`, `shared/logger.ts`, `shared/data-factory.ts` | env loader, structured logger, deterministic PRNG factory |
| Support | `support/auth.ts`, `support/assertions.ts`, `support/global-setup.ts`, `support/global-teardown.ts`, `support/mock-admin-session.ts`, `support/analytics-stubs.ts`, `support/detailed-analytics-stubs.ts` | session/guard, custom matcher, global setup (storageState), the two stub modules |
| Fixtures | `fixtures/index.ts` | extends `test` with `logger`, `testData`, `adminPage`; re-exports `expect` |
| Page Objects | `pages/base.page.ts`, `pages/admin/login.page.ts`, `pages/admin/executive-dashboard.page.ts`, `pages/admin/detailed-analytics.page.ts` | BasePage + 3 admin POMs |
| Suites | `admin/authentication.spec.ts` (6), `admin/executive-dashboard.spec.ts` (15), `admin/detailed-analytics.spec.ts` (22) | admin-web only |
| Meta/smoke | `tests/framework.spec.ts` (9 self-tests), `tests/smoke.spec.ts` (1) | framework + infra smoke |
| Docs | `README.md` (16 sections), `maestro/README.md` | onboarding + isolation notes |
| Placeholders | `playwright/customer/.gitkeep`, `playwright/provider/.gitkeep`, `maestro/` | reserved, empty |

### 1.2 Existing scripts (`qa/package.json`)

Present: `install:browsers`, `install:chromium`, `typecheck`, `test:e2e`, `test:e2e:headed`,
`test:e2e:chromium`, `test:framework`, `test:list`, `report`.
Root (`/package.json`): `test` (jest), `web`, `android`, `lint` — **no** root `typecheck`/`export`
aggregate script (those run via `npx tsc` / `npx expo export` directly).

### 1.3 Existing documentation (`qa/README.md` headings)

Prerequisites · Environment variables (+`BASE_URL` behaviour) · Running the tests (+file/tag targeting) ·
Folder structure · How to add a Page Object · fixtures · tests · How reports work · Authentication ·
Troubleshooting · CI notes · Dashboard isolation testing · Detailed Analytics suite · Future Maestro.
The README is an **onboarding/how-to** guide. There is **no formal architecture/policy document** —
that gap is the core of this slice.

---

## 2. Duplication findings (precise; per required action)

Legend for **Action**: **Consolidate now** · **Document only** · **Leave separate (intentional)**.

| # | Files & duplicated behavior | Harmful? | Reduces maintenance risk? | Over-general risk? | Action |
|---|---|---|---|---|---|
| D1 | `respond()` + `respondError()` + `rpcNameFromUrl()` — byte-identical in `analytics-stubs.ts` and `detailed-analytics-stubs.ts` | Low now, grows per suite | Yes (one fix site for the abort-vs-500 subtlety) | Low (tiny pure primitives) | **Consolidate now** → `support/rpc-interceptor.ts` |
| D2 | Strict-tracker plumbing — `called/unexpected/badShape` arrays + `assertNoAnomalies()` + `assertCalled()` + the `/\/rest\/v1\/rpc\/analytics_/` catch-all, near-identical in both stub modules (detailed adds `lastParamsFor` + param capture) | Medium (two authorities for the determinism guarantee) | Yes | **Medium** — must extract only the *core*, leaving fixtures + shape rules per-suite | **Consolidate now (core only)** |
| D3 | Per-RPC POST + `p_from/p_to` base validation loop — same skeleton in both, differing only by extra keys (`p_bucket`/`p_limit`) | Medium | Yes | Medium if made "universal validator" | **Consolidate now** as a *pure* `validateRpcShape(req, rules)` primitive (unit-testable) |
| D4 | `CONNECTED` + `hasCreds` constants — verbatim in `executive-dashboard.spec.ts:29-30` and `detailed-analytics.spec.ts:32-33` | Medium (env-key drift risk) | Yes | Low | **Consolidate now** → `support/connected-mode.ts` (+ add `QA_DASHBOARD_CONNECTED` to `shared/env.ts`) |
| D5 | Connected real-login flow — `login.login(process.env.E2E_ADMIN_*)` + `waitForURL(!login)` in `setupDashboard`/`setupDetailed`; also overlaps `support/auth.ts:loginAsAdmin` (which uses bulk `fill`, not the hydration gate) | Medium | Yes | Low | **Consolidate now** → one `connectedAdminLogin(page)` reusing `LoginPage` (hydration-gated) |
| D6 | Hydration-gate typing — `LoginPage.waitForReady/fill` and `DetailedAnalyticsPage.typeInto` both implement the RN-Web `pressSequentially`+`toHaveValue`+`toPass` probe | Medium (subtle logic, two copies) | Yes | Low | **Consolidate now** → `support/rn-web.ts:hydratedFill(locator, value)` (both POMs delegate) |
| D7 | CSV download read — `readDownload()` exists only in `detailed-analytics.spec.ts` (single user) | No | Marginal | Low | **Consolidate now (tiny)** → `support/download.ts:readDownloadText(download)` (clearly reusable; promoted once) |
| D8 | Chromium-only guard — `test.skip(project!=='chromium')` only in the detailed suite (single user) | No | Marginal | Low | **Document only** (promote to `support/browser-scope.ts:chromiumOnly(test)` when a 2nd suite needs it) |
| D9 | `mockAdminSession` network guard (`authRequests`/`unexpectedRest` + `assertClean`) vs the tracker's `unexpected` REST recording | No (different layers) | No | High (a "universal guard" would blur session-vs-RPC concerns) | **Leave separate (intentional)** |
| D10 | The two fixture *datasets* and the two *RPC name sets* (exec vs detailed) | No — genuinely different contracts | No | High (merging would couple unrelated screens) | **Leave separate (intentional)** |
| D11 | `analytics-stubs.ts` module-level mutable `overviewFromSeen` (reset per install) vs detailed stubs' closure-scoped state | Latent (global-state smell; leak if reset ever missed) | Yes | Low | **Document** as an anti-pattern; when D2 lands, move exec state into the interceptor closure |

**Net consolidation:** D1–D7 into **four small primitives** (`rpc-interceptor.ts`, `connected-mode.ts`,
`rn-web.ts`, `download.ts`) + a pure `validateRpcShape`. This is **primitives, not a framework** — the
per-suite fixtures, RPC sets, and shape rules stay in their own modules. D8/D11 documented; D9/D10 left
separate on purpose.

---

## 3. Reliability-risk audit

| Risk | Evidence / mechanism | Severity | Mitigation (this slice = policy; not code beyond primitives) |
|---|---|---|---|
| R1 Firefox/WebKit CPU-contention flakes | `executive-dashboard` `toBeVisible` timeouts at 30–35s under 3-browser × 6-worker + one shared Expo dev server; intermittent (0–6 failures across full runs) | **High** | Flake policy §7 + gate policy §5: default gate is **Chromium-only**; multi-browser is a **separate, retry-enabled, lower-concurrency** advisory gate |
| R2 Browser-project skip volume | Chromium-only suites produce 44 skips in the 3-project run → confusing totals | Medium | Reporting-accuracy rule §4 doc + tag `@chromium-only`; report skips by *cause* |
| R3 Shared testID collisions | `chart-loading`/`chart-empty` reused across charts (components override passed id) | Medium | testID policy doc; positional scoping is documented, not "fixed" via prod change |
| R4 Positional selectors | 7 identical "Download CSV" buttons addressed by `.nth()` | Medium | `.nth()` policy §4 doc: allowed only with a documented stable order + a comment |
| R5 Implicit timing | Section headings render at mount before data → reading tracker params immediately is racy (fixed in Slice 42 test 4 via `expect.poll`) | Medium | Deterministic-wait/polling policy; a health-test guards "no fixed sleeps" convention |
| R6 Cross-test state | `overviewFromSeen` module global (D11) | Low (reset today) | D2 consolidation moves it into closure; health-test asserts tracker reset |
| R7 Route interception leaks | Per-`page` routes + fresh context per test → none observed | Low | Health-test: two installs yield independent trackers |
| R8 Env misconfiguration | `BASE_URL` set ⇒ no auto-server; creds absent ⇒ storageState skipped | Low | env doc + `connectedMode()` single source |
| R9 Wrong working directory | Earlier PowerShell CWD artifact caused false export/jest "failures" | Medium | doc: run root gate from repo root; qa gate from `qa/`; scripts §7 encode CWD |
| R10 Confusing pass/skip reporting | skips = chromium-only scoping + backend-gated auth | Medium | reporting-accuracy §4: never call a suite "fully passing" while backend-gated tests are skipped |
| R11 Accidental live-backend dependence | mock suites must fail loud | Low (guarded) | health-test: a stray `/auth` or un-stubbed `/rest` fails `assertClean()` |
| R12 Mock fixtures drifting from prod RPC contracts | qa fixtures hand-mirror `src/lib/analytics.ts` + `executive-analytics.ts` types | **Medium** | §6 open decision: optional type-level drift guard; documented as a known limitation regardless |

---

## 4. QA Automation Architecture document — section design

Deliverable: the official guide will live at **`qa/docs/ARCHITECTURE.md`** (new `qa/docs/` folder), linked
from `qa/README.md`. The README stays the *how-to*; ARCHITECTURE.md is the *why/policy*. Exact sections
(each 1 short paragraph + rules; policies with already-decided values shown inline below):

1. **Goals & non-goals** — deterministic, offline-first admin-web E2E; *not* a universal test framework, not app-feature seeding.
2. **Directory structure** — `shared/` (runner-agnostic), `playwright/{admin,customer,provider}` suites, `playwright/pages`, `playwright/support` (primitives), `playwright/fixtures`, `playwright/tests` (meta/smoke), `maestro/` (reserved).
3. **Test-layer model** — L0 pure unit (support primitives, no browser) · L1 infra/meta (framework health) · L2 feature E2E (mock) · L3 connected confirmation (real backend).
4. **Suite classification** — reference suite (Auth), isolated feature suites (Executive, Detailed), meta/smoke.
5. **Browser-scope policy** — admin-web feature suites are **Chromium-only** (`@chromium-only` + `chromiumOnly(test)` guard). Cross-browser is exercised by **smoke + auth render/validation** only. Rationale: admin is a desktop web surface; full 3-browser feature runs add contention (R1) without proportional signal.
6. **Mock-vs-connected policy** — default **mock** (`mockAdminSession` + RPC stubs), fully offline & deterministic; **connected** (`QA_DASHBOARD_CONNECTED=1` + `E2E_ADMIN_*`) is opt-in confirmation. A suite must run green offline; connected adds assurance, never gates day-to-day merges.
7. **Authentication authority** — the **Admin Authentication suite is the single source of truth** for real login. Feature suites use `mockAdminSession` for isolation and must never re-assert login mechanics.
8. **Page Object rules** — one POM per screen; specs never touch raw selectors; POMs hold locators+actions+reusable assertions, no test-level orchestration; construct POM inside each test (parallel-safe).
9. **Locator hierarchy** — prefer (a) role + accessible name, (b) user-visible exact text, (c) placeholder/label, (d) app-provided `testID`, (e) **positional `.nth()` only as last resort** with a documented stable order.
10. **testID policy** — use existing app testIDs; **do not add production testIDs for tests** without explicit approval (a proven blocker). Note shared/overridden testIDs (`chart-loading`/`chart-empty`).
11. **`.nth()` policy** — permitted only when order is structurally fixed (e.g., section-ordered CSV buttons), must carry a comment naming the order source; never across dynamic lists.
12. **Fixture design** — extend Playwright `test`; per-`page` route installation; **closure-scoped** stub state (no module globals); typed fixtures with exact deterministic values.
13. **Route interception** — install specific routes *after* `mockAdminSession` so they win; a catch-all records unexpected; fail loud on anything unstubbed.
14. **Strict RPC tracking** — every authenticated test asserts `assertNoAnomalies()` (no unexpected/mis-shaped) and, where meaningful, `assertCalled([...])`.
15. **Request-shape validation** — POST + required params per RPC; extra params (`p_bucket`/`p_limit`) validated per contract; a pure `validateRpcShape` is unit-tested.
16. **Network isolation** — mock runs make **zero** `/auth/v1` and **zero** un-stubbed `/rest/v1` calls (guard `assertClean()`).
17. **Deterministic waiting** — wait on real signals (rendered element, captured request, response); **never fixed sleeps**.
18. **Polling** — use `expect.poll`/`toPass` for state that settles asynchronously (captured RPC params, hydration).
19. **Retry policy** — local `retries: 0` (flakes visible); CI `retries: 2` for L2/L3; L0/L1 never retried.
20. **Flaky-test policy** — see §7 (full policy).
21. **Test naming** — `"<behavior> <expected outcome>"`, lowercase, action-first, no ticket refs.
22. **Tagging** — controlled vocabulary §8.
23. **CSV/download testing** — assert **real download content** (headers, ordering, escaping, row count, formula-injection) via `readDownloadText`.
24. **Failure artifacts** — screenshot/video/trace/HTML+JSON reports auto-produced by config; no per-test wiring.
25. **Environment variables** — `BASE_URL`, `START_SERVER` (derived), `CI`, `E2E_ADMIN_*`, `QA_DASHBOARD_CONNECTED`; all resolved through `shared/env.ts`.
26. **Secrets handling** — creds only via env/`.env` (git-ignored); never committed; `.env.example` documents keys; framework never creates accounts.
27. **Reporting accuracy** — never label a suite "fully passing" while backend-gated tests are skipped; report skips by cause; distinguish flake vs failure.
28. **Release confirmation** — the pre-release gate §5C, incl. an optional connected confirmation §5D.
29. **Production-change approval rules** — no `src/`/`supabase/`/app-config change from a QA slice without explicit approval; testIDs included.

---

## 5. Shared-infrastructure proposal (file-level)

Four small primitive modules + one pure validator. All under `qa/playwright/support/`. **Prefer small
primitives over a universal framework.**

### 5.1 `support/rpc-interceptor.ts` (NEW) — resolves D1, D2, D3, D11
- **Public API:**
  - `createRpcInterceptor(page, opts): Promise<RpcTracker>` where
    `opts = { prefixRegex: RegExp; rpcs: readonly string[]; validate(req, rpc): string[]; respond(route, rpc): Promise<void> }`.
  - `type RpcTracker = { called: string[]; unexpected: string[]; badShape: string[]; assertNoAnomalies(): void; assertCalled(required): void; lastParamsFor(rpc): RpcParams | undefined; }`.
  - Re-exports `respondJson(route, rows, delayMs?)`, `abortRoute(route, delayMs?)`, `rpcNameFromUrl(url)`.
- **Responsibility:** the catch-all + per-RPC route registration + `called/unexpected/badShape` bookkeeping + param capture. Response payloads and shape rules are injected (stay per-suite).
- **Replaces:** the duplicated tracker plumbing/catch-all/`respond`/`respondError`/`rpcNameFromUrl` in both stub modules; `overviewFromSeen` becomes closure state.
- **Migration impact:** `analytics-stubs.ts` and `detailed-analytics-stubs.ts` are rewritten to *call* it, keeping their exported functions (`stubExecutiveAnalytics`, `installDetailedAnalyticsStubs`) and fixtures unchanged → **suites need no edits**.
- **Risks:** the abstraction must not leak per-suite specifics; mitigated by injecting `validate`/`respond`. **Justified:** yes (two proven consumers, identical plumbing).

### 5.2 `support/validate-rpc-shape.ts` (NEW, pure) — resolves D3
- **API:** `validateRpcShape(req: Request, rules: { requireParams: string[]; enums?: Record<string, readonly string[]>; numbers?: string[] }): string[]` → list of problems (empty = valid).
- **Responsibility:** pure request-shape checks (POST, required params, enum membership e.g. `p_bucket`, numeric e.g. `p_limit`). **Unit-testable without a browser** (accepts a minimal request-like shape).
- **Replaces:** inline validation in both stub modules. **Justified:** yes — enables L0 health-tests.

### 5.3 `support/connected-mode.ts` (NEW) — resolves D4, D5
- **API:** `isConnected(): boolean` (`QA_DASHBOARD_CONNECTED === '1'`), `hasAdminCreds(): boolean`, `connectedAdminLogin(page): Promise<void>` (uses `LoginPage`, hydration-gated).
- **Depends on:** `shared/env.ts` extended with `connected: boolean` + reuse `hasAdminCreds`.
- **Replaces:** duplicated `CONNECTED`/`hasCreds` constants and the connected-login flow in both specs.
- **Migration impact:** the two feature specs import these instead of local constants (~6 lines each). **Justified:** yes.

### 5.4 `support/rn-web.ts` (NEW) — resolves D6
- **API:** `hydratedFill(input: Locator, value: string): Promise<void>`, `waitForHydration(input: Locator): Promise<void>`.
- **Responsibility:** the RN-Web controlled-input hydration gate (probe-type-verify via `toPass`).
- **Replaces:** the copy in `DetailedAnalyticsPage.typeInto`; `LoginPage.fill/waitForReady` delegate. **Justified:** yes — one authority for a subtle correctness gate.

### 5.5 `support/download.ts` (NEW, tiny) — resolves D7
- **API:** `readDownloadText(download: Download): Promise<string>`.
- **Replaces:** `readDownload()` in the detailed spec. **Justified:** small but clearly reusable; promoted once (not speculative).

**Explicitly NOT built (would be over-general):** a universal mock/guard framework, a generic
"any-endpoint" interceptor, a shared assertion mega-utility. Custom matcher stays in `assertions.ts`.

---

## 6. QA framework health-test inventory (small, high-value)

**7 tests.** L0 = pure unit (Playwright test runner, no browser/server). L1 = Playwright browser meta-test.
L0 tests are cheap and fast; they carry most of the value. L1 tests prove the browser-level guarantees.

| # | Health-test | Layer | Purpose | Pri | Runtime | Failure signal | Value vs cost |
|---|---|---|---|---|---|---|---|
| H1 | `validateRpcShape` flags missing param / bad enum / non-number | **L0** | proves shape validation catches malformed RPCs | P0 | <10ms | validator returns [] for bad input | High / trivial |
| H2 | tracker `assertCalled` names a missing required RPC; `assertNoAnomalies` throws on unexpected/badShape | **L0** | proves the determinism assertions actually fail when they should | P0 | <20ms | asserts don't throw on bad state | High / low |
| H3 | two `createRpcInterceptor` installs yield independent trackers (state resets) | **L0** | guards R6/R7 cross-test leakage | P1 | <20ms | shared/leaked state | High / low |
| H4 | `isConnected()` is false without `QA_DASHBOARD_CONNECTED`; true with it (env toggled in-test) | **L0** | connected mode never activates implicitly (R11) | P0 | <10ms | mock suites silently hit backend | High / trivial |
| H5 | `mockAdminSession` reaches an authed admin screen **through the real guard**, and **without** the session the guard redirects to login (no bypass) | **L1** | proves the fixture authenticates via the normal route and does not bypass the guard | P0 | ~6–10s | fixture bypasses/greenwashes auth | High / medium |
| H6 | a planted stray `/auth/v1` (or un-stubbed `/rest/v1`) request makes `guard.assertClean()` throw | **L1** | proves network isolation is enforced, not decorative (R11) | P1 | ~5–8s | offline test silently depends on backend | High / medium |
| H7 | `readDownloadText` returns exact bytes incl. escaping (drive a tiny in-page blob download) | **L1** | proves the CSV/download helper preserves content/escaping | P2 | ~4–6s | corrupted/altered download content | Medium / low |

**Deferred/document-only (not built as tests):** "browser-scope tags behave" — validated by convention +
`--grep`, low automated value; CSV *formula-injection* correctness is already asserted in the Detailed
suite (test 21) against the real app `toCsv` output, so a duplicate meta-test is unnecessary.

Location: L0 → `playwright/tests/framework.spec.ts` (extend existing). L1 → new
`playwright/tests/infra-health.spec.ts` (Chromium-only). All tagged `@infra @meta`.

---

## 7. Flake-management policy

- **Definition.** A *flake* = a test that passes and fails on the identical commit with no code change.
  Classify each into: **application flake** (product race/bug — file a product issue, do **not** quarantine
  the test), **test flake** (missing wait/ordering — fix the test), **environment contention** (CPU/dev-server
  starvation under high parallelism — not a defect; see below).
- **Rerun acceptance.** A single automatic rerun is acceptable **only** for L2/L3 under CI `retries: 2`.
  Locally (`retries: 0`) a failure is investigated, never blindly re-run to green.
- **Blocks merge when:** an L0/L1 health-test fails; a Chromium feature test fails deterministically; any
  test fails twice on the same commit.
- **Quarantine.** Allowed only for a confirmed environment-contention flake in a *non-Chromium* project, via
  `test.fixme`/`@quarantine` tag, **only** with a linked tracking note in `qa/docs/FLAKES.md` (id, symptom,
  suspected cause, owner, date). **Max duration: 14 days**, then it must be fixed or the underlying issue
  escalated. No quarantine of Chromium feature tests or health-tests.
- **Ownership.** The slice author owns flakes they introduce; the QA-architecture owner (this slice's owner)
  owns shared-infra flakes.
- **Retry settings.** Keep `retries: CI ? 2 : 0`. Do not raise local retries to mask flakes.
- **Firefox/WebKit contention (R1) specifically.** Treat as **environment**, not defect: (a) the default
  merge gate is **Chromium-only**; (b) the multi-browser gate runs **advisory**, with `--workers=2` to cut
  dev-server contention and `retries` enabled; (c) a repeated *deterministic* cross-browser failure (not
  contention) is a real bug and blocks. This is captured as **Open Decision F**.

---

## 8. Tagging & naming standard (official vocabulary)

Syntax: Playwright first-class `{ tag: [...] }` (grep-selectable). **Minimal, orthogonal** — one value per
axis; avoid tag soup.

| Axis | Tags | Rule |
|---|---|---|
| Feature area | `@authentication`, `@executive-dashboard`, `@detailed-analytics`, `@infra` | exactly one |
| Role | `@admin` (later `@customer`/`@provider`) | one |
| Priority | `@p0`, `@p1`, `@p2` | exactly one |
| Suite membership | `@smoke`, `@regression` | `@smoke` ⊂ `@regression` where applicable |
| Isolation mode | `@mock` (default, implicit — omit) or `@connected` | tag only when connected-required |
| Browser scope | `@chromium-only` | only when the suite is pinned |
| Meta | `@meta` (health-tests), `@security` (security-relevant) | as applicable |

**Removed/avoided:** redundant `@e2e` (everything under `playwright/` is E2E), per-test bespoke tags.
**Naming:** `"<behavior> <expected outcome>"` — e.g. `"empty data renders zeros and \"No data\" charts
without broken values"`. No numbers, no ticket ids.

---

## 9. Merge & release gate design

Four gates. **Do not** require 4-serial + 2-parallel for ordinary feature merges — the audit shows the
Chromium feature suites are deterministic (Slice 42: 6/6 clean isolated runs); repeated cycles are
reserved for **infra changes** and **releases**.

### Gate A — Normal feature-branch merge (blocking)
- Commands: `qa: playwright test <changed-suite> --project=chromium` · `qa: tsc --noEmit` · root `jest` (if `src/` touched — usually not for QA slices).
- Browser scope: **Chromium-only**. Skips: connected/backend-gated tests skip (expected).
- Repeat cycles: **none** (single run). Artifacts: HTML+JSON report on failure.
- Reporting: pass/skip/fail with skip cause. Blocking.

### Gate B — QA infrastructure changes (blocking) — *this is the Slice-43 gate*
- Commands: full `qa` Chromium suite **×2 serial + ×1 parallel** (proportionate, not 4+2) · full L0/L1 health-tests · `qa: tsc` · **plus** the full app gate (root `jest`, `tsc`, `expo export web`, `expo export android`) because shared primitives touch every suite.
- Browser scope: Chromium for features; multi-browser **advisory** (`--workers=2`).
- Repeat cycles: 2 serial + 1 parallel (stability signal without excess cost).
- Artifacts: reports + a written stability summary. Blocking on any deterministic failure.

### Gate C — Pre-release validation (blocking)
- Commands: **full multi-browser** `qa: playwright test` (all projects, `--workers=2`, `retries` on) · full health-tests · root `jest` · root `tsc` · `expo export web` · `expo export android`.
- Browser scope: all 3. Skips: backend-gated auth + `@connected` skip unless Gate D is run.
- Repeat cycles: 1 full multi-browser + 1 Chromium re-run to confirm no deterministic regressions.
- Artifacts: full HTML report retained. Blocking; contention flakes handled per §7.

### Gate D — Connected-environment confirmation (advisory, pre-release recommended)
- Commands: `QA_DASHBOARD_CONNECTED=1 E2E_ADMIN_*=… qa: playwright test --project=chromium --grep @connected` + the auth backend tests.
- Browser scope: Chromium. Skips: none (creds required). Repeat: single run.
- Artifacts: report. **Advisory** — recommended before a production release; never blocks routine merges.

**Reporting format (all gates):** `X passed / Y skipped / Z failed`, skips itemized by cause
(chromium-only scoping vs backend-gated), plus explicit "not fully verified until connected" where Gate D
was not run.

---

## 10. Script & command proposal (specify only — do not implement)

Proposed `qa/package.json` scripts (names fit the existing `test:*` style; keep current ones):

| Script | Command | Purpose |
|---|---|---|
| `qa:test:chromium` | `playwright test --project=chromium` | default feature validation (alias of existing `test:e2e:chromium`) |
| `qa:test:all-browsers` | `playwright test --workers=2` | multi-browser advisory (lower concurrency for R1) |
| `qa:test:connected` | `cross-env QA_DASHBOARD_CONNECTED=1 playwright test --project=chromium --grep @connected` | Gate D |
| `qa:test:stability` | shell loop: 2× serial (`--workers=1`) + 1× parallel, Chromium | Gate B stability cycle |
| `qa:typecheck` | `tsc --noEmit` (alias of existing `typecheck`) | QA TS check |
| `qa:health` | `playwright test playwright/tests --project=chromium` | run framework + infra-health meta-tests |
| `qa:report` | `playwright show-report reports/html` (alias `report`) | open artifacts |

Notes: `qa:test:stability` needs a tiny cross-platform runner (Node script or npm-run-all), because a raw
`for` loop is shell-specific (the environment is PowerShell-primary + Bash). A **root** aggregate
(`qa:release`) that chains the qa suite + root jest/tsc/expo exports is **Open Decision C** — root scripts
are outside `qa/` and touch the app package. `cross-env` is not currently a dependency (Open Decision C).

---

## 11. Migration plan (staged; no big rewrite; rollback points)

Each stage is independently committable and revertable (rollback = revert that commit; no cross-stage
coupling).

1. **Docs** — add `qa/docs/ARCHITECTURE.md` (+ `FLAKES.md` stub); link from README. *No code.* ← rollback point.
2. **Primitives (behavior-preserving)** — add `rpc-interceptor.ts`, `validate-rpc-shape.ts`,
   `connected-mode.ts`, `rn-web.ts`, `download.ts`. **Do not** change suites yet; new files, zero call-sites. Run `qa:typecheck`. ← rollback point.
3. **Rewire stub modules** — `analytics-stubs.ts` + `detailed-analytics-stubs.ts` delegate to the interceptor/validator; **exports unchanged**. Run Chromium exec+detailed suites (must stay 15/15, 22/22). ← rollback point.
4. **Rewire specs (small)** — feature specs use `connected-mode.ts`; detailed POM + LoginPage use `rn-web.ts`; detailed spec uses `download.ts`. Re-run Chromium suites. ← rollback point.
5. **Health tests** — add H1–H4 to `framework.spec.ts`, H5–H7 in `infra-health.spec.ts`. Run `qa:health`. ← rollback point.
6. **Scripts** — add proposed `qa:*` scripts (+ stability runner). ← rollback point.
7. **Validate (Gate B)** — 2 serial + 1 parallel Chromium + health + full app gate; write stability summary.

Ordering guarantees suites never break: primitives land unused (2) → stub internals swap behind stable
exports (3) → specs adopt helpers (4). Any stage can stop/rollback with the platform still green.

---

## 12. Test-count & change estimate

- **Health tests:** **7** (H1–H4 L0, H5–H7 L1).
- **Files changed:** ~**14** — new: 5 primitives + `ARCHITECTURE.md` + `FLAKES.md` + `infra-health.spec.ts` (8); modified: `analytics-stubs.ts`, `detailed-analytics-stubs.ts`, `executive-dashboard.spec.ts`, `detailed-analytics.spec.ts`, `detailed-analytics.page.ts`, `login.page.ts`, `framework.spec.ts`, `package.json`, `README.md` (~9, some small).
- **Lines:** **+900 / −250** (docs dominate additions; consolidation removes duplicated plumbing).
- **Runtime impact:** L0 health-tests negligible (<0.1s); L1 add ~20–30s to a Chromium run; **no change** to feature-suite runtime. Default merge gate becomes *faster* (Chromium-only, no forced repeat cycles).
- **Risk level:** **Low–Medium.** Behavior-preserving consolidation behind stable exports; staged with rollback points; the only medium risk is the interceptor refactor (D2), covered by re-running both feature suites at stage 3.

---

## 13. Explicit non-goals (Slice 43 will NOT add)

New Admin **feature** tests · Customer tests · Provider tests · Maestro flows · any production application
behavior · database seeding · broad/generic mocking framework · CI-provider-specific configuration (none
exists today and none is required) · refactors done purely for aesthetics. No change to `src/`,
`supabase/`, or app configuration.

---

## 14. Blockers & limitations

- **B1 (environment).** The connected gate (D) and the auth backend tests remain **unexecutable in this
  sandbox** (Supabase `…supabase.co` → HTTP 000; no `E2E_ADMIN_*`). Health-tests H1–H7 are all offline and
  do run. Connected confirmation stays a documented pre-release recommendation.
- **B2 (R1 contention).** Multi-browser full-suite flakiness is environmental (shared dev server + high
  worker count on one machine); the gate policy routes around it (Chromium default, advisory multi-browser
  at `--workers=2`). It is *not* fully "solved," only made non-blocking and characterized — see Open Decision F.
- **B3 (R12 drift).** qa fixtures hand-mirror app RPC types; without importing app types, a silent contract
  drift is possible. A type-level guard is proposed but is **Open Decision E** (it would import `src/` types
  into `qa/`, a boundary change).

---

## 15. Open decisions requiring approval

- **A. Consolidate the two strict analytics trackers?** Recommend **yes**, as a *core primitive*
  (`rpc-interceptor.ts`) that both stub modules call, keeping fixtures/RPC-sets/shape-rules per-suite
  (D1–D3). Alternative: document-only and leave both copies.
- **B. Health-tests in Playwright vs a lower-level runner?** Recommend **hybrid**: L0 pure-unit tests run
  under the Playwright test runner (no browser) alongside `framework.spec.ts` — no new runner/dependency;
  L1 browser meta-tests in `infra-health.spec.ts`. Alternative: add Jest/Vitest to `qa/` (new dependency —
  not recommended).
- **C. Add shared scripts (and `cross-env`)?** Recommend **yes** for the `qa:*` scripts + a small Node
  stability runner; decide whether a **root** `qa:release` aggregate is in-scope (touches the app
  `package.json`) and whether to add `cross-env` (or encode env inline per-OS).
- **D. Sustainable stability-run frequency.** Recommend: **none** for normal feature merges (Gate A single
  run); **2 serial + 1 parallel** for infra changes (Gate B); **full multi-browser + Chromium re-run** for
  releases (Gate C). Confirm this replaces the ad-hoc "4 serial + 2 parallel every time."
- **E. Multi-browser gate policy** (and R12 drift guard). Confirm multi-browser is **advisory at
  `--workers=2`**, blocking only on deterministic (non-contention) failures. Separately, approve/decline the
  optional type-level fixture-drift guard (imports `src/` analytics types into `qa/`).
- **F. Does R1 (Firefox/WebKit contention) warrant a dedicated follow-up slice?** Options: (i) accept the
  advisory-gate policy as sufficient; (ii) open a small follow-up to tune workers/sharding or run browsers
  against separate served builds. Recommend **(i)** now, revisit if it recurs under the new policy.

---

## 16. Deliverables of the eventual implementation (for reference, not this slice)

`qa/docs/ARCHITECTURE.md`, `qa/docs/FLAKES.md`; `qa/playwright/support/{rpc-interceptor,validate-rpc-shape,
connected-mode,rn-web,download}.ts`; `qa/playwright/tests/infra-health.spec.ts` (+ H1–H4 in
`framework.spec.ts`); behavior-preserving edits to the two stub modules, two feature specs, the detailed
POM, and `login.page.ts`; new `qa:*` scripts; `shared/env.ts` gains `connected`. No production changes.
