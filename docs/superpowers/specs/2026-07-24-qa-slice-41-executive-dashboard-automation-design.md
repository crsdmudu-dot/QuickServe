# QA Slice 41 — Admin Executive Dashboard Automation — Spec

**Date:** 2026-07-24
**Status:** Draft for approval — **spec only, no tests written**
**Scope:** the automated Playwright suite for **only** the Admin Executive Dashboard (`(admin-web)/analytics` index). Follows the reference conventions established by the Admin Authentication suite.

---

## 1. What is under test

The Executive Dashboard (`src/app/(admin-web)/analytics/index.tsx`, Slice 38): the admin analytics landing. Observed, testable surface:

- **7 sections** (`MetricSection` titles): `Platform Health`, `Activity (selected period)`, `Operational`, `Growth`, `Service analytics`, `Provider analytics`, `Geographic analytics`.
- **~26 KPI cards** (`ExecutiveKpiCard`, each a unique `label` + value + a "Current"/"Selected period" tag): Current Wallet Balance, Current Active Customers, Current Active Providers, Current Platform Rating, Active Disputes, Open Support Tickets, Pending Jobs, In-Progress Jobs, Total/Active/Completed/Cancelled Bookings, Total Revenue, Platform Commission, Average Booking Value, Repeat Customer Rate, New Customers, New Providers, Avg Response Time, Avg Completion Time, Failed Payments, Notifications Sent, Period Avg Rating.
- **Filter bar** — 6 presets: `Today`, `Last 7 days`, `Last 30 days`, `Last 90 days`, `This year`, `Custom` (default **Last 30 days**).
- **Header controls** — `Last updated <time>` / `Last updated —`, a `Refresh` button, a disabled **ExportMenu** (CSV/Excel/PDF, `testID` `export-csv|excel|pdf`), and a `View detailed analytics` drill-down button.
- **Growth deltas** — `GrowthDeltaBadge` (▲ / ▼ / – %) on New Customers, New Providers, Revenue, Bookings.
- **Loading** — per-KPI skeletons (`ExecutiveKpiCard loading` → `testID="kpi-skeleton"`); 9 independent section loading flags (no page-level gate); chart `testID`s (e.g. `chart-customer-growth`, `chart-revenue-ts`).
- **Per-section error rows** — exact copy: `Could not load platform health data.`, `Could not load activity data.`, `Could not load operational data.`, `Could not load notification delivery data.`, each with a `Retry` button.

**Data source:** Supabase RPCs — `analytics_executive_overview`, `analytics_service_categories`, `analytics_growth_timeseries`, `analytics_notification_delivery` (from `executive-analytics.ts`) plus reused `analytics_bookings_timeseries`, `analytics_financial_timeseries`, `analytics_providers`, `analytics_services`, `analytics_geography`. All are `POST <supabase>/rest/v1/rpc/<name>`.

**Access:** admin-only. `(admin-web)/_layout` → `useAdminGuard` → `useAuth().role === 'admin'`. No session → **redirect to `/(admin-web)/login`**; session but non-admin → "Not authorized"; admin → the dashboard shell.

---

## 2. The central architectural decision — determinism without seeding

Two independent needs:

- **Reaching the page** requires an **admin session** (the guard checks `role === 'admin'`).
- **Deterministic data/states** for assertions.

**Data is solved without seeding via Playwright `page.route` RPC stubbing.** We intercept `**/rest/v1/rpc/analytics_*` and return fixed fixtures — giving exact, deterministic values and letting us force **loading** (delayed fulfill), **error** (fulfill 500 / abort), **empty** (zeros/empty arrays), and **populated** states on demand. **No database seeding is required** (this respects "do not create broad seeding infrastructure").

**Reaching the page has two possible approaches — a decision for you:**

| Approach | How the admin session is obtained | Offline? | Infra cost | Recommendation |
|---|---|---|---|---|
| **A. Connected-env auth (recommended now)** | Real admin login (reuse `LoginPage`, or the `adminPage` storageState fixture once `global-setup` runs with `E2E_ADMIN_*`). RPCs are still stubbed for determinism. | **No** — needs creds + reachable Supabase for the *session only* | ~zero (reuses the auth suite) | **Yes, now** — consistent with the approved auth-suite gating. |
| **B. Fully-offline mock session** | A small `mockAdminSession` fixture: inject a Supabase session into `localStorage` (`addInitScript`) + stub the auth/profile-role network so `role='admin'`, then stub the analytics RPCs. | **Yes** — no backend, no creds | Low-but-nonzero, well-bounded (one fixture) | **Flag for your decision.** High value (fully-offline, deterministic admin UI tests) but is new infra bordering on what you asked me not to build broadly. **Not building it in this slice unless you approve.** |

This spec is written for **Approach A** (gated like the auth backend tests), and lists which tests would additionally run offline **if** you later approve Approach B. Either way, **RPC stubbing removes the DB-seeding dependency entirely.**

---

## 3. Page Objects required

- **`ExecutiveDashboardPage`** (new, `qa/playwright/pages/admin/executive-dashboard.page.ts`) extending `BasePage`:
  - `path = '/(admin-web)/analytics'`.
  - Locators: `section(title)`, `kpiCard(label)` (locates the card by its label and exposes its value), `presetButton(label)`, `refreshButton`, `viewDetailedButton`, `exportButtons` (csv/excel/pdf), `lastUpdated`, `sectionError(copy)` + `retryButton`, `kpiSkeletons` (`getByTestId('kpi-skeleton')`), `chart(testId)`.
  - Actions: `goto()`, `selectPreset(label)`, `refresh()`, `waitForLoaded()` (KPI skeletons gone + a known card populated) — reusing the **hydration-gate** discipline from `LoginPage` where interaction precedes assertion.
- **Reuse** `LoginPage` (for the auth step in Approach A) and `BasePage`.

**Possible production-code note (blocker-gated):** `ExecutiveKpiCard` renders `label` + `value` as sibling `Text`s with no per-card `testID`. Value-level assertions will first be attempted by **locating the card via its unique label and reading its value sibling** (no app change). Only **if** that proves unstable will we propose adding a single `testID={`kpi-${label}`}` to `ExecutiveKpiCard` — and only then, as a *proven* automation blocker, per the guardrails. Default expectation: **no production change.**

---

## 4. Fixtures & data assumptions

- **Auth:** Approach A reuses the `adminPage` storageState fixture (populated by `global-setup` when `E2E_ADMIN_*` is set) **or** an explicit `LoginPage` login in a `beforeEach`. No new auth infra.
- **Data:** a new **`analytics-stubs` helper** (`qa/playwright/support/` or `qa/shared/`) providing deterministic fixtures + a `stubExecutiveRpcs(page, { overview, previous, categories, growth, notifications, ... , mode })` routing helper where `mode ∈ {populated, empty, error, loading(delayMs)}`. Pure fixtures, no network, no DB.
- **Determinism:** all asserted values come from the stubs, never from live data — so assertions are exact and stable regardless of environment.

---

## 5. Test inventory (priorities · tags)

Tags follow the reference convention: role `@admin`, area `@executive-dashboard`, suite `@smoke`/`@regression`, priority `@p0..@p2`, concern `@security` where relevant.

| # | Test | Priority | Tags | State exercised | Offline (A / B) |
|---|---|---|---|---|---|
| 1 | Unauthenticated visitor to `/analytics` is redirected to the login | **P0** | @security @smoke @regression | access | **A: yes** / B: yes |
| 2 | Authenticated admin sees all 7 dashboard sections | P0 | @smoke @regression | structure/populated | A: no / B: yes |
| 3 | Header shows filter presets, Last-updated, Refresh, disabled export, drill-down | P1 | @regression | structure | A: no / B: yes |
| 4 | Platform Health cards render stubbed values (wallet, active cust/prov, rating, disputes, tickets) | **P0** | @regression | populated | A: no / B: yes |
| 5 | Activity cards render stubbed period values (bookings breakdown, revenue, commission, ABV, repeat) | **P0** | @regression | populated | A: no / B: yes |
| 6 | Operational cards render (pending/in-progress, response/completion, failed payments, notifications) | P1 | @regression | populated | A: no / B: yes |
| 7 | Growth section shows delta badges (▲/▼/–) vs previous period | P1 | @regression | populated | A: no / B: yes |
| 8 | Service / Provider / Geographic sections render stubbed rows | P1 | @regression | populated | A: no / B: yes |
| 9 | Charts render for stubbed timeseries (customer/provider growth, revenue, bookings, top services/providers) | P2 | @regression | populated | A: no / B: yes |
| 10 | KPI cards show skeletons while data loads, then values | P1 | @regression | loading | A: no / B: yes |
| 11 | Sections load independently — a slow section does not gate the others | P1 | @regression | loading | A: no / B: yes |
| 12 | A failed section shows its inline error + Retry; other (ok) sections still render | **P0** | @regression | error | A: no / B: yes |
| 13 | Refresh/Retry re-fetches and recovers after a transient error | **P0** | @regression | error→populated | A: no / B: yes |
| 14 | Zero/empty data renders without crashing (0 / — values) | P1 | @regression | empty | A: no / B: yes |
| 15 | Changing the range preset re-queries and updates *period* cards but leaves *Current* health cards unchanged | P1 | @regression | filters + semantics | A: no / B: yes |
| 16 | "Last updated" timestamp updates after Refresh | P2 | @regression | header | A: no / B: yes |
| 17 | Export controls are present but disabled ("coming soon") | P2 | @regression | header | A: no / B: yes |

**≈ 17 tests.** Under **Approach A**, **1 runs offline** (redirect) and **16 are auth-gated** (run in the connected QA/CI env with `E2E_ADMIN_*` + Supabase). Under **Approach B**, **all 17 run offline & deterministically**.

---

## 6. Deterministic assertions (how each state is proven)

- **Populated:** stub `analytics_executive_overview` (and list RPCs) with fixed fixtures → assert each card's value equals the stubbed value (label-anchored), delta badges show the computed direction from current-vs-previous stubs.
- **Loading:** stub with a `route.fulfill` delayed by N ms → assert `kpi-skeleton` visible before resolve; assert independence by delaying **one** RPC and asserting a **different** section is already populated.
- **Error:** stub the target RPC with `route.fulfill({ status: 500 })` (or `route.abort()`) → assert the exact section error copy + `Retry`; assert a sibling stubbed-OK section still renders (isolation).
- **Recovery:** first response errors, second (after `Retry`/`Refresh`) succeeds → assert values appear.
- **Empty:** stub zeros/empty arrays → assert cards render `0` / `—` and no crash.
- **Filters/semantics:** stub distinct payloads keyed by the `p_from/p_to` range → select `Last 7 days` then `This year` → assert Activity (period) values change while the `Current …` health cards are unchanged (the Slice-38 health-vs-period invariant).
- **No sleeps** — every wait is on a rendered element, a stubbed response, or `toPass`; the hydration-gate pattern precedes interactions.

---

## 7. Loading / error / empty / populated handling — summary

All four states are **first-class tests** (rows 4-14), made deterministic by RPC stubbing. This is the payoff of stubbing over live data: we can *force* each state on demand rather than hope the live backend is in it.

---

## 8. Backend / environment dependencies (honest)

- **Offline (current sandbox, Approach A):** only **Test 1 (redirect)** runs; the other 16 **skip** (gated on admin session availability). This is the accurate status to report — the suite is **not** "passing" until it runs in a connected environment. (Consistent with the reporting correction for the auth suite.)
- **Connected QA/CI (Approach A):** with `E2E_ADMIN_*` + reachable Supabase, all 17 run; data is still stubbed (deterministic), so results don't depend on live DB contents.
- **If Approach B is approved:** all 17 run offline & deterministically (no creds, no backend) — the strongest position, at the cost of one bounded `mockAdminSession` fixture.

---

## 9. Test-data blockers (called out honestly)

1. **Admin session to pass the guard** — the only hard dependency. Solved by creds+backend (A) or a mock-session fixture (B). **No DB seeding needed either way.**
2. **Per-card value locators** — `ExecutiveKpiCard` has no per-card `testID`. Mitigation: label-anchored value locating first; propose a single additive `testID` **only if** proven blocked (guardrail-compliant). Expected outcome: no production change.
3. **Chart internals** — charts expose a container `testID` but not their datapoints; chart tests assert the container renders for stubbed series (P2), not pixel-level content.
4. **`this_year`/local-time boundary** — a known Slice-38 minor; range assertions key on the stub payloads, not on wall-clock math, so this does not affect the suite.

No other blockers. **No broad seeding infrastructure is proposed.** **No production code change is proposed** (pending the row-2 mitigation outcome).

---

## 10. Deliverables of the eventual implementation (for reference, not this slice)

`ExecutiveDashboardPage` POM · `analytics-stubs` fixtures/helper · `qa/playwright/admin/executive-dashboard.spec.ts` (~17 tagged tests) · reuse of `LoginPage`/`adminPage` for auth · `qa/`-only, no app change (unless the row-2 blocker is proven) · failure artifacts inherited from the framework config.

---

## 11. Open decisions for you

1. **Approach A vs B** for reaching the dashboard (Section 2). Recommendation: **A now** (gated, zero new infra), with **B** as an optional, high-ROI follow-up you may approve to make this and all future admin suites fully offline-deterministic.
2. Confirm the **~17-test inventory** and priorities (Section 5) — add/remove any.
3. Confirm the **no-production-change** stance, accepting the row-2 `testID` mitigation may (rarely) surface a proven blocker.

**Stopping here for approval. No tests will be written until you approve this spec (and choose Approach A or B).**
