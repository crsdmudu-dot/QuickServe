# QA Slice 42 — Admin Detailed Analytics Automation — Spec

**Status:** Specification only (no tests, no Page Objects, no fixtures, no production change).
**Branch:** `qa/slice-42-detailed-analytics`
**Baseline:** `main` @ `d421d7d` (QA Slice 41 merged). Reuses the Slice 41 reference architecture
(bounded `mockAdminSession`, optional connected real-session mode, strict RPC interception + anomaly
tracking, Page Object discipline, first-class tags, deterministic waits, no fixed sleeps, `qa/`-only).

---

## 1. What is under test

The **Admin Detailed Analytics** screen only:

- **Route:** `/(admin-web)/analytics/detailed` (`src/app/(admin-web)/analytics/detailed.tsx`,
  default export `AnalyticsDetailedScreen`). This is the relocated Slice-25/28 dashboard, reached as a
  **drill-down** from the Executive Dashboard's **"View detailed analytics"** button
  (`index.tsx:356` → `router.push('/(admin-web)/analytics/detailed')`).
- **Guard:** the same `(admin-web)/_layout.tsx` guard as Slice 41 (`useAdminGuard` → `role === 'admin'`;
  no session → `Redirect` to `/(admin-web)/login`; non-admin → "Not authorized"). Wrapped in `AdminShell`.
- **Data:** the **nine Slice-25/28 analytics wrappers** in `src/lib/analytics.ts`, each calling a
  Supabase RPC. All fetched together in one `Promise.all` inside `loadAll()`, re-run whenever
  `preset | bucket | customFrom | customTo` changes.

### 1.1 Sections (7, in render order)

| # | Heading | Rendering | Data source |
|---|---|---|---|
| 1 | **Executive KPIs** | 6 `TrendCard`s (testIDs `kpi-revenue`, `kpi-gross-bookings`, `kpi-completed-bookings`, `kpi-active-providers`, `kpi-active-customers`, `kpi-avg-booking-value`) | `analytics_kpis` |
| 2 | **Booking analytics** | `LineChart` (`chart-bookings-ts`) + 5 `TrendCard`s (`kpi-completion-rate`, `kpi-cancellation-rate`, `kpi-avg-completion`, `kpi-pending`, `kpi-completed`) | `analytics_bookings_timeseries` + `analytics_bookings_summary` |
| 3 | **Financial analytics** | `LineChart` (`chart-financial-ts`, KES) + 5 `TrendCard`s (`kpi-fin-revenue`, `kpi-fin-payouts`, `kpi-fin-qs-revenue`, `kpi-fin-wallet`, `kpi-fin-promo`) | `analytics_financial_timeseries` + `analytics_financial_summary` |
| 4 | **Provider analytics** | `BarChart` (`chart-providers-bar`, KES) + conditional **Lowest-rated providers** list (asc by rating, top 5, display-only) | `analytics_providers` |
| 5 | **Service analytics** | `BarChart` (`chart-services-bar`) + conditional `PieChart` (`chart-services-pie`, revenue>0 only) | `analytics_services` |
| 6 | **Geographic analytics** | `BarChart` (`chart-geography-bar`) | `analytics_geography` |
| 7 | **Customer analytics** | 4 `TrendCard`s (`kpi-new-customers`, `kpi-returning-customers`, `kpi-retention-rate`, `kpi-repeat-booking-rate`) | `analytics_customers` |

### 1.2 Filters & controls

- **Presets** (`Button`s, active = `primary` variant): `Today` · `Last 7 days` · `Last 30 days` ·
  `This month` · `Custom`. **Default = `Last 30 days` (`last30`).**
- **Custom** preset reveals two `Input`s — `From (ISO date)` / `To (ISO date)` — bound to `customFrom`/`customTo`.
- **Buckets** (active = `primary`): `Day` · `Week` · `Month`. **Default = `Day`.** Applies to the two
  timeseries RPCs (`p_bucket`).
- **Per-section CSV:** every `SectionHeading` renders a ghost **"Download CSV"** button → `exportCsv(name, rows)`
  (web = `Blob` + `<a download>` click; formula-injection guard in `toCsv`). **7 identical-label buttons.**
- **Loading:** global `loading` flag → caption **"Loading analytics…"** + each chart renders its own
  `testID="chart-loading"` skeleton. **Empty:** each chart renders `testID="chart-empty"` ("No data").
- **Error:** global `try/catch` → caption **"Could not load analytics."** + **Retry** button
  (see §8.1 — not reliably reachable through the network boundary).

### 1.3 What Detailed Analytics does NOT have (vs Executive/Slice 41)

- **No manual "Refresh" button** and **no "Last updated" timestamp** — reload is filter-driven only.
- **No delta/comparison badges**, no "previous period" logic, no per-section independent loading
  (one shared `loading` flag for all 9 calls).
- **No in-page "back to Executive" button** — return is via browser back or the AdminShell sidebar.

Those Slice-41 coverage areas are therefore **N/A** to this suite and are documented as such rather than tested.

---

## 2. Central architectural decision — reuse Slice 41 isolation, separate the stubs

**Session isolation:** reuse **`mockAdminSession`** unchanged. The detailed screen sits behind the same
guard and the same `AdminShell` + `ServicesProvider` app-shell; `mockAdminSession` already seeds a valid
admin session, stubs `profiles`/`notifications`/`services`/`service_categories`, and fails loud on any
`/auth/v1/*` or un-stubbed `/rest/v1/*`. No change needed.

**Connected mode preserved:** keep the Slice 41 `QA_DASHBOARD_CONNECTED=1` real-login path (via `LoginPage`
+ `E2E_ADMIN_*`). Same `setupDashboard(page)` shape: mock mode by default, connected mode opt-in.

**Analytics stubs — a NEW, separate module.** The detailed screen calls a **different RPC set** from
Slice 41 and with **different request shapes**, so reusing `qa/playwright/support/analytics-stubs.ts`
would be wrong. Reuse only the *pattern* (tracker shape, `respond`/`respondError` helpers), in a new
`qa/playwright/support/detailed-analytics-stubs.ts`:

| | Slice 41 (Executive) | Slice 42 (Detailed) |
|---|---|---|
| RPCs | overview, service_categories, growth_ts, notification_delivery, bookings_ts, financial_ts, providers, services, geography | **kpis, bookings_ts, bookings_summary, financial_ts, financial_summary, providers, services, geography, customers** |
| Net-new RPCs | — | **kpis, bookings_summary, financial_summary, customers** (4) |
| Extra request params | none (p_from/p_to only) | **`p_bucket`** on the 2 timeseries; **`p_limit`** on providers |
| Overlap | — | bookings_ts, financial_ts, providers, services, geography (shapes match, but validation differs) |

Because 4 RPCs are net-new and the shape-validation rules differ (must accept/validate `p_bucket` and
`p_limit`), a dedicated module is clearer and safer than parameterising the Slice 41 one. **No generic
mocking framework** — one focused module scoped to these nine RPCs.

---

## 3. Page Object — `DetailedAnalyticsPage`

New POM `qa/playwright/pages/admin/detailed-analytics.page.ts` (extends `BasePage`), mirroring the Slice 41
POM discipline (user-visible anchors + the app's existing testIDs; no test-only production hooks).

**Static tables**
- `SECTIONS` = the 7 headings (§1.1).
- `PRESETS` = `['Today','Last 7 days','Last 30 days','This month','Custom']`.
- `BUCKETS` = `['Day','Week','Month']`.
- `KPI_TESTIDS` = the 17 `kpi-*` ids; `CHART_TESTIDS` = the 6 `chart-*` ids.

**Locators**
- `section(title)` → `getByText(title, { exact: true })`.
- `kpiCard(testId)` → `getByTestId(testId)` — **primary value anchor** (unique per card; unlike Slice 41,
  detailed KPI cards *do* expose testIDs, so no `.first()`/exact-text gymnastics).
- `chart(testId)` → `getByTestId(testId)`; `chartsLoading` → `getByTestId('chart-loading')`;
  `chartsEmpty` → `getByTestId('chart-empty')` (both non-unique — see selector risks).
- `presetButton(label)` / `bucketButton(label)` → `getByRole('button', { name, exact:true })`.
- `customFromInput` / `customToInput` → located via the `From (ISO date)` / `To (ISO date)` labels.
- `downloadCsvButtons` → `getByRole('button', { name: 'Download CSV' })` (7; addressed by `.nth(i)`).
- `loadingCaption` → `getByText('Loading analytics…')`.
- `errorBanner` → `getByText('Could not load analytics.')`; `retryButton` → `getByRole('button',{name:'Retry'})`
  (documented likely-unreachable).
- `lowestRatedRows` → the "Lowest-rated providers" list rows.

**Actions**
- `waitForReady()` → wait for `section('Executive KPIs')` visible.
- `selectPreset(label)` / `selectBucket(label)`.
- `enterCustomRange(from, to)` → select `Custom`, then hydration-gated `fill()` of both inputs
  (retry `pressSequentially` + `toHaveValue`, the Slice 41 RN-Web hydration gate).
- `downloadCsv(sectionIndex)` → click the nth "Download CSV" and capture the download event.

**Helpers/assertions**
- `expectKpi(testId, text)` → `expect(kpiCard(testId)).toContainText(text)`.
- `expectChartPopulated(testId)` → named chart testID visible.
- `expectNoBrokenValues()` → assert no visible KPI card contains `NaN` / `undefined`.

**Selector risks** (see §8): the 7 identical "Download CSV" buttons (positional `nth`), the shared
`chart-loading` / `chart-empty` testIDs across multiple charts (positional scoping for the partial-data
test), and brittle SVG internal text (not asserted).

---

## 4. Fixture & interception design — `detailed-analytics-stubs.ts`

**Typed fixtures** (exact, deterministic; chosen so every rendered string is unambiguous):

- `KPIS_POPULATED: AnalyticsKpis` — e.g. `revenue: 125000` → renders `KES 125,000`;
  `gross_bookings: 48`, `completed_bookings: 35`, `active_providers: 12`, `active_customers: 31`,
  `avg_booking_value: 3572` → `KES 3,572`.
- `BOOKINGS_SUMMARY: BookingsSummary` — `completion_rate: 73` → `73.0%`, `cancellation_rate: 10` → `10.0%`,
  `avg_completion_minutes: 47` → `47`, `pending: 5`, `completed: 35`.
- `FINANCIAL_SUMMARY: FinancialSummary` — 5 distinct KES values.
- `CUSTOMERS: CustomerStats` — `new_customers: 18`, `returning_customers: 13`, `retention_rate: 42` → `42.0%`,
  `repeat_booking_rate: 46` → `46.0%`.
- `BOOKINGS_TS: BookingsPoint[]`, `FINANCIAL_TS: FinancialPoint[]` — 2–3 points each.
- `PROVIDERS: ProviderStat[]` — includes rows with **null `avg_rating`** and **null `full_name`** for the
  malformed-safe test; ordered so lowest-rated assertion is deterministic.
- `SERVICES: ServiceStat[]` — `service_id`s (`house-cleaning`, `plumbing`) resolve to deterministic labels
  via `getServiceBySlug` **humanize fallback** even with the empty catalog stub (verified).
- `GEOGRAPHY: GeoStat[]`.
- `*_ZERO` / empty-array variants for the empty state.

**RPC inventory & strict request-shape matching**

| RPC | Method | Required body | Returns (wrapper) |
|---|---|---|---|
| `analytics_kpis` | POST | `p_from`,`p_to` | `[AnalyticsKpis]` (row 0) |
| `analytics_bookings_timeseries` | POST | `p_from`,`p_to`,**`p_bucket`∈{day,week,month}** | `BookingsPoint[]` |
| `analytics_bookings_summary` | POST | `p_from`,`p_to` | `[BookingsSummary]` (row 0) |
| `analytics_financial_timeseries` | POST | `p_from`,`p_to`,**`p_bucket`** | `FinancialPoint[]` |
| `analytics_financial_summary` | POST | `p_from`,`p_to` | `[FinancialSummary]` (row 0) |
| `analytics_providers` | POST | `p_from`,`p_to`,**`p_limit`** (int) | `ProviderStat[]` |
| `analytics_services` | POST | `p_from`,`p_to` | `ServiceStat[]` |
| `analytics_geography` | POST | `p_from`,`p_to` | `GeoStat[]` |
| `analytics_customers` | POST | `p_from`,`p_to` | `[CustomerStats]` (row 0) |

**Tracker** `DetailedAnalyticsTracker` (same discipline as Slice 41):
- catch-all regex `/\/rest\/v1\/rpc\/analytics_/` records any **unexpected** analytics RPC not in the set.
- per-RPC handler records `called`, validates POST + required body keys → `badShape` on violation,
  and **captures the params** (`p_from`, `p_to`, `p_bucket`, `p_limit`) so filter tests can assert what
  was actually sent.
- `assertNoAnomalies()` (no unexpected, no badShape), `assertCalled(required)` (names any missing RPC),
  plus exposed `paramsFor(rpc)` for filter assertions.
- **Modes:** `populated` | `empty` | `partial` (per-RPC `failing[]` → `respondError`/empty) |
  `loading` (`delayMs`) | `degradation` (abort a set). `respondError` uses `route.abort('failed')`
  (the reachable graceful-degradation path).

**CSV/download strategy:** no network stubbing — `exportCsv` builds the `Blob` **client-side** from the
already-fetched fixture rows. Capture with `page.waitForEvent('download')`, read the content, and compare
to `toCsv(expectedRows)` computed from the same fixture. Deterministic and asserts real file content
(headers + rows + formula-injection prefix where applicable).

**Cross-test reset:** routes are registered per `page`, and Playwright gives each test a fresh
`context`/`page`, so stubs and the tracker reset naturally. Any module-level scratch (e.g. a params buffer)
is re-initialised inside the installer, exactly as Slice 41 resets `overviewFromSeen`.

---

## 5. Test inventory (priority · tags · data state · RPCs · offline · assertion)

All run **offline** in mock mode (`installMockAdminSession` + `installDetailedAnalyticsStubs`) except where
noted; connected mode is opt-in. Tag vocabulary matches Slice 41 (`@smoke`, `@p0/@p1/@p2`, plus
domain tags).

| # | Test name | Verifies | Pri | Tags | Data state | Expected calls | Assertion strategy |
|---|---|---|---|---|---|---|---|
| 1 | unauthenticated visit redirects to admin login | access control | **P0** | @smoke @access | no session | none (guard redirects) | URL ends `/login`; no analytics RPC fired |
| 2 | drill-down from Executive Dashboard opens Detailed Analytics | route entry / nav | P1 | @nav | populated (index + detailed) | executive stubs + detailed stubs | click "View detailed analytics" → `section('Executive KPIs')` visible |
| 3 | renders all 7 sections + filter/bucket controls by default | structure | **P0** | @smoke @structure | populated | all 9 | each `SECTIONS` heading + all `PRESETS`/`BUCKETS` visible |
| 4 | default preset "Last 30 days" and bucket "Day" are active | default state | P1 | @filters | populated | all 9 | `Last 30 days` & `Day` = primary variant |
| 5 | Executive KPI cards show exact fixture values | populated values | **P0** | @kpi | populated | `analytics_kpis` | `expectKpi` on all 6 exec testIDs (e.g. `KES 125,000`, `48`) |
| 6 | Booking summary KPIs show exact values | populated values | P1 | @kpi | populated | `analytics_bookings_summary` | `73.0%`, `10.0%`, `47`, `5`, `35` on their testIDs |
| 7 | Financial summary KPIs show exact KES values | populated values | P1 | @kpi | populated | `analytics_financial_summary` | 5 KES cards exact |
| 8 | Customer KPIs show exact values | populated values | P1 | @kpi | populated | `analytics_customers` | `18`, `13`, `42.0%`, `46.0%` |
| 9 | all charts render in populated state | charts | P1 | @charts | populated | ts/providers/services/geography | 6 named chart testIDs visible; no `chart-empty` |
| 10 | lowest-rated providers list is ascending by rating | ranking (display-only) | P2 | @providers | populated | `analytics_providers` | first row = lowest `avg_rating`; nulls excluded |
| 11 | all 9 detailed RPCs fire once with correct shapes | RPC contract | **P0** | @smoke @rpc | populated | **all 9** | `assertCalled(all 9)` + `assertNoAnomalies()` + `mockAdminSession.assertClean()` |
| 12 | selecting bucket "Week" re-issues timeseries with `p_bucket='week'` | filter → request | P1 | @filters | populated | 2 timeseries | `paramsFor` shows `p_bucket='week'` on both |
| 13 | Custom preset reveals inputs; ISO dates drive `p_from`/`p_to` | custom range | P1 | @filters @custom | populated | all 9 (re-fetch) | inputs appear; `paramsFor` `p_from`/`p_to` match entered dates |
| 14 | preset "Today" sends midnight `p_from` | filter → request | P2 | @filters | populated | all 9 | `p_from` = local midnight of `to` |
| 15 | loading state shows caption + chart skeletons | loading independence | P1 | @loading | populated + `delayMs` | all 9 (delayed) | `loadingCaption` + `chart-loading` visible pre-resolve, gone after |
| 16 | empty data → zeros, "No data" charts, pie & lowest-rated hidden | empty state | **P0** | @empty | empty | all 9 (empty) | KPIs `KES 0`/`0`/`0.0%`; `chart-empty` present; no pie/lowest-rated; `expectNoBrokenValues()` |
| 17 | all analytics calls failing degrades to zeros without crashing | graceful degradation | P1 | @degradation | degradation (abort all) | all 9 (aborted) | dashboard renders zeros/No data; page alive; **documents error banner is not reached** (see §8.1) |
| 18 | one failing section leaves the rest intact | partial data | P1 | @partial | partial (geography empty) | all 9 | geography chart `chart-empty` (positional); other sections populated |
| 19 | explicitly-supported nulls render safely | malformed-safe | P2 | @malformed-safe | populated w/ nulls | providers + summary | `kpi-avg-completion` = `—`; null `full_name` → `#id`; null `avg_rating` → `—` |
| 20 | "Download CSV" (Executive KPIs) exports correct file content | export | **P0** | @export @csv | populated | (client-side) | download content == `toCsv([KPIS_POPULATED])` incl. header |
| 21 | "Download CSV" (Providers) exports correct row content | export | P1 | @export @csv | populated | (client-side) | download content == `toCsv(PROVIDERS)` |
| 22 | rapid preset changes settle on the last-selected filter's data | stale/eventual consistency | P1 | @stale | populated (per-preset payloads) | all 9 ×N | final render matches last preset; **documents no true race-guard** (see §8.2) |

---

## 6. Coverage-requirement mapping (honest)

| Required consideration | Covered by | Note |
|---|---|---|
| Access control & route entry | 1, 2 | — |
| Page structure & default state | 3, 4 | — |
| Every section/tab | 3, 5–10 | 7 sections; no tabs (single scroll page) |
| Exact KPI/summary values | 5–8 | via unique KPI testIDs |
| Filter presets & custom date | 4, 12, 13, 14 | — |
| Chart & table rendering | 9, 10 | tables = KPI cards + lowest-rated list; charts = SVG (testID presence, not internal text) |
| Sorting / pagination / search / drill-down | 2, 10 | drill-down entry (2), lowest-rated sort (10); **no pagination/search exist** |
| Growth / comparison semantics | — | **N/A** — Detailed screen has no deltas/comparison (Slice-41 concern) |
| CSV export incl. file content | 20, 21 | real download content verified |
| Refresh & last-updated | — | **N/A** — no Refresh/Last-updated on Detailed (§1.3) |
| Loading independence | 15 | one shared `loading` flag (documented) |
| Empty data | 16 | — |
| Partial data | 18 | — |
| Malformed-safe (explicit support) | 19 | only app-supported nulls; not arbitrary bad types |
| Section-level degradation & recovery | 17 | reachable form only (zeros/No data); recovery/error-banner not reachable (§8.1) |
| Stale-response during rapid filter changes | 22 | eventual consistency only; no true guard (§8.2) |
| No NaN/undefined/dup/broken formatting | 5, 16, 19 (`expectNoBrokenValues`) | cross-cutting |
| Navigation back to Executive | 2 (+note) | entry tested; no in-page back button (§8) |

---

## 7. Test-count estimate

- **Recommended: 22 tests.** Breakdown: **P0 ×6** (1, 3, 5, 11, 16, 20) · **P1 ×13** (2, 4, 6, 7, 8, 9,
  12, 13, 15, 17, 18, 21, 22) · **P2 ×3** (10, 14, 19).
- **Offline:** all 22 in mock mode; test 1 needs no session; tests 2–22 use `mockAdminSession`. Connected
  mode (`QA_DASHBOARD_CONNECTED=1`) is opt-in and does not add tests.
- **Browser scope:** recommend **Chromium-only** for this suite (desktop admin-web; deterministic;
  matches the Slice-41 admin approach) — see open decision B.
- **Runtime (estimate, Chromium, cold Expo/Metro dev server):** serial ≈ **2–3 min**; parallel
  (default workers) ≈ **45–75 s**. Consistent with Slice 41's admin-web timings.

---

## 8. Blockers & limitations (called out honestly)

1. **Global error banner is not reliably reachable via the network boundary.** The nine wrappers do
   `const { data, error } = await supabase.rpc(...)` and return **safe defaults / `[]`** whenever `error`
   is set. postgrest-js converts network failures (including `route.abort`) into an `error` object rather
   than a thrown exception, so `loadAll()`'s `try/catch` — and thus the **"Could not load analytics." +
   Retry** UI — is essentially unreachable through Playwright network control. The reachable reality of a
   failed backend is **zeros + "No data" charts, no crash** (test 17). The error/Retry branch remains the
   province of the app's own unit tests. Consequently the "recovery" half of "degradation & recovery" is
   **not** E2E-testable here (same finding as Slice 41).
2. **No stale-response protection exists in the app.** `loadAll()` has no request-id/abort guard; rapid
   filter changes fire overlapping `Promise.all`s and the last `setState` wins. We can assert **eventual
   consistency** (test 22) but cannot assert race protection, because there is none. We will **not** author
   a test that asserts a bug (deliberately delaying an earlier response to surface stale data).
3. **Seven identical "Download CSV" buttons** share one accessible name and carry no testID. Tests address
   them **positionally** (`.nth(sectionIndex)`), which is deterministic given the fixed section order but
   brittle to re-ordering. A production `testID` (`export-csv-<section>`) would remove the risk — **open
   decision A** (production change, needs approval; default: do not add).
4. **`chart-loading` / `chart-empty` testIDs are shared** across all charts (the components hard-code them,
   overriding the passed testID in those states). Per-section empty assertions (test 18) must scope by
   **position/count**, not by a unique id. Populated assertions are safe (named chart testID reappears).
5. **SVG chart internals are brittle.** Bar/line/pie values and labels are rendered as `<SvgText>` at
   computed coordinates. Tests assert **chart presence (testID) + the KPI cards**, never SVG-internal
   numbers, to avoid coordinate/text flake.
6. **N/A surfaces (documented, not tested):** no Refresh button, no Last-updated timestamp, no
   delta/comparison badges, no per-section independent loading, and **no in-page "back to Executive"
   button** (return is via browser back / AdminShell sidebar). Test 2 covers forward drill-down entry.
7. **Nav-entry test (2) couples to the Executive stubs.** It must also install the Slice-41
   `analytics-stubs` for `index.tsx`. Kept at P1 and isolated; if we prefer suite purity we can drop it and
   load `/detailed` directly (open decision C).
8. **Connected real-session confirmation still pending.** As in Slice 41, the sandbox cannot reach Supabase
   (`lkigkltvstlxfdztffds.supabase.co` → HTTP 000) and has no `E2E_ADMIN_*`. The offline mock suite is fully
   deterministic; an optional connected-environment run remains **recommended before production releases**
   and has not been executed here.

---

## 9. Open decisions requiring approval

- **A. Production testIDs for the 7 "Download CSV" buttons?** Recommend **No** (use `.nth()`); revisit only
  if flakiness is proven. Adding `export-csv-<section>` is a production change and needs explicit approval.
- **B. Browser-project scope.** Recommend **Chromium-only** for this admin-web suite (deterministic desktop
  surface). Alternative: run across Chromium/Firefox/WebKit like the broader `qa/` suite (≈3× runtime).
- **C. Include the drill-down nav-entry test (2)?** Recommend **Yes** but isolated (reusing Slice-41
  executive stubs). Alternative: drop it and load `/detailed` directly to keep the suite purely detailed-scoped.
- **D. CSV assertion depth.** Recommend asserting the **full CSV string** (header + all fixture rows) since
  fixtures are small; alternative is header + first row only.
- **E. Isolation approach.** Reuse `mockAdminSession` unchanged (recommended) — confirm no objection to the
  detailed suite depending on the Slice-41 fixture rather than a copy.

---

## 10. Deliverables of the eventual implementation (for reference, not this slice)

- `qa/playwright/pages/admin/detailed-analytics.page.ts` — the POM (§3).
- `qa/playwright/support/detailed-analytics-stubs.ts` — fixtures + tracker (§4).
- `qa/playwright/admin/detailed-analytics.spec.ts` — the 22 tests (§5).
- Reuse (no change): `qa/playwright/support/mock-admin-session.ts`, `LoginPage`, `BasePage`.
- `qa/README.md` — a short note that Detailed Analytics reuses `mockAdminSession` and adds a separate,
  detailed-scoped analytics stub module.
- No production code changes (unless open decision A is approved).
