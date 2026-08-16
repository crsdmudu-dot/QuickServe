/**
 * service-details-schema.test.ts
 *
 * Static assertions against supabase/migrations/0037_booking_service_details.sql.
 * Reads the migration file as TEXT (fs) — no live database required.
 *
 * Invariants checked:
 *  - bookings.service_details added as jsonb
 *  - additive and idempotent (add column IF NOT EXISTS)
 *  - NULLABLE: no `not null`, and no default (pre-existing rows stay untouched)
 *  - no backfill (no update/insert statements)
 *  - no RLS change (no policy / enable row level security)
 *  - no index of any kind (a GIN index is deliberately deferred)
 *  - no dedup change: 0033's bookings_active_dedup is NOT recreated, and 0034's
 *    bookings_idempotency_key_uidx is NOT touched
 *  - no new tables, no drops, no column removal
 *  - no pricing / fulfilment / sourcing / inventory schema
 *  - it is the highest-numbered migration and does not collide with an existing prefix
 */

import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');
const MIGRATION_PATH = path.join(MIGRATIONS_DIR, '0037_booking_service_details.sql');

/** Full file text (lowercased) — used for positive assertions. */
let sql: string;
/**
 * EXECUTABLE sql only, with `--` comments stripped. The "migration must NOT do X" assertions
 * run against this: the file's explanatory header legitimately discusses the rollback statement,
 * the 0034 idempotency index, and why pricing/fulfilment schema is deferred. Scanning prose for
 * those words would fail on documentation rather than on behaviour.
 */
let statements: string;

beforeAll(() => {
  sql = fs.readFileSync(MIGRATION_PATH, 'utf-8').toLowerCase();
  statements = sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
});

describe('0037 — bookings.service_details column', () => {
  it('the migration file exists', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it('adds service_details to public.bookings as jsonb', () => {
    expect(sql).toMatch(/alter\s+table\s+public\.bookings/);
    expect(sql).toMatch(/add\s+column\s+if\s+not\s+exists\s+service_details\s+jsonb/);
  });

  it('is nullable — never declares not null on the new column', () => {
    expect(statements).not.toMatch(/service_details\s+jsonb[^;]*not\s+null/);
  });

  it('sets no default', () => {
    expect(statements).not.toMatch(/service_details\s+jsonb[^;]*default/);
  });
});

describe('0037 — additive only', () => {
  it('performs no backfill of existing rows', () => {
    expect(statements).not.toMatch(/\bupdate\s+public\.bookings\b/);
    expect(statements).not.toMatch(/\binsert\s+into\b/);
  });

  it('creates no table', () => {
    expect(statements).not.toMatch(/\bcreate\s+table\b/);
  });

  it('drops nothing', () => {
    expect(statements).not.toMatch(/\bdrop\s+(table|column|index|policy|function|trigger)\b/);
  });

  it('creates no index — GIN is deliberately deferred', () => {
    expect(statements).not.toMatch(/\bcreate\s+(unique\s+)?index\b/);
  });

  it('changes no RLS policy or table-level RLS setting', () => {
    expect(statements).not.toMatch(/\bcreate\s+policy\b/);
    expect(statements).not.toMatch(/\balter\s+policy\b/);
    expect(statements).not.toMatch(/enable\s+row\s+level\s+security/);
  });
});

describe('0037 — deduplication is left exactly as 0034 left it', () => {
  it('does not recreate the 0033 bookings_active_dedup index', () => {
    expect(statements).not.toMatch(/create[^;]*bookings_active_dedup/);
  });

  it('does not touch the 0034 idempotency index', () => {
    expect(statements).not.toMatch(/(create|drop|alter)[^;]*bookings_idempotency_key_uidx/);
  });
});

describe('0037 — no premature pricing or fulfilment schema', () => {
  it('introduces no pricing, sourcing, inventory or fulfilment objects', () => {
    for (const banned of [
      'price', 'pricing', 'markup', 'margin', 'supplier', 'inventory',
      'stock', 'fulfilment', 'fulfillment', 'invoice', 'settlement',
    ]) {
      expect(statements).not.toContain(banned);
    }
  });
});

describe('migration sequence hygiene', () => {
  const files = (): string[] => fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

  it('0037 is the highest-numbered migration', () => {
    const highest = files()
      .map((f) => parseInt(f.slice(0, 4), 10))
      .filter((n) => !Number.isNaN(n))
      .reduce((a, b) => Math.max(a, b), 0);
    expect(highest).toBe(37);
  });

  it('no other migration shares the 0037 prefix', () => {
    expect(files().filter((f) => f.startsWith('0037'))).toEqual(['0037_booking_service_details.sql']);
  });
});
