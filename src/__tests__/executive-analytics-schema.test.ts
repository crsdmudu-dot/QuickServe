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
