# Slice 38 — Executive Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin Executive Analytics Dashboard that aggregates existing platform data (reusing the Slice-25 analytics RPCs) with a small composite overview RPC, three gap RPCs, a cached wrapper lib, and a dashboard screen — no new business logic, no schema changes.

**Architecture:** One additive migration (`0032`) adds a composite `analytics_executive_overview` RPC plus three gap RPCs (`analytics_service_categories`, `analytics_growth_timeseries`, `analytics_notification_delivery`) and additive `if not exists` indexes — all `security definer` / `is_admin()` / SELECT-only, mirroring `0025_analytics.sql`. A new `src/lib/executive-analytics.ts` wraps them with a short TTL cache and reuses the Slice-25 wrappers. The executive overview becomes `(admin-web)/analytics/index.tsx`; the existing detailed analytics screen is relocated to `(admin-web)/analytics/detailed.tsx` as a drill-down.

**Tech Stack:** Expo React Native + Expo Router (admin-web), TypeScript, Supabase Postgres RPCs, Jest. Reuses `components/admin-web/charts/{bar,line,pie}-chart.tsx`, `trend-card.tsx`, `data-table.tsx`, `page-meta.tsx`.

## Global Constraints

- **Aggregate existing data only; no duplicate business logic.** Reuse Slice-25 RPCs; add SQL only for genuine gaps.
- **No schema changes** beyond additive read-only RPCs + `create index if not exists`. No table/column/trigger/RLS modification; no destructive DDL; no writes.
- **Every new RPC:** `language plpgsql security definer set search_path = public`, opens with `if not public.is_admin() then raise exception 'Admin only'; end if;`, then SELECT-only.
- **Two metric classes:** health snapshots (`current_*`, filter-independent) vs range-scoped activity. Active customers/providers = distinct with a **non-cancelled** booking (active or completed) in the **trailing 30 days** (now-relative). Current Platform Rating = `avg(reviews.rating)` over all reviews; `period_avg_rating` = avg over range.
- **Exact tokens (verified in-repo):** commission = `payments.quickserve_share`; paid revenue = `payments.amount where status='paid' and paid_at in range`; booking statuses = `pending,accepted,provider_assigned,on_the_way,in_progress,completed,cancelled` (active = not completed/cancelled); `wallets.balance`; `support_cases(case_type in ('support','dispute'), status)` open = `status not in ('resolved','closed')`; `notifications.push_status in ('pending','sent','skipped','no_token','failed')`; `profiles(role,created_at)`; `payment_attempts.status='failed'`; `reviews(rating,created_at)`; `booking_activity.event_type` = the new status string; bookings→service via `bookings.service_id = services.slug`, `services.category_id → service_categories(id,name)`.
- **Admin-web only.** No customer/provider/native change. No booking/payment/provider/wallet/notification/dispatch/ranking/payout workflow change. No AI/recommendations/predictions.
- **Exports:** future-ready **disabled** UI only — not implemented.
- **Gate per task:** `npm test`, `npx tsc --noEmit`, `npx expo export --platform web`, `npx expo export --platform android`. Baseline: **2881 tests** (Slice-37 head). If `package-lock.json` drifts, `git checkout -- package-lock.json` before committing.

Spec: `docs/superpowers/specs/2026-07-09-slice-38-executive-analytics-dashboard-design.md`

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/0032_executive_analytics.sql` | composite overview RPC + 3 gap RPCs + additive indexes | 1 |
| `src/__tests__/executive-analytics-schema.test.ts` | static invariants over the migration | 1 |
| `src/lib/executive-analytics.ts` | RPC wrappers, types, TTL cache, `executiveRange` presets | 2 |
| `src/lib/executive-analytics.test.ts` | wrapper/cache/range unit tests | 2 |
| `src/components/admin-web/analytics/executive-kpi-card.tsx` | KPI card (snapshot vs period tag) | 3 |
| `src/components/admin-web/analytics/metric-section.tsx` | titled section wrapper | 3 |
| `src/components/admin-web/analytics/growth-delta-badge.tsx` | period delta badge | 3 |
| `src/components/admin-web/analytics/*.test.tsx` | component tests | 3 |
| `src/app/(admin-web)/analytics/index.tsx` | Executive Dashboard (replaces old index content) | 4 |
| `src/app/(admin-web)/analytics/detailed.tsx` | relocated Slice-25 detailed analytics (drill-down) | 4 |
| `src/app/(admin-web)/analytics/executive-dashboard.test.tsx` | dashboard screen test | 4 |
| `src/components/admin-web/analytics/export-menu.tsx` | future-ready disabled export controls | 5 |
| `docs/pilot/executive-analytics-verification.md` | verification doc | 6 |

---

### Task 1: Migration 0032 — overview RPC + gap RPCs + indexes + static test

**Files:**
- Create: `supabase/migrations/0032_executive_analytics.sql`
- Test: `src/__tests__/executive-analytics-schema.test.ts`

**Interfaces — Produces (later tasks depend on these exact signatures/columns):**
- `analytics_executive_overview(p_from timestamptz, p_to timestamptz)` → one row: `current_wallet_balance numeric, current_active_customers int, current_active_providers int, current_platform_rating numeric, active_disputes int, open_support_tickets int, pending_jobs int, in_progress_jobs int, total_bookings int, active_bookings int, completed_bookings int, cancelled_bookings int, total_revenue numeric, platform_commission numeric, avg_booking_value numeric, repeat_customer_rate numeric, new_customers int, new_providers int, avg_response_minutes numeric, avg_completion_minutes numeric, failed_payments int, period_avg_rating numeric`.
- `analytics_service_categories(p_from timestamptz, p_to timestamptz)` → rows `category text, bookings int, revenue numeric, featured_bookings int`.
- `analytics_growth_timeseries(p_from timestamptz, p_to timestamptz, p_bucket text)` → rows `period text, new_customers int, new_providers int`.
- `analytics_notification_delivery(p_from timestamptz, p_to timestamptz)` → rows `push_status text, total int`.

- [ ] **Step 1: Write the failing static test** — `src/__tests__/executive-analytics-schema.test.ts`

```ts
/**
 * executive-analytics-schema.test.ts — static assertions over
 * supabase/migrations/0032_executive_analytics.sql (fs read, no DB).
 * Mirrors communication-center-schema.test.ts.
 */
import * as fs from 'fs';
import * as path from 'path';

const SQL_PATH = path.resolve(__dirname, '../../supabase/migrations/0032_executive_analytics.sql');
let sql: string;
let lower: string;
beforeAll(() => {
  sql = fs.readFileSync(SQL_PATH, 'utf-8');
  lower = sql.toLowerCase();
});

const FNS = [
  'analytics_executive_overview',
  'analytics_service_categories',
  'analytics_growth_timeseries',
  'analytics_notification_delivery',
];

describe('new RPCs present and admin-guarded, security definer, SELECT-only', () => {
  test.each(FNS)('%s is defined', (fn) => {
    expect(lower).toContain(`create or replace function public.${fn}(`);
  });
  test.each(FNS)('%s is security definer with pinned search_path', (fn) => {
    // each function segment contains the security clause
    const seg = lower.split(`public.${fn}(`)[1] ?? '';
    expect(seg).toContain('security definer set search_path = public');
  });
  test('every function opens with an is_admin() guard', () => {
    const guards = lower.match(/if not public\.is_admin\(\) then/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(FNS.length);
  });
});

describe('additive + read-only (no schema mutation)', () => {
  test('no destructive or write DDL/DML on business tables', () => {
    expect(lower).not.toMatch(/drop table/);
    expect(lower).not.toMatch(/alter table/);
    expect(lower).not.toMatch(/create trigger/);
    expect(lower).not.toMatch(/create policy/);
    expect(lower).not.toMatch(/\binsert into\b/);
    expect(lower).not.toMatch(/\bupdate .*\bset\b/);
    expect(lower).not.toMatch(/\bdelete from\b/);
  });
  test('indexes are created only with if not exists', () => {
    const creates = lower.match(/create index/g) ?? [];
    const guarded = lower.match(/create index if not exists/g) ?? [];
    expect(creates.length).toBe(guarded.length);
    expect(creates.length).toBeGreaterThan(0);
  });
});

describe('reuses existing tokens (no duplicated/renamed business calc)', () => {
  test('commission uses quickserve_share', () => {
    expect(lower).toContain('quickserve_share');
  });
  test('active/open support cases use resolved/closed exclusion', () => {
    expect(lower).toContain("not in ('resolved','closed')");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/__tests__/executive-analytics-schema.test.ts`
Expected: FAIL — migration file does not exist.

- [ ] **Step 3: Write the migration** — `supabase/migrations/0032_executive_analytics.sql`

```sql
-- ============================================================
-- Slice 38 — Executive Analytics Dashboard (read-only RPCs + indexes)
-- ALL functions: language plpgsql security definer set search_path = public
-- ALL functions: open with is_admin() guard, then SELECT-only queries.
-- Additive only: no table/column/trigger/RLS/policy change; indexes if not exists.
-- ============================================================

-- ---------------- 1. composite executive overview ----------------
create or replace function public.analytics_executive_overview(
  p_from timestamptz,
  p_to   timestamptz
)
returns table(
  current_wallet_balance   numeric,
  current_active_customers int,
  current_active_providers int,
  current_platform_rating  numeric,
  active_disputes          int,
  open_support_tickets     int,
  pending_jobs             int,
  in_progress_jobs         int,
  total_bookings           int,
  active_bookings          int,
  completed_bookings       int,
  cancelled_bookings       int,
  total_revenue            numeric,
  platform_commission      numeric,
  avg_booking_value        numeric,
  repeat_customer_rate     numeric,
  new_customers            int,
  new_providers            int,
  avg_response_minutes     numeric,
  avg_completion_minutes   numeric,
  failed_payments          int,
  period_avg_rating        numeric
)
language plpgsql security definer set search_path = public as $$
declare
  v_completed_in_range int;
  v_distinct_customers int;
  v_repeat_customers   int;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  -- ---- Health snapshots (filter-independent) ----
  select coalesce(sum(w.balance), 0) into current_wallet_balance from public.wallets w;

  select count(distinct b.customer_id) into current_active_customers
    from public.bookings b
    where b.status <> 'cancelled' and b.created_at >= now() - interval '30 days';

  select count(distinct b.assigned_provider_id) into current_active_providers
    from public.bookings b
    where b.assigned_provider_id is not null
      and b.status <> 'cancelled' and b.created_at >= now() - interval '30 days';

  select coalesce(avg(r.rating), 0) into current_platform_rating from public.reviews r;

  select count(*) into active_disputes from public.support_cases s
    where s.case_type = 'dispute' and s.status not in ('resolved','closed');
  select count(*) into open_support_tickets from public.support_cases s
    where s.case_type = 'support' and s.status not in ('resolved','closed');

  select count(*) into pending_jobs     from public.bookings b where b.status = 'pending';
  select count(*) into in_progress_jobs from public.bookings b where b.status = 'in_progress';

  -- ---- Activity (range-scoped) ----
  select
    count(*)::int,
    count(*) filter (where b.status not in ('completed','cancelled'))::int,
    count(*) filter (where b.status = 'completed')::int,
    count(*) filter (where b.status = 'cancelled')::int
  into total_bookings, active_bookings, completed_bookings, cancelled_bookings
  from public.bookings b
  where b.created_at between p_from and p_to;

  select coalesce(sum(p.amount) filter (where p.status = 'paid' and p.paid_at between p_from and p_to), 0),
         coalesce(sum(p.quickserve_share) filter (where p.status = 'paid' and p.paid_at between p_from and p_to), 0)
    into total_revenue, platform_commission
    from public.payments p;

  avg_booking_value := total_revenue / nullif(completed_bookings, 0);

  -- repeat customer rate over range: customers with >1 booking in range / distinct customers in range
  select count(distinct b.customer_id) into v_distinct_customers
    from public.bookings b where b.created_at between p_from and p_to;
  select count(*) into v_repeat_customers from (
    select b.customer_id from public.bookings b
      where b.created_at between p_from and p_to
      group by b.customer_id having count(*) > 1
  ) rc;
  repeat_customer_rate := coalesce(v_repeat_customers::numeric / nullif(v_distinct_customers, 0), 0);

  select count(*) filter (where pr.role = 'customer')::int,
         count(*) filter (where pr.role = 'provider')::int
    into new_customers, new_providers
    from public.profiles pr where pr.created_at between p_from and p_to;

  -- avg response minutes: booking created -> first accepted/provider_assigned activity
  select avg(extract(epoch from (fr.first_at - b.created_at)) / 60.0)
    into avg_response_minutes
    from public.bookings b
    join lateral (
      select min(ba.created_at) as first_at from public.booking_activity ba
       where ba.booking_id = b.id and ba.event_type in ('accepted','provider_assigned')
    ) fr on true
    where b.created_at between p_from and p_to and fr.first_at is not null;

  -- avg completion minutes: created -> completion activity, for completed bookings in range
  select avg(extract(epoch from (fc.done_at - b.created_at)) / 60.0)
    into avg_completion_minutes
    from public.bookings b
    join lateral (
      select min(ba.created_at) as done_at from public.booking_activity ba
       where ba.booking_id = b.id and ba.event_type = 'completed'
    ) fc on true
    where b.status = 'completed' and b.created_at between p_from and p_to and fc.done_at is not null;

  select count(*)::int into failed_payments from public.payment_attempts pa
    where pa.status = 'failed' and pa.created_at between p_from and p_to;

  select coalesce(avg(r.rating), 0) into period_avg_rating from public.reviews r
    where r.created_at between p_from and p_to;

  return next;
end; $$;

-- ---------------- 2. service category distribution + featured perf ----------------
create or replace function public.analytics_service_categories(
  p_from timestamptz,
  p_to   timestamptz
)
returns table(category text, bookings int, revenue numeric, featured_bookings int)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  return query
    select coalesce(sc.name, 'Uncategorized') as category,
           count(b.id)::int as bookings,
           coalesce(sum(p.amount) filter (where p.status = 'paid'), 0) as revenue,
           count(b.id) filter (where s.is_featured)::int as featured_bookings
      from public.bookings b
      left join public.services s on s.slug = b.service_id
      left join public.service_categories sc on sc.id = s.category_id
      left join public.payments p on p.booking_id = b.id
     where b.created_at between p_from and p_to
     group by coalesce(sc.name, 'Uncategorized')
     order by bookings desc;
end; $$;

-- ---------------- 3. customer/provider growth timeseries ----------------
create or replace function public.analytics_growth_timeseries(
  p_from   timestamptz,
  p_to     timestamptz,
  p_bucket text
)
returns table(period text, new_customers int, new_providers int)
language plpgsql security definer set search_path = public as $$
declare v_trunc text;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  v_trunc := case lower(p_bucket) when 'week' then 'week' when 'month' then 'month' else 'day' end;
  return query
    select to_char(date_trunc(v_trunc, pr.created_at), 'YYYY-MM-DD') as period,
           count(*) filter (where pr.role = 'customer')::int as new_customers,
           count(*) filter (where pr.role = 'provider')::int as new_providers
      from public.profiles pr
     where pr.created_at between p_from and p_to
     group by date_trunc(v_trunc, pr.created_at)
     order by date_trunc(v_trunc, pr.created_at);
end; $$;

-- ---------------- 4. notification delivery summary ----------------
create or replace function public.analytics_notification_delivery(
  p_from timestamptz,
  p_to   timestamptz
)
returns table(push_status text, total int)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  return query
    select n.push_status, count(*)::int as total
      from public.notifications n
     where n.created_at between p_from and p_to
     group by n.push_status
     order by total desc;
end; $$;

-- ---------------- 5. additive supporting indexes (if not exists) ----------------
create index if not exists bookings_created_at_idx    on public.bookings (created_at);
create index if not exists bookings_status_idx         on public.bookings (status);
create index if not exists payments_paid_at_idx        on public.payments (paid_at);
create index if not exists profiles_created_role_idx   on public.profiles (created_at, role);
create index if not exists reviews_created_at_idx      on public.reviews (created_at);
create index if not exists support_cases_type_status_idx on public.support_cases (case_type, status);
create index if not exists notifications_created_status_idx on public.notifications (created_at, push_status);
create index if not exists payment_attempts_status_created_idx on public.payment_attempts (status, created_at);
```

*Note for the implementer:* verify `services.is_featured` is the correct featured-flag column name in `0030_services_marketplace.sql`; if it differs, use the actual column. If any index target column already has an equivalent index, `if not exists` makes the statement a no-op — leave it.

- [ ] **Step 4: Run the static test to verify it passes**

Run: `npx jest src/__tests__/executive-analytics-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the task gate**

Run: `npm test` then `npx tsc --noEmit` then `npx expo export --platform web` then `npx expo export --platform android`
Expected: green (2881 + new static tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0032_executive_analytics.sql src/__tests__/executive-analytics-schema.test.ts
git commit -m "feat: slice38 migration 0032 executive analytics RPCs + indexes"
```

---

### Task 2: `executive-analytics.ts` wrapper lib (TTL cache + presets)

**Files:**
- Create: `src/lib/executive-analytics.ts`, `src/lib/executive-analytics.test.ts`

**Interfaces:**
- Consumes: `supabase.rpc(...)` (from `@/lib/supabase`); `analyticsRange` + `RangePreset` (from `@/lib/analytics`) for the shared presets.
- Produces: types + wrappers (below) used by Tasks 3–4.

- [ ] **Step 1: Write the failing test** — `src/lib/executive-analytics.test.ts`

```ts
import {
  executiveRange,
  getExecutiveOverview,
  invalidateExecutiveCache,
} from './executive-analytics';

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));
import { supabase } from '@/lib/supabase';
const mockRpc = supabase.rpc as jest.Mock;

const NOW = new Date('2026-07-09T12:00:00Z');

describe('executiveRange', () => {
  test('last90 is 90 days before now', () => {
    const { from, to } = executiveRange('last90', undefined, undefined, NOW);
    expect(to).toBe(NOW.toISOString());
    expect(from).toBe(new Date('2026-04-10T12:00:00Z').toISOString());
  });
  test('this_year starts at Jan 1 local', () => {
    const { from } = executiveRange('this_year', undefined, undefined, NOW);
    expect(new Date(from).getFullYear()).toBe(2026);
    expect(new Date(from).getMonth()).toBe(0);
  });
  test('shared presets delegate to analyticsRange (last7)', () => {
    const { from, to } = executiveRange('last7', undefined, undefined, NOW);
    expect(to).toBe(NOW.toISOString());
    expect(from).toBe(new Date('2026-07-02T12:00:00Z').toISOString());
  });
});

describe('getExecutiveOverview + TTL cache', () => {
  beforeEach(() => { invalidateExecutiveCache(); mockRpc.mockReset(); });

  test('calls analytics_executive_overview with p_from/p_to and returns the row', async () => {
    mockRpc.mockResolvedValue({ data: [{ total_bookings: 5, current_wallet_balance: 100 }], error: null });
    const r = await getExecutiveOverview('A', 'B');
    expect(mockRpc).toHaveBeenCalledWith('analytics_executive_overview', { p_from: 'A', p_to: 'B' });
    expect(r.total_bookings).toBe(5);
    expect(r.current_wallet_balance).toBe(100);
  });

  test('second call within TTL is served from cache (rpc called once)', async () => {
    mockRpc.mockResolvedValue({ data: [{ total_bookings: 1 }], error: null });
    await getExecutiveOverview('A', 'B');
    await getExecutiveOverview('A', 'B');
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  test('invalidateExecutiveCache forces a refetch', async () => {
    mockRpc.mockResolvedValue({ data: [{ total_bookings: 1 }], error: null });
    await getExecutiveOverview('A', 'B');
    invalidateExecutiveCache();
    await getExecutiveOverview('A', 'B');
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  test('returns zeroed default on error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'x' } });
    const r = await getExecutiveOverview('A', 'B');
    expect(r.total_bookings).toBe(0);
    expect(r.avg_response_minutes).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/executive-analytics.test.ts`
Expected: FAIL — `Cannot find module './executive-analytics'`.

- [ ] **Step 3: Implement** — `src/lib/executive-analytics.ts`

```ts
// executive-analytics.ts — read-only wrappers for the Slice-38 executive RPCs,
// with a short in-memory TTL cache. Reuses analyticsRange for shared presets.
// No writes, no push, no duplicate business logic.
import { supabase } from '@/lib/supabase';
import { analyticsRange, type RangePreset, type AnalyticsBucket } from '@/lib/analytics';

// ── Range presets (adds last90 + this_year over the Slice-25 presets) ──────────
export type ExecRangePreset = 'today' | 'last7' | 'last30' | 'last90' | 'this_year' | 'custom';

export function executiveRange(
  preset: ExecRangePreset,
  customFrom?: string,
  customTo?: string,
  now: Date = new Date(),
): { from: string; to: string } {
  const to = now.toISOString();
  switch (preset) {
    case 'last90': {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      return { from: d.toISOString(), to };
    }
    case 'this_year':
      return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to };
    default:
      // today / last7 / last30 / custom → reuse the Slice-25 helper (no duplication)
      return analyticsRange(preset as RangePreset, customFrom, customTo, now);
  }
}

// ── Types ──────────────────────────────────────────────────────────────────
export type ExecutiveOverview = {
  current_wallet_balance: number;
  current_active_customers: number;
  current_active_providers: number;
  current_platform_rating: number;
  active_disputes: number;
  open_support_tickets: number;
  pending_jobs: number;
  in_progress_jobs: number;
  total_bookings: number;
  active_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  total_revenue: number;
  platform_commission: number;
  avg_booking_value: number;
  repeat_customer_rate: number;
  new_customers: number;
  new_providers: number;
  avg_response_minutes: number | null;
  avg_completion_minutes: number | null;
  failed_payments: number;
  period_avg_rating: number;
};

export type ServiceCategoryStat = {
  category: string;
  bookings: number;
  revenue: number;
  featured_bookings: number;
};
export type GrowthPoint = { period: string; new_customers: number; new_providers: number };
export type NotificationDelivery = { push_status: string; total: number };

const DEFAULT_OVERVIEW: ExecutiveOverview = {
  current_wallet_balance: 0,
  current_active_customers: 0,
  current_active_providers: 0,
  current_platform_rating: 0,
  active_disputes: 0,
  open_support_tickets: 0,
  pending_jobs: 0,
  in_progress_jobs: 0,
  total_bookings: 0,
  active_bookings: 0,
  completed_bookings: 0,
  cancelled_bookings: 0,
  total_revenue: 0,
  platform_commission: 0,
  avg_booking_value: 0,
  repeat_customer_rate: 0,
  new_customers: 0,
  new_providers: 0,
  avg_response_minutes: null,
  avg_completion_minutes: null,
  failed_payments: 0,
  period_avg_rating: 0,
};

// ── TTL cache ────────────────────────────────────────────────────────────────
type CacheEntry = { value: unknown; ts: number };
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

function cacheKey(rpc: string, from: string, to: string, bucket?: string): string {
  return `${rpc}|${from}|${to}|${bucket ?? ''}`;
}

async function cached<T>(key: string, loader: () => Promise<T>, now: number = Date.now()): Promise<T> {
  const hit = cache.get(key);
  if (hit && now - hit.ts < CACHE_TTL_MS) return hit.value as T;
  const value = await loader();
  cache.set(key, { value, ts: now });
  return value;
}

/** Clears the executive cache (used by the dashboard's manual refresh). */
export function invalidateExecutiveCache(): void {
  cache.clear();
}

/** Latest cache write time (ms epoch) for a given overview range, or null. */
export function getOverviewTimestamp(from: string, to: string): number | null {
  return cache.get(cacheKey('analytics_executive_overview', from, to))?.ts ?? null;
}

// ── Wrappers ────────────────────────────────────────────────────────────────
export async function getExecutiveOverview(from: string, to: string): Promise<ExecutiveOverview> {
  return cached(cacheKey('analytics_executive_overview', from, to), async () => {
    const { data, error } = await supabase.rpc('analytics_executive_overview', { p_from: from, p_to: to });
    if (error) return DEFAULT_OVERVIEW;
    return (data as ExecutiveOverview[] | null)?.[0] ?? DEFAULT_OVERVIEW;
  });
}

export async function getServiceCategories(from: string, to: string): Promise<ServiceCategoryStat[]> {
  return cached(cacheKey('analytics_service_categories', from, to), async () => {
    const { data, error } = await supabase.rpc('analytics_service_categories', { p_from: from, p_to: to });
    if (error) return [];
    return (data as ServiceCategoryStat[] | null) ?? [];
  });
}

export async function getGrowthTimeseries(
  from: string,
  to: string,
  bucket: AnalyticsBucket,
): Promise<GrowthPoint[]> {
  return cached(cacheKey('analytics_growth_timeseries', from, to, bucket), async () => {
    const { data, error } = await supabase.rpc('analytics_growth_timeseries', {
      p_from: from, p_to: to, p_bucket: bucket,
    });
    if (error) return [];
    return (data as GrowthPoint[] | null) ?? [];
  });
}

export async function getNotificationDelivery(from: string, to: string): Promise<NotificationDelivery[]> {
  return cached(cacheKey('analytics_notification_delivery', from, to), async () => {
    const { data, error } = await supabase.rpc('analytics_notification_delivery', { p_from: from, p_to: to });
    if (error) return [];
    return (data as NotificationDelivery[] | null) ?? [];
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/executive-analytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the task gate** (`npm test`, `npx tsc --noEmit`, `npx expo export --platform web`, `npx expo export --platform android`) — all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/executive-analytics.ts src/lib/executive-analytics.test.ts
git commit -m "feat: slice38 executive-analytics lib (wrappers, TTL cache, presets)"
```

---

### Task 3: Executive presentational components

**Files:**
- Create: `src/components/admin-web/analytics/executive-kpi-card.tsx`, `metric-section.tsx`, `growth-delta-badge.tsx`
- Test: `src/components/admin-web/analytics/executive-kpi-card.test.tsx`, `metric-section.test.tsx`, `growth-delta-badge.test.tsx`

**Interfaces — Produces:**
- `ExecutiveKpiCard({ label, value, kind, sublabel? }: { label: string; value: string; kind: 'snapshot' | 'period'; sublabel?: string })`
- `MetricSection({ title, children }: { title: string; children: React.ReactNode })`
- `GrowthDeltaBadge({ delta }: { delta: number })`

- [ ] **Step 1: Write the failing tests**

`executive-kpi-card.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react-native';
import { ExecutiveKpiCard } from '@/components/admin-web/analytics/executive-kpi-card';

test('renders label, value, and the class tag', () => {
  render(<ExecutiveKpiCard label="Current Wallet Balance" value="KES 1,000" kind="snapshot" />);
  expect(screen.getByText('Current Wallet Balance')).toBeOnTheScreen();
  expect(screen.getByText('KES 1,000')).toBeOnTheScreen();
  expect(screen.getByText('Current')).toBeOnTheScreen();
});

test('period kind shows the Selected period tag', () => {
  render(<ExecutiveKpiCard label="Total Bookings" value="42" kind="period" />);
  expect(screen.getByText('Selected period')).toBeOnTheScreen();
});
```

`growth-delta-badge.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react-native';
import { GrowthDeltaBadge } from '@/components/admin-web/analytics/growth-delta-badge';

test('positive delta shows an up arrow and percentage', () => {
  render(<GrowthDeltaBadge delta={12.5} />);
  expect(screen.getByText('▲ 12.5%')).toBeOnTheScreen();
});
test('negative delta shows a down arrow', () => {
  render(<GrowthDeltaBadge delta={-3} />);
  expect(screen.getByText('▼ 3%')).toBeOnTheScreen();
});
test('zero delta shows a neutral dash', () => {
  render(<GrowthDeltaBadge delta={0} />);
  expect(screen.getByText('– 0%')).toBeOnTheScreen();
});
```

`metric-section.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { MetricSection } from '@/components/admin-web/analytics/metric-section';

test('renders the title and children', () => {
  render(<MetricSection title="Platform Health"><Text>child</Text></MetricSection>);
  expect(screen.getByText('Platform Health')).toBeOnTheScreen();
  expect(screen.getByText('child')).toBeOnTheScreen();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest src/components/admin-web/analytics/`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the three components**

`executive-kpi-card.tsx`:
```tsx
// executive-kpi-card.tsx — presentational KPI card with a snapshot/period tag.
import { View, StyleSheet } from 'react-native';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';

export type ExecutiveKpiCardProps = {
  label: string;
  value: string;
  kind: 'snapshot' | 'period';
  sublabel?: string;
};

export function ExecutiveKpiCard({ label, value, kind, sublabel }: ExecutiveKpiCardProps) {
  return (
    <Card style={styles.card}>
      <Text variant="caption" color="textSecondary">{label}</Text>
      <Text variant="title">{value}</Text>
      <Text variant="caption" color="textSecondary">
        {kind === 'snapshot' ? 'Current' : 'Selected period'}
      </Text>
      {sublabel ? <Text variant="caption" color="textSecondary">{sublabel}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.one, minWidth: 160, flexGrow: 1 },
});
```
*(If `@/components/ui/card` / `Text` variants differ, match the existing card/text API used elsewhere in `components/ui`.)*

`metric-section.tsx`:
```tsx
// metric-section.tsx — titled wrapper grouping a set of metric cards/charts.
import type { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { SectionHeader } from '@/components/ui/section-header';
import { Spacing } from '@/constants/theme';

export function MetricSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two, marginBottom: Spacing.three },
  body: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
```

`growth-delta-badge.tsx`:
```tsx
// growth-delta-badge.tsx — period-over-period delta indicator.
import { Text } from '@/components/ui/text';

export function GrowthDeltaBadge({ delta }: { delta: number }) {
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '–';
  const magnitude = Math.abs(delta);
  const color = delta > 0 ? 'success' : delta < 0 ? 'error' : 'textSecondary';
  return <Text variant="caption" color={color as never}>{`${arrow} ${magnitude}%`}</Text>;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/components/admin-web/analytics/`
Expected: PASS. *(If a `Card`/`Text`/`SectionHeader` import path or prop differs, adjust to the real component API — the tests assert on rendered text, which is stable.)*

- [ ] **Step 5: Run the task gate** — all green.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin-web/analytics/
git commit -m "feat: slice38 executive dashboard presentational components"
```

---

### Task 4: Executive Dashboard screen + relocate detailed analytics

**Files:**
- Create: `src/app/(admin-web)/analytics/detailed.tsx` (moved content of the current `index.tsx`)
- Modify (replace content): `src/app/(admin-web)/analytics/index.tsx` → Executive Dashboard
- Test: `src/app/(admin-web)/analytics/executive-dashboard.test.tsx`

**Interfaces:**
- Consumes: T2 wrappers (`getExecutiveOverview`, `getServiceCategories`, `getGrowthTimeseries`, `getNotificationDelivery`, `executiveRange`, `invalidateExecutiveCache`, `getOverviewTimestamp`), reused Slice-25 wrappers (`getAnalyticsBookingsTimeseries`, `getAnalyticsFinancialTimeseries`, `getAnalyticsProviders`, `getAnalyticsServices`, `getAnalyticsGeography`), T3 components, and the existing charts (`LineChart`, `BarChart`, `PieChart`, `TrendCard`), `PageMeta`, `DataTable`, `formatKes`.

- [ ] **Step 1: Relocate the existing detailed analytics screen**

Move the **entire current content** of `src/app/(admin-web)/analytics/index.tsx` into a new file `src/app/(admin-web)/analytics/detailed.tsx`, changing only the default export function name (e.g. `AnalyticsDetailedScreen`) and the `PageMeta` title to `"Detailed analytics"`. Do not alter its logic — it remains the Slice-25 detailed dashboard, now reachable at `/(admin-web)/analytics/detailed`. (This preserves the existing screen and all its tests behavior; update the existing analytics screen test's import/route only if it targeted the index path.)

- [ ] **Step 2: Write the failing dashboard test** — `executive-dashboard.test.tsx`

```tsx
import { render, screen, waitFor } from '@testing-library/react-native';
import ExecutiveDashboard from '@/app/(admin-web)/analytics/index';

jest.mock('@/lib/executive-analytics', () => ({
  executiveRange: () => ({ from: 'F', to: 'T' }),
  invalidateExecutiveCache: jest.fn(),
  getOverviewTimestamp: () => Date.parse('2026-07-09T12:00:00Z'),
  getExecutiveOverview: jest.fn().mockResolvedValue({
    current_wallet_balance: 5000, current_active_customers: 12, current_active_providers: 4,
    current_platform_rating: 4.6, active_disputes: 1, open_support_tickets: 2,
    pending_jobs: 3, in_progress_jobs: 2, total_bookings: 40, active_bookings: 10,
    completed_bookings: 25, cancelled_bookings: 5, total_revenue: 90000, platform_commission: 9000,
    avg_booking_value: 3600, repeat_customer_rate: 0.3, new_customers: 8, new_providers: 2,
    avg_response_minutes: 12, avg_completion_minutes: 90, failed_payments: 1, period_avg_rating: 4.5,
  }),
  getServiceCategories: jest.fn().mockResolvedValue([]),
  getGrowthTimeseries: jest.fn().mockResolvedValue([]),
  getNotificationDelivery: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/lib/analytics', () => ({
  getAnalyticsBookingsTimeseries: jest.fn().mockResolvedValue([]),
  getAnalyticsFinancialTimeseries: jest.fn().mockResolvedValue([]),
  getAnalyticsProviders: jest.fn().mockResolvedValue([]),
  getAnalyticsServices: jest.fn().mockResolvedValue([]),
  getAnalyticsGeography: jest.fn().mockResolvedValue([]),
}));

test('renders health snapshot + activity KPIs and Last Updated', async () => {
  render(<ExecutiveDashboard />);
  await waitFor(() => expect(screen.getByText('Platform Health')).toBeOnTheScreen());
  expect(screen.getByText('Current Wallet Balance')).toBeOnTheScreen();
  expect(screen.getByText('Total Bookings')).toBeOnTheScreen();
  expect(screen.getByText(/Last updated/i)).toBeOnTheScreen();
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx jest src/app/\(admin-web\)/analytics/executive-dashboard.test.tsx`
Expected: FAIL — index is still the old detailed screen (no "Platform Health").

- [ ] **Step 4: Implement the Executive Dashboard** — replace `src/app/(admin-web)/analytics/index.tsx`

Build the screen following the existing analytics screen's idiom (state + `useEffect` load on range change, `PageMeta`, reused charts). Concrete structure:

```tsx
/**
 * (admin-web)/analytics/index.tsx — Executive Analytics Dashboard (landing).
 * Aggregates existing data via executive-analytics + reused Slice-25 wrappers.
 * Display-only. Detailed Slice-25 analytics live at ./detailed (drill-down).
 */
import { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';

import { PageMeta } from '@/components/admin-web/page-meta';
import { LineChart } from '@/components/admin-web/charts/line-chart';
import { BarChart } from '@/components/admin-web/charts/bar-chart';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { formatKes } from '@/lib/currency';
import { ExecutiveKpiCard } from '@/components/admin-web/analytics/executive-kpi-card';
import { MetricSection } from '@/components/admin-web/analytics/metric-section';
import { ExportMenu } from '@/components/admin-web/analytics/export-menu'; // Task 5 (until then omit)
import {
  executiveRange, invalidateExecutiveCache, getOverviewTimestamp,
  getExecutiveOverview, getServiceCategories, getGrowthTimeseries, getNotificationDelivery,
  type ExecRangePreset, type ExecutiveOverview,
} from '@/lib/executive-analytics';
import {
  getAnalyticsBookingsTimeseries, getAnalyticsFinancialTimeseries,
  getAnalyticsProviders, getAnalyticsServices, getAnalyticsGeography,
} from '@/lib/analytics';

const PRESETS: { id: ExecRangePreset; label: string }[] = [
  { id: 'today', label: 'Today' }, { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' }, { id: 'last90', label: 'Last 90 days' },
  { id: 'this_year', label: 'This year' }, { id: 'custom', label: 'Custom' },
];

export default function ExecutiveDashboard() {
  const [preset, setPreset] = useState<ExecRangePreset>('last30');
  const [overview, setOverview] = useState<ExecutiveOverview | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { from, to } = executiveRange(preset);
    const ov = await getExecutiveOverview(from, to);
    setOverview(ov);
    setLastUpdated(getOverviewTimestamp(from, to));
    // charts/tables reuse existing wrappers (bookings/financial timeseries, providers, services, geography)
    // and the growth/category/notification gap wrappers — load + set into local state (omitted for brevity;
    // follow the same pattern, feeding LineChart/BarChart/DataTable).
  }, [preset]);

  useEffect(() => { void load(); }, [load]);

  const refresh = () => { invalidateExecutiveCache(); void load(); };

  return (
    <View>
      <PageMeta title="Executive analytics" />
      <View style={styles.header}>
        <View style={styles.presets}>
          {PRESETS.map((p) => (
            <Button key={p.id} label={p.label} onPress={() => setPreset(p.id)} variant={p.id === preset ? 'primary' : 'secondary'} />
          ))}
        </View>
        <View style={styles.headerRight}>
          <Text variant="caption" color="textSecondary">
            {lastUpdated ? `Last updated ${new Date(lastUpdated).toLocaleTimeString()}` : 'Last updated —'}
          </Text>
          <Button label="Refresh" onPress={refresh} variant="secondary" />
          {/* <ExportMenu /> added in Task 5 */}
        </View>
        <Button label="View detailed analytics" onPress={() => router.push('/(admin-web)/analytics/detailed')} variant="secondary" />
      </View>

      {overview && (
        <>
          <MetricSection title="Platform Health">
            <ExecutiveKpiCard label="Current Wallet Balance" value={formatKes(overview.current_wallet_balance)} kind="snapshot" />
            <ExecutiveKpiCard label="Current Active Customers" value={String(overview.current_active_customers)} kind="snapshot" />
            <ExecutiveKpiCard label="Current Active Providers" value={String(overview.current_active_providers)} kind="snapshot" />
            <ExecutiveKpiCard label="Current Platform Rating" value={overview.current_platform_rating.toFixed(2)} kind="snapshot" />
            <ExecutiveKpiCard label="Active Disputes" value={String(overview.active_disputes)} kind="snapshot" />
            <ExecutiveKpiCard label="Open Support Tickets" value={String(overview.open_support_tickets)} kind="snapshot" />
          </MetricSection>

          <MetricSection title="Activity (selected period)">
            <ExecutiveKpiCard label="Total Bookings" value={String(overview.total_bookings)} kind="period" />
            <ExecutiveKpiCard label="Active Bookings" value={String(overview.active_bookings)} kind="period" />
            <ExecutiveKpiCard label="Completed Bookings" value={String(overview.completed_bookings)} kind="period" />
            <ExecutiveKpiCard label="Cancelled Bookings" value={String(overview.cancelled_bookings)} kind="period" />
            <ExecutiveKpiCard label="Total Revenue" value={formatKes(overview.total_revenue)} kind="period" />
            <ExecutiveKpiCard label="Platform Commission" value={formatKes(overview.platform_commission)} kind="period" />
            <ExecutiveKpiCard label="Average Booking Value" value={formatKes(overview.avg_booking_value)} kind="period" />
            <ExecutiveKpiCard label="Repeat Customer Rate" value={`${(overview.repeat_customer_rate * 100).toFixed(0)}%`} kind="period" />
          </MetricSection>

          <MetricSection title="Operational">
            <ExecutiveKpiCard label="Pending Jobs" value={String(overview.pending_jobs)} kind="snapshot" />
            <ExecutiveKpiCard label="In-Progress Jobs" value={String(overview.in_progress_jobs)} kind="snapshot" />
            <ExecutiveKpiCard label="Avg Response Time" value={overview.avg_response_minutes == null ? '—' : `${overview.avg_response_minutes.toFixed(0)} min`} kind="period" />
            <ExecutiveKpiCard label="Avg Completion Time" value={overview.avg_completion_minutes == null ? '—' : `${overview.avg_completion_minutes.toFixed(0)} min`} kind="period" />
            <ExecutiveKpiCard label="Failed Payments" value={String(overview.failed_payments)} kind="period" />
          </MetricSection>
          {/* Growth / Service / Provider / Geographic sections + charts (LineChart/BarChart/DataTable)
              wired from the reused wrappers + gap wrappers, following the existing analytics screen idiom. */}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.two, marginBottom: Spacing.three },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
```

Then wire the remaining sections (Growth, Service analytics, Provider analytics, Geographic) and the six charts using the reused Slice-25 wrappers + the T2 gap wrappers, following the existing `detailed.tsx` idiom (state per dataset, load in `load()`, feed `LineChart`/`BarChart`/`DataTable`). Provider/service/geographic tables reuse `getAnalyticsProviders`/`getAnalyticsServices`/`getAnalyticsGeography` (sorted client-side for "highest rated / highest earning / most active").

- [ ] **Step 5: Run the dashboard test to verify it passes**

Run: `npx jest src/app/\(admin-web\)/analytics/executive-dashboard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the task gate** — regenerate route types first for the new route: `npx expo export --platform android`, then `npx tsc --noEmit`, then `npx expo export --platform web`, then `npm test`. All green.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(admin-web)/analytics/index.tsx" "src/app/(admin-web)/analytics/detailed.tsx" "src/app/(admin-web)/analytics/executive-dashboard.test.tsx"
git commit -m "feat: slice38 executive dashboard screen + relocate detailed analytics"
```

---

### Task 5: Future-ready export stubs + performance/caching polish

**Files:**
- Create: `src/components/admin-web/analytics/export-menu.tsx`, `export-menu.test.tsx`
- Modify: `src/app/(admin-web)/analytics/index.tsx` (mount `<ExportMenu />` in the header)

**Interfaces — Produces:** `ExportMenu()` — three disabled buttons (CSV / Excel / PDF) with a "coming soon" caption. No export logic.

- [ ] **Step 1: Write the failing test** — `export-menu.test.tsx`

```tsx
import { render, screen } from '@testing-library/react-native';
import { ExportMenu } from '@/components/admin-web/analytics/export-menu';

test('renders three disabled export controls marked coming soon', () => {
  render(<ExportMenu />);
  for (const label of ['CSV', 'Excel', 'PDF']) {
    const btn = screen.getByTestId(`export-${label.toLowerCase()}`);
    expect(btn.props.accessibilityState?.disabled).toBe(true);
  }
  expect(screen.getByText(/coming soon/i)).toBeOnTheScreen();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/components/admin-web/analytics/export-menu.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `export-menu.tsx`

```tsx
// export-menu.tsx — future-ready, DISABLED export controls (no export implemented this slice).
import { View, StyleSheet } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';

export function ExportMenu() {
  return (
    <View style={styles.row}>
      {(['CSV', 'Excel', 'PDF'] as const).map((label) => (
        <Button key={label} testID={`export-${label.toLowerCase()}`} label={label} onPress={() => {}} disabled variant="secondary" />
      ))}
      <Text variant="caption" color="textSecondary">Exports coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one } });
```

*(If `Button` renders `disabled` via a different prop/state, match the real API; keep the `testID`s and the "coming soon" text so the test asserts real disabled state.)*

- [ ] **Step 4: Mount it** — in `index.tsx` header, replace the `{/* <ExportMenu /> ... */}` comment with `<ExportMenu />` and add the import.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/components/admin-web/analytics/export-menu.test.tsx` then `npx jest src/app/\(admin-web\)/analytics/`
Expected: PASS.

- [ ] **Step 6: Caching/performance confirmation (no code unless a gap is found)** — confirm the dashboard issues one `analytics_executive_overview` call per range (cache-backed), reused list wrappers are bounded (`getAnalyticsProviders` default `limit`), and no client-side full-table load exists. Record findings for Task 6.

- [ ] **Step 7: Run the task gate** — all green.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin-web/analytics/export-menu.tsx src/components/admin-web/analytics/export-menu.test.tsx "src/app/(admin-web)/analytics/index.tsx"
git commit -m "feat: slice38 future-ready export stubs + caching confirmation"
```

---

### Task 6: Verification + final gate + whole-branch review

**Files:**
- Create: `docs/pilot/executive-analytics-verification.md`

- [ ] **Step 1: Write the verification doc** — `docs/pilot/executive-analytics-verification.md`, documenting with cited `file:line` / grep evidence:
  - **Reuse-not-duplicate proof:** table mapping each metric → existing Slice-25 RPC (reused) or new 0032 RPC; confirm no existing calculation was reimplemented (commission reuses `quickserve_share`, revenue reuses the paid-payments definition).
  - **As-role / admin-only audit:** every new RPC opens with `is_admin()` + `security definer set search_path = public` (cite lines in `0032`); non-admin gets `raise exception 'Admin only'`.
  - **No schema-destructive / no-workflow proof:** `git diff --stat <base>..HEAD` shows only additive RPCs + `if not exists` indexes + lib + components + screens + docs; no `alter table`/`drop`/`create trigger`/`create policy`/`insert`/`update`/`delete` on business tables (cite the static schema test).
  - **Metric-class separation:** health snapshots vs range activity are distinct in the RPC and UI.
  - **Isolation:** diff limited to the Slice-38 files; existing detailed analytics preserved (relocated to `detailed.tsx`).
  - **Performance:** single composite overview call + TTL cache + additive indexes; no client-side full load.

- [ ] **Step 2: Final gate** — run and record: `npm test`, `npx tsc --noEmit`, `npx expo export --platform web`, `npx expo export --platform android`, `git status`.

- [ ] **Step 3: Commit the verification doc**

```bash
git add docs/pilot/executive-analytics-verification.md
git commit -m "docs: slice38 executive analytics verification"
```

- [ ] **Step 4: Independent whole-branch review** — generate the review package for `<merge-base main HEAD>..HEAD` and dispatch the whole-branch reviewer (most-capable model): architecture, scope compliance (aggregate-not-duplicate), security (admin-only, security-definer, SELECT-only), regression risk (existing analytics preserved, no workflow change), performance, docs, code quality, tests, isolation. Fix only Critical/Important (one batched fix subagent). Then **pause before merge**.

---

## Rollback Plan

All changes are additive, read-only, or isolated — no schema mutation, no destructive DDL, no workflow change:
- **Migration `0032`:** revert by `drop function if exists public.analytics_executive_overview(timestamptz,timestamptz);` (and the three gap functions) and `drop index if exists` for the eight additive indexes. No data impact — the functions/indexes are additive and read-only.
- **`executive-analytics.ts` + tests:** delete the files.
- **Components (`executive-kpi-card`, `metric-section`, `growth-delta-badge`, `export-menu`) + tests:** delete.
- **Screen:** restore the original `analytics/index.tsx` (the Slice-25 detailed screen currently relocated to `detailed.tsx`) and delete `detailed.tsx` + `executive-dashboard.test.tsx`.
- **Docs:** delete `docs/pilot/executive-analytics-verification.md`.
- **Whole branch:** `git checkout main` (branch unmerged until approval) restores the pre-slice state exactly; or revert the merge commit if already merged.

---

## Self-Review Notes

- **Spec coverage:** T1 ↔ spec §3.2 (overview RPC + 3 gap RPCs + additive indexes); T2 ↔ §3.3 lib + TTL cache + `last90`/`this_year`; T3 ↔ §3.3 components; T4 ↔ §3.1/§4 dashboard + drill-down relocation + §3.4 Last Updated; T5 ↔ §3.5 export stubs + §6 performance; T6 ↔ §5 security + §10 review + verification. Metric definitions (§2.1) encoded verbatim in the T1 SQL; forward-compat note (active def) lives inside `analytics_executive_overview`.
- **Type consistency:** `ExecutiveOverview` fields in T2 match the T1 RPC return columns 1:1; `ExecRangePreset` used identically in T2/T4; `ExecutiveKpiCard`/`MetricSection`/`GrowthDeltaBadge` signatures identical across T3/T4.
- **No new dependency** is introduced; exports remain disabled stubs; CSV reuse of `toCsv`/`exportCsv` is deferred.
