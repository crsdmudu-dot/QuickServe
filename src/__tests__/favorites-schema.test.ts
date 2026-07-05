/**
 * favorites-schema.test.ts
 *
 * Static assertions against supabase/migrations/0027_favorite_providers.sql.
 * Reads the migration file as TEXT (fs) — no live database required.
 *
 * Invariants checked:
 *  - favorite_providers table declared with unique(customer_id, provider_id)
 *  - customer+created_at index present
 *  - RLS enabled on favorite_providers
 *  - 3 owner-only policies (select/insert/delete) each using customer_id = auth.uid()
 *  - NO update policy on favorite_providers
 *  - NO provider/admin/public policy on favorite_providers
 *  - Both RPCs present (list_public_providers, get_my_favorite_providers)
 *    each with security definer + set search_path = public
 *  - No PII: neither RPC selects phone
 *  - RPC return column lists contain the 10 safe fields and NOT phone
 *  - get_my_favorite_providers scopes by f.customer_id = auth.uid()
 *  - Additive-only: no alter table public.profiles / drop / update of existing objects
 */

import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/0027_favorite_providers.sql'
);

let sql: string;
let lower: string;

beforeAll(() => {
  sql = fs.readFileSync(MIGRATION_PATH, 'utf-8');
  lower = sql.toLowerCase();
});

// Helper: normalise multiple spaces/newlines for whitespace-robust matching
function norm(s: string): string {
  return s.replace(/\s+/g, ' ').toLowerCase();
}

// Helper: extract the segment of the SQL file that belongs to a given function
function getFnSegment(fnName: string): string {
  const marker = 'create or replace function';
  const parts = lower.split(marker);
  const segment = parts.find((p) => p.trimStart().startsWith(`public.${fnName}(`));
  if (!segment) throw new Error(`Segment for function "${fnName}" not found`);
  return segment;
}

// ─── 1. Table declaration ────────────────────────────────────────────────────

describe('favorite_providers table', () => {
  test('create table if not exists public.favorite_providers present', () => {
    expect(norm(sql)).toContain('create table if not exists public.favorite_providers');
  });

  test('unique (customer_id, provider_id) present', () => {
    expect(norm(sql)).toContain('unique (customer_id, provider_id)');
  });

  test('customer+created_at index present', () => {
    // create index if not exists favorite_providers_customer_idx
    //   on public.favorite_providers (customer_id, created_at desc)
    expect(norm(sql)).toContain('favorite_providers_customer_idx');
    expect(norm(sql)).toContain('customer_id, created_at desc');
  });

  test('enable row level security present', () => {
    const pattern =
      /alter\s+table\s+public\.favorite_providers\s+enable\s+row\s+level\s+security/i;
    expect(sql).toMatch(pattern);
  });
});

// ─── 2. Owner-only RLS policies ─────────────────────────────────────────────

describe('owner-only RLS — select policy', () => {
  test('favorite_providers_select policy present', () => {
    expect(sql).toContain('"favorite_providers_select"');
  });

  test('select policy uses customer_id = auth.uid()', () => {
    // Extract the segment around favorite_providers_select
    const idx = lower.indexOf('"favorite_providers_select"');
    const segment = lower.slice(idx, idx + 300);
    expect(norm(segment)).toContain('customer_id = auth.uid()');
  });
});

describe('owner-only RLS — insert policy', () => {
  test('favorite_providers_insert policy present', () => {
    expect(sql).toContain('"favorite_providers_insert"');
  });

  test('insert policy uses customer_id = auth.uid()', () => {
    const idx = lower.indexOf('"favorite_providers_insert"');
    const segment = lower.slice(idx, idx + 300);
    expect(norm(segment)).toContain('customer_id = auth.uid()');
  });
});

describe('owner-only RLS — delete policy', () => {
  test('favorite_providers_delete policy present', () => {
    expect(sql).toContain('"favorite_providers_delete"');
  });

  test('delete policy uses customer_id = auth.uid()', () => {
    const idx = lower.indexOf('"favorite_providers_delete"');
    const segment = lower.slice(idx, idx + 300);
    expect(norm(segment)).toContain('customer_id = auth.uid()');
  });
});

// ─── 3. NO update policy on favorite_providers ──────────────────────────────

describe('no update policy on favorite_providers', () => {
  test('no "for update" policy on favorite_providers table', () => {
    // Any policy on favorite_providers that says "for update" would be wrong
    const forUpdateOnTable = new RegExp(
      'create\\s+policy\\s+"[^"]*"\\s+on\\s+public\\.favorite_providers\\s+for\\s+update',
      'i'
    );
    expect(sql).not.toMatch(forUpdateOnTable);
  });

  test('no "favorite_providers_update" policy name in file', () => {
    expect(sql).not.toContain('"favorite_providers_update"');
  });
});

// ─── 4. No provider/admin/public extra policies ──────────────────────────────

describe('no extra policies (provider/admin/public) on favorite_providers', () => {
  test('no is_admin() reference in any favorite_providers policy', () => {
    // Collect all policy blocks on favorite_providers
    const policyBlocks = sql.match(
      /create\s+policy\s+"[^"]*"\s+on\s+public\.favorite_providers[\s\S]*?;/gi
    ) ?? [];
    for (const block of policyBlocks) {
      expect(block.toLowerCase()).not.toContain('is_admin');
    }
  });

  test('only 3 policies on favorite_providers (select/insert/delete)', () => {
    const policyNames = sql.match(
      /create\s+policy\s+"([^"]*)"\s+on\s+public\.favorite_providers/gi
    ) ?? [];
    expect(policyNames).toHaveLength(3);
  });
});

// ─── 5. Both RPCs declared ──────────────────────────────────────────────────

describe('RPCs declared', () => {
  test('list_public_providers() present', () => {
    expect(norm(sql)).toContain('create or replace function public.list_public_providers()');
  });

  test('get_my_favorite_providers() present', () => {
    expect(norm(sql)).toContain(
      'create or replace function public.get_my_favorite_providers()'
    );
  });
});

// ─── 6. RPC security attributes ─────────────────────────────────────────────

describe('list_public_providers security', () => {
  test('has security definer', () => {
    expect(getFnSegment('list_public_providers')).toContain('security definer');
  });

  test('has set search_path = public', () => {
    expect(getFnSegment('list_public_providers')).toContain('set search_path = public');
  });
});

describe('get_my_favorite_providers security', () => {
  test('has security definer', () => {
    expect(getFnSegment('get_my_favorite_providers')).toContain('security definer');
  });

  test('has set search_path = public', () => {
    expect(getFnSegment('get_my_favorite_providers')).toContain('set search_path = public');
  });
});

// ─── 7. No PII — phone not selected in either RPC ───────────────────────────

describe('no PII in RPCs', () => {
  test('list_public_providers does not select phone', () => {
    const seg = getFnSegment('list_public_providers');
    // Should not select p.phone or "phone" as a column
    expect(seg).not.toMatch(/\bp\.phone\b/i);
    // The return table declaration should not include phone
    expect(seg).not.toMatch(/\bphone\b/i);
  });

  test('get_my_favorite_providers does not select phone', () => {
    const seg = getFnSegment('get_my_favorite_providers');
    expect(seg).not.toMatch(/\bp\.phone\b/i);
    expect(seg).not.toMatch(/\bphone\b/i);
  });
});

// ─── 8. RPC return column lists contain the 10 safe fields ──────────────────

const SAFE_FIELDS = [
  'provider_id',
  'full_name',
  'average_rating',
  'review_count',
  'completed_jobs_count',
  'is_verified',
  'years_experience',
  'availability_status',
  'profile_photo_url',
  'created_at',
];

describe('list_public_providers return columns', () => {
  test.each(SAFE_FIELDS)('returns column "%s"', (col) => {
    const seg = getFnSegment('list_public_providers');
    expect(norm(seg)).toContain(col);
  });
});

describe('get_my_favorite_providers return columns', () => {
  test.each(SAFE_FIELDS)('returns column "%s"', (col) => {
    const seg = getFnSegment('get_my_favorite_providers');
    expect(norm(seg)).toContain(col);
  });
});

// ─── 9. get_my_favorite_providers scoped to auth.uid() ──────────────────────

describe('get_my_favorite_providers caller scoping', () => {
  test('where clause uses f.customer_id = auth.uid()', () => {
    const seg = getFnSegment('get_my_favorite_providers');
    expect(norm(seg)).toContain('f.customer_id = auth.uid()');
  });
});

// ─── 10. Additive-only — no existing objects altered ────────────────────────

describe('additive-only constraints', () => {
  test('no "alter table public.profiles" in migration', () => {
    expect(norm(sql)).not.toContain('alter table public.profiles');
  });

  test('no "drop" statement in migration', () => {
    // Ensure no drop table / drop function / drop policy on existing objects
    expect(norm(sql)).not.toContain('drop table');
    expect(norm(sql)).not.toContain('drop function');
    expect(norm(sql)).not.toContain('drop policy');
  });

  test('no "update" DML statement on existing tables', () => {
    // Should contain no "update public.profiles" or similar DML updates
    expect(norm(sql)).not.toContain('update public.profiles');
    expect(norm(sql)).not.toContain('update public.bookings');
    expect(norm(sql)).not.toContain('update public.reviews');
  });
});
