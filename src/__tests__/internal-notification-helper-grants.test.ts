/**
 * internal-notification-helper-grants.test.ts
 *
 * Static regression guard for migration 0062, which restricts the internal notification
 * helpers (notify_user / notify_admins / notify_send_push) to in-database callers by
 * revoking the default PUBLIC execute grant they were created with.
 *
 * Reads the migration files as TEXT (fs); no live database is contacted. It proves what the
 * migrations SAY: which privileges 0062 removes, that no later migration restores them by a
 * grant, a drop-and-recreate or a new overload, and that every in-database caller of the
 * helpers is SECURITY DEFINER. The behavioural denial (anon/authenticated refused, triggers
 * still delivering) is proven separately by a connected QA run. Same pattern as
 * mpesa-callback-grants.test.ts for 0035.
 */
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations');
const FIX = '0062_restrict_internal_notification_helpers.sql';

/** The three exact signatures the fix covers, keyed by helper name (argument types only). */
const HELPERS = {
  notify_user: ['uuid', 'uuid', 'text', 'text', 'text', 'text', 'text', 'text'],
  notify_admins: ['uuid', 'text', 'text', 'text', 'text', 'text'],
  notify_send_push: ['jsonb'],
} as const;
type Helper = keyof typeof HELPERS;
const HELPER_NAMES = Object.keys(HELPERS) as Helper[];
const signature = (h: Helper) => `public.${h}(${HELPERS[h].join(', ')})`;
const SIGNATURES = HELPER_NAMES.map(signature);

/**
 * Every function whose CURRENT definition calls a helper. Kept exact in both directions by the
 * inventory test below: a listed name that stops calling a helper, or a new caller that is not
 * listed, fails.
 */
const LEGITIMATE_CALLERS = [
  'notify_admins',
  'tg_notify_booking_created',
  'tg_notify_booking_update',
  'tg_notify_payment_paid',
  'tg_notify_payment_failed',
  'tg_notify_chat_message',
  'tg_notify_review',
  'tg_notify_provider_pending',
  'mpesa_ops_alert_sweep',
  'record_mpesa_callback_event',
  'tg_push_bookings',
  'tg_push_payments',
  'tg_push_booking_messages',
  'tg_push_notification',
] as const;

const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();
const readMigration = (f: string) => fs.readFileSync(path.join(MIGRATIONS, f), 'utf-8');
const migrationFiles = () =>
  fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
const laterMigrations = () => migrationFiles().filter((f) => f > FIX);

type FnDef = { name: string; file: string; orReplace: boolean; args: string[]; header: string; body: string };

/** Split a parameter list on top-level commas (ignores commas inside parentheses). */
function splitParams(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** Argument TYPES of a parameter list: drops modes, names and defaults ("p_x uuid default null" -> "uuid"). */
function argTypes(list: string): string[] {
  return splitParams(list).map((p) => {
    const noDefault = p.replace(/\s+default\s+[\s\S]*$/i, '').replace(/\s*=\s*[\s\S]*$/, '');
    const tokens = noDefault.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (['in', 'out', 'inout', 'variadic'].includes(tokens[0])) tokens.shift();
    return (tokens.length > 1 ? tokens.slice(1) : tokens).join(' ');
  });
}

/**
 * Every `create [or replace] function [public.]<name>(...)` in one file, with its argument
 * types, its header (up to the dollar-quote) and its body (between the matching dollar-quote
 * tags, e.g. $$ or $fn$).
 */
function parseFunctions(file: string, sql: string): FnDef[] {
  const out: FnDef[] = [];
  const re = /create\s+(or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    // Parameter list: balanced parentheses from the opening one.
    let depth = 1;
    let i = re.lastIndex;
    while (i < sql.length && depth > 0) {
      if (sql[i] === '(') depth += 1;
      if (sql[i] === ')') depth -= 1;
      i += 1;
    }
    const params = sql.slice(re.lastIndex, i - 1);
    const tag = sql.slice(i).match(/\bas\s+(\$[a-z_]*\$)/i);
    if (!tag || tag.index === undefined) continue;
    const bodyStart = i + tag.index + tag[0].length;
    const bodyEnd = sql.indexOf(tag[1], bodyStart);
    out.push({
      name: m[2].toLowerCase(),
      file,
      orReplace: Boolean(m[1]),
      args: argTypes(params),
      header: sql.slice(m.index, i + tag.index),
      body: sql.slice(bodyStart, bodyEnd < 0 ? sql.length : bodyEnd),
    });
  }
  return out;
}

/** The latest definition of every function across the whole migration history (by name). */
function latestDefinitions(): Map<string, FnDef> {
  const latest = new Map<string, FnDef>();
  for (const file of migrationFiles()) {
    for (const def of parseFunctions(file, readMigration(file))) latest.set(def.name, def);
  }
  return latest;
}

const callsAHelper = (body: string) =>
  HELPER_NAMES.some((h) => new RegExp(`\\b${h}\\s*\\(`, 'i').test(body));

describe('0062 — internal notification helper EXECUTE privileges', () => {
  let fix: string;

  beforeAll(() => {
    fix = norm(readMigration(FIX));
  });

  it.each(SIGNATURES)('revokes EXECUTE on %s from PUBLIC', (sig) => {
    expect(fix).toContain(`revoke execute on function ${norm(sig)} from public`);
  });

  it.each(SIGNATURES)('revokes EXECUTE on %s from anon', (sig) => {
    expect(fix).toContain(`revoke execute on function ${norm(sig)} from anon`);
  });

  it.each(SIGNATURES)('revokes EXECUTE on %s from authenticated', (sig) => {
    expect(fix).toContain(`revoke execute on function ${norm(sig)} from authenticated`);
  });

  it('adds no EXECUTE grant of its own', () => {
    // A grant here would be a real change in exposure, so it must be deliberate, not drifted in.
    expect(fix).not.toContain('grant execute on function');
  });

  it('states that service_role retains its platform EXECUTE grant, and never revokes it', () => {
    expect(fix).toContain('service_role is neither granted nor revoked here, and it retains execute');
    expect(fix).not.toMatch(/revoke execute on function [^;]* from service_role/);
  });

  it('does not modify the bodies of the three helpers', () => {
    // The fix is privilege-only. Redefining a helper here would change runtime behaviour.
    expect(fix).not.toContain('create or replace function');
    expect(fix).not.toContain('create function');
    expect(fix).not.toContain('drop function');
  });

  it('touches only the three intended signatures — no unrelated privilege change', () => {
    const statements = readMigration(FIX)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('--'));

    // Every executable statement must be a revoke against one of the three signatures.
    expect(statements).toHaveLength(SIGNATURES.length * 3);
    const allowed = new Set(
      SIGNATURES.flatMap((sig) =>
        ['public', 'anon', 'authenticated'].map((role) =>
          norm(`revoke execute on function ${sig} from ${role};`),
        ),
      ),
    );
    for (const stmt of statements) {
      expect(allowed.has(norm(stmt))).toBe(true);
    }
  });

  describe('no later migration restores or sidesteps the revoke', () => {
    it('re-grants EXECUTE on no helper, and on no function schema-wide', () => {
      for (const file of laterMigrations()) {
        const sql = norm(readMigration(file));
        for (const h of HELPER_NAMES) {
          expect({ file, helper: h, regranted: new RegExp(`grant\\s+(execute|all)[^;]*on\\s+function\\s+(public\\.)?${h}\\s*\\(`).test(sql) })
            .toEqual({ file, helper: h, regranted: false });
        }
        expect(sql).not.toMatch(/grant\s+(execute|all)[^;]*on\s+all\s+functions\s+in\s+schema\s+public/);
        expect(sql).not.toMatch(/alter\s+default\s+privileges[\s\S]{0,120}grant\s+(execute|all)[\s\S]{0,60}to\s+(public|anon|authenticated)/);
      }
    });

    it('never DROPs a helper — a drop and recreate would restore the default PUBLIC grant with no GRANT statement', () => {
      for (const file of laterMigrations()) {
        const sql = norm(readMigration(file));
        for (const h of HELPER_NAMES) {
          expect({ file, helper: h, dropped: new RegExp(`drop\\s+function\\s+(if\\s+exists\\s+)?(public\\.)?${h}\\b`).test(sql) })
            .toEqual({ file, helper: h, dropped: false });
        }
      }
    });

    it('redefines a helper only by CREATE OR REPLACE of the exact revoked signature — no plain CREATE, no new overload', () => {
      // CREATE OR REPLACE of the SAME signature keeps the function (same OID) and therefore its
      // privileges, so it cannot undo 0062. A different argument list is a different function —
      // a new overload created with the default PUBLIC grant — and must not inherit 0062's
      // assurance. A plain CREATE of an existing signature can only succeed after a drop.
      for (const file of laterMigrations()) {
        for (const def of parseFunctions(file, readMigration(file))) {
          if (!HELPER_NAMES.includes(def.name as Helper)) continue;
          const helper = def.name as Helper;
          expect({ file, helper, orReplace: def.orReplace, args: def.args }).toEqual({
            file,
            helper,
            orReplace: true,
            args: [...HELPERS[helper]],
          });
        }
      }
    });

    it('never ALTERs a helper — owner, security-mode, name or schema changes fall outside this assurance', () => {
      for (const file of laterMigrations()) {
        const sql = norm(readMigration(file));
        for (const h of HELPER_NAMES) {
          expect({ file, helper: h, altered: new RegExp(`alter\\s+function\\s+(public\\.)?${h}\\b`).test(sql) })
            .toEqual({ file, helper: h, altered: false });
        }
      }
    });
  });

  describe('in-database callers keep working after the revoke', () => {
    let latest: Map<string, FnDef>;

    beforeAll(() => {
      latest = latestDefinitions();
    });

    it.each(LEGITIMATE_CALLERS)(
      '%s: its current definition calls a helper AND is SECURITY DEFINER (runs as its owner, whom the revoke does not affect)',
      (caller) => {
        const def = latest.get(caller);
        expect(def).toBeDefined();
        expect(callsAHelper((def as FnDef).body)).toBe(true);
        expect((def as FnDef).header).toMatch(/security\s+definer/i);
      },
    );

    it('the caller list is exact: every function whose current definition calls a helper is listed', () => {
      const actual = [...latest.values()]
        .filter((d) => callsAHelper(d.body))
        .map((d) => d.name)
        .sort();
      expect(actual).toEqual([...LEGITIMATE_CALLERS].sort());
    });
  });

  describe('parser controls', () => {
    it('reads argument types without names, modes or defaults', () => {
      expect(argTypes('p_user uuid, p_booking uuid, p_type text default null')).toEqual(['uuid', 'uuid', 'text']);
      expect(argTypes('in p_payload jsonb')).toEqual(['jsonb']);
      expect(argTypes("p_n numeric(10, 2), p_t text = 'x'")).toEqual(['numeric(10, 2)', 'text']);
    });

    it('reads a $fn$-quoted body, its security mode, and plain CREATE versus CREATE OR REPLACE', () => {
      const sql =
        "create or replace function public.f(p jsonb) returns void language plpgsql security definer as $fn$ begin perform public.notify_admins(null,'a','b','c','d','e'); end $fn$;\n" +
        'create function notify_send_push(p_payload jsonb, p_extra text) returns void language sql as $$ select 1 $$;';
      const [f, overload] = parseFunctions('x.sql', sql);
      expect(f).toMatchObject({ name: 'f', orReplace: true, args: ['jsonb'] });
      expect(f.header).toMatch(/security definer/);
      expect(callsAHelper(f.body)).toBe(true);
      // The overload shape the redefinition guard must reject: plain CREATE, changed argument list.
      expect(overload).toMatchObject({ name: 'notify_send_push', orReplace: false, args: ['jsonb', 'text'] });
      expect(overload.args).not.toEqual([...HELPERS.notify_send_push]);
    });
  });
});
