# Slice 28 — Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only, admin-only web-admin analytics dashboard — executive KPIs + booking/financial/provider/service/geographic/customer analytics, charts, date-range filtering, and CSV export — with zero business-logic change.

**Architecture:** All aggregation is in parameterized, admin-guarded, read-only SECURITY DEFINER RPCs (migration `0025`, functions only). A client lib wraps them; a range helper + CSV util + lightweight chart components feed a web-admin dashboard. Nothing writes; nothing influences dispatch/ranking/payouts.

**Tech Stack:** Supabase (Postgres SECURITY DEFINER SELECT-only RPCs), Expo RN + TS, Expo Router, Jest + RNTL.

## Global Constraints

- **Read-only + admin-only:** every RPC is a pure `SELECT` aggregation, `security definer set search_path = public`, and STARTS with `if not public.is_admin() then raise exception 'Admin only'; end if;` (DEFINER bypasses RLS → the guard is mandatory). **No INSERT/UPDATE/DELETE, no triggers, no background jobs, no cached tables, no materialized views.** Migration `0025` adds ONLY functions — no schema change to existing tables.
- **No business-logic change / no workflow change** — analytics only READ `bookings`/`payments`/`provider_earnings`/`wallet_transactions`/`promo_redemptions`/`profiles`/`reviews`/`booking_activity`. Ratings/earnings shown are **display-only** — they NEVER feed dispatch, provider ranking, or payouts. No auth/payment/wallet/promo/notification/tracking change.
- **Revenue definitions:** revenue = `sum(payments.amount) where status='paid'` (bucket by `paid_at`); QuickServe revenue = `sum(quickserve_share)`; provider payouts = `sum(provider_earnings.amount)` (split by `payout_status`); wallet usage = `Σ |amount|` of `wallet_transactions` type `payment_applied`; promo usage = `Σ promo_redemptions.discount_amount`.
- **Honest limits:** geographic grouping uses the `address_label` locality proxy (no structured `city` column — precise city is future-ready); `avg_completion_minutes` is best-effort from the `booking_activity` 'completed' event − `bookings.created_at`.
- **PDF export = future-ready only** (documented signature, no dependency/code). CSV export is built.
- Gate every task: `npm test` green, `npx tsc --noEmit` clean, `expo export --platform web` AND `--platform android` succeed.

---

## File Structure

**Create**
- `supabase/migrations/0025_analytics.sql` — the read-only admin-guarded RPCs.
- `src/lib/analytics.ts` (+ `analytics.test.ts`) — RPC wrappers, `analyticsRange`, `exportCsv` (+ documented `exportPdf` stub).
- `src/components/admin-web/charts/{trend-card,bar-chart,line-chart,pie-chart}.tsx` (+ tests).
- `src/app/(admin-web)/analytics/index.tsx` — the dashboard.
- `docs/pilot/analytics.md` — verification doc.

**Modify**
- `src/components/admin-web/admin-sidebar.tsx` — "Analytics" nav entry.

**Reuse (do not modify):** `is_admin()`, `SERVICES` (service titles), `formatKes`, `DataTable`/`PageMeta`, all business tables/flows.

---

## Task Order (dependency-ordered)

1. **T1** — Migration `0025`: all analytics RPCs (KPIs, bookings, financial, providers, services, geography, customers).
2. **T2** — `src/lib/analytics.ts` wrappers + `analyticsRange` + `exportCsv` (+ `exportPdf` future stub) (+ tests).
3. **T3** — Chart components `TrendCard`/`BarChart`/`LineChart`/`PieChart` (+ tests).
4. **T4** — Web-admin analytics dashboard (KPIs + 6 sections + filters + per-section CSV) + sidebar nav (+ tests).
5. **T5** — Verification `docs/pilot/analytics.md` + admin-only/read-only + backward-compat + isolation + final gate.

Each task ends green (tests / tsc / both exports).

---

### Task 1: Migration `0025_analytics.sql`

**Files:** Create `supabase/migrations/0025_analytics.sql`

**Build (all `security definer set search_path = public`, each opens with the `is_admin()` guard; SELECT-only):**
- **`analytics_kpis(p_from timestamptz, p_to timestamptz)`** `returns table(revenue numeric, gross_bookings int, completed_bookings int, active_providers int, active_customers int, avg_booking_value numeric)` — revenue = paid `amount` in range (by `paid_at`); gross = bookings created in range; completed = status='completed' created in range; active_providers/customers = distinct ids on bookings in range; avg = `revenue / nullif(completed_bookings,0)`.
- **`analytics_bookings_timeseries(p_from, p_to, p_bucket text)`** `returns table(period timestamptz, total int, completed int, cancelled int)` — `date_trunc(p_bucket, created_at)` group; guard `p_bucket in ('day','week','month')`.
- **`analytics_bookings_summary(p_from, p_to)`** `returns table(completion_rate numeric, cancellation_rate numeric, avg_completion_minutes numeric, pending int, completed int)` — rates over total in range; `avg_completion_minutes` = avg over bookings of `(ba.completed_at − b.created_at)` where `ba` = the `booking_activity` row with `event_type='completed'` (or `new.status`), in minutes; NULL-safe.
- **`analytics_financial_timeseries(p_from, p_to, p_bucket)`** `returns table(period timestamptz, revenue numeric, provider_payouts numeric, quickserve_revenue numeric, wallet_used numeric, promo_used numeric)` — join/aggregate payments (paid, by `paid_at`), `provider_earnings`, `wallet_transactions` (`payment_applied`), `promo_redemptions`, each bucketed.
- **`analytics_financial_summary(p_from, p_to)`** `returns table(revenue numeric, provider_payouts numeric, quickserve_revenue numeric, wallet_used numeric, promo_used numeric)` — one-row totals.
- **`analytics_providers(p_from, p_to, p_limit int default 20)`** `returns table(provider_id uuid, full_name text, completed_jobs int, avg_rating numeric, total_earnings numeric, completion_rate numeric)` — per assigned provider over range; `avg_rating` from `profiles.average_rating`; `order by total_earnings desc limit p_limit` (client re-sorts for top / lowest-rated).
- **`analytics_services(p_from, p_to)`** `returns table(service_id text, bookings int, revenue numeric, avg_job_value numeric, cancellation_rate numeric)` — group by `service_id`.
- **`analytics_geography(p_from, p_to)`** `returns table(area text, bookings int, revenue numeric, active_providers int)` — group by `coalesce(nullif(btrim(address_label),''),'Unknown')`.
- **`analytics_customers(p_from, p_to)`** `returns table(new_customers int, returning_customers int, repeat_booking_rate numeric, retention_rate numeric)` — new = first-ever booking in range; returning = booked in range AND has a prior booking before `p_from`; repeat rate = customers with ≥2 lifetime bookings / customers booking in range; retention = returning / active-in-range.

**Checks:** SQL well-formed; `npm test` (~1038), `tsc`, both exports. Commit `feat: slice28 read-only admin analytics RPCs (0025)`.
> DB not applied locally — behavioral aggregate/admin-guard verify in T5.

---

### Task 2: `src/lib/analytics.ts` wrappers + range + CSV

**Files:** Create `src/lib/analytics.ts` (+ `analytics.test.ts`)

**Build:**
- Row types per RPC (`AnalyticsKpis`, `BookingsPoint`, `BookingsSummary`, `FinancialPoint`, `FinancialSummary`, `ProviderStat`, `ServiceStat`, `GeoStat`, `CustomerStats`).
- One wrapper per RPC — e.g. `getAnalyticsKpis(from, to)` → `rpc('analytics_kpis', { p_from, p_to })` → `data?.[0] ?? <zeroed>`; timeseries → `data ?? []`; `getAnalyticsProviders(from, to, limit)` etc. All `[]`/zeroed on error (safe).
- **`analyticsRange(preset: 'today'|'last7'|'last30'|'this_month'|'custom', customFrom?, customTo?): { from: string; to: string }`** — pure; returns ISO bounds (local day boundaries). `Bucket = 'day'|'week'|'month'`.
- **`exportCsv(filename: string, rows: Record<string, unknown>[]): Promise<void>`** — build CSV (header from keys, RFC-4180 quoting/escaping); web → Blob + anchor download; native → `expo-file-system` write + `expo-sharing` share (best-effort; no throw). A pure `toCsv(rows): string` inner fn for unit tests.
- **`exportPdf` future stub:** an exported `exportPdf` that throws/logs "PDF export coming soon" (documented; not wired to UI) — so the future contract exists without a dependency.

**Tests:** each wrapper calls the right `rpc(name, {p_from,p_to,...})` + maps row/`[]`/zeroed on error; `analyticsRange` presets produce correct bounds (fixed `now`); `toCsv` (headers, comma/quote/newline escaping, empty → header-only or '').

**Steps:** TDD → `tsc` → commit `feat: slice28 analytics lib (wrappers, range, CSV)`.

---

### Task 3: Chart components

**Files:** Create `src/components/admin-web/charts/{trend-card,bar-chart,line-chart,pie-chart}.tsx` (+ tests)

**Build (token-driven, RN + RN-web safe, display-only):**
- **`TrendCard`** `{ label; value; deltaPct?; direction? }` — KPI tile (value + optional ▲/▼ delta color).
- **`BarChart`** `{ data: { label; value }[]; testID? }` — horizontal/vertical bars as scaled Views (width/height = value/max); label + value per bar; empty state.
- **`LineChart`** `{ series: { period; value }[] }` — a simple polyline. Use `react-native-svg` (add the dep if not present — Expo-supported, RN + web safe) OR a lightweight scaled-dots/segments View fallback; pick ONE and keep both exports green. Empty state.
- **`PieChart`** `{ slices: { label; value }[] }` — composition; svg arcs or a stacked-bar approximation (whichever the LineChart choice implies). Empty state + a legend.
(If `react-native-svg` is chosen, verify `expo export --platform web` AND `--platform android` both succeed before committing.)

**Tests:** each renders from sample data (labels/values present) + an empty state; no business calls.

**Steps:** TDD → `tsc` → both exports (svg check) → commit `feat: slice28 chart components`.

---

### Task 4: Web-admin analytics dashboard + nav

**Files:** Create `src/app/(admin-web)/analytics/index.tsx`; Modify `src/components/admin-web/admin-sidebar.tsx`; Test `admin-web-analytics.test.tsx`

**Build (mirror `(admin-web)/reviews`/`promos` screens):**
- **Filter controls:** a preset row (Today / Last 7 / Last 30 / This month / Custom) + (for Custom) two date inputs → `analyticsRange`; a bucket selector (day/week/month) for the time series. Changing filters re-queries all sections.
- On mount / filter change, load all wrappers for the range; render:
  - **Executive KPIs** — `TrendCard`s (revenue, gross bookings, completed, active providers, active customers, avg booking value) via `getAnalyticsKpis`.
  - **Booking analytics** — `LineChart` (bookings timeseries) + summary cards (completion/cancellation rate, avg completion, pending vs completed).
  - **Financial analytics** — `LineChart` (revenue/payouts/quickserve over time) + summary cards (wallet used, promo used).
  - **Provider analytics** — `DataTable`/`BarChart`: Top providers (by earnings/jobs) + Lowest-rated (avg_rating asc) from `getAnalyticsProviders`.
  - **Service analytics** — `BarChart`/table: most booked, revenue, avg value, cancellation rate (`getAnalyticsServices`; titles via `SERVICES`).
  - **Geographic analytics** — `BarChart`/table by `area` (`getAnalyticsGeography`).
  - **Customer analytics** — `TrendCard`s: new / returning / retention / repeat rate (`getAnalyticsCustomers`).
  - **Per-section "Download CSV"** → `exportCsv(<section>.csv, rows)`.
- **`admin-sidebar.tsx`:** add `{ label: 'Analytics', route: '/(admin-web)/analytics', segment: 'analytics' }` to `NAV_ITEMS`.
- Display-only — no mutations, no dispatch/ranking/payout influence.

**Tests:** `admin-web-analytics.test.tsx` — mock `@/lib/analytics` (all wrappers → fixtures); the dashboard renders KPIs + each section (a value from each) after `waitFor`; changing the preset re-calls the wrappers with new bounds; "Download CSV" calls `exportCsv`. Keep other admin-web tests green (NAV_ITEM additive — update a sidebar count assertion minimally if any).

**Steps:** `expo export --platform android` (new route) → `tsc` → `npm test` → `expo export --platform web` → commit `feat: slice28 web-admin analytics dashboard + nav`.

---

### Task 5: Verification, admin-only/read-only, backward-compat, isolation, final gate

**Files:** Create `docs/pilot/analytics.md`

- **Verification (documented SQL + manual):** each RPC returns correct aggregates for a seeded range (revenue = Σ paid amount; completion/cancellation rates; provider/service/geography/customer groupings; financial split); **a non-admin call raises 'Admin only'**; the RPCs are **read-only** (running them performs NO writes; `0025` created NO tables/triggers/materialized views — `select ... from pg_matviews` / `pg_trigger` shows none added); bucket day/week/month; empty range → zeros/empty. Note the `address_label` city-proxy + best-effort completion-time + future-ready PDF.
- **Backward-compat:** existing booking/payment/wallet/promo/notification/tracking flows unchanged (analytics only read); no schema change to existing tables.
- **Isolation:** `git diff <base>..HEAD --stat` — only analytics files changed; migration `0025` contains ONLY `create function` (no `create table`/`trigger`/`materialized view`/`create/alter` on business tables); NO change to `bookings`/`payments`/`wallet`/`promo`/`notification`/`tracking`/dispatch/auth code.
- **No-influence audit:** confirm no analytics output feeds `assignProvider`/dispatch/ranking/payout code (grep — analytics lib is consumed only by the dashboard).
- **Final gate:** `expo export` web + android, `tsc` clean, `npm test` green, `git status` clean.
- Commit `test: slice28 analytics verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-28-analytics`. Abandon = `git checkout main` + delete branch.
- **Per-task revert:** independent commits — `git revert <commit>` rolls back one. Reverting T4 removes the dashboard + nav; T3 the charts; T2 the lib — the RPCs go unused (harmless, read-only).
- **Disable without schema revert:** revert the T4 commit → the dashboard + nav disappear; the `0025` functions remain but are never called (inert, read-only, admin-guarded).
- **Schema rollback:** forward-only `0026_rollback_analytics.sql` — `drop function` each analytics RPC. No tables/triggers to drop (none were created); nothing else references them; all business data/flows unaffected.
- **No business-table / trigger / job / workflow involvement** — rollback is confined to the read-only functions + the dashboard/lib/charts.

---

## Self-Review

- **Spec coverage:** all 9 RPCs incl KPIs/booking/financial/provider/service/geography/customer (T1); lib wrappers + `analyticsRange` + `exportCsv` + `exportPdf` stub (T2); TrendCard/BarChart/LineChart/PieChart (T3); dashboard with KPI cards + 6 sections + filters + per-section CSV + nav (T4); verification + admin-only/read-only + no-writes + backward-compat + isolation + no-influence audit (T5). Read-only + admin-guard (T1 `is_admin()`; T5 verify). No cached/materialized/triggers/jobs (T1 functions-only; T5 audit). No business-logic/workflow change + no dispatch/ranking/payout influence (constraints; T5 isolation + no-influence audit). Future-ready PDF (T2 stub; T5 doc).
- **Placeholder scan:** none; concrete SQL signatures/return-columns + tests per task.
- **Name consistency:** RPC names `analytics_kpis`/`analytics_bookings_timeseries`/`_summary`/`analytics_financial_timeseries`/`_summary`/`analytics_providers`/`analytics_services`/`analytics_geography`/`analytics_customers` (T1) ↔ wrappers `getAnalytics*` (T2) ↔ dashboard (T4); `analyticsRange`/`exportCsv`/`toCsv` (T2) used by T4; chart component names (T3) consumed by T4; reuses `is_admin()`/`SERVICES`/`formatKes`/`DataTable`.
