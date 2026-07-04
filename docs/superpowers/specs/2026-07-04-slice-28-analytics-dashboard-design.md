# Slice 28 — Analytics Dashboard (Design Spec)

**Date:** 2026-07-04
**Status:** Approved design → (implementation plan NOT yet created — paused after spec)
**Builds on (reads only):** `bookings` (status/service_id/scheduled_for/created_at/customer_id/assigned_provider_id/address_label/latitude/longitude), `payments` (amount/provider_share/quickserve_share/status/paid_at + Slice-26/27 wallet_applied/promo_discount), `provider_earnings` (amount/payout_status), `wallet_transactions`, `promo_redemptions`, `profiles` (role/approval_status/average_rating/review_count), `reviews`, `booking_activity` (status-change timeline). Nothing is written.

---

## 1. Goal & Non-Goals

Give admins operational + business insight through a **read-only** analytics dashboard — executive KPIs, booking/financial/provider/service/geographic/customer analytics, charts, date-range filtering, and CSV export — **without changing any business logic**.

**Non-goals / out of scope (guardrails):** analytics are **display-only** and NEVER influence dispatch, provider ranking, or payouts; NO denormalized/cached/materialized tables, NO triggers, NO background jobs, NO business-logic change; NO auth/payment/wallet/tracking/dispatch/notification logic change. **Admin-only.** PDF export is documented as future-ready only (not built).

---

## 2. Architecture — SECURITY DEFINER read-only RPCs; admin-guarded; client charts + CSV

- **Aggregation lives in parameterized SECURITY DEFINER RPCs** (migration `0025`), each starting with `if not public.is_admin() then raise exception 'Admin only'; end if;` (SECURITY DEFINER bypasses RLS, so the guard is mandatory). Every RPC is a pure `SELECT` aggregation over existing tables — **no INSERT/UPDATE/DELETE, no triggers, no jobs, no materialized views, no cached tables.**
- **Date range is a parameter** (`p_from timestamptz, p_to timestamptz`), with an optional `p_bucket text ('day'|'week'|'month')` for time series (`date_trunc(p_bucket, ...)`). A pure client helper builds the ranges (Today / Last 7 / Last 30 / This month / Custom).
- **Client** (`src/lib/analytics.ts`) wraps each RPC (returns typed rows; `[]`/zeroed defaults on error). **Charts** are lightweight reusable components (contracts in §5). **CSV export** is a client util (flatten a dataset → CSV → share/download; native via expo-sharing/file-system, web via a blob download). **PDF export = future-ready** (documented signature, not implemented).
- **Screen:** a web-admin dashboard `src/app/(admin-web)/analytics/index.tsx` (+ a "Analytics" sidebar nav entry). Admin-web is the home (charts + export); a compact mobile-admin summary is optional/future.

---

## 3. Analytics catalog (metric → source → RPC)

Each RPC takes `(p_from, p_to[, p_bucket])` and is admin-guarded + read-only. **Revenue = `sum(payments.amount) where status='paid'` bucketed by `paid_at`; QuickServe revenue = `sum(quickserve_share)`; provider payouts = `sum(provider_earnings.amount)` (split by `payout_status`).**

### 3a. Executive KPIs — `analytics_kpis(p_from, p_to)` → one row
`revenue` (paid amount), `gross_bookings` (count created), `completed_bookings` (count status='completed'), `active_providers` (distinct `assigned_provider_id` with a booking in range), `active_customers` (distinct `customer_id` with a booking in range), `avg_booking_value` (`revenue / nullif(completed_bookings,0)`).

### 3b. Booking analytics
- `analytics_bookings_timeseries(p_from, p_to, p_bucket)` → rows `{ period, total, completed, cancelled }` (by day/week/month).
- `analytics_bookings_summary(p_from, p_to)` → `completion_rate` (completed/total), `cancellation_rate` (cancelled/total), `avg_completion_minutes` (avg of the `booking_activity` 'completed' event time − `bookings.created_at`; NULL when absent — best-effort), `pending`, `completed` counts.

### 3c. Financial analytics — `analytics_financial_timeseries(p_from, p_to, p_bucket)` → rows
`{ period, revenue (paid amount), provider_payouts (earnings), quickserve_revenue (quickserve_share), wallet_used (Σ |payment_applied| from wallet_transactions), promo_used (Σ promo_redemptions.discount_amount) }`. Plus a `analytics_financial_summary(p_from,p_to)` one-row totals for the KPI/trend cards.

### 3d. Provider analytics — `analytics_providers(p_from, p_to, p_limit int default 20)` → rows
`{ provider_id, full_name, completed_jobs, avg_rating (profiles.average_rating), total_earnings (Σ provider_earnings.amount), completion_rate }`. The client sorts for **Top providers** (earnings/jobs) and **Lowest-rated** (avg_rating asc, min review threshold). Ratings are **display-only** — never fed to dispatch/ranking.

### 3e. Service analytics — `analytics_services(p_from, p_to)` → rows
`{ service_id, bookings, revenue, avg_job_value, cancellation_rate }` (grouped by `service_id`; titles resolved client-side via `SERVICES`). Covers most-booked, revenue-by-service, avg job value, cancellation-by-service.

### 3f. Geographic analytics — `analytics_geography(p_from, p_to)` → rows
`{ area, bookings, revenue, active_providers }` grouped by a **locality proxy** = `coalesce(nullif(btrim(address_label),''), 'Unknown')`. **NOTE:** there is no structured `city` column; `address_label` (the Google-Places label from Slice 20) is the closest proxy. A precise city/region breakdown is **future-ready** (would need a structured `city` column — out of scope, no schema/business change here).

### 3g. Customer analytics — `analytics_customers(p_from, p_to)` → one row (+ optional new-customer timeseries)
`new_customers` (customers whose **first-ever** booking falls in range), `returning_customers` (customers with a booking in range AND a prior booking before `p_from`), `repeat_booking_rate` (customers with ≥2 lifetime bookings / total customers who booked in range), `retention_rate` (returning / active-in-range). All derived from `bookings` + `profiles` — read-only.

---

## 4. Filtering

A pure client helper `analyticsRange(preset, customFrom?, customTo?) → { from, to }`: **Today**, **Last 7 days**, **Last 30 days**, **This month**, **Custom range**. The selected range feeds every RPC; a bucket selector (day/week/month) drives the time series. No server state.

---

## 5. Charts (reusable components — contract level; rendering tech decided in the plan)

Token-driven, RN + RN-web safe, display-only:
- **`TrendCard`** `{ label, value, deltaPct?, direction? }` — a KPI tile with an optional up/down delta.
- **`BarChart`** `{ data: { label, value }[] }` — categorical bars (services, geography, providers).
- **`LineChart`** `{ series: { period, value }[] }` — time series (bookings/revenue over time).
- **`PieChart`** `{ slices: { label, value }[] }` — composition (bookings by status, revenue by service).
(Implementation may use scaled Views for bars/trend and `react-native-svg` for line/pie — a dependency/impl decision for the plan; both web + native exports must pass.)

---

## 6. Export

- **CSV (built):** `exportCsv(filename, rows)` — flatten a dataset (array of objects) to CSV and save/share (native: expo-file-system + expo-sharing; web: a Blob download). Each dashboard section offers a "Download CSV" for its underlying rows.
- **PDF (future-ready, documented not built):** a placeholder `exportPdf(...)` signature is described in `docs/pilot/analytics.md` for a later slice — no dependency or code this slice.

---

## 7. Backward Compatibility & Guardrails

- **Nothing writes.** Every RPC is `SELECT`-only, SECURITY DEFINER, `is_admin()`-guarded. No triggers/jobs/materialized/cached tables; no schema change to existing tables; migration `0025` adds **only** the read-only functions.
- Existing booking/payment/wallet/promo/notification/tracking/dispatch flows are **untouched** — analytics only read them. Ratings/earnings shown are **display-only** and never influence dispatch, ranking, or payouts.
- Admin-only (RPC guard + admin-web layout). Non-admin RPC calls raise. No auth/payment/wallet/tracking/notification logic change.
- Honest limits: `avg_completion_minutes` best-effort from `booking_activity`; geographic grouping by `address_label` proxy (precise city future-ready).

---

## 8. Testing

- **DB (`docs/pilot/analytics.md`):** each RPC returns correct aggregates for a seeded range (revenue = paid amount, completion/cancellation rates, provider/service/geography/customer groupings); **non-admin call raises 'Admin only'**; RPCs are read-only (no writes; no triggers/materialized created); bucket day/week/month; empty range → zeros/empty.
- **Lib (`analytics.test.ts`, mocked supabase):** each wrapper calls the right `rpc(name, args)` and maps rows / zeroed defaults on error; `analyticsRange` presets (Today/7/30/month/custom); `exportCsv` produces correct CSV (quoting, headers).
- **Components (RNTL):** TrendCard/BarChart/LineChart/PieChart render from sample data (+ empty states); the analytics screen renders KPIs + sections from mocked lib, the range/bucket filters re-query, and "Download CSV" calls `exportCsv`.
- **Gate:** `npm test`, `npx tsc --noEmit`, `expo export --platform web` + `--platform android`.

---

## 9. Deliverables

1. `supabase/migrations/0025_analytics.sql` — read-only, admin-guarded SECURITY DEFINER RPCs (`analytics_kpis`, `analytics_bookings_timeseries`/`_summary`, `analytics_financial_timeseries`/`_summary`, `analytics_providers`, `analytics_services`, `analytics_geography`, `analytics_customers`). No tables/triggers/materialized views.
2. `src/lib/analytics.ts` (+ tests) — typed RPC wrappers, `analyticsRange`, `exportCsv` (+ documented `exportPdf` future stub).
3. Chart components `TrendCard`/`BarChart`/`LineChart`/`PieChart` (+ tests).
4. `src/app/(admin-web)/analytics/index.tsx` — the dashboard (KPIs + the 6 analytic sections + charts + range/bucket filters + per-section CSV) + a "Analytics" sidebar nav entry.
5. `docs/pilot/analytics.md` — verification (RPC correctness, admin-only, read-only/no-writes), CSV notes, the future-ready PDF + precise-city notes, backward-compat/isolation; green gate.
