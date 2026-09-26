/**
 * profile-update-authority.test.ts
 *
 * Static regression guard for migration 0063 Parts B and C (lead-PM findings O1 and O3):
 *   - O1: profiles_update_admin lets an admin change only the provider fields the admin web edits; role, the
 *     account-deletion state, contact details, created_at and the trigger-computed counters are pinned.
 *   - O3: profiles_update_own additionally pins deleted_at and deletion_status (added by 0056).
 *
 * Reads the migration files and the app/admin source as TEXT; no database is contacted. The checks read the
 * LATEST definition of each policy across all migrations, so a later migration that weakens either one fails
 * here. Every profiles column must be classified, so a new column forces a deliberate decision. The negative
 * controls run the same checks on the policy text that was live before 0063 and prove they fail.
 * The behaviour (admin role change refused, admin approval still allowed, and so on) is proven separately
 * against a real database built from these migrations.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  latestPolicy,
  normalizeSql,
  policyExpressions,
  splitSqlStatements,
  tableColumns,
  topLevelConjuncts,
} from '../../test/sql-text.ts';

const ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');
const FIX = '0063_lock_booking_insert_and_profile_update_fields.sql';

type Migration = { file: string; sql: string };

const readMigrations = (): Migration[] =>
  fs
    .readdirSync(MIGRATIONS)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
    .map((file) => ({ file, sql: fs.readFileSync(path.join(MIGRATIONS, file), 'utf-8') }));

/** Columns an admin may change through the API: exactly what the admin web writes (checked below). */
const ADMIN_WRITABLE = [
  'approval_status', // setProviderApproval
  'is_verified', // Verify toggle
  'availability_status', // Availability toggle, Save profile
  'bio', // Save profile
  'years_experience', // Save profile
  'skills', // Save profile
  'profile_photo_url', // Save profile
];

/** Columns a user may NOT change on their own row (0001 + 0005 + 0008/0009, plus 0056's deletion state). */
const OWN_PINNED = [
  'role',
  'approval_status',
  'is_verified',
  'completed_jobs_count',
  'review_count',
  'average_rating',
  'deleted_at',
  'deletion_status',
];

/**
 * Columns a user MAY change on their own row. created_at has never been pinned for the owner (0001, 0009) and is
 * outside O3's scope; it is listed so that the classification is complete and the gap stays visible.
 */
const OWN_EDITABLE = ['full_name', 'phone', 'profile_photo_url', 'bio', 'years_experience', 'skills', 'availability_status', 'created_at'];

/** Nullable profiles columns: a pin on one of these must use IS NOT DISTINCT FROM (= would refuse NULL = NULL). */
const NULLABLE = ['full_name', 'phone', 'profile_photo_url', 'bio', 'years_experience', 'skills', 'average_rating', 'deleted_at'];

/** Split a policy check into pins of the form "<col> (=|is not distinct from) (select p.<col> ... where p.id = <key>)". */
export function pinsOf(check: string, key: 'profiles.id' | 'auth.uid()'): { pinned: Map<string, string>; other: string[] } {
  const pinned = new Map<string, string>();
  const other: string[] = [];
  const keyRe = key === 'profiles.id' ? 'profiles\\.id' : 'auth\\.uid\\(\\)';
  const pinRe = new RegExp(`^([a-z_]+) (=|is not distinct from) \\(select p\\.([a-z_]+) from public\\.profiles p where p\\.id = ${keyRe}\\)$`);
  for (const c of topLevelConjuncts(check)) {
    const m = pinRe.exec(c);
    if (m && m[1] === m[3]) pinned.set(m[1], m[2]);
    else other.push(c);
  }
  return { pinned, other };
}

function pinViolations(pinned: Map<string, string>, expected: string[], label: string): string[] {
  const out: string[] = [];
  for (const c of expected) if (!pinned.has(c)) out.push(`${label}: ${c} is not pinned`);
  for (const c of pinned.keys()) if (!expected.includes(c)) out.push(`${label}: ${c} is pinned but should be writable`);
  for (const [c, op] of pinned) if (NULLABLE.includes(c) && op !== 'is not distinct from') out.push(`${label}: nullable ${c} is pinned with =`);
  return out;
}

/** O1: what must hold for the admin policy. */
export function adminPolicyViolations(statement: string | null, columns: string[]): string[] {
  if (!statement) return ['profiles_update_admin does not exist'];
  const out: string[] = [];
  if (!/^create policy "profiles_update_admin" on public\.profiles for update using \(/.test(statement)) out.push('profiles_update_admin is not a plain FOR UPDATE policy');
  if (/\bas restrictive\b/.test(statement)) out.push('profiles_update_admin must stay permissive (it grants the admin power)');
  const { using, check } = policyExpressions(statement);
  if (using !== 'public.is_admin()') out.push(`profiles_update_admin USING is "${using}"`);
  if (!check) return [...out, 'profiles_update_admin has no WITH CHECK'];
  const { pinned, other } = pinsOf(check, 'profiles.id');
  if (other.join(' | ') !== 'public.is_admin()') out.push(`profiles_update_admin has unexpected conjuncts: ${other.join(' | ')}`);
  const expected = columns.filter((c) => c !== 'id' && !ADMIN_WRITABLE.includes(c));
  return [...out, ...pinViolations(pinned, expected, 'profiles_update_admin')];
}

/** O3: what must hold for the own-profile policy. */
export function ownPolicyViolations(statement: string | null, columns: string[]): string[] {
  if (!statement) return ['profiles_update_own does not exist'];
  const out: string[] = [];
  if (!/^create policy "profiles_update_own" on public\.profiles for update using \(/.test(statement)) out.push('profiles_update_own is not a plain FOR UPDATE policy');
  const { using, check } = policyExpressions(statement);
  if (using !== 'auth.uid() = id') out.push(`profiles_update_own USING is "${using}"`);
  if (!check) return [...out, 'profiles_update_own has no WITH CHECK'];
  const { pinned, other } = pinsOf(check, 'auth.uid()');
  if (other.join(' | ') !== 'auth.uid() = id') out.push(`profiles_update_own has unexpected conjuncts: ${other.join(' | ')}`);
  for (const c of columns) {
    if (c !== 'id' && !OWN_PINNED.includes(c) && !OWN_EDITABLE.includes(c)) out.push(`profiles column ${c} is not classified for the owner`);
  }
  return [...out, ...pinViolations(pinned, OWN_PINNED, 'profiles_update_own')];
}

/** Permissive policies that can authorize an UPDATE on profiles, as they stand after every migration. */
export function permissiveUpdatePolicies(migrations: Migration[]): string[] {
  const live = new Map<string, string>();
  for (const { file, sql } of migrations) {
    for (const stmt of splitSqlStatements(sql)) {
      const n = normalizeSql(stmt);
      const create = /^create policy "?([a-z0-9_]+)"? on (?:public\.)?"?profiles"?\b(.*)$/.exec(n);
      if (create) live.set(create[1], create[2]);
      const drop = /^drop policy (?:if exists )?"?([a-z0-9_]+)"? on (?:public\.)?"?profiles"?$/.exec(n);
      if (drop) live.delete(drop[1]);
      if (/^do\b/.test(n) && /create policy [^;]*\bon public\.%i\b[^;]*\bfor (update|all)\b/.test(n) && !/as restrictive/.test(n)) {
        throw new Error(`${file}: a DO block creates permissive policies dynamically; update this guard`);
      }
    }
  }
  return [...live]
    .filter(([, rest]) => !/\bas restrictive\b/.test(rest) && !/\bfor (select|insert|delete)\b/.test(rest))
    .map(([name]) => name)
    .sort();
}

/** Every `.from('profiles').<write>(` in non-test source files under the given directories. */
function profileWriteSites(dirs: string[]): { file: string; kind: string }[] {
  const sites: { file: string; kind: string }[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== '__tests__') walk(p);
      } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) {
        const text = fs.readFileSync(p, 'utf-8');
        const re = /from\(\s*['"]profiles['"]\s*\)\s*\.\s*(update|upsert|insert|delete)\s*\(/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) sites.push({ file: path.relative(ROOT, p).replace(/\\/g, '/'), kind: m[1] });
      }
    }
  };
  for (const d of dirs) walk(path.join(ROOT, d));
  return sites;
}

/** Top-level keys of the object literal passed as the 2nd argument of every call to `fn` in the admin web. */
function adminCallKeys(fn: string): Set<string> {
  const keys = new Set<string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== '__tests__') walk(p);
      } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) {
        const text = fs.readFileSync(p, 'utf-8');
        let at = text.indexOf(`${fn}(`);
        while (at >= 0) {
          const open = text.indexOf('{', at);
          let depth = 0;
          let i = open;
          for (; i < text.length; i++) {
            if (text[i] === '{' || text[i] === '(' || text[i] === '[') depth += 1;
            if (text[i] === '}' || text[i] === ')' || text[i] === ']') depth -= 1;
            if (depth === 0) break;
          }
          const inner = text.slice(open + 1, i);
          let d = 0;
          let cur = '';
          const parts: string[] = [];
          for (const ch of inner) {
            if ('{(['.includes(ch)) d += 1;
            if ('})]'.includes(ch)) d -= 1;
            if (ch === ',' && d === 0) {
              parts.push(cur);
              cur = '';
            } else cur += ch;
          }
          parts.push(cur);
          for (const part of parts) {
            const k = /^\s*([A-Za-z_]\w*)\s*(:|$)/.exec(part);
            if (k) keys.add(k[1]);
          }
          at = text.indexOf(`${fn}(`, i);
        }
      }
    }
  };
  walk(path.join(ROOT, 'apps/admin/src'));
  return keys;
}

describe('0063 Parts B and C (O1, O3) - profile update authority', () => {
  let migrations: Migration[];
  let columns: string[];
  const admin = () => latestPolicy(migrations, 'profiles', 'profiles_update_admin');
  const own = () => latestPolicy(migrations, 'profiles', 'profiles_update_own');

  beforeAll(() => {
    migrations = readMigrations();
    columns = tableColumns(migrations, 'profiles');
  });

  it('reads the profiles columns from the migrations (parser sanity: 17 as of 0063)', () => {
    expect(tableColumns(migrations.filter((m) => m.file <= FIX), 'profiles')).toHaveLength(17);
    for (const c of ['role', 'deleted_at', 'deletion_status', 'average_rating']) expect(columns).toContain(c);
  });

  it('0063 re-creates both policies, and its versions pass the checks on their own', () => {
    const upToFix = migrations.filter((m) => m.file <= FIX);
    const cols = tableColumns(upToFix, 'profiles');
    const a = latestPolicy(upToFix, 'profiles', 'profiles_update_admin');
    const o = latestPolicy(upToFix, 'profiles', 'profiles_update_own');
    expect([a?.file, o?.file]).toEqual([FIX, FIX]);
    expect(adminPolicyViolations(a?.statement ?? null, cols)).toEqual([]);
    expect(ownPolicyViolations(o?.statement ?? null, cols)).toEqual([]);
  });

  it('O1: the admin policy keeps the admin check and pins every column the admin web does not write', () => {
    expect(adminPolicyViolations(admin()?.statement ?? null, columns)).toEqual([]);
  });

  it('O1: role, the deletion state and the rating counters are among the admin pins', () => {
    const { pinned } = pinsOf(policyExpressions(admin()!.statement).check!, 'profiles.id');
    for (const c of ['role', 'deleted_at', 'deletion_status', 'average_rating', 'review_count', 'completed_jobs_count']) expect(pinned.has(c)).toBe(true);
  });

  it('O1: the admin-writable list is exactly what the admin web sends', () => {
    // adminUpdateProviderProfile(id, { ... }) call sites in apps/admin, plus setProviderApproval -> approval_status.
    const sent = adminCallKeys('adminUpdateProviderProfile');
    const providers = fs.readFileSync(path.join(ROOT, 'src/lib/providers.ts'), 'utf-8');
    expect(providers).toMatch(/export async function setProviderApproval[\s\S]*?\.update\(\{ approval_status: status \}\)/);
    sent.add('approval_status');
    expect([...sent].sort()).toEqual([...ADMIN_WRITABLE].sort());
  });

  it('the only profiles writes in app and admin code are the three helpers in src/lib/providers.ts', () => {
    // A new write path must be reviewed against the admin and own policy lists above.
    const sites = profileWriteSites(['src', 'apps/admin/src']);
    expect(sites).toEqual([
      { file: 'src/lib/providers.ts', kind: 'update' },
      { file: 'src/lib/providers.ts', kind: 'update' },
      { file: 'src/lib/providers.ts', kind: 'update' },
    ]);
  });

  it('O3: the own-profile policy keeps 0009 and adds deleted_at and deletion_status', () => {
    expect(ownPolicyViolations(own()?.statement ?? null, columns)).toEqual([]);
  });

  it('no other permissive policy can authorize an UPDATE on profiles', () => {
    expect(permissiveUpdatePolicies(migrations)).toEqual(['profiles_update_admin', 'profiles_update_own']);
  });

  describe('negative controls (the checks above can fail)', () => {
    const upTo = (file: string) => migrations.filter((m) => m.file < file);

    it('O1: the admin policy that was live before 0063 (0003_admin_dispatch.sql:27) fails the check', () => {
      const before = latestPolicy(upTo(FIX), 'profiles', 'profiles_update_admin');
      expect(before?.file).toBe('0003_admin_dispatch.sql');
      const v = adminPolicyViolations(before!.statement, columns);
      expect(v).toContain('profiles_update_admin: role is not pinned');
      expect(v).toContain('profiles_update_admin: deleted_at is not pinned');
      expect(v).toContain('profiles_update_admin: deletion_status is not pinned');
    });

    it('O3: the own policy that was live before 0063 (0009_pin_review_count.sql:7-19) fails the check', () => {
      const before = latestPolicy(upTo(FIX), 'profiles', 'profiles_update_own');
      expect(before?.file).toBe('0009_pin_review_count.sql');
      expect(ownPolicyViolations(before!.statement, columns)).toEqual([
        'profiles_update_own: deleted_at is not pinned',
        'profiles_update_own: deletion_status is not pinned',
      ]);
    });

    it('a later migration that restores the old admin policy is caught', () => {
      const old = 'create policy "profiles_update_admin" on public.profiles for update using (public.is_admin()) with check (public.is_admin());';
      const later = [...migrations, { file: '0999_control.sql', sql: `drop policy if exists "profiles_update_admin" on public.profiles;\n${old}` }];
      expect(adminPolicyViolations(latestPolicy(later, 'profiles', 'profiles_update_admin')?.statement ?? null, columns)).not.toEqual([]);
    });

    it('a later migration that just drops a policy, or adds another permissive UPDATE policy, is caught', () => {
      const dropped = [...migrations, { file: '0999_control.sql', sql: 'drop policy if exists "profiles_update_own" on public.profiles;' }];
      expect(ownPolicyViolations(latestPolicy(dropped, 'profiles', 'profiles_update_own')?.statement ?? null, columns)).toEqual([
        'profiles_update_own does not exist',
      ]);
      const extra = [...migrations, { file: '0999_control.sql', sql: 'create policy "x" on public.profiles for all using (true) with check (true);' }];
      expect(permissiveUpdatePolicies(extra)).toEqual(['profiles_update_admin', 'profiles_update_own', 'x']);
    });

    it('a nullable column pinned with "=", or a new unclassified column, is caught', () => {
      const text = admin()!.statement.replace('full_name is not distinct from', 'full_name =');
      expect(adminPolicyViolations(text, columns)).toContain('profiles_update_admin: nullable full_name is pinned with =');
      expect(ownPolicyViolations(own()!.statement, [...columns, 'risk_flag'])).toContain('profiles column risk_flag is not classified for the owner');
      expect(adminPolicyViolations(admin()!.statement, [...columns, 'risk_flag'])).toContain('profiles_update_admin: risk_flag is not pinned');
    });

    it('an OR slipped into a policy is caught', () => {
      const widened = admin()!.statement.replace('with check ( public.is_admin()', 'with check ( public.is_admin() or true');
      expect(widened).not.toBe(admin()!.statement);
      expect(adminPolicyViolations(widened, columns).some((v) => v.startsWith('profiles_update_admin has unexpected conjuncts'))).toBe(true);
    });
  });
});
