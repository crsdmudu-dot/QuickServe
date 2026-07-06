/**
 * customer-experience-schema.test.ts
 *
 * Static assertions against supabase/migrations/0029_customer_experience.sql.
 * Reads the migration file as TEXT (fs) — no live database required.
 *
 * Invariants checked:
 *  - reviews.updated_at added as additive column (not a table rewrite)
 *  - edit_review RPC: security definer + set search_path = public
 *    body has owner guard (customer_id = auth.uid()) + 24-hour window
 *    + updated_at = now() + updates rating + all category ratings + tags
 *  - NO new "create policy ... for update" on reviews table
 *  - favorite_services table: unique(customer_id, service_id)
 *    customer+created_at index; RLS enabled
 *    3 owner-only policies (_select/_insert/_delete) each customer_id = auth.uid()
 *    NO update policy; NO is_admin/provider policy
 *  - Additive: no "drop ", no alter/recreate of trg_recompute_provider_rating,
 *    no alter of existing reviews policies
 */

import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/0029_customer_experience.sql'
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

// Helper: extract the SQL segment that belongs to a given function
function getFnSegment(fnName: string): string {
  const marker = 'create or replace function';
  const parts = lower.split(marker);
  const segment = parts.find((p) => p.trimStart().startsWith(`public.${fnName}(`));
  if (!segment) throw new Error(`Segment for function "${fnName}" not found`);
  return segment;
}

// ─── 1. reviews.updated_at — additive column ────────────────────────────────

describe('reviews.updated_at additive column', () => {
  test('alter table public.reviews add column if not exists updated_at present', () => {
    expect(norm(sql)).toContain(
      'alter table public.reviews add column if not exists updated_at'
    );
  });

  test('migration does NOT contain "create table if not exists public.reviews"', () => {
    // Must be additive — no recreate of the reviews table
    expect(norm(sql)).not.toContain('create table if not exists public.reviews');
  });
});

// ─── 2. edit_review RPC — declared ──────────────────────────────────────────

describe('edit_review RPC declared', () => {
  test('create or replace function public.edit_review( present', () => {
    expect(norm(sql)).toContain('create or replace function public.edit_review(');
  });
});

// ─── 3. edit_review — security attributes ───────────────────────────────────

describe('edit_review security attributes', () => {
  test('has security definer', () => {
    expect(getFnSegment('edit_review')).toContain('security definer');
  });

  test('has set search_path = public', () => {
    expect(getFnSegment('edit_review')).toContain('set search_path = public');
  });
});

// ─── 4. edit_review — owner + 24h window guard ──────────────────────────────

describe('edit_review owner + window guard', () => {
  test('body contains customer_id = auth.uid() guard', () => {
    expect(norm(getFnSegment('edit_review'))).toContain('customer_id = auth.uid()');
  });

  test('body contains 24 hours window', () => {
    expect(norm(getFnSegment('edit_review'))).toContain('24 hours');
  });
});

// ─── 5. edit_review — content fields updated ────────────────────────────────

describe('edit_review updates content fields', () => {
  test('updates rating', () => {
    expect(norm(getFnSegment('edit_review'))).toContain('rating');
  });

  test('updates quality_rating', () => {
    expect(norm(getFnSegment('edit_review'))).toContain('quality_rating');
  });

  test('updates punctuality_rating', () => {
    expect(norm(getFnSegment('edit_review'))).toContain('punctuality_rating');
  });

  test('updates communication_rating', () => {
    expect(norm(getFnSegment('edit_review'))).toContain('communication_rating');
  });

  test('updates professionalism_rating', () => {
    expect(norm(getFnSegment('edit_review'))).toContain('professionalism_rating');
  });

  test('updates value_rating', () => {
    expect(norm(getFnSegment('edit_review'))).toContain('value_rating');
  });

  test('updates tags', () => {
    expect(norm(getFnSegment('edit_review'))).toContain('tags');
  });

  test('sets updated_at = now()', () => {
    expect(norm(getFnSegment('edit_review'))).toContain('updated_at = now()');
  });
});

// ─── 6. NO new reviews UPDATE policy ────────────────────────────────────────

describe('no new reviews UPDATE policy', () => {
  test('file does NOT add a "for update" policy on public.reviews', () => {
    // The RPC is the sole owner+window edit path; no new reviews UPDATE policy allowed
    const forUpdateOnReviews = new RegExp(
      'create\\s+policy\\s+"[^"]*"\\s+on\\s+public\\.reviews\\s+for\\s+update',
      'i'
    );
    expect(sql).not.toMatch(forUpdateOnReviews);
  });
});

// ─── 7. favorite_services table ─────────────────────────────────────────────

describe('favorite_services table', () => {
  test('create table if not exists public.favorite_services present', () => {
    expect(norm(sql)).toContain('create table if not exists public.favorite_services');
  });

  test('unique (customer_id, service_id) present', () => {
    expect(norm(sql)).toContain('unique (customer_id, service_id)');
  });

  test('service_id text column present (no FK)', () => {
    // norm() collapses whitespace — the normalised form has a single space
    expect(norm(sql)).toContain('service_id text not null');
  });

  test('customer+created_at index present', () => {
    expect(norm(sql)).toContain('favorite_services_customer_idx');
    expect(norm(sql)).toContain('customer_id, created_at desc');
  });

  test('enable row level security on favorite_services', () => {
    const pattern =
      /alter\s+table\s+public\.favorite_services\s+enable\s+row\s+level\s+security/i;
    expect(sql).toMatch(pattern);
  });
});

// ─── 8. favorite_services — 3 owner-only RLS policies ───────────────────────

describe('favorite_services — select policy', () => {
  test('favorite_services_select policy present', () => {
    expect(sql).toContain('"favorite_services_select"');
  });

  test('select policy uses customer_id = auth.uid()', () => {
    const idx = lower.indexOf('"favorite_services_select"');
    const segment = lower.slice(idx, idx + 300);
    expect(norm(segment)).toContain('customer_id = auth.uid()');
  });
});

describe('favorite_services — insert policy', () => {
  test('favorite_services_insert policy present', () => {
    expect(sql).toContain('"favorite_services_insert"');
  });

  test('insert policy uses customer_id = auth.uid()', () => {
    const idx = lower.indexOf('"favorite_services_insert"');
    const segment = lower.slice(idx, idx + 300);
    expect(norm(segment)).toContain('customer_id = auth.uid()');
  });
});

describe('favorite_services — delete policy', () => {
  test('favorite_services_delete policy present', () => {
    expect(sql).toContain('"favorite_services_delete"');
  });

  test('delete policy uses customer_id = auth.uid()', () => {
    const idx = lower.indexOf('"favorite_services_delete"');
    const segment = lower.slice(idx, idx + 300);
    expect(norm(segment)).toContain('customer_id = auth.uid()');
  });
});

// ─── 9. favorite_services — exactly 3 policies ──────────────────────────────

describe('favorite_services — exactly 3 owner-only policies', () => {
  test('only 3 policies on public.favorite_services', () => {
    const policyNames = sql.match(
      /create\s+policy\s+"([^"]*)"\s+on\s+public\.favorite_services/gi
    ) ?? [];
    expect(policyNames).toHaveLength(3);
  });
});

// ─── 10. favorite_services — NO update policy ───────────────────────────────

describe('favorite_services — no update policy', () => {
  test('no "for update" policy on favorite_services', () => {
    const pattern = new RegExp(
      'create\\s+policy\\s+"[^"]*"\\s+on\\s+public\\.favorite_services\\s+for\\s+update',
      'i'
    );
    expect(sql).not.toMatch(pattern);
  });

  test('no "favorite_services_update" policy name', () => {
    expect(sql).not.toContain('"favorite_services_update"');
  });
});

// ─── 11. favorite_services — NO is_admin / provider policy ──────────────────

describe('favorite_services — no admin/provider policy', () => {
  test('no is_admin() reference in any favorite_services policy', () => {
    const policyBlocks = sql.match(
      /create\s+policy\s+"[^"]*"\s+on\s+public\.favorite_services[\s\S]*?;/gi
    ) ?? [];
    for (const block of policyBlocks) {
      expect(block.toLowerCase()).not.toContain('is_admin');
    }
  });
});

// ─── 12. Additive-only constraints ──────────────────────────────────────────

describe('additive-only constraints', () => {
  test('no "drop " statement in migration', () => {
    expect(norm(sql)).not.toContain('drop table');
    expect(norm(sql)).not.toContain('drop function');
    expect(norm(sql)).not.toContain('drop policy');
    expect(norm(sql)).not.toContain('drop trigger');
  });

  test('does NOT alter or recreate trg_recompute_provider_rating', () => {
    // The trigger name may appear in a comment (acceptable), but must NOT appear
    // in a "create trigger", "drop trigger", or "alter trigger" statement.
    const createTrigger = /create\s+trigger\s+trg_recompute_provider_rating/i;
    const dropTrigger   = /drop\s+trigger\s+(if\s+exists\s+)?trg_recompute_provider_rating/i;
    const alterTrigger  = /alter\s+trigger\s+trg_recompute_provider_rating/i;
    expect(sql).not.toMatch(createTrigger);
    expect(sql).not.toMatch(dropTrigger);
    expect(sql).not.toMatch(alterTrigger);
  });

  test('does NOT alter existing reviews policies (reviews_insert_own / reviews_select / reviews_update_admin)', () => {
    // No "alter policy" on reviews
    const alterPolicyOnReviews = /alter\s+policy\s+"[^"]*"\s+on\s+public\.reviews/i;
    expect(sql).not.toMatch(alterPolicyOnReviews);
    // No "drop policy" on reviews
    const dropPolicyOnReviews = /drop\s+policy\s+"[^"]*"\s+on\s+public\.reviews/i;
    expect(sql).not.toMatch(dropPolicyOnReviews);
  });

  test('does NOT contain "drop trigger"', () => {
    expect(norm(sql)).not.toContain('drop trigger');
  });
});
