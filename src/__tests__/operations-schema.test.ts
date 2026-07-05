/**
 * operations-schema.test.ts
 *
 * Static assertions against supabase/migrations/0026_operations_portal.sql.
 * Reads the migration file as TEXT (fs) — no live database required.
 *
 * Invariants checked:
 *  - All 5 tables exist (create table if not exists public.<name>)
 *  - RLS is enabled for each of the 5 tables
 *  - Every "create policy" uses public.is_admin()
 *  - No "for delete" policy exists on any table
 *  - Immutable tables (support_case_notes, support_case_events, internal_notes)
 *    have NO update policy
 *  - support_cases + account_flags DO have an update policy
 *  - All required check constraint literals are present
 *  - account_flags has active boolean + lifted_by + lifted_at (append-only metadata)
 */

import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/0026_operations_portal.sql'
);

let sql: string;

beforeAll(() => {
  sql = fs.readFileSync(MIGRATION_PATH, 'utf-8');
  // Normalise for whitespace-robust matching
});

// Helper: normalise multiple spaces/newlines for contains checks
function norm(s: string): string {
  return s.replace(/\s+/g, ' ').toLowerCase();
}

// ─── 1. All 5 tables are declared ────────────────────────────────────────────

describe('tables declared', () => {
  const tables = [
    'support_cases',
    'support_case_notes',
    'support_case_events',
    'internal_notes',
    'account_flags',
  ];

  test.each(tables)('create table if not exists public.%s present', (table) => {
    expect(norm(sql)).toContain(`create table if not exists public.${table}`);
  });
});

// ─── 2. RLS enabled on all 5 tables ──────────────────────────────────────────

describe('RLS enabled', () => {
  const tables = [
    'support_cases',
    'support_case_notes',
    'support_case_events',
    'internal_notes',
    'account_flags',
  ];

  test.each(tables)('enable row level security on public.%s', (table) => {
    // Match: alter table public.<table> enable row level security
    const pattern = new RegExp(
      `alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`,
      'i'
    );
    expect(sql).toMatch(pattern);
  });
});

// ─── 3. Every create policy uses public.is_admin() ───────────────────────────

describe('admin-only RLS', () => {
  test('every create policy line references public.is_admin()', () => {
    // Extract all create policy blocks (simplified: each policy must contain is_admin)
    const policyMatches = sql.match(/create\s+policy\s+"[^"]+"/gi) ?? [];
    expect(policyMatches.length).toBeGreaterThan(0);

    // Split SQL into segments around each "create policy" keyword and verify
    // each segment contains public.is_admin() before the next "create policy"
    const segments = sql.split(/create\s+policy\s+/i).slice(1); // skip preamble
    for (const segment of segments) {
      // The segment starts with the policy name and ends before the next policy.
      // It should contain is_admin()
      expect(segment.toLowerCase()).toContain('public.is_admin()');
    }
  });
});

// ─── 4. No "for delete" policy ───────────────────────────────────────────────

describe('no delete policy', () => {
  test('file does not contain "for delete"', () => {
    expect(norm(sql)).not.toContain('for delete');
  });
});

// ─── 5. Immutable tables: support_case_notes, support_case_events, internal_notes
//       must NOT have an update policy ─────────────────────────────────────────

describe('immutable tables — no update policy', () => {
  const immutableTables = [
    'support_case_notes',
    'support_case_events',
    'internal_notes',
  ];

  test.each(immutableTables)(
    'no update policy for %s',
    (table) => {
      // Check that there is no policy named "<table>_update"
      expect(sql).not.toContain(`"${table}_update"`);

      // More robust: verify no "for update" appears in a policy block for this table.
      // We look for the pattern: create policy "... on public.<table> for update
      const pattern = new RegExp(
        `create\\s+policy\\s+"[^"]*"\\s+on\\s+public\\.${table}\\s+for\\s+update`,
        'i'
      );
      expect(sql).not.toMatch(pattern);
    }
  );
});

// ─── 6. support_cases + account_flags DO have an update policy ───────────────

describe('mutable tables — update policy present', () => {
  test('support_cases has an update policy', () => {
    expect(sql).toContain('"support_cases_update"');
  });

  test('account_flags has an update policy', () => {
    expect(sql).toContain('"account_flags_update"');
  });
});

// ─── 7. Check constraint literals ────────────────────────────────────────────

describe('check constraint literals', () => {
  // status — 6 values
  const statusValues = [
    'open',
    'in_review',
    'waiting_on_customer',
    'waiting_on_provider',
    'resolved',
    'closed',
  ];
  test.each(statusValues)('status check contains "%s"', (val) => {
    expect(sql).toContain(`'${val}'`);
  });

  // priority — 4 values
  const priorityValues = ['low', 'medium', 'high', 'urgent'];
  test.each(priorityValues)('priority check contains "%s"', (val) => {
    expect(sql).toContain(`'${val}'`);
  });

  // case_type — support + dispute
  test('case_type contains "support"', () => {
    expect(sql).toContain("'support'");
  });
  test('case_type contains "dispute"', () => {
    expect(sql).toContain("'dispute'");
  });

  // dispute_kind — 4 values
  const disputeKindValues = [
    'booking_dispute',
    'payment_dispute',
    'customer_complaint',
    'provider_complaint',
  ];
  test.each(disputeKindValues)('dispute_kind contains "%s"', (val) => {
    expect(sql).toContain(`'${val}'`);
  });

  // resolution_outcome — 6 values
  const resolutionOutcomeValues = [
    'no_action',
    'refund_recommended',
    'wallet_credit_recommended',
    'provider_warning',
    'provider_suspension_recommended',
    'customer_warning',
  ];
  test.each(resolutionOutcomeValues)('resolution_outcome contains "%s"', (val) => {
    expect(sql).toContain(`'${val}'`);
  });
});

// ─── 8. account_flags append-only metadata ───────────────────────────────────

describe('account_flags append-only lift metadata', () => {
  test('has "active boolean"', () => {
    expect(norm(sql)).toContain('active boolean');
  });

  test('has "lifted_by" column', () => {
    expect(sql).toContain('lifted_by');
  });

  test('has "lifted_at" column', () => {
    expect(sql).toContain('lifted_at');
  });
});
