# QuickServe QA Automation — Architecture & Policy Guide

The official architecture and policy authority for the `qa/` workspace. The
[README](../README.md) is the *how-to* (setup, running, adding tests); this
document is the *why* and the *rules*. Established in QA Slice 43.

---

## 1. Goals & non-goals

**Goals:** deterministic, offline-first, fast end-to-end coverage of the admin-web
surface; a small set of reusable primitives; honest reporting.
**Non-goals:** a universal test framework, application-feature seeding, broad
generic mocking, or coverage of customer/provider/native flows (reserved).

## 2. Directory structure

```
qa/
  shared/            runner-agnostic utilities (env, logger, data-factory)
  playwright/
    admin/           admin feature suites (*.spec.ts)
    customer/ …      reserved (empty)
    provider/ …      reserved (empty)
    pages/           Page Objects (base + per-screen)
    support/         primitives (session, interceptor, validators, helpers)
    fixtures/        extended Playwright test/expect
    tests/           meta/health + smoke
  docs/              ARCHITECTURE.md (this), FLAKES.md
  maestro/           reserved for native flows
```

## 3. Test-layer model

- **L0 — unit:** pure primitives, no browser/server (run under the Playwright runner). Cheapest; most health value.
- **L1 — infra/meta:** browser-level checks of the framework itself (`tests/infra-health.spec.ts`).
- **L2 — feature E2E (mock):** the default — offline, deterministic, via `mockAdminSession` + RPC stubs.
- **L3 — connected confirmation:** opt-in, real backend (`QA_DASHBOARD_CONNECTED=1` + `E2E_ADMIN_*`).

## 4. Suite classification

Reference suite (**Admin Authentication** — the login authority), isolated feature
suites (**Executive Dashboard**, **Detailed Analytics**), and meta/smoke.

## 5. Browser-scope policy

Admin-web feature suites are **Chromium-only** (`@chromium-only` tag +
`test.skip(project!=='chromium')` guard). Cross-browser signal comes from **smoke +
the auth render/validation tests**. Rationale: admin is a desktop web surface; full
3-browser feature runs add CPU contention (see §20 / FLAKES.md) without
proportional signal.

## 6. Mock-vs-connected policy

Default **mock** (fully offline, deterministic). **Connected** is opt-in
confirmation, never a routine merge gate. A suite MUST be green offline.

## 7. Authentication authority

The **Admin Authentication suite is the single source of truth** for real login.
Feature suites use `mockAdminSession` for isolation and never re-assert login
mechanics.

## 8. Page Object rules

One POM per screen; specs never touch raw selectors; POMs hold
locators + actions + reusable assertions; construct the POM inside each test
(parallel-safe).

## 9. Locator hierarchy (most → least preferred)

1. role + accessible name · 2. user-visible exact text · 3. placeholder / label ·
4. app-provided `testID` · 5. positional `.nth()` (last resort, §11).

## 10. testID policy

Use existing app testIDs. **Do not add production testIDs for tests** without
explicit approval (a proven blocker). Note shared/overridden testIDs
(`chart-loading`, `chart-empty`).

## 11. `.nth()` policy

Permitted only when order is structurally fixed (e.g. section-ordered "Download
CSV" buttons); must carry a comment naming the order source; never across dynamic
lists.

## 12. Fixture design

Extend Playwright `test`; install routes per `page`; keep stub state
**closure-scoped** (no module globals); typed fixtures with exact deterministic
values. **Feature fixtures stay independent** — do not merge datasets across
suites.

## 13. Route interception

Install specific routes *after* `mockAdminSession` so they win; a catch-all records
unexpected RPCs; fail loud on anything unstubbed.

## 14. Strict RPC tracking

Every authenticated feature test asserts `assertNoAnomalies()` and, where
meaningful, `assertCalled([...])`. Backed by the shared `rpc-interceptor.ts`.

## 15. Request-shape validation

POST + required params per RPC; extra params (`p_bucket`, `p_limit`) validated per
contract via the pure `validate-rpc-shape.ts` (unit-tested by H1).

## 16. Network isolation

Mock runs make **zero** `/auth/v1` and **zero** un-stubbed `/rest/v1` calls; the
`mockAdminSession` guard `assertClean()` enforces it (H6).

## 17. Deterministic waiting

Wait on real signals (rendered element, captured request, response). **Never fixed
sleeps.** (Stub response *delays* for loading tests are not test-level sleeps.)

## 18. Polling

Use `expect.poll` / `toPass` for asynchronously-settling state (captured RPC params,
RN-Web hydration).

## 19. Retry policy

Local `retries: 0` (flakes visible). CI `retries: 2` for L2/L3. L0/L1 never retried.

## 20. Flaky-test policy

See [FLAKES.md](./FLAKES.md). Summary: classify as application / test /
environment-contention; Firefox/WebKit contention is environmental and handled by
the browser-scope policy + advisory multi-browser gate, not by quarantining
Chromium tests.

## 21. Test naming

`"<behavior> <expected outcome>"`, lowercase, action-first, no ticket ids/numbers.

## 22. Tagging

Controlled vocabulary (one value per axis; avoid tag soup):

| Axis | Tags |
|---|---|
| Feature area | `@authentication` `@executive-dashboard` `@detailed-analytics` `@infra` |
| Role | `@admin` (later `@customer`/`@provider`) |
| Priority | `@p0` `@p1` `@p2` |
| Suite | `@smoke` `@regression` |
| Isolation | `@connected` (mock is default/implicit) |
| Browser scope | `@chromium-only` |
| Meta | `@meta` `@security` |

## 23. CSV / download testing

Assert **real download content** (headers, ordering, escaping, row count,
formula-injection) via `readDownloadText` (`support/download.ts`).

## 24. Failure artifacts

Screenshot / video / trace / HTML+JSON reports are produced automatically by
`playwright.config.ts` — no per-test wiring.

## 25. Environment variables

Resolved through `shared/env.ts`: `BASE_URL`, `START_SERVER` (derived), `CI`,
`E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `QA_DASHBOARD_CONNECTED`.

## 26. Secrets handling

Credentials only via env / `.env` (git-ignored); never committed; `.env.example`
documents keys; the framework never creates accounts.

## 27. Reporting accuracy

Never label a suite "fully passing" while backend-gated tests are skipped. Report
skips **by cause** (Chromium-only scoping vs backend-gated). Distinguish flake from
failure.

## 28. Release confirmation

The pre-release gate (§30-C) plus an optional connected confirmation (§30-D).

## 29. Production-change approval rules

No change to `src/`, `supabase/`, or app configuration from a QA slice without
explicit approval — production testIDs included.

---

## 30. Merge & release gates

Proportionate gates (the blanket "4 serial + 2 parallel every change" is retired):

- **A — Feature-branch merge (blocking):** Chromium single run of the changed suite + `qa:typecheck`. Skips: connected/backend-gated. No repeat cycles.
- **B — QA infrastructure change (blocking):** `qa:test:stability` (2 serial + 1 parallel Chromium) + `qa:health` + full app gate (root `jest`, `tsc`, `expo export web`, `expo export android`). Multi-browser advisory.
- **C — Pre-release (blocking):** `qa:test:all-browsers` (`--workers=2`) + `qa:health` + full app gate + a Chromium re-run.
- **D — Connected confirmation (advisory):** `qa:test:connected` with `QA_DASHBOARD_CONNECTED=1` + `E2E_ADMIN_*`. Recommended before a production release; never blocks routine merges.

Reporting for all gates: `X passed / Y skipped / Z failed`, skips itemized by cause,
plus an explicit "not fully verified until connected" when Gate D was not run.

---

## 31. The two-consumer rule (extraction principle)

**Only extract a shared helper once it has at least two real consumers.** Surface
similarity is not sufficient justification; a single-use "helper" is premature
abstraction. When a second genuine consumer appears, promote the duplicated logic
into a small, focused primitive under `support/` — never a universal framework.
Feature fixtures and RPC datasets stay independent even when they look alike.

The Slice-43 primitives each satisfy this rule: `rpc-interceptor.ts` and
`validate-rpc-shape.ts` (Executive + Detailed stubs), `connected-mode.ts` and
`rn-web.ts` (both feature specs / both typing POMs), `download.ts` (Detailed spec +
the H7 health-test).
