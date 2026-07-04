# Slice 28 — Admin Analytics: Operator & Verification Guide

Accurate as of migration `0025_analytics.sql` and commit range `5b15fec..HEAD`.

---

## 1. Overview

The Analytics system exposes a **read-only, admin-only** view of platform health via nine SECURITY DEFINER RPCs and a single-page dashboard in the admin web panel.

**Design invariants:**

- Every analytics RPC is `SECURITY DEFINER set search_path = public` and opens with the `is_admin()` guard — non-admin callers receive `ERROR P0001 Admin only`; the guard is mandatory because SECURITY DEFINER bypasses Row-Level Security.
- Every RPC body is `return query select ...` — no INSERT, UPDATE, or DELETE. The RPCs are strictly read aggregations.
- Migration `0025_analytics.sql` creates **functions only** — no tables, no indexes on business tables, no materialized views, no triggers, no jobs. Zero schema change to existing tables.
- The dashboard (`(admin-web)/analytics/index.tsx`) and the TypeScript lib (`src/lib/analytics.ts`) are display-only. They never feed dispatch, provider ranking, or payout decisions.
- No auth / payment / wallet / promo / notification / tracking workflow is modified. The analytics layer only reads those tables.

```
Admin opens analytics dashboard
    │
    └─ analyticsRange(preset) → { from, to }    (pure TS — no I/O)
            │
            └─ Promise.all([
                  analytics_kpis(from, to),
                  analytics_bookings_timeseries(from, to, bucket),
                  analytics_bookings_summary(from, to),
                  analytics_financial_timeseries(from, to, bucket),
                  analytics_financial_summary(from, to),
                  analytics_providers(from, to),
                  analytics_services(from, to),
                  analytics_geography(from, to),
                  analytics_customers(from, to),
               ])
               ↓ each RPC: is_admin() → SELECT aggregation → return rows
               ↓ zero writes; zero influence on dispatch/ranking/payouts
               ↓ display in TrendCards / BarChart / LineChart / PieChart
               ↓ "Download CSV" → exportCsv (Blob on web; Share.share native)
               ↓ "Download PDF" → exportPdf stub ("PDF export coming soon")
```

---

## 2. The 9 RPCs — Signatures, Purpose, and Sample Calls

All nine functions share the pattern: `language plpgsql security definer set search_path = public`.

### 2.1 `analytics_kpis(p_from, p_to)`

**Signature:**
```sql
analytics_kpis(p_from timestamptz, p_to timestamptz)
returns table(
  revenue             numeric,
  gross_bookings      int,
  completed_bookings  int,
  active_providers    int,
  active_customers    int,
  avg_booking_value   numeric
)
```

**Purpose:** Single-row KPI summary for a date range. Revenue = sum of paid payments by `paid_at`; gross bookings = all bookings created in range; `avg_booking_value = revenue / nullif(completed_bookings, 0)`.

**Sample call:**
```sql
select * from public.analytics_kpis(now() - interval '30 days', now());
-- Expected: 1 row
-- { revenue: 125000, gross_bookings: 48, completed_bookings: 35,
--   active_providers: 12, active_customers: 31, avg_booking_value: 3571.43 }
```

---

### 2.2 `analytics_bookings_timeseries(p_from, p_to, p_bucket)`

**Signature:**
```sql
analytics_bookings_timeseries(p_from timestamptz, p_to timestamptz, p_bucket text)
returns table(
  period    timestamptz,
  total     int,
  completed int,
  cancelled int
)
```

**Purpose:** Booking counts (total / completed / cancelled) bucketed by `'day'`, `'week'`, or `'month'` using `date_trunc`, ordered chronologically. Invalid bucket raises `'Invalid bucket'`.

**Sample call:**
```sql
select * from public.analytics_bookings_timeseries(
  now() - interval '7 days', now(), 'day'
);
-- Expected: 1–7 rows, each { period: timestamptz, total: int, completed: int, cancelled: int }

-- Invalid bucket raises:
select * from public.analytics_bookings_timeseries(now() - interval '7 days', now(), 'hour');
-- Expected: ERROR P0001 Invalid bucket
```

---

### 2.3 `analytics_bookings_summary(p_from, p_to)`

**Signature:**
```sql
analytics_bookings_summary(p_from timestamptz, p_to timestamptz)
returns table(
  completion_rate       numeric,
  cancellation_rate     numeric,
  avg_completion_minutes numeric,
  pending               int,
  completed             int
)
```

**Purpose:** One-row completion/cancellation rate summary. `avg_completion_minutes` is derived from `booking_activity.created_at` where `event_type = 'completed'` minus `bookings.created_at` (see § 7 on honest limits).

**Sample call:**
```sql
select * from public.analytics_bookings_summary(now() - interval '30 days', now());
-- Expected: 1 row
-- { completion_rate: 0.73, cancellation_rate: 0.10, avg_completion_minutes: 47.5,
--   pending: 5, completed: 35 }
```

---

### 2.4 `analytics_financial_timeseries(p_from, p_to, p_bucket)`

**Signature:**
```sql
analytics_financial_timeseries(p_from timestamptz, p_to timestamptz, p_bucket text)
returns table(
  period            timestamptz,
  revenue           numeric,
  provider_payouts  numeric,
  quickserve_revenue numeric,
  wallet_used       numeric,
  promo_used        numeric
)
```

**Purpose:** Revenue, provider payouts, QuickServe take, wallet usage, and promo discounts bucketed by `'day'`/`'week'`/`'month'`. Uses four CTEs (rev, pay, wal, promo) unified with a UNION ALL-periods + LEFT JOIN pattern (equivalent to FULL OUTER JOIN) so every occupied period appears with `coalesce(…, 0)` fill. Invalid bucket raises `'Invalid bucket'`.

**Sample call:**
```sql
select * from public.analytics_financial_timeseries(
  now() - interval '30 days', now(), 'week'
);
-- Expected: 1–5 rows each { period, revenue, provider_payouts,
--   quickserve_revenue, wallet_used, promo_used }
```

---

### 2.5 `analytics_financial_summary(p_from, p_to)`

**Signature:**
```sql
analytics_financial_summary(p_from timestamptz, p_to timestamptz)
returns table(
  revenue            numeric,
  provider_payouts   numeric,
  quickserve_revenue numeric,
  wallet_used        numeric,
  promo_used         numeric
)
```

**Purpose:** Same five financial totals as the timeseries but for the whole range with no bucketing — one row.

**Sample call:**
```sql
select * from public.analytics_financial_summary(now() - interval '30 days', now());
-- Expected: 1 row { revenue, provider_payouts, quickserve_revenue, wallet_used, promo_used }
```

---

### 2.6 `analytics_providers(p_from, p_to, p_limit)`

**Signature:**
```sql
analytics_providers(p_from timestamptz, p_to timestamptz, p_limit int default 20)
returns table(
  provider_id     uuid,
  full_name       text,
  completed_jobs  int,
  avg_rating      numeric,
  total_earnings  numeric,
  completion_rate numeric
)
```

**Purpose:** Provider leaderboard ordered by `total_earnings desc`. `avg_rating` is read from `profiles.average_rating` (display-only — never fed back to dispatch or ranking). Limit defaults to 20.

**Sample call:**
```sql
select * from public.analytics_providers(now() - interval '30 days', now(), 10);
-- Expected: up to 10 rows; each { provider_id, full_name, completed_jobs,
--   avg_rating, total_earnings, completion_rate }
```

---

### 2.7 `analytics_services(p_from, p_to)`

**Signature:**
```sql
analytics_services(p_from timestamptz, p_to timestamptz)
returns table(
  service_id        text,
  bookings          int,
  revenue           numeric,
  avg_job_value     numeric,
  cancellation_rate numeric
)
```

**Purpose:** Per-`service_id` aggregates — booking volume, paid revenue, average job value, and cancellation rate — ordered by bookings descending.

**Sample call:**
```sql
select * from public.analytics_services(now() - interval '30 days', now());
-- Expected: 1 row per service_id booked in range
-- { service_id: 'house_cleaning', bookings: 12, revenue: 36000,
--   avg_job_value: 3000, cancellation_rate: 0.08 }
```

---

### 2.8 `analytics_geography(p_from, p_to)`

**Signature:**
```sql
analytics_geography(p_from timestamptz, p_to timestamptz)
returns table(
  area             text,
  bookings         int,
  revenue          numeric,
  active_providers int
)
```

**Purpose:** Bookings, revenue, and active provider count grouped by area. Area is derived as `coalesce(nullif(btrim(b.address_label), ''), 'Unknown')` — the locality proxy (see § 7).

**Sample call:**
```sql
select * from public.analytics_geography(now() - interval '30 days', now());
-- Expected: 1 row per distinct area label; blanks/null collapse to 'Unknown'
-- { area: 'Westlands', bookings: 8, revenue: 24000, active_providers: 5 }
```

---

### 2.9 `analytics_customers(p_from, p_to)`

**Signature:**
```sql
analytics_customers(p_from timestamptz, p_to timestamptz)
returns table(
  new_customers        int,
  returning_customers  int,
  repeat_booking_rate  numeric,
  retention_rate       numeric
)
```

**Purpose:** Customer acquisition and retention stats for a date range — one row. Definitions: `new_customers` = in-range customers whose first-ever booking falls within `[p_from, p_to]`; `returning_customers` = in-range customers with at least one booking before `p_from`; `repeat_booking_rate` = in-range customers with ≥ 2 lifetime bookings / count(in-range); `retention_rate` = returning / count(in-range).

**Sample call:**
```sql
select * from public.analytics_customers(now() - interval '30 days', now());
-- Expected: 1 row
-- { new_customers: 18, returning_customers: 13, repeat_booking_rate: 0.46,
--   retention_rate: 0.42 }
```

---

## 3. Every RPC is SECURITY DEFINER + Admin-Guarded + SELECT-Only

### 3.1 Verify all 9 functions are SECURITY DEFINER

```sql
select proname, prosecdef
from pg_proc
where proname like 'analytics_%'
  and pronamespace = 'public'::regnamespace
order by proname;
-- Expected: exactly 9 rows; prosecdef = true for all 9
--   analytics_bookings_summary  | true
--   analytics_bookings_timeseries | true
--   analytics_customers         | true
--   analytics_financial_summary | true
--   analytics_financial_timeseries | true
--   analytics_geography         | true
--   analytics_kpis              | true
--   analytics_providers         | true
--   analytics_services          | true
```

### 3.2 Prove non-admin call raises 'Admin only'

```sql
-- As any non-admin user (role != 'admin' in profiles; is_admin() = false):
select * from public.analytics_kpis(now() - interval '30 days', now());
-- Expected: ERROR P0001 Admin only

-- Same applies to all 9 RPCs — each opens with:
--   if not public.is_admin() then raise exception 'Admin only'; end if;
```

### 3.3 Prove admin call returns rows and performs NO writes

```sql
-- As admin (is_admin() = true):
select * from public.analytics_kpis(now() - interval '30 days', now());
-- Expected: 1 row of aggregates (no error)

-- Verify no writes occurred — check pg_stat_user_tables for 0 inserts/updates/deletes:
select relname, n_tup_ins, n_tup_upd, n_tup_del
from pg_stat_user_tables
where relnamespace = 'public'::regnamespace
  and relname in ('bookings','payments','provider_earnings',
                  'wallet_transactions','promo_redemptions','profiles')
-- Run before and after an analytics_kpis call. Expected: all three counts unchanged.
-- (Every analytics RPC body is `return query select ...` — no DML.)
```

### 3.4 Inspect function bodies for SELECT-only content

```sql
select proname, prosrc
from pg_proc
where proname like 'analytics_%'
  and pronamespace = 'public'::regnamespace
order by proname;
-- Expected: each body contains ONLY:
--   - is_admin() guard
--   - (bucketed RPCs) bucket validation
--   - return query select ... (no INSERT, UPDATE, DELETE, or PERFORM writes)
```

---

## 4. No Analytics Tables, No Materialized Views, No Triggers, No Jobs

Migration `0025_analytics.sql` contains only `create or replace function` statements.

### 4.1 Verify no analytics tables were created

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name like 'analytics%';
-- Expected: 0 rows (migration 0025 created FUNCTIONS ONLY — no tables)
```

### 4.2 Verify no materialized views

```sql
select matviewname
from pg_matviews
where schemaname = 'public';
-- Expected: 0 rows for analytics; same count as before Slice 28
```

### 4.3 Verify no new triggers

```sql
select tgname, relname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relnamespace = 'public'::regnamespace
order by relname, tgname;
-- Expected: same trigger list as before Slice 28
-- analytics_* functions are not trigger functions (they return TABLE, not trigger)
```

### 4.4 Verify no cron/pg_cron jobs

```sql
-- If pg_cron is enabled:
select jobname, command from cron.job where command like '%analytics%';
-- Expected: 0 rows — no scheduled analytics jobs
```

### 4.5 Confirm 0025 is functions-only (structural check)

```sql
-- Run directly against the migration file content:
-- Confirm 0025_analytics.sql contains ONLY `create or replace function` statements.
-- No: CREATE TABLE, CREATE TRIGGER, CREATE MATERIALIZED VIEW, CREATE INDEX,
--     ALTER TABLE (on any business table), INSERT, UPDATE, DELETE.
select proname from pg_proc
where proname like 'analytics_%'
  and pronamespace = 'public'::regnamespace
order by proname;
-- Expected: exactly 9 rows (as above in § 3.1) — the full fruit of 0025
```

---

## 5. Date Ranges and Buckets

The TypeScript `analyticsRange` helper (in `src/lib/analytics.ts`) converts UI presets to ISO timestamp pairs.

| Preset | `from` | `to` |
|---|---|---|
| `today` | local midnight of `now` | `now` |
| `last7` | `now − 7 days` | `now` |
| `last30` | `now − 30 days` | `now` |
| `this_month` | first-of-month midnight of `now` | `now` |
| `custom` | `customFrom` (fallback: local midnight) | `customTo` (fallback: `now`) |

The `p_bucket` parameter is accepted by `analytics_bookings_timeseries` and `analytics_financial_timeseries`. Valid values are `'day'`, `'week'`, and `'month'`. Any other value is rejected:

```sql
select * from public.analytics_bookings_timeseries(
  now() - interval '7 days', now(), 'quarter'
);
-- Expected: ERROR P0001 Invalid bucket
```

The SQL implementation uses `date_trunc(p_bucket, ...)`, so results align to period boundaries (midnight UTC).

---

## 6. CSV Export — Formula-Injection Guard

Each dashboard section has a "Download CSV" button. On press it calls `exportCsv(filename, rows)`:

- **Web (`Platform.OS === 'web'`):** builds a `Blob` with MIME `text/csv`, creates an object URL, and triggers an `<a download>` click. The URL is revoked immediately after.
- **Native:** calls `Share.share({ message: csv })` from React Native. No new npm dependency is needed (Share is built-in).

The underlying `toCsv` helper applies an **RFC-4180 CSV formula-injection guard (CWE-1236)**:

> Analytics CSV cells carry user-controlled data — customer names, provider names, `address_label`, promo codes. A leading `=`, `+`, `-`, `@`, tab, or carriage return in a cell value can be executed as a spreadsheet formula by Excel or Google Sheets when an admin opens the export. To neutralise this, `escapeField` prefixes any such leading character with a single quote (`'`), causing spreadsheet applications to treat the cell as literal text.

```ts
// From src/lib/analytics.ts toCsv > escapeField:
if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
```

### Verify formula-injection guard in the function body

```sql
-- Inspect the escapeField implementation (code reference, not SQL):
-- src/lib/analytics.ts lines ~326-329
-- /^[=+\-@\t\r]/.test(str) → str = "'" + str
-- Neutralises: =SUM(A1), +1, -1, @SUM(), tab-prefixed, CR-prefixed
```

### Verify the guard via a unit test

```
npm test -- analytics --testNamePattern="formula"
-- Expected: all formula-injection assertions pass
--   '=SUM(A1)' → "=SUM(A1)"' (single-quote prefix)
--   '+1'       → "'+1"
--   etc.
```

`exportCsv` is **best-effort** — it wraps the entire operation in `try/catch` and never throws to the caller; a failed export silently returns.

---

## 7. Future-Ready PDF Stub

`exportPdf` (in `src/lib/analytics.ts`) is a documented placeholder:

```ts
export async function exportPdf(_filename: string, _rows: Record<string, unknown>[]): Promise<void> {
  console.warn('PDF export coming soon');
}
```

- **Not implemented** — calling it logs a warning and returns immediately.
- **No dependency added** — no PDF library is installed; `package.json` carries only the `react-native-svg` addition from T3.
- **Future-ready** — the signature matches `exportCsv` so swapping it for a real implementation requires no callers to change.

---

## 8. Honest Limits

### 8.1 Geographic grouping — `address_label` locality proxy

`analytics_geography` groups bookings by:

```sql
coalesce(nullif(btrim(b.address_label), ''), 'Unknown') as area
```

The `bookings.address_label` column contains a free-text location string entered by the customer (or resolved from coordinates). There is **no structured `city` column**. This means:

- Areas may vary by text variation ("Westlands", "westlands", "Westlands, Nairobi") and will appear as separate groups.
- Blank or null labels are collapsed to `'Unknown'`.
- Precise city-level grouping is future-ready once a structured `city` column is added to `bookings`.

### 8.2 `avg_completion_minutes` — best-effort from `booking_activity`

`analytics_bookings_summary` computes:

```sql
avg(extract(epoch from (ca.done_at - b2.created_at)) / 60.0)
-- where done_at = min(booking_activity.created_at) where event_type = 'completed'
```

This is **best-effort** because:

- It relies on a row in `booking_activity` with `event_type = 'completed'` existing for each completed booking. Bookings that lack this row are excluded from the average.
- `created_at` on `booking_activity` is the event record time, not a driver-reported completion time.
- The result is `null` (not 0) when no matching activity rows exist in the range.

---

## 9. Display-Only — No Influence on Dispatch, Ranking, or Payouts

The analytics dashboard and all 9 RPCs are **strictly read aggregations**. They never:

- Feed the `assignProvider` / dispatch flow.
- Modify or consume the provider ranking algorithm.
- Affect `provider_earnings`, `provider_share`, `quickserve_share`, or any payout calculation.
- Write to any table.

The provider leaderboard in the dashboard (`analytics_providers`) reads `profiles.average_rating` and `provider_earnings.amount` for display only. These values are computed by the existing earnings/ratings system and are shown to the admin as-is; the analytics RPC does not update them.

### Verify no-influence (import audit)

```bash
grep -rl "@/lib/analytics" src/
# Expected output:
#   src/app/(admin-web)/analytics/index.tsx   ← dashboard (display only)
#   src/lib/analytics.test.ts                 ← test file
#   src/__tests__/admin-web-analytics.test.tsx ← test file
# NOT found in: bookings.ts, payments.ts, dispatch, assignProvider, earnings, notifications, auth
```

---

## 10. No Workflow Change

Slice 28 **does not modify** any of the following:

- Auth flows (`src/auth/**`) — untouched.
- Payment flows (`pay_payment`, M-Pesa STK push, `create_earning_on_paid`, `override_payment_status`) — untouched.
- Wallet RPCs (`apply_wallet_to_payment`, `admin_wallet_adjust`, `_wallet_post`) — untouched.
- Promo RPCs (`redeem_promo`) — untouched.
- Notification triggers (`tg_notify_payment_paid`, etc.) — untouched.
- Tracking / ChatThread — untouched.
- `assignProvider` / dispatch logic — untouched.
- Any migration other than `0025_analytics.sql` — no other migration added.

The analytics layer only reads `bookings`, `payments`, `provider_earnings`, `wallet_transactions`, `promo_redemptions`, and `profiles` — it does not mutate them.

---

## 11. Rollback Plan

### Option A — Per-task git revert (UI hidden; RPCs dormant but inert)

Revert newest-first. The RPCs remain in the DB but are called by nothing — fully inert because no business code imports `@/lib/analytics`.

Order (newest first):

1. `bc5717a` — admin analytics dashboard + nav sidebar entry (T4)
2. `42a65c5` — chart components (T3)
3. `99dfc4d` — CSV formula-injection fix (between T2 and T3)
4. `fdcf625` — analytics lib wrappers + range + CSV (T2)
5. `39c2732` — 0025 analytics RPCs (T1)

Reverting `bc5717a` alone removes the dashboard and sidebar link — the safest single-task rollback. The RPCs sit unused in the DB; they perform no work until called.

### Forward rollback migration: `0026_rollback_analytics.sql`

If the RPCs must also be removed, run after reverting application code:

```sql
-- Drop all 9 analytics RPCs (safe — no table/trigger/matview was created by 0025)
drop function if exists public.analytics_kpis(timestamptz, timestamptz);
drop function if exists public.analytics_bookings_timeseries(timestamptz, timestamptz, text);
drop function if exists public.analytics_bookings_summary(timestamptz, timestamptz);
drop function if exists public.analytics_financial_timeseries(timestamptz, timestamptz, text);
drop function if exists public.analytics_financial_summary(timestamptz, timestamptz);
drop function if exists public.analytics_providers(timestamptz, timestamptz, int);
drop function if exists public.analytics_services(timestamptz, timestamptz);
drop function if exists public.analytics_geography(timestamptz, timestamptz);
drop function if exists public.analytics_customers(timestamptz, timestamptz);
```

This migration is safe at any time because:

- No analytics tables, triggers, materialized views, or indexes were created — nothing extra to drop.
- All business tables (`bookings`, `payments`, `provider_earnings`, `wallet_transactions`, `promo_redemptions`, `profiles`) are **unaffected** — no schema change was made to them.
- `pay_payment`, `create_earning_on_paid`, `override_payment_status`, `trg_create_earning_on_paid`, `assignProvider`, and all wallet/promo RPCs are **untouched**.
- All business data and flows continue unaffected after dropping the RPCs.

---

## 12. Isolation Diff

`git diff 5b15fec..HEAD --stat` (run 2026-07-04):

```
 package-lock.json                               | 157 +++++++
 package.json                                    |   1 +
 src/__tests__/admin-web-analytics.test.tsx      | 348 ++++++++++++++
 src/app/(admin-web)/analytics/index.tsx         | 588 ++++++++++++++++++++++++
 src/components/admin-web/admin-sidebar.tsx      |   1 +
 src/components/admin-web/charts/bar-chart.tsx   | 193 ++++++++
 src/components/admin-web/charts/charts.test.tsx | 231 ++++++++++
 src/components/admin-web/charts/line-chart.tsx  | 210 +++++++++
 src/components/admin-web/charts/pie-chart.tsx   | 270 +++++++++++
 src/components/admin-web/charts/trend-card.tsx  | 104 +++++
 src/lib/analytics.test.ts                       | 520 +++++++++++++++++++++
 src/lib/analytics.ts                            | 374 +++++++++++++++
 supabase/migrations/0025_analytics.sql          | 448 ++++++++++++++++++
 13 files changed, 3445 insertions(+)
```

### Files changed — all in scope

| File | Task | Purpose |
|---|---|---|
| `supabase/migrations/0025_analytics.sql` | T1 | 9 read-only admin analytics RPCs (functions only) |
| `src/lib/analytics.ts` | T2 + security fix | Types + 9 RPC wrappers + analyticsRange + toCsv (formula-injection guard) + exportCsv + exportPdf stub |
| `src/lib/analytics.test.ts` | T2 + security fix | 49 tests: 9 wrapper calls/error-defaults, analyticsRange presets, toCsv (13 escaping cases + 6 formula-injection assertions) |
| `src/components/admin-web/charts/trend-card.tsx` | T3 | TrendCard display component (pure, no data fetch) |
| `src/components/admin-web/charts/bar-chart.tsx` | T3 | BarChart SVG component (pure presentational) |
| `src/components/admin-web/charts/line-chart.tsx` | T3 | LineChart SVG component (pure presentational) |
| `src/components/admin-web/charts/pie-chart.tsx` | T3 | PieChart SVG donut component (pure presentational) |
| `src/components/admin-web/charts/charts.test.tsx` | T3 | 25 chart component tests |
| `package.json` | T3 | +`react-native-svg` 15.15.4 (Expo SDK-56 pinned) |
| `package-lock.json` | T3 | Lock file updated for react-native-svg |
| `src/app/(admin-web)/analytics/index.tsx` | T4 | Full analytics dashboard (preset/bucket/date-range + 6 sections + per-section CSV) |
| `src/__tests__/admin-web-analytics.test.tsx` | T4 | 17 dashboard tests |
| `src/components/admin-web/admin-sidebar.tsx` | T4 | +1 Analytics nav entry |

### Out-of-scope files — confirmed absent from diff

- `supabase/migrations/0010_payments.sql` — NOT in diff (pay_payment / create_earning_on_paid / provider_share unchanged)
- Any migration other than `0025_analytics.sql` — NOT in diff
- `src/auth/**` — NOT in diff
- `supabase/functions/mpesa-stk-push/**` — NOT in diff
- `src/app/booking/[id].tsx` — NOT in diff
- `src/lib/payments.ts` / `src/lib/wallet.ts` / `src/lib/promotions.ts` — NOT in diff
- Any chat / ChatThread / tracking file — NOT in diff
- `provider_earnings` / `provider_share` / `quickserve_share` / `payments_shares_check` — NOT in diff
- `assignProvider` / dispatch / ranking / payout logic — NOT in diff

### `0025_analytics.sql` structural verification

The migration file (448 lines) contains exactly 9 `create or replace function` blocks:

```bash
grep -c "^create or replace function" supabase/migrations/0025_analytics.sql
# Expected: 9
```

No `CREATE TABLE`, `CREATE TRIGGER`, `CREATE MATERIALIZED VIEW`, `CREATE INDEX`, `ALTER TABLE`, `INSERT`, `UPDATE`, or `DELETE` statements appear.

### No-influence audit result

```bash
grep -rl "@/lib/analytics" src/
# Result:
#   src/app/(admin-web)/analytics/index.tsx    ← display-only dashboard
#   src/lib/analytics.test.ts
#   src/__tests__/admin-web-analytics.test.tsx
# Absent from: bookings.ts, payments.ts, wallet.ts, promotions.ts,
#   assignProvider, dispatch, earnings, notifications, auth, tracking
```

Isolation: **CLEAN** — only analytics files changed; no business/schema/dispatch/auth change.

---

## 13. Final Gate Results (2026-07-04)

| Check | Result |
|---|---|
| `npm test` | PASS — 130 suites, 1129 tests, 0 failures |
| `npx tsc --noEmit` | PASS — no errors |
| `npx expo export --platform web` | PASS — exported to `dist/` |
| `npx expo export --platform android` | PASS — exported to `dist/` |
| `git status` (after doc commit) | CLEAN — only `supabase/.temp/` untracked |

---

## 14. Operator Checklist — Deploying Slice 28

### Pre-deploy

- [ ] Slices 26 (`0023_wallet.sql`) and 27 (`0024_promotions.sql`) must already be applied (analytics RPCs reference `wallet_transactions` and `promo_redemptions`).
- [ ] Apply migration `0025_analytics.sql` via Supabase SQL Editor or `supabase db push`.

### Post-deploy verification

```sql
-- 1. Confirm all 9 analytics RPCs exist
select proname from pg_proc
where proname like 'analytics_%'
  and pronamespace = 'public'::regnamespace
order by proname;
-- Expected: 9 rows

-- 2. Confirm all 9 are SECURITY DEFINER
select proname, prosecdef from pg_proc
where proname like 'analytics_%'
  and pronamespace = 'public'::regnamespace
order by proname;
-- Expected: all prosecdef = true

-- 3. Confirm no analytics tables created
select table_name from information_schema.tables
where table_schema = 'public' and table_name like 'analytics%';
-- Expected: 0 rows

-- 4. Confirm no new materialized views
select matviewname from pg_matviews where schemaname = 'public';
-- Expected: same as before Slice 28

-- 5. Smoke test — non-admin blocked
-- (As a non-admin user:)
select * from public.analytics_kpis(now() - interval '30 days', now());
-- Expected: ERROR P0001 Admin only

-- 6. Smoke test — admin returns data
-- (As admin:)
select * from public.analytics_kpis(now() - interval '30 days', now());
-- Expected: 1 row (no error)

-- 7. Confirm invalid bucket raises
select * from public.analytics_bookings_timeseries(
  now() - interval '7 days', now(), 'hour'
);
-- Expected: ERROR P0001 Invalid bucket

-- 8. Confirm pre-Slice-28 functions unchanged
select proname from pg_proc
where proname in ('pay_payment', 'create_earning_on_paid',
                  'override_payment_status', 'apply_wallet_to_payment',
                  'redeem_promo')
  and pronamespace = 'public'::regnamespace;
-- Expected: 5 rows (all present and unchanged)
```
