/**
 * provider-policy-service-details-schema.test.ts
 *
 * Static assertions against supabase/migrations/0038_provider_service_details_immutable.sql,
 * cross-checked against 0004_provider_jobs.sql and 0034_provider_terminal_states.sql.
 * Reads the migration files as TEXT (fs) — no live database required.
 *
 * SCOPE AND LIMIT. These are STRUCTURAL proofs about the policy SQL: that the guards exist, that
 * nothing previously pinned was dropped, and that no permission was widened. They cannot prove
 * RUNTIME behaviour — that an actual provider UPDATE is rejected by Postgres. Behavioural proof
 * requires the migration to be applied to QA and an authorised negative test to be run there,
 * which is a later, separately-approved gate. Requirements 1–4 of the test brief are therefore
 * asserted here as policy-text guarantees, not as executed transitions.
 *
 * Invariants checked:
 *  - provider cannot advance a booking out of 'cancelled' or 'completed' (pre-update status guard)
 *  - provider may only move to on_the_way / in_progress / completed, forward-only (rank check)
 *  - service_details is pinned (immutable to providers)
 *  - EVERY field pinned by the previous policy is still pinned (no silent unpinning)
 *  - the admin update policy is not referenced or modified
 *  - forward-only: no table/column/index/function/trigger changes, no data mutation
 *  - the migration version is unique and sorts after 0037 (which creates the column it uses)
 *  - duplicate migration versions in the executable path are limited to the known 0034 pair
 */

import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');
const REPAIR = path.join(MIGRATIONS_DIR, '0038_provider_service_details_immutable.sql');
/**
 * The superseded policy migration. It lives in `archive/` — QUARANTINED out of the executable
 * migration set because it shared version 0034 with 0034_booking_idempotency_key.sql, which made
 * `supabase db push` fail closed. Its contents are preserved byte-for-byte and it is still the
 * meaningful baseline to diff 0038 against. See supabase/migrations/archive/README.md.
 */
const TERMINAL = path.join(MIGRATIONS_DIR, 'archive', '0034_provider_terminal_states.sql');

/** Strip `--` comments so "must NOT contain" assertions test executable SQL, not prose. */
const executable = (file: string): string =>
  fs
    .readFileSync(file, 'utf-8')
    .toLowerCase()
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

/** Collapse all whitespace so multi-line SQL clauses can be matched as single strings. */
const flat = (s: string): string => s.replace(/\s+/g, ' ');

let repair: string;
let repairFlat: string;
let terminalFlat: string;

beforeAll(() => {
  repair = executable(REPAIR);
  repairFlat = flat(repair);
  terminalFlat = flat(executable(TERMINAL));
});

describe('0038 — terminal-state protection preserved (F4/P1)', () => {
  it('recreates the provider update policy', () => {
    expect(repairFlat).toContain('drop policy if exists "bookings_update_provider" on public.bookings');
    expect(repairFlat).toContain('create policy "bookings_update_provider" on public.bookings');
  });

  it('a provider cannot advance a booking whose CURRENT status is cancelled or completed', () => {
    // The pre-update status must be one of the progressable states; 'cancelled'/'completed'
    // are absent from that list, so any transition out of them fails the check.
    expect(repairFlat).toContain(
      "(select b.status from public.bookings b where b.id = bookings.id) in ('provider_assigned','on_the_way','in_progress')",
    );
    const guard = /\(select b\.status[^)]*\)\s*in\s*\('provider_assigned','on_the_way','in_progress'\)/;
    expect(guard.test(repairFlat)).toBe(true);
    // Neither terminal state may appear in the progressable list.
    const list = repairFlat.match(/in \('provider_assigned','on_the_way','in_progress'\)/);
    expect(list).not.toBeNull();
    expect(list![0]).not.toContain('cancelled');
    expect(list![0]).not.toContain('completed');
  });

  it('restricts the target status to the three provider-progressable states', () => {
    expect(repairFlat).toContain("status in ('on_the_way','in_progress','completed')");
  });

  it('keeps the forward-only rank comparison for legitimate transitions', () => {
    expect(repairFlat).toContain('case status');
    expect(repairFlat).toMatch(/when 'on_the_way' then 1 when 'in_progress' then 2 when 'completed' then 3/);
    expect(repairFlat).toContain('>');
  });
});

describe('0038 — service_details immutability', () => {
  it('pins service_details so a provider cannot alter the customer request', () => {
    expect(repairFlat).toContain(
      'service_details is not distinct from (select b.service_details from public.bookings b where b.id = bookings.id)',
    );
  });

  it('uses IS NOT DISTINCT FROM so a null snapshot compares equal (pre-V1 bookings)', () => {
    const clause = repairFlat.match(/service_details[^)]*?is not distinct from/);
    expect(clause).not.toBeNull();
    // A plain `=` would make every pre-Service-Details booking (null) fail the check.
    expect(repairFlat).not.toMatch(/and service_details\s*=\s*\(select/);
  });

  it('the superseded policy did NOT pin service_details — this migration is what adds it', () => {
    expect(terminalFlat).not.toContain('service_details');
  });
});

describe('0038 — nothing previously pinned was dropped', () => {
  const PINNED = [
    'customer_id',
    'service_id',
    'address',
    'scheduled_for',
    'notes',
    'assigned_provider_id',
    'assigned_provider_name',
    'assigned_provider_phone',
    'admin_notes',
  ];

  it.each(PINNED)('still pins %s', (field) => {
    const pinned =
      repairFlat.includes(`${field} = (select b.${field} from public.bookings b where b.id = bookings.id)`) ||
      repairFlat.includes(`${field} is not distinct from (select b.${field} from public.bookings b where b.id = bookings.id)`);
    expect(pinned).toBe(true);
  });

  it('pins at least as many columns as the policy it supersedes', () => {
    const count = (s: string): number => (s.match(/from public\.bookings b where b\.id = bookings\.id/g) ?? []).length;
    expect(count(repairFlat)).toBeGreaterThan(count(terminalFlat));
  });

  it('keeps the provider ownership check in both USING and WITH CHECK', () => {
    expect(repairFlat).toContain('using (assigned_provider_id = auth.uid())');
    expect(repairFlat).toContain('with check ( assigned_provider_id = auth.uid()');
  });
});

describe('0038 — no widening, no collateral change', () => {
  it('does not modify the admin update policy', () => {
    expect(repair).not.toContain('bookings_update_admin');
    expect(repair).not.toContain('is_admin');
  });

  it('touches no other policy than bookings_update_provider', () => {
    const dropped = repair.match(/drop policy[^;]*/g) ?? [];
    const created = repair.match(/create policy "([^"]+)"/g) ?? [];
    expect(dropped).toHaveLength(1);
    expect(created).toEqual(['create policy "bookings_update_provider"']);
  });

  it('does not disable or alter row level security', () => {
    expect(repair).not.toMatch(/enable\s+row\s+level\s+security/);
    expect(repair).not.toMatch(/disable\s+row\s+level\s+security/);
    expect(repair).not.toMatch(/force\s+row\s+level\s+security/);
  });

  it('grants nothing and creates no role', () => {
    expect(repair).not.toMatch(/\bgrant\b/);
    expect(repair).not.toMatch(/\bcreate\s+role\b/);
  });
});

describe('0038 — forward-only', () => {
  it('changes no table, column, index, function or trigger', () => {
    expect(repair).not.toMatch(/\bcreate\s+table\b/);
    expect(repair).not.toMatch(/\balter\s+table\b/);
    expect(repair).not.toMatch(/\bcreate\s+(unique\s+)?index\b/);
    expect(repair).not.toMatch(/\bcreate\s+(or\s+replace\s+)?function\b/);
    expect(repair).not.toMatch(/\bcreate\s+trigger\b/);
  });

  it('mutates no data', () => {
    expect(repair).not.toMatch(/\binsert\s+into\b/);
    expect(repair).not.toMatch(/\bupdate\s+public\.bookings\b/);
    expect(repair).not.toMatch(/\bdelete\s+from\b/);
    expect(repair).not.toMatch(/\btruncate\b/);
  });

  it('drops only the policy it immediately recreates', () => {
    expect(repair).not.toMatch(/\bdrop\s+(table|column|index|function|trigger)\b/);
  });
});

describe('migration sequence', () => {
  const files = (): string[] => fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

  /**
   * This replaced an `expect(highest).toBe(38)` assertion that only held while 0038 happened to
   * be the newest migration in the directory. It protected nothing the sibling tests below do
   * not already cover — uniqueness of 0038, its ordering after 0037, and the no-duplicate-version
   * rule — and it broke on every subsequent migration, so it was an accidental ceiling rather
   * than an intended invariant (the file header lists no such invariant).
   *
   * What IS worth pinning is the property the Supabase CLI actually depends on: every executable
   * migration filename must carry a parseable 4-digit version prefix, because the CLI keys
   * migration history on it and a file without one is silently skipped.
   */
  it('0038 exists and every migration carries a CLI-parseable 4-digit version', () => {
    expect(fs.existsSync(REPAIR)).toBe(true);
    const unparseable = files().filter((f) => !/^\d{4}_/.test(f));
    expect(unparseable).toEqual([]);
    expect(files()).toContain('0038_provider_service_details_immutable.sql');
  });

  it('0038 is a unique version', () => {
    expect(files().filter((f) => f.startsWith('0038'))).toEqual([
      '0038_provider_service_details_immutable.sql',
    ]);
  });

  it('sorts after 0037, which creates the column it references', () => {
    expect(fs.existsSync(path.join(MIGRATIONS_DIR, '0037_booking_service_details.sql'))).toBe(true);
    expect('0038_provider_service_details_immutable.sql' > '0037_booking_service_details.sql').toBe(true);
  });

  it('references a column that only exists from 0037 onward', () => {
    const m0037 = executable(path.join(MIGRATIONS_DIR, '0037_booking_service_details.sql'));
    expect(m0037).toContain('service_details jsonb');
    expect(repairFlat).toContain('service_details');
  });

  /**
   * NO duplicate versions may exist in the executable migration set. The Supabase CLI keys
   * migration history on the 4-digit version prefix, so two files sharing one version make
   * `supabase db push` fail closed (LegacyDbPushMissingRemoteError) and block every later
   * migration. This assertion is what stops that regressing.
   *
   * Tightened from "no NEW duplicate" once 0034_provider_terminal_states.sql was quarantined
   * into archive/ (excluded from the glob). See supabase/migrations/archive/README.md.
   */
  it('the executable migration set contains NO duplicate versions', () => {
    const byVersion = new Map<string, string[]>();
    for (const f of files()) {
      const v = f.slice(0, 4);
      byVersion.set(v, [...(byVersion.get(v) ?? []), f]);
    }
    const duplicates = [...byVersion.entries()].filter(([, names]) => names.length > 1);
    expect(duplicates).toEqual([]);
  });

  it('exactly one executable migration claims version 0034', () => {
    expect(files().filter((f) => f.startsWith('0034'))).toEqual(['0034_booking_idempotency_key.sql']);
  });

  it('the quarantined migration is preserved outside the executable set', () => {
    expect(fs.existsSync(TERMINAL)).toBe(true);
    expect(files()).not.toContain('0034_provider_terminal_states.sql');
  });
});
