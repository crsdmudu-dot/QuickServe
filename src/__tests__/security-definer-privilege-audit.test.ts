/**
 * security-definer-privilege-audit.test.ts
 *
 * Inventory guard: every SECURITY DEFINER function in supabase/migrations must show at least one
 * recognised privilege SIGNAL in the migration text. It is a tripwire for the defect class, not a
 * proof of effective privileges: it reads text with regular expressions, keys functions by NAME
 * (not full signature), and does not model grants that follow a revoke or what a guard call
 * actually enforces. Effective privileges are established per fix by its targeted guard test and
 * by a connected read of the database catalogue.
 *
 * Why this exists. A SECURITY DEFINER function runs with its owner's privileges and bypasses
 * RLS. PostgreSQL creates every function with a default `GRANT EXECUTE TO PUBLIC`, and anon
 * and authenticated are members of PUBLIC, so a definer function in the API-exposed `public`
 * schema is reachable through PostgREST the moment it is created. That is safe only if the
 * function authorizes its own caller, or if public reach is intended. This test fails when a
 * new definer function is added with none of the signals below — the defect class fixed in
 * 0035 (apply_mpesa_callback) and 0062 (internal notification helpers).
 *
 * Classification — each is a TEXT signal, checked in this order:
 *   TRIGGER            - declared `returns trigger` (clients cannot call a trigger function via RPC)
 *   REVOKED            - a `revoke ... on function <name>(` appears in some migration; a later
 *                        re-grant or a different overload is NOT detected here
 *   ADMIN_GUARDED      - the text after the definition mentions is_admin(); whether it gates the
 *                        whole function is not checked
 *   OWNERSHIP_GUARDED  - the text after the definition mentions auth.uid(); same limit
 *   PUBLIC_PROJECTION  - allowlisted: intentionally reachable by anon/authenticated
 *   UNCLASSIFIED       - none of the above -> FAIL, make a decision
 *
 * Everything is read from the migration text; no database is contacted.
 */
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations');

/**
 * Functions deliberately reachable without a guard because they return a curated, public
 * projection. Adding to this list is a security decision and should be reviewed as one.
 *
 *  - list_public_providers():         approved-provider directory. Curated columns only
 *                                     (name, ratings, counts, verification, photo). No phone,
 *                                     no email, no address.
 *  - get_provider_rating_breakdown(): rating AGGREGATES only, filtered to is_hidden = false.
 *                                     No review text, no reviewer identity, no private feedback.
 */
const PUBLIC_PROJECTION_ALLOWLIST = new Set(['list_public_providers', 'get_provider_rating_breakdown']);

type FnDef = {
  name: string;
  file: string;
  ret: string;
  body: string;
};

/**
 * Extract the return type from a function header.
 *
 * Deliberately anchored to the first word after `returns` (optionally past `setof`). An
 * unanchored character-class match such as /returns\s+([a-z0-9_ \[\]]+)/ swallows the trailing
 * `language plpgsql security definer set search_path ...` clause, which makes a trigger
 * function's return type read as `trigger language plpgsql ...` instead of `trigger` and
 * silently misclassifies it as client-callable. See the negative controls below.
 */
export function extractReturnType(header: string): string {
  const m = header.match(/returns\s+(?:setof\s+)?([a-z0-9_]+)/i);
  return m ? m[1].toLowerCase() : '?';
}

function parseMigrations(): { defs: Map<string, FnDef>; revoked: Set<string> } {
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const defs = new Map<string, FnDef>();
  const revoked = new Set<string>();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf-8');

    const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*(returns[\s\S]{0,80})/gi;
    const marks: { name: string; ret: string; idx: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) {
      marks.push({ name: m[1], ret: extractReturnType(m[3]), idx: m.index });
    }
    for (let i = 0; i < marks.length; i++) {
      const end = i + 1 < marks.length ? marks[i + 1].idx : sql.length;
      const body = sql.slice(marks[i].idx, end);
      if (!/security\s+definer/i.test(body)) continue;
      // Later migrations redefine earlier functions; the last definition wins.
      defs.set(marks[i].name, { name: marks[i].name, file, ret: marks[i].ret, body });
    }

    const rv = /revoke\s+(?:all|execute)[\s\S]{0,60}?on\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi;
    while ((m = rv.exec(sql))) revoked.add(m[1]);
  }

  return { defs, revoked };
}

function classify(def: FnDef, revoked: Set<string>): string {
  if (def.ret === 'trigger') return 'TRIGGER';
  if (revoked.has(def.name)) return 'REVOKED';
  if (/is_admin\s*\(/i.test(def.body)) return 'ADMIN_GUARDED';
  if (/auth\.uid\(\)/i.test(def.body)) return 'OWNERSHIP_GUARDED';
  if (PUBLIC_PROJECTION_ALLOWLIST.has(def.name)) return 'PUBLIC_PROJECTION';
  return 'UNCLASSIFIED';
}

describe('SECURITY DEFINER privilege audit', () => {
  let defs: Map<string, FnDef>;
  let revoked: Set<string>;

  beforeAll(() => {
    ({ defs, revoked } = parseMigrations());
  });

  it('finds a non-trivial inventory (parser sanity)', () => {
    expect(defs.size).toBeGreaterThan(50);
  });

  it('every SECURITY DEFINER function shows at least one recognised privilege signal', () => {
    const unclassified = [...defs.values()]
      .filter((d) => classify(d, revoked) === 'UNCLASSIFIED')
      .map((d) => `${d.name}  (${d.file})`);

    // A failure here means: a definer function shows no revoke, no guard call and no allowlist
    // entry in the migration text. Revoke it, guard it, or allowlist it with a written reason.
    // A pass does not prove the function is safe; see the header.
    expect(unclassified).toEqual([]);
  });

  it('the internal notification helpers carry the REVOKED signal after 0062 (effective privileges: see the 0062 guard)', () => {
    for (const name of ['notify_user', 'notify_admins', 'notify_send_push']) {
      const def = defs.get(name);
      expect(def).toBeDefined();
      expect(classify(def as FnDef, revoked)).toBe('REVOKED');
    }
  });

  it('the allowlist stays small and intentional', () => {
    // Growth here should be a conscious review step, not incidental.
    expect(PUBLIC_PROJECTION_ALLOWLIST.size).toBeLessThanOrEqual(4);
    for (const name of PUBLIC_PROJECTION_ALLOWLIST) {
      expect(defs.has(name)).toBe(true);
    }
  });

  describe('regex negative controls (guards against the over-greedy counting defect)', () => {
    it('reads a trigger return type as exactly "trigger"', () => {
      const header = 'returns trigger language plpgsql security definer set search_path = public as $$';
      expect(extractReturnType(header)).toBe('trigger');
    });

    it('reads a void return type as exactly "void"', () => {
      const header = 'returns void language plpgsql security definer set search_path = public, private as $$';
      expect(extractReturnType(header)).toBe('void');
    });

    it('handles setof and table returns', () => {
      expect(extractReturnType('returns setof record language sql')).toBe('record');
      expect(extractReturnType('returns table ( id uuid ) language sql')).toBe('table');
    });

    it('classifies known trigger functions as TRIGGER, not as client-callable', () => {
      // The earlier defect leaked these into the callable set, inflating the count.
      for (const name of ['tg_push_notification', 'tg_notify_booking_created']) {
        const def = defs.get(name);
        expect(def).toBeDefined();
        expect((def as FnDef).ret).toBe('trigger');
        expect(classify(def as FnDef, revoked)).toBe('TRIGGER');
      }
    });

    it('trigger functions are a real subset, not the whole inventory', () => {
      const all = [...defs.values()];
      const triggers = all.filter((d) => d.ret === 'trigger');
      expect(triggers.length).toBeGreaterThan(0);
      expect(triggers.length).toBeLessThan(all.length);
    });
  });
});
