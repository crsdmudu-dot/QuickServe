# Slice 39 — QA Automation Framework (Playwright) — Design Spec

**Date:** 2026-07-24
**Status:** Approved (fixed requirements applied 2026-07-24)
**Slice goal:** Build a long-term, production-quality **QA automation framework** for QuickServe — the permanent foundation every future automated-QA slice builds on. This slice delivers **infrastructure only**; it does **not** automate any application feature.

---

## 1. Overview & Guiding Principle

QuickServe (Expo React Native; Admin Web served by `expo start --web`) has strong manual QA coverage (Slices' pilot docs + the manual QA guide) but **no automated end-to-end testing**. Slice 39 creates a professional Playwright framework so future slices can add automated tests without re-solving configuration, authentication, reporting, or architecture.

**Definitive principle:** build the **framework**, not the tests. The deliverable is a maintainable-for-years automation platform that will eventually hold **hundreds** of tests across admin/customer/provider surfaces and multiple tools. The only tests written this slice are the minimum needed to **prove the framework works** (a framework self-test and an infrastructure smoke test).

The framework treats the QuickServe app as a **black box over HTTP** — it never imports app source, never touches the database or Supabase, and never changes application behaviour.

---

## 2. Architecture & Isolation

### 2.1 Isolated `qa/` workspace
A standalone QA workspace lives at **`qa/`** with its **own** dependency tree and configuration, fully independent of the app:

- `qa/package.json` — its own `@playwright/test` devDependency + scripts; **its own `node_modules`** (Playwright deps never mix with the RN/Expo/Jest tree).
- `qa/tsconfig.json` — standalone TypeScript config (node + `@playwright/test` types), not extending the app's Expo tsconfig.
- `qa/playwright.config.ts` — the Playwright configuration.
- `qa/.env.example` — documented environment keys (no secrets).
- `qa/README.md` — the long-term documentation.

The QuickServe application remains **completely independent**: the framework imports nothing from `src/`, and running the app's own gate is unaffected.

### 2.2 The only files touched outside `qa/` (additive, precedented)
An in-repo sub-package requires exactly **two one-line additive exclusions** so the app's existing gate stays green — mirroring how the repo **already** excludes its `apps/website` sub-project:

- **`jest.config.js`** — add `'/qa/'` to `testPathIgnorePatterns` (already contains `'/apps/website/'`). Without this, `jest-expo`'s default pattern would try to run the Playwright `.spec.ts` files and fail.
- **`tsconfig.json`** — add `"qa"` to `exclude` (already contains `"apps/website"`). Without this, the root `tsc --noEmit` would type-check `qa/` and fail on `@playwright/test` imports it cannot resolve.

These are **test/build-config exclusions only**. They are **additive**, change **no application behaviour**, and touch no app source, DB, Supabase, or functionality. No other file outside `qa/` is modified.

### 2.3 Multi-tool, future-proof workspace
`qa/` is designed as a **general automation platform**, not a Playwright-only project, so future tools (especially **Maestro** for Android/iOS) slot in without repository restructuring. This slice creates a **`qa/maestro/` placeholder** (empty, with a `.gitkeep` and a short README note) alongside `qa/playwright/`.

---

## 3. Folder Structure

The layout is **tool-agnostic at the top** (so future tools like Maestro slot in as siblings) and **tool-specific inside** each tool's folder:

```
qa/
  package.json            # @playwright/test; scripts: test:e2e, test:e2e:headed, report, install-browsers
  playwright.config.ts    # projects, reporters, trace/video/screenshot, webServer, global setup/teardown
  tsconfig.json           # standalone (node + @playwright/test types)
  .env.example            # BASE_URL, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD (documented, no secrets)
  .gitignore              # ignores node_modules, .auth/, reports/, screenshots/, videos/, test-results/, .env
  README.md               # the maintained-for-years documentation
  .auth/                  # storageState (git-ignored; created at runtime)

  shared/                 # CROSS-TOOL, tool-agnostic code (reused by Playwright now, Maestro later)
    env.ts                # typed environment loader (BASE_URL, admin creds, CI)
    logger.ts             # leveled, timestamped logger
    data-factory.ts       # deterministic (seeded) data-value generators — no DB, no network

  playwright/             # Playwright-SPECIFIC
    admin/                # FUTURE admin tests — empty placeholder (.gitkeep)
    customer/             # FUTURE customer tests — empty placeholder (.gitkeep)
    provider/             # FUTURE provider tests — empty placeholder (.gitkeep)
    pages/                # base.page.ts + admin/login.page.ts (POM foundation/example)
    fixtures/             # index.ts — extended `test` / `expect` with custom fixtures
    support/              # auth.ts, assertions.ts, global-setup.ts, global-teardown.ts
    tests/                # framework.spec.ts, smoke.spec.ts (this slice's proof tests)

  maestro/                # FUTURE mobile (Android/iOS) automation — empty placeholder (.gitkeep + note)

  reports/                # HTML/JSON reports (git-ignored artifacts, cross-tool)
  screenshots/            # failure screenshots (git-ignored artifacts, cross-tool)
  videos/                 # failure videos (git-ignored artifacts, cross-tool)
```

- **Cross-tool code:** `qa/shared/` holds tool-agnostic utilities (env, logger, data-factory) that both Playwright (now) and Maestro (later) can reuse — this is why they sit above `playwright/`, not inside it.
- **Tool-specific code:** everything Playwright-coupled (pages, fixtures, custom assertions, auth, global setup/teardown, and the spec files) lives under `qa/playwright/`.
- **Artifact / secret** folders (`reports/`, `screenshots/`, `videos/`, `.auth/`, `test-results/`): created at runtime and **git-ignored**; kept at the `qa/` level so they're shared across tools.
- Placeholder folders (`playwright/{admin,customer,provider}`, `maestro/`) ship with a `.gitkeep` so the structure is committed and visible.

---

## 4. Framework Components (each a small, single-purpose unit)

Every required deliverable maps to a focused file:

- **Playwright configuration** (`qa/playwright.config.ts`): three browser **projects** — Chromium (primary), Firefox, WebKit; **retries** (2 on CI, 0 locally); **reporters** HTML + list + JSON; `use`: `baseURL`, **trace** `on-first-retry`, **screenshot** `only-on-failure`, **video** `retain-on-failure`; `outputDir` under `qa/`; sensible test/expect timeouts; **webServer** (see §6); `globalSetup`/`globalTeardown`.
- **Standalone TypeScript config** (`qa/tsconfig.json`): strict, node module resolution, `@playwright/test` types; scoped to `qa/`.
- **Environment loader** (`qa/shared/env.ts`): typed, validated access to `BASE_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `CI` via `dotenv` reading `qa/.env`. Missing optional values degrade gracefully (documented), never throw at import. (Cross-tool → `shared/`.)
- **Logger** (`qa/shared/logger.ts`): leveled (debug/info/warn/error), timestamped, test-context-aware; used across setup/teardown/fixtures. (Cross-tool → `shared/`.)
- **Deterministic data factory** (`qa/shared/data-factory.ts`): **pure**, **seeded** generators producing data *values* (fake emails, names, ids, booking-shaped objects). Deterministic given a seed for reproducible tests. **No DB seeding, no network** — it generates values only. (Cross-tool → `shared/`.)
- **Global setup** (`qa/playwright/support/global-setup.ts`): **guarded** authentication — if admin creds are present, log in **once** and save `qa/.auth/admin.json` (storageState); if absent, **skip** and log a clear notice so the framework still runs unauthenticated (public smoke) in CI without secrets. Also logs run metadata (base URL, browsers).
- **Global teardown** (`qa/playwright/support/global-teardown.ts`): run summary + any cleanup (e.g. transient artifacts). No DB/network side effects.
- **Authentication helpers** (`qa/playwright/support/auth.ts`): `loginAsAdmin(page)` (drives the admin login form) and `saveAdminStorageState()`; reused by global-setup and the `adminPage` fixture. Admin account **must pre-exist** (no account creation).
- **Reusable custom assertions** (`qa/playwright/support/assertions.ts`): Playwright `expect` extensions (e.g. `toBeOnPath`, `toHaveLoadedWithoutConsoleErrors`) — generic and reusable, **not** feature-specific. (Playwright-coupled → `playwright/support/`.)
- **Page Object Model foundation** (`qa/playwright/pages/base.page.ts`): `BasePage` with `page`, `goto(path)`, `waitForReady()`, and common helpers. **Example** page object `qa/playwright/pages/admin/login.page.ts` (`LoginPage`) demonstrates the pattern — it is the POM foundation, **not** a feature test.
- **Fixtures** (`qa/playwright/fixtures/index.ts`): extends Playwright's `test` with `adminPage` (storageState-backed page), `logger`, and `testData`; re-exports `expect`. This extended `test`/`expect` is what future tests import.
- **Documentation** (`qa/README.md`): install, run, env keys, folder map, how to add a Page Object / a test / a fixture, conventions for scaling to hundreds of tests, and the Maestro-placeholder note.

---

## 5. Smoke Validation (proving the framework works — no feature automation)

Two things run in the gate to prove the pipeline end-to-end, **without any business assertion**:

1. **Framework self-tests** (`qa/playwright/tests/framework.spec.ts`): in-process tests of the framework's own building blocks — the deterministic data factory (same seed → same output; different seed → different), the custom assertions, the env loader, and the logger. **No app, no browser navigation to a feature.**
2. **Infrastructure smoke test** (`qa/playwright/tests/smoke.spec.ts`): navigates to the **Admin login URL** and asserts **infrastructure health only** — the page responds and the document/login form renders. It intentionally **triggers the reporting/artifact pipeline** (and the design includes a demonstration that a deliberately-failing check would produce a screenshot/video/trace, kept skipped or annotated so the suite stays green).

The smoke test proves, in order: **browser launches → web server starts → Admin login page loads → Playwright reporters work → screenshots/videos/traces are produced.** It asserts **nothing** about bookings, wallet, analytics, notifications, or any customer/provider/admin business flow.

**Explicitly out of scope this slice:** booking tests, wallet tests, analytics tests, notification tests, any customer/provider/admin feature flow. Those are future slices built **on** this framework.

---

## 6. Web Server (app under test)

Playwright's **`webServer`** manages the Admin Web app:

- **If `BASE_URL` is set** → use it directly (`use.baseURL = BASE_URL`); do not start a server (point at an already-running or deployed instance).
- **Otherwise** → automatically start the Admin Web app by running the parent repo's `expo start --web` (webServer `command` run with `cwd` = repo root), wait for `http://localhost:8081`, and use that as `baseURL`. `reuseExistingServer` is enabled locally so re-runs attach to an already-running dev server.

This makes the framework **self-contained** (it can start the app itself) yet **flexible** (override to any environment via `BASE_URL`).

---

## 7. Security

- **No secrets committed.** Real values live only in `qa/.env` (git-ignored). `qa/.env.example` documents the keys (`BASE_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`) with placeholder values.
- **Auth state** is saved under `qa/.auth/` (git-ignored) — never committed.
- **No account creation**: the admin test account must already exist (reuse the QA admin from manual testing).
- **No production `.env`, no Supabase, no database** is read or written. The framework only performs HTTP interactions with the running Admin Web UI, exactly as a real browser would.
- `qa/.gitignore` ignores `node_modules`, `.auth/`, `reports/`, `screenshots/`, `videos/`, `test-results/`, and any `.env` (keeping `.env.example`).

---

## 8. Guardrails

- **No production code / app functionality / UI behaviour change.** The framework imports nothing from `src/`.
- **No database schema, no Supabase, no business-logic change.**
- The **only** files modified outside `qa/` are the two **additive** exclusions in `jest.config.js` and `tsconfig.json` (§2.2), which change no application behaviour.
- **No feature automation** — infrastructure + self-tests only.
- The app's **existing gate** (`npm test` / `tsc --noEmit` / `expo export`) must remain green (trivially — app source untouched) and is re-verified.
- No new app dependency; all new dependencies are confined to `qa/package.json`.

---

## 9. Testing & Validation Strategy

- **Framework self-tests** (§5.1) run via `npx playwright test` in-process — fast, no browser navigation to features.
- **Infrastructure smoke test** (§5.2) runs headless (Chromium primary) against the auto-started `expo start --web`, producing the HTML report + trace/video/screenshot artifacts.
- **Per-task gate (the "full" gate chosen):** `qa` type-check (`npx tsc --noEmit` in `qa/`), lint where applicable, `npx playwright install chromium`, and `npx playwright test` (the self-tests + smoke, headless) — proving browser launch + artifact generation. The **app gate stays green** (`npm test` / root `tsc --noEmit` unaffected by the two additive exclusions).
- **Honesty rule:** if the live web run is blocked by the environment (e.g. the Expo web server cannot start in CI), the implementer **reports it explicitly** rather than reporting a false pass; the framework's correctness is still evidenced by `npx playwright test --list` + the self-tests + the config.

---

## 10. Task Breakdown (7 review-gated tasks)

1. **Scaffold `qa/` workspace** — `package.json`, standalone `tsconfig.json`, `.gitignore`, `.env.example`, the full folder tree (with `.gitkeep`s incl. `maestro/`), install `@playwright/test` + Chromium, a **minimal** `playwright.config.ts`, and a trivial passing **framework self-test** — plus the two additive root exclusions (`jest.config.js`, `tsconfig.json`) — proving `npx playwright test` runs.
2. **Full Playwright configuration** — 3 browser projects, retries, HTML/list/JSON reporters, trace/video/screenshot, `outputDir`, timeouts, and the **webServer** (`expo start --web` + `BASE_URL` override).
3. **Utilities** — `env` loader, `logger`, deterministic `data-factory`, reusable custom `assertions` (+ their framework self-tests).
4. **Auth + global setup/teardown** — `auth.ts`, guarded `global-setup.ts` (storageState), `global-teardown.ts`.
5. **POM foundation + fixtures** — `BasePage`, `LoginPage` (example), extended `test`/`expect` with `adminPage`/`logger`/`testData` fixtures.
6. **Infrastructure smoke test + documentation** — `smoke.spec.ts` (login page loads, artifacts produced), `qa/README.md`, and the placeholder scaffolding (admin/customer/provider/maestro `.gitkeep`s + notes).
7. **Verification** — verification doc (isolation proof, guardrail/greps, artifact-pipeline evidence), final full headless run (Chromium; optionally Firefox/WebKit), app-gate re-check, independent whole-branch review; pause before merge.

---

## 11. Review Checkpoints

- **Per task:** two-stage review (spec compliance + code quality). Guardrail greps each task: nothing outside `qa/` changed except the two additive exclusions; no import from `src/`; no DB/Supabase/secret; no feature assertion.
- **Backend/isolation checkpoint (after T1):** confirm the two root edits are additive and precedented; the app gate is green; `qa/` is a standalone package.
- **Framework checkpoint (after T6):** confirm the smoke test proves browser+server+reporters+artifacts, contains no business assertion, and the docs let a newcomer add a test.
- **Final:** independent whole-branch review (architecture, isolation, security, guardrails, maintainability, docs, the "no feature automation" boundary). Fix only Critical/Important. Pause before merge.

---

## 12. Explicit Non-Goals

- No automation of any application feature (no booking/wallet/analytics/notification/customer/provider/admin flow tests).
- No production code / DB / schema / Supabase / UI-behaviour change.
- No app dependency additions (all deps confined to `qa/`).
- No Maestro implementation this slice (placeholder folder only).
- No account creation / data seeding (admin account pre-exists; factory generates values only).
- No CI pipeline wiring this slice (the framework is CI-ready; wiring is a future slice).
