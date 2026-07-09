# Slice 38 — Executive Analytics Dashboard — Design Spec

**Date:** 2026-07-09
**Status:** Approved (refinements applied 2026-07-09)
**Slice goal:** A real-time Executive Analytics Dashboard for QuickServe administrators that surfaces operational, financial, and growth metrics **already stored in the platform**, by aggregating existing data — not by creating new business logic.

---

## 1. Overview & Guiding Principle

QuickServe already has a Slice-25 analytics layer: migration `0025_analytics.sql` (9 `security definer` / `is_admin()` / SELECT-only RPCs) and `src/lib/analytics.ts` (RPC wrappers, `analyticsRange`, `toCsv`/`exportCsv`, `exportPdf` stub), surfaced at `(admin-web)/analytics`.

Slice 38 is a **composition & aggregation layer** on top of that. It **reuses** the existing RPCs, **adds a small number of gap-filling read-only RPCs** for metrics not yet computed, and presents an executive overview. It creates **no duplicate business calculations** and makes **no schema changes** (every gap metric derives from existing tables).

**Definitive principle:** aggregate existing data; reuse booking, payment, wallet, provider, customer, review, promotion, notification, and service systems wherever possible; introduce SQL only where a metric does not already exist.

---

## 2. Two Metric Classes (binding design rule)

The dashboard separates **two classes** of metric so a health snapshot is never confused with a historical activity metric:

- **Platform Health — current snapshot (filter-independent).** Point-in-time values as of when the dashboard is viewed; the date-range filter does **not** affect them. These are labeled "Current …".
- **Activity — selected period (range-scoped).** Values computed over the selected date range; the filter **does** affect them.

The date-range filter (Today / Last 7 / Last 30 / Last 90 / This Year / Custom) affects **activity** metrics (bookings, revenue, commission, growth, cancellations, average booking value, period ratings, notification delivery) and **not** the health snapshots, unless a metric is explicitly labeled otherwise.

### 2.1 Metric definitions

**Platform Health (current snapshot):**
- **Current Wallet Balance** = `SUM(wallets.balance)` across all wallets at view time (`wallets.balance`, Slice-23, enforced `>= 0`). Point-in-time; ignores the date filter.
- **Current Active Customers** = count of distinct customers with **at least one active or completed booking in the trailing 30 days** (now-relative, filter-independent). "Active booking" = a booking whose status is not cancelled and not completed (i.e. pending / assigned / in-progress); "completed" = status `completed`.
- **Current Active Providers** = count of distinct providers with **at least one active or completed booking in the trailing 30 days** (now-relative, filter-independent), by the same active/completed definition.
  - **Forward-compatibility note (required):** this metric is intentionally defined on booking activity because Provider Availability is deferred. It is designed so that a future Provider Availability signal can be incorporated **without redesigning the Executive Dashboard or its RPCs** — the definition lives entirely inside `analytics_executive_overview` and can be extended there (e.g. `OR provider.is_available`) with no change to the lib, components, or screen contract.
- **Current Platform Rating** = average across **all current reviews** (`AVG(reviews.rating)` over the whole table), shown as the executive KPI. Filter-independent.
- **Active Disputes** = `support_cases` where `case_type = 'dispute'` and `status NOT IN ('resolved','closed')` (Slice-26). Current open state.
- **Open Support Tickets** = `support_cases` where `case_type = 'support'` and `status NOT IN ('resolved','closed')` (Slice-26 — this already exists; not merely future-compatible).

**Activity (range-scoped, respects the filter):**
- **Total Bookings** = bookings created in range.
- **Active Bookings** = bookings in range with status pending / assigned / in-progress (not completed, not cancelled).
- **Completed Bookings** = bookings in range with status `completed`.
- **Cancelled Bookings** = bookings in range with status `cancelled`.
- **Total Revenue** = `SUM(payments.amount)` where `status='paid'` and `paid_at` in range (reuses the Slice-25 revenue definition).
- **Platform Commission** = QuickServe revenue in range (reuses `analytics_financial_summary.quickserve_revenue`).
- **Average Booking Value** = revenue / completed bookings in range (reuses Slice-25 definition).
- **Repeat Customer Rate** = reuses `analytics_customers.repeat_booking_rate` for the range.
- **New Customers / New Providers (growth)** = profiles created in range, by role.
- **Pending Jobs** = bookings currently pending (operational; see note below).
- **In-Progress Jobs** = bookings currently in-progress.
- **Average Response Time** = average minutes from booking creation/assignment to provider acceptance, over range (derived from existing booking timestamps/activity; if the timestamps required are not present, this field returns null and is documented as such rather than adding schema).
- **Average Completion Time** = reuses `analytics_bookings_summary.avg_completion_minutes` for the range.
- **Failed Payments** = count of failed payment attempts in range (from the existing payment-attempts data surfaced by `(admin-web)/payment-attempts`).
- **Average Rating (Selected Period)** = `AVG(reviews.rating)` for reviews created within the range — used by charts/trends/drill-downs (distinct from the Current Platform Rating KPI).
- **Notification Delivery Summary** = counts of notifications by `push_status` in range (Slice-20/31).

> **Operational "current" counts** (Pending Jobs, In-Progress Jobs, Active Disputes, Open Support Tickets) are inherently current-state; they are shown in the Operational section and are not date-filtered (a job is pending *now*, not "pending in the last 7 days"). The spec treats them as snapshots even though they sit in the operational group.

---

## 3. Architecture

### 3.1 Screen structure
- **`(admin-web)/analytics/index.tsx`** becomes the **Executive Dashboard** (the analytics landing).
- The existing Slice-25 detailed analytics views become **drill-downs** linked from the executive overview. Existing detailed screens are preserved (no regression); links route into them.
- Admin-portal only. No customer-facing or provider-facing surface.

### 3.2 Backend aggregation layer — migration `0032_executive_analytics.sql`
All new functions: `language plpgsql security definer set search_path = public`, open with an `is_admin()` guard, then **SELECT-only** queries. No writes, no triggers, no RLS changes, no destructive DDL.

**New composite RPC (one round-trip for all scalar KPIs):**
- `analytics_executive_overview(p_from timestamptz, p_to timestamptz)` → returns **one row** with clearly-named fields grouped by class:
  - Health snapshot (filter-independent): `current_wallet_balance`, `current_active_customers`, `current_active_providers`, `current_platform_rating`, `active_disputes`, `open_support_tickets`, `pending_jobs`, `in_progress_jobs`.
  - Activity (range-scoped): `total_bookings`, `active_bookings`, `completed_bookings`, `cancelled_bookings`, `total_revenue`, `platform_commission`, `avg_booking_value`, `repeat_customer_rate`, `new_customers`, `new_providers`, `avg_response_minutes`, `avg_completion_minutes`, `failed_payments`, `period_avg_rating`.

**New gap list/timeseries RPCs:**
- `analytics_service_categories(p_from, p_to)` → per service-category distribution (bookings, revenue share) + featured-service performance flag (from Slice-30 `service_categories` / `is_featured`).
- `analytics_growth_timeseries(p_from, p_to, p_bucket)` → `{ period, new_customers, new_providers }` per bucket, for the customer/provider growth charts (from `profiles.created_at` by role).
- `analytics_notification_delivery(p_from, p_to)` → notification counts by `push_status` (delivered/failed/pending) for the range.

**Reused unchanged (Slice-25):** `analytics_bookings_timeseries`, `analytics_financial_timeseries`, `analytics_bookings_summary`, `analytics_financial_summary`, `analytics_providers`, `analytics_services`, `analytics_geography`, `analytics_customers`.
- Provider analytics (highest rated / highest earning / most active / completion rate) reuse `analytics_providers` (already returns `avg_rating`, `total_earnings`, `completed_jobs`, `completion_rate`), sorted client-side.
- Service analytics (most/least booked) reuse `analytics_services`.
- Geographic analytics reuse `analytics_geography`.

**Additive indexes only** (created `if not exists`, non-destructive) where a supporting index is missing: `bookings(created_at)`, `bookings(status)`, `payments(paid_at)` / `payments(status)`, `profiles(created_at, role)`, `reviews(created_at)`, `support_cases(case_type, status)`, `notifications(created_at, push_status)`.

### 3.3 Frontend layer
- **`src/lib/executive-analytics.ts`** (new): typed wrappers for the new RPCs; re-exports the Slice-25 wrappers; a **light in-memory TTL cache** keyed by `{ rpc, from, to, bucket }` (short TTL, e.g. 60s) with a way to read the cache timestamp for "Last Updated"; extends the range presets with **`last90`** and **`this_year`** (added to `RangePreset` + `analyticsRange`, additive — existing presets unchanged). All wrappers return safe defaults on error (mirrors `analytics.ts`). No writes.
- **`(admin-web)/analytics/index.tsx`** (Executive Dashboard): filter bar (Today / Last 7 / Last 30 / Last 90 / This Year / Custom) → **Platform Health** cards → **Activity (selected period)** KPI cards → **Operational**, **Growth**, **Service analytics**, **Provider analytics**, **Geographic** sections → **Charts** (revenue over time, bookings over time, customer growth, provider growth, top services, top providers) reusing existing chart components. Drill-down links to the existing detailed analytics screens. A **"Last Updated" timestamp** is shown (see §3.4).
- **New presentational components** (only where existing ones don't fit): `ExecutiveKpiCard` (value + label + a "Current" vs "Selected period" tag), `MetricSection` (titled group wrapper), `GrowthDeltaBadge` (period-over-period delta indicator). Reuse existing KPI card, chart, `DataTable`, and range-filter components wherever they already exist.

### 3.4 "Last Updated" timestamp
Because the dashboard reads through a short client-side TTL cache, it shows a lightweight **"Last Updated HH:MM"** indicator reflecting when the executive data was last fetched from the server (the cache-write time of `analytics_executive_overview`). A manual refresh control invalidates the cache and updates the timestamp. Pure/presentational; no polling required.

### 3.5 Export (future-ready only)
Per the brief, exports are **not implemented** this slice. The dashboard shows **future-ready, disabled** CSV / Excel / PDF controls. When implemented later, CSV can reuse the existing `toCsv`/`exportCsv` (which already carry the CSV formula-injection guard, CWE-1236); Excel/PDF remain future work. No export dependency is added.

---

## 4. Proposed Dashboard Layout (top → bottom)

1. **Header:** title, date-range filter (6 presets + custom), "Last Updated" indicator + refresh, disabled export menu.
2. **Platform Health (current):** Current Wallet Balance · Current Active Customers · Current Active Providers · Current Platform Rating · Active Disputes · Open Support Tickets.
3. **Activity KPIs (selected period):** Total / Active / Completed / Cancelled Bookings · Total Revenue · Platform Commission · Average Booking Value · Repeat Customer Rate.
4. **Operational:** Pending Jobs · In-Progress Jobs · Avg Response Time · Avg Completion Time · Failed Payments · Active Disputes · Open Support Tickets · Notification delivery summary.
5. **Growth:** Customer growth · Provider growth · Revenue growth · Booking growth (with `GrowthDeltaBadge`).
6. **Service analytics:** Most booked · Least booked · Category distribution · Featured-service performance.
7. **Provider analytics:** Highest rated · Highest earning · Most active · Completion rate.
8. **Geographic:** Bookings by city · Revenue by city.
9. **Charts:** Revenue over time · Bookings over time · Customer growth · Provider growth · Top services · Top providers.

---

## 5. Security Considerations

- **Admin-only:** every new RPC opens with `if not public.is_admin() then raise exception 'Admin only'; end if;` and is `security definer set search_path = public` — identical to the Slice-25 pattern. Non-admins receive nothing.
- **Read-only:** all new RPCs are SELECT-only. No INSERT/UPDATE/DELETE, no triggers, no RLS changes, no workflow side effects.
- **No new PII exposure:** the dashboard aggregates data already visible to admins in existing screens; leaderboards show the same provider/customer identifiers the existing analytics screen already shows.
- **Injection-safe exports:** deferred, but the reusable `toCsv` already neutralizes formula injection; any future export path uses it.
- **Surface:** admin-web routes only; no customer/provider route touched.

## 6. Performance Considerations

- **Server-side aggregation:** all metrics are computed in Postgres (counts / GROUP BY / SUM); the client never loads every booking/payment. The composite `analytics_executive_overview` returns all scalar KPIs in **one round-trip**.
- **Indexes:** additive supporting indexes (created `if not exists`) on the range/group/filter columns.
- **Client TTL cache:** short-TTL in-memory cache keyed by `{ rpc, from, to, bucket }` reduces repeat calls when switching sections; drives the "Last Updated" indicator.
- **Bounded lists:** leaderboards use the existing `p_limit` parameter (pagination-ready); large datasets are never fully materialized client-side.
- **Future scale (documented, not built):** materialized views with scheduled refresh are a future option; kept out here to preserve real-time behavior.

## 7. Guardrails

- No customer-facing or provider-facing changes. **Admin portal only.**
- No booking / payment / provider / wallet / notification / dispatch / ranking / payout **workflow** changes.
- No schema changes beyond additive read-only RPCs + additive `if not exists` indexes. No table/column/trigger/RLS modification. No destructive DDL.
- No duplicate business calculations — reuse Slice-25 RPCs and existing systems.
- No AI, no recommendations, no predictive analytics. **Dashboard only.**
- Exports not implemented (future-ready UI only).
- Android/native unaffected (admin-web screen); no existing analytics regression (existing detailed screens preserved).

## 8. Testing Strategy

- **Static schema test** (fs-read over `0032_executive_analytics.sql`, mirroring `communication-center-schema.test.ts`): each new RPC is `security definer` + `set search_path = public` + has the `is_admin()` guard + is SELECT-only (no insert/update/delete/DDL on business tables); indexes are `if not exists`; no reference that would duplicate an existing Slice-25 calculation beyond reuse.
- **Lib unit tests** (`executive-analytics.test.ts`): RPC wrappers call the right rpc with the right params and return safe defaults on error; TTL cache hit/expiry + timestamp read; `analyticsRange` new presets `last90` / `this_year` with an injected `now`; metric-class separation (health fields don't depend on range in the wrapper contract).
- **Component tests:** `ExecutiveKpiCard` (snapshot vs period tag), `MetricSection`, `GrowthDeltaBadge`, and the dashboard screen (renders health vs activity groups, filter switches range, charts render from timeseries, drill-down links, "Last Updated" shows).
- Full gate each task: `npm test`, `npx tsc --noEmit`, `npx expo export --platform web`, `npx expo export --platform android`.

## 9. Suggested Task Breakdown (6 review-gated tasks)

1. **Migration `0032`** — `analytics_executive_overview` + `analytics_service_categories` + `analytics_growth_timeseries` + `analytics_notification_delivery` + additive indexes + static schema test.
2. **`executive-analytics.ts` lib** — new RPC wrappers + types + TTL cache (+ timestamp) + `last90`/`this_year` presets + re-export of Slice-25 wrappers + tests.
3. **Executive presentational components** — `ExecutiveKpiCard`, `MetricSection`, `GrowthDeltaBadge` (+ reuse existing KPI/chart/table) + tests.
4. **Executive Dashboard screen** — `(admin-web)/analytics/index.tsx`: filter bar, Health + Activity + Operational + Growth + Service + Provider + Geographic sections, charts (reused), drill-down links, "Last Updated" indicator + refresh.
5. **Export future-ready stubs + performance/caching polish** — disabled CSV/Excel/PDF controls; cache tuning; ensure single-round-trip overview + bounded lists.
6. **Verification** — verification doc: as-role RLS/admin-only audit of every new RPC; reuse-not-duplicate proof (which metrics reuse Slice-25 vs new); no-schema-destructive / no-workflow / admin-only proofs; final gate; independent whole-branch review; pause before merge.

## 10. Review Checkpoints

- **Per task:** two-stage review (spec compliance + code quality). Guardrail greps each task: new RPCs are `is_admin()`-guarded SELECT-only; no write/trigger/RLS/DDL on business tables; no workflow file changed; admin-web only; reuse-not-duplicate honored.
- **Backend checkpoint (after T1):** confirm no duplicate calculation, additive-only DDL, `is_admin()` on every function, indexes `if not exists`.
- **Frontend checkpoint (after T4):** confirm metric-class separation is visible (Health vs Activity), charts reuse existing components, drill-downs preserved, "Last Updated" present.
- **Final:** independent whole-branch review (most-capable model) — architecture, scope compliance, security/RLS (admin-only), reuse-not-duplicate, performance, regression risk (existing analytics + no workflow change), code quality, tests, isolation. Fix only Critical/Important. Pause before merge.

## 11. Explicit Non-Goals

- No new business logic / duplicate calculations.
- No booking/payment/provider/wallet/notification/dispatch/ranking/payout workflow change.
- No schema/table/column/trigger/RLS change (only additive read-only RPCs + `if not exists` indexes).
- No exports implemented (future-ready UI only).
- No AI, recommendations, or predictive analytics.
- No customer-facing / provider-facing change; admin portal only.
- No materialized views this slice (future scale note only).
