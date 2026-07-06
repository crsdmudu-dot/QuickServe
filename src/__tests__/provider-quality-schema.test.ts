/**
 * provider-quality-schema.test.ts
 *
 * Static assertions against supabase/migrations/0028_provider_quality.sql.
 * Reads the migration file as TEXT (fs) — no live database required.
 *
 * Invariants checked:
 *  - Both tables present with RLS enabled
 *  - provider_quality_actions: 6 action_type values, exactly 3 policies
 *    (pqa_admin_select / pqa_admin_insert use public.is_admin();
 *     pqa_provider_select uses provider_id = auth.uid() AND provider_visible = true)
 *    NO for update / for delete policy; NO customer/public policy
 *    provider_visible boolean default false; created_by present
 *  - provider_conduct_acceptances: unique(provider_id, version); exactly 3 policies
 *    (pca_owner_insert / pca_owner_select use provider_id = auth.uid();
 *     pca_admin_select uses public.is_admin())
 *    NO update/delete policy
 *  - RPCs: both security definer + set search_path = public;
 *    record_provider_quality_action contains is_admin() guard + created_by + auth.uid();
 *    accept_provider_conduct uses auth.uid() + on conflict (provider_id, version) do nothing
 *  - Additive: no alter table public.profiles; no drop; no create trigger
 */

import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/0028_provider_quality.sql'
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

// ─── 1. Both tables declared ─────────────────────────────────────────────────

describe('tables declared', () => {
  test('create table if not exists public.provider_quality_actions present', () => {
    expect(norm(sql)).toContain(
      'create table if not exists public.provider_quality_actions'
    );
  });

  test('create table if not exists public.provider_conduct_acceptances present', () => {
    expect(norm(sql)).toContain(
      'create table if not exists public.provider_conduct_acceptances'
    );
  });
});

// ─── 2. RLS enabled on both tables ───────────────────────────────────────────

describe('RLS enabled', () => {
  test('enable row level security on public.provider_quality_actions', () => {
    const pattern =
      /alter\s+table\s+public\.provider_quality_actions\s+enable\s+row\s+level\s+security/i;
    expect(sql).toMatch(pattern);
  });

  test('enable row level security on public.provider_conduct_acceptances', () => {
    const pattern =
      /alter\s+table\s+public\.provider_conduct_acceptances\s+enable\s+row\s+level\s+security/i;
    expect(sql).toMatch(pattern);
  });
});

// ─── 3. provider_quality_actions — 6 action_type values ──────────────────────

describe('provider_quality_actions action_type constraint values', () => {
  const actionTypes = [
    'coaching_needed',
    'coaching_completed',
    'warning_given',
    'improvement_observed',
    'temporarily_paused_recommended',
    'no_action',
  ];

  test.each(actionTypes)('action_type check contains "%s"', (val) => {
    expect(sql).toContain(`'${val}'`);
  });
});

// ─── 4. provider_quality_actions — exactly 3 policies ────────────────────────

describe('provider_quality_actions policies', () => {
  test('exactly 3 policies on provider_quality_actions', () => {
    const policyNames = sql.match(
      /create\s+policy\s+"([^"]*)"\s+on\s+public\.provider_quality_actions/gi
    ) ?? [];
    expect(policyNames).toHaveLength(3);
  });

  test('pqa_admin_select policy present', () => {
    expect(sql).toContain('"pqa_admin_select"');
  });

  test('pqa_admin_select uses public.is_admin()', () => {
    const idx = lower.indexOf('"pqa_admin_select"');
    const segment = lower.slice(idx, idx + 300);
    expect(norm(segment)).toContain('public.is_admin()');
  });

  test('pqa_admin_insert policy present', () => {
    expect(sql).toContain('"pqa_admin_insert"');
  });

  test('pqa_admin_insert uses public.is_admin()', () => {
    const idx = lower.indexOf('"pqa_admin_insert"');
    const segment = lower.slice(idx, idx + 300);
    expect(norm(segment)).toContain('public.is_admin()');
  });

  test('pqa_provider_select policy present', () => {
    expect(sql).toContain('"pqa_provider_select"');
  });

  test('pqa_provider_select uses provider_id = auth.uid()', () => {
    const idx = lower.indexOf('"pqa_provider_select"');
    const segment = lower.slice(idx, idx + 300);
    expect(norm(segment)).toContain('provider_id = auth.uid()');
  });

  test('pqa_provider_select gate includes provider_visible = true', () => {
    const idx = lower.indexOf('"pqa_provider_select"');
    const segment = lower.slice(idx, idx + 300);
    expect(norm(segment)).toContain('provider_visible = true');
  });
});

// ─── 5. provider_quality_actions — NO update/delete policy ───────────────────

describe('provider_quality_actions — no update or delete policy', () => {
  test('no "for update" policy on provider_quality_actions', () => {
    const pattern = new RegExp(
      'create\\s+policy\\s+"[^"]*"\\s+on\\s+public\\.provider_quality_actions\\s+for\\s+update',
      'i'
    );
    expect(sql).not.toMatch(pattern);
  });

  test('no "for delete" policy on provider_quality_actions', () => {
    const pattern = new RegExp(
      'create\\s+policy\\s+"[^"]*"\\s+on\\s+public\\.provider_quality_actions\\s+for\\s+delete',
      'i'
    );
    expect(sql).not.toMatch(pattern);
  });
});

// ─── 6. provider_quality_actions — NO customer/public policy ─────────────────

describe('provider_quality_actions — no customer or public policy', () => {
  test('no policy on provider_quality_actions references "customer"', () => {
    const policyBlocks = sql.match(
      /create\s+policy\s+"[^"]*"\s+on\s+public\.provider_quality_actions[\s\S]*?;/gi
    ) ?? [];
    for (const block of policyBlocks) {
      // customer_id column is fine; we are guarding against a "customer" role policy
      // The 3 policies must only reference is_admin() or provider_id = auth.uid()
      // None of the 3 should reference a "customer_id" column
      expect(block.toLowerCase()).not.toContain('customer_id');
    }
  });
});

// ─── 7. provider_quality_actions — column assertions ─────────────────────────

describe('provider_quality_actions column assertions', () => {
  test('provider_visible boolean default false present', () => {
    expect(norm(sql)).toContain('provider_visible boolean not null default false');
  });

  test('created_by column present', () => {
    expect(sql).toContain('created_by');
  });
});

// ─── 8. provider_conduct_acceptances — unique(provider_id, version) ──────────

describe('provider_conduct_acceptances', () => {
  test('unique (provider_id, version) present', () => {
    expect(norm(sql)).toContain('unique (provider_id, version)');
  });
});

// ─── 9. provider_conduct_acceptances — exactly 3 policies ────────────────────

describe('provider_conduct_acceptances policies', () => {
  test('exactly 3 policies on provider_conduct_acceptances', () => {
    const policyNames = sql.match(
      /create\s+policy\s+"([^"]*)"\s+on\s+public\.provider_conduct_acceptances/gi
    ) ?? [];
    expect(policyNames).toHaveLength(3);
  });

  test('pca_owner_insert policy present', () => {
    expect(sql).toContain('"pca_owner_insert"');
  });

  test('pca_owner_insert uses provider_id = auth.uid()', () => {
    const idx = lower.indexOf('"pca_owner_insert"');
    const segment = lower.slice(idx, idx + 300);
    expect(norm(segment)).toContain('provider_id = auth.uid()');
  });

  test('pca_owner_select policy present', () => {
    expect(sql).toContain('"pca_owner_select"');
  });

  test('pca_owner_select uses provider_id = auth.uid()', () => {
    const idx = lower.indexOf('"pca_owner_select"');
    const segment = lower.slice(idx, idx + 300);
    expect(norm(segment)).toContain('provider_id = auth.uid()');
  });

  test('pca_admin_select policy present', () => {
    expect(sql).toContain('"pca_admin_select"');
  });

  test('pca_admin_select uses public.is_admin()', () => {
    const idx = lower.indexOf('"pca_admin_select"');
    const segment = lower.slice(idx, idx + 300);
    expect(norm(segment)).toContain('public.is_admin()');
  });
});

// ─── 10. provider_conduct_acceptances — NO update/delete policy ──────────────

describe('provider_conduct_acceptances — no update or delete policy', () => {
  test('no "for update" policy on provider_conduct_acceptances', () => {
    const pattern = new RegExp(
      'create\\s+policy\\s+"[^"]*"\\s+on\\s+public\\.provider_conduct_acceptances\\s+for\\s+update',
      'i'
    );
    expect(sql).not.toMatch(pattern);
  });

  test('no "for delete" policy on provider_conduct_acceptances', () => {
    const pattern = new RegExp(
      'create\\s+policy\\s+"[^"]*"\\s+on\\s+public\\.provider_conduct_acceptances\\s+for\\s+delete',
      'i'
    );
    expect(sql).not.toMatch(pattern);
  });
});

// ─── 11. RPCs declared ───────────────────────────────────────────────────────

describe('RPCs declared', () => {
  test('record_provider_quality_action present', () => {
    expect(norm(sql)).toContain(
      'create or replace function public.record_provider_quality_action('
    );
  });

  test('accept_provider_conduct present', () => {
    expect(norm(sql)).toContain(
      'create or replace function public.accept_provider_conduct('
    );
  });
});

// ─── 12. RPCs — security definer + set search_path = public ──────────────────

describe('RPC security attributes', () => {
  test('record_provider_quality_action has security definer', () => {
    expect(getFnSegment('record_provider_quality_action')).toContain('security definer');
  });

  test('record_provider_quality_action has set search_path = public', () => {
    expect(getFnSegment('record_provider_quality_action')).toContain(
      'set search_path = public'
    );
  });

  test('accept_provider_conduct has security definer', () => {
    expect(getFnSegment('accept_provider_conduct')).toContain('security definer');
  });

  test('accept_provider_conduct has set search_path = public', () => {
    expect(getFnSegment('accept_provider_conduct')).toContain('set search_path = public');
  });
});

// ─── 13. record_provider_quality_action — guard + actor ──────────────────────

describe('record_provider_quality_action internals', () => {
  test('contains is_admin() guard', () => {
    expect(getFnSegment('record_provider_quality_action')).toContain(
      'if not public.is_admin()'
    );
  });

  test('contains created_by column reference', () => {
    expect(getFnSegment('record_provider_quality_action')).toContain('created_by');
  });

  test('contains auth.uid() for actor', () => {
    expect(getFnSegment('record_provider_quality_action')).toContain('auth.uid()');
  });

  test('does NOT update public.profiles (record-only)', () => {
    expect(getFnSegment('record_provider_quality_action')).not.toContain(
      'update public.profiles'
    );
  });

  test('does NOT reference approval_status (no suspension side effect)', () => {
    expect(getFnSegment('record_provider_quality_action')).not.toContain('approval_status');
  });
});

// ─── 14. accept_provider_conduct — actor + idempotent ────────────────────────

describe('accept_provider_conduct internals', () => {
  test('contains auth.uid() for provider_id', () => {
    expect(getFnSegment('accept_provider_conduct')).toContain('auth.uid()');
  });

  test('contains on conflict (provider_id, version) do nothing', () => {
    expect(norm(getFnSegment('accept_provider_conduct'))).toContain(
      'on conflict (provider_id, version) do nothing'
    );
  });
});

// ─── 15. Additive-only — no existing objects altered ─────────────────────────

describe('additive-only constraints', () => {
  test('no "alter table public.profiles" in migration', () => {
    expect(norm(sql)).not.toContain('alter table public.profiles');
  });

  test('no "drop " statement in migration', () => {
    expect(norm(sql)).not.toContain('drop table');
    expect(norm(sql)).not.toContain('drop function');
    expect(norm(sql)).not.toContain('drop policy');
  });

  test('no "create trigger" in migration', () => {
    expect(norm(sql)).not.toContain('create trigger');
  });
});
