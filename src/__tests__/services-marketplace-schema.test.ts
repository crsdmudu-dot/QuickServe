/**
 * services-marketplace-schema.test.ts
 *
 * Static assertions against supabase/migrations/0030_services_marketplace.sql.
 * Reads the migration file as TEXT (fs) — no live database required.
 *
 * Invariants checked (all remain TRUE after T2 appends RPCs + seed):
 *  - Both tables present: service_categories + services
 *  - All spec columns/fields present (spot-check: booleans, status, timestamps,
 *    active_from/until, estimated_duration, starting_price_text)
 *  - slug on BOTH tables: unique + format check ^[a-z0-9]+(-[a-z0-9]+)*$
 *  - services has unique (category_id, name)
 *  - services.status check has all 5 values (draft/active/hidden/disabled/archived) + default 'draft'
 *  - RLS enabled on both tables
 *  - services_select uses (status = 'active' or public.is_admin())
 *  - service_categories_select uses (active = true or public.is_admin())
 *  - insert + update policies use public.is_admin() on both tables
 *  - NO "for delete" policy anywhere in the file
 *  - Indexes present: status, category, display_order
 *  - Additive: no "drop " statement; no alter on pre-existing tables
 */

import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/0030_services_marketplace.sql'
);

let sql: string;

beforeAll(() => {
  sql = fs.readFileSync(MIGRATION_PATH, 'utf-8');
});

// Helper: normalise whitespace for robust matching
function norm(s: string): string {
  return s.replace(/\s+/g, ' ').toLowerCase();
}

// ─── 1. Both tables declared ──────────────────────────────────────────────────

describe('tables declared', () => {
  test('create table if not exists public.service_categories present', () => {
    expect(norm(sql)).toContain('create table if not exists public.service_categories');
  });

  test('create table if not exists public.services present', () => {
    expect(norm(sql)).toContain('create table if not exists public.services');
  });
});

// ─── 2. service_categories columns ───────────────────────────────────────────

describe('service_categories columns', () => {
  test('has id uuid primary key', () => {
    expect(norm(sql)).toContain('id uuid primary key');
  });

  test('has slug text not null unique', () => {
    // slug appears in both tables; just check the raw text contains the pattern
    expect(norm(sql)).toContain('slug text not null unique');
  });

  test('has name text not null', () => {
    expect(norm(sql)).toContain('name text not null');
  });

  test('has icon text', () => {
    expect(sql).toContain('icon');
  });

  test('has color text', () => {
    expect(sql).toContain('color');
  });

  test('has display_order', () => {
    expect(sql).toContain('display_order');
  });

  test('has active boolean not null default true', () => {
    expect(norm(sql)).toContain('active boolean not null default true');
  });

  test('has created_at timestamptz', () => {
    expect(norm(sql)).toContain('created_at timestamptz not null default now()');
  });

  test('has updated_at timestamptz', () => {
    expect(norm(sql)).toContain('updated_at timestamptz not null default now()');
  });
});

// ─── 3. services columns ─────────────────────────────────────────────────────

describe('services columns', () => {
  test('has short_description', () => {
    expect(sql).toContain('short_description');
  });

  test('has full_description', () => {
    expect(sql).toContain('full_description');
  });

  test('has category_id uuid', () => {
    expect(norm(sql)).toContain('category_id uuid');
  });

  test('has featured boolean not null default false', () => {
    expect(norm(sql)).toContain('featured boolean not null default false');
  });

  test('has trending boolean not null default false', () => {
    expect(norm(sql)).toContain('trending boolean not null default false');
  });

  test('has emergency_available boolean not null default false', () => {
    expect(norm(sql)).toContain('emergency_available boolean not null default false');
  });

  test('has inspection_required boolean not null default false', () => {
    expect(norm(sql)).toContain('inspection_required boolean not null default false');
  });

  test('has available_24_7 boolean not null default false', () => {
    expect(norm(sql)).toContain('available_24_7 boolean not null default false');
  });

  test('has estimated_duration', () => {
    expect(sql).toContain('estimated_duration');
  });

  test('has starting_price_text', () => {
    expect(sql).toContain('starting_price_text');
  });

  test('has active_from timestamptz', () => {
    expect(sql).toContain('active_from');
  });

  test('has active_until timestamptz', () => {
    expect(sql).toContain('active_until');
  });
});

// ─── 4. slug format check on BOTH tables ─────────────────────────────────────

describe('slug format check', () => {
  test('slug format regex present in migration', () => {
    expect(sql).toContain("'^[a-z0-9]+(-[a-z0-9]+)*$'");
  });

  test('slug format check appears at least twice (once per table)', () => {
    const matches = (sql.match(/\^(\[a-z0-9\]|\[a-z0-9\]\+)/g) ?? []).length;
    // The pattern '^[a-z0-9]+(-[a-z0-9]+)*$' appears once per table = 2
    const exactMatches = (sql.match(/\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$/g) ?? []).length;
    expect(exactMatches).toBeGreaterThanOrEqual(2);
  });

  test('slug check used with "unique" on service_categories', () => {
    // service_categories block contains: slug text not null unique check (...)
    const catIdx = norm(sql).indexOf('create table if not exists public.service_categories');
    const servIdx = norm(sql).indexOf('create table if not exists public.services');
    const catBlock = norm(sql).slice(catIdx, servIdx);
    expect(catBlock).toContain('slug text not null unique');
  });

  test('slug check used with "unique" on services', () => {
    const servIdx = norm(sql).indexOf('create table if not exists public.services');
    // services block starts at servIdx
    const servBlock = norm(sql).slice(servIdx, servIdx + 1000);
    expect(servBlock).toContain('slug text not null unique');
  });
});

// ─── 5. services.status check — 5 values + default 'draft' ──────────────────

describe('services status check', () => {
  const statusValues = ['draft', 'active', 'hidden', 'disabled', 'archived'];

  test.each(statusValues)("status check contains '%s'", (val) => {
    expect(sql).toContain(`'${val}'`);
  });

  test("status default is 'draft'", () => {
    expect(norm(sql)).toContain("default 'draft'");
  });
});

// ─── 6. services unique (category_id, name) ──────────────────────────────────

describe('services composite unique constraint', () => {
  test('unique (category_id, name) present', () => {
    expect(norm(sql)).toContain('unique (category_id, name)');
  });
});

// ─── 7. RLS enabled on both tables ───────────────────────────────────────────

describe('RLS enabled', () => {
  test('enable row level security on public.service_categories', () => {
    const pattern = /alter\s+table\s+public\.service_categories\s+enable\s+row\s+level\s+security/i;
    expect(sql).toMatch(pattern);
  });

  test('enable row level security on public.services', () => {
    const pattern = /alter\s+table\s+public\.services\s+enable\s+row\s+level\s+security/i;
    expect(sql).toMatch(pattern);
  });
});

// ─── 8. service_categories_select policy ─────────────────────────────────────

describe('service_categories_select policy', () => {
  test('"service_categories_select" policy declared', () => {
    expect(sql).toContain('"service_categories_select"');
  });

  test('policy uses (active = true or public.is_admin())', () => {
    const idx = norm(sql).indexOf('"service_categories_select"');
    const segment = norm(sql).slice(idx, idx + 400);
    expect(segment).toContain('active = true or public.is_admin()');
  });
});

// ─── 9. services_select policy ───────────────────────────────────────────────

describe('services_select policy', () => {
  test('"services_select" policy declared', () => {
    expect(sql).toContain('"services_select"');
  });

  test("policy uses (status = 'active' or public.is_admin())", () => {
    const idx = norm(sql).indexOf('"services_select"');
    const segment = norm(sql).slice(idx, idx + 400);
    expect(segment).toContain("status = 'active' or public.is_admin()");
  });
});

// ─── 10. Insert policies use public.is_admin() ───────────────────────────────

describe('insert policies use public.is_admin()', () => {
  test('"service_categories_insert" policy declared', () => {
    expect(sql).toContain('"service_categories_insert"');
  });

  test('service_categories_insert uses public.is_admin()', () => {
    const idx = norm(sql).indexOf('"service_categories_insert"');
    const segment = norm(sql).slice(idx, idx + 300);
    expect(segment).toContain('public.is_admin()');
  });

  test('"services_insert" policy declared', () => {
    expect(sql).toContain('"services_insert"');
  });

  test('services_insert uses public.is_admin()', () => {
    const idx = norm(sql).indexOf('"services_insert"');
    const segment = norm(sql).slice(idx, idx + 300);
    expect(segment).toContain('public.is_admin()');
  });
});

// ─── 11. Update policies use public.is_admin() ───────────────────────────────

describe('update policies use public.is_admin()', () => {
  test('"service_categories_update" policy declared', () => {
    expect(sql).toContain('"service_categories_update"');
  });

  test('service_categories_update uses public.is_admin()', () => {
    const idx = norm(sql).indexOf('"service_categories_update"');
    const segment = norm(sql).slice(idx, idx + 300);
    expect(segment).toContain('public.is_admin()');
  });

  test('"services_update" policy declared', () => {
    expect(sql).toContain('"services_update"');
  });

  test('services_update uses public.is_admin()', () => {
    const idx = norm(sql).indexOf('"services_update"');
    const segment = norm(sql).slice(idx, idx + 300);
    expect(segment).toContain('public.is_admin()');
  });
});

// ─── 12. NO "for delete" policy anywhere ─────────────────────────────────────

describe('no delete policy', () => {
  test('file does not contain "for delete"', () => {
    expect(norm(sql)).not.toContain('for delete');
  });
});

// ─── 13. Indexes present ─────────────────────────────────────────────────────

describe('indexes present', () => {
  test('service_categories_order_idx present', () => {
    expect(sql).toContain('service_categories_order_idx');
  });

  test('services_status_idx present', () => {
    expect(sql).toContain('services_status_idx');
  });

  test('services_category_idx present', () => {
    expect(sql).toContain('services_category_idx');
  });

  test('services_order_idx present', () => {
    expect(sql).toContain('services_order_idx');
  });
});

// ─── 14. Additive: no destructive statements ─────────────────────────────────

describe('additive-only constraints', () => {
  test('no "drop table" in migration', () => {
    expect(norm(sql)).not.toContain('drop table');
  });

  test('no "drop function" in migration', () => {
    expect(norm(sql)).not.toContain('drop function');
  });

  test('no "drop policy" in migration', () => {
    expect(norm(sql)).not.toContain('drop policy');
  });

  test('no "drop trigger" in migration', () => {
    expect(norm(sql)).not.toContain('drop trigger');
  });

  test('no "alter table" of an existing (pre-0030) table', () => {
    // Only the 2 new tables may appear after "alter table" — no pre-existing tables
    const alterMatches = sql.match(/alter\s+table\s+public\.(\w+)/gi) ?? [];
    for (const match of alterMatches) {
      const tableName = match.replace(/alter\s+table\s+public\./i, '').toLowerCase();
      expect(['service_categories', 'services']).toContain(tableName);
    }
  });
});

// ─── 15. Exactly 3 policies per table (select + insert + update; no delete) ──

describe('exactly 3 policies per table', () => {
  test('service_categories has exactly 3 policies', () => {
    const matches = sql.match(
      /create\s+policy\s+"[^"]*"\s+on\s+public\.service_categories/gi
    ) ?? [];
    expect(matches).toHaveLength(3);
  });

  test('services has exactly 3 policies', () => {
    const matches = sql.match(
      /create\s+policy\s+"[^"]*"\s+on\s+public\.services/gi
    ) ?? [];
    expect(matches).toHaveLength(3);
  });
});
