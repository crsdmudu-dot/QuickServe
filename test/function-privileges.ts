/**
 * function-privileges.ts - a static model of who may EXECUTE each database function, built by replaying the
 * migrations in order. Used by src/__tests__/function-execute-privilege-audit.test.ts; no database is contacted.
 *
 * What it replays, per function SIGNATURE (schema, name and input argument types, as PostgreSQL identifies it):
 *   CREATE [OR REPLACE] FUNCTION / PROCEDURE, DROP ..., ALTER ... SECURITY DEFINER|INVOKER,
 *   GRANT / REVOKE EXECUTE (or ALL) ON FUNCTION|PROCEDURE|ROUTINE <signature list>,
 *   GRANT / REVOKE ... ON ALL FUNCTIONS|PROCEDURES|ROUTINES IN SCHEMA <schema list>.
 *
 * The starting privileges of a NEW function are modelled CONSERVATIVELY, as the Supabase platform grants them
 * to functions the postgres role creates when nothing else intervenes:
 *   schema public or storage: EXECUTE for PUBLIC, postgres, anon, authenticated and service_role;
 *   any other schema:         EXECUTE for PUBLIC and postgres.
 * ALTER DEFAULT PRIVILEGES statements (such as 0064) are recorded but deliberately NOT credited: they depend on
 * which role runs a migration, so the audit insists on an explicit REVOKE for every function instead. The model can
 * therefore only over-report exposure, never under-report it.
 *
 * Anything it cannot follow fails closed: dynamic SQL that grants, revokes or creates functions inside a DO block or
 * a function body, ownership / rename / schema changes, %TYPE arguments, unknown grantee roles, or a GRANT/REVOKE/DROP
 * that names a function the model does not know. Those land in `unsupported` (or throw) so a test fails and a person
 * looks.
 *
 * Free of imports other than ./sql-text.ts and of TypeScript-only runtime syntax, so it also runs under plain Node 24.
 */
import { balancedParens, normalizeSql, splitSqlStatements, splitTopLevel, stripSqlComments } from './sql-text.ts';

export type Migration = { file: string; sql: string };

export type FunctionState = {
  /** schema.name(type,type) - the identity PostgreSQL uses for privileges. */
  key: string;
  schema: string;
  name: string;
  args: string[];
  kind: 'function' | 'procedure';
  securityDefiner: boolean;
  /** First word of the return type ('trigger', 'void', 'table', 'boolean', ...); '' for a procedure. */
  returns: string;
  /** Normalized text of the latest definition (header and body), for light text checks. */
  definition: string;
  /** Migration file of the latest CREATE [OR REPLACE]. */
  definedIn: string;
  /** Roles holding EXECUTE, lower case; 'public' is PUBLIC. */
  execute: Set<string>;
};

export type FunctionModel = {
  functions: Map<string, FunctionState>;
  /** Normalized ALTER DEFAULT PRIVILEGES statements, with their file. Recorded, not applied (see header). */
  defaultPrivilegeStatements: { file: string; statement: string }[];
  /** Constructs this model cannot follow. An audit must treat any entry as a failure. */
  unsupported: string[];
};

/** Roles a GRANT/REVOKE in these migrations may name. Anything else is unsupported (it could carry membership). */
const KNOWN_ROLES = new Set(['public', 'postgres', 'anon', 'authenticated', 'service_role', 'supabase_admin', 'authenticator']);

/** The roles whose EXECUTE makes a function reachable from the public API. */
export const CLIENT_ROLES = ['public', 'anon', 'authenticated'] as const;

export function platformDefaultExecute(schema: string): string[] {
  return schema === 'public' || schema === 'storage'
    ? ['public', 'postgres', 'anon', 'authenticated', 'service_role']
    : ['public', 'postgres'];
}

const TYPE_ALIASES: Record<string, string> = {
  int: 'integer',
  int4: 'integer',
  integer: 'integer',
  int2: 'smallint',
  smallint: 'smallint',
  int8: 'bigint',
  bigint: 'bigint',
  bool: 'boolean',
  boolean: 'boolean',
  float8: 'double precision',
  float: 'double precision',
  'double precision': 'double precision',
  float4: 'real',
  real: 'real',
  varchar: 'character varying',
  'character varying': 'character varying',
  char: 'character',
  character: 'character',
  bpchar: 'character',
  timestamptz: 'timestamp with time zone',
  'timestamp with time zone': 'timestamp with time zone',
  timestamp: 'timestamp without time zone',
  'timestamp without time zone': 'timestamp without time zone',
  timetz: 'time with time zone',
  'time with time zone': 'time with time zone',
  time: 'time without time zone',
  'time without time zone': 'time without time zone',
  decimal: 'numeric',
  numeric: 'numeric',
};

/** Multi-word type names: a parameter spelled exactly like one of these has no name. */
const MULTI_WORD_TYPES = Object.keys(TYPE_ALIASES).filter((t) => t.includes(' '));

/** Canonical spelling of one type, as regprocedure prints it (typmods dropped, public./pg_catalog. dropped). */
export function normalizeType(raw: string): string {
  let t = normalizeSql(raw)
    .replace(/\(\s*\d+(\s*,\s*\d+)?\s*\)/g, '')
    .replace(/\s+\[/g, '[')
    .trim();
  if (/%\s*type\b/.test(t)) throw new Error(`%TYPE argument is not modelled: ${raw}`);
  t = t.replace(/^(public|pg_catalog)\./, '').replace(/"/g, '');
  const array = /(\[\])+$/.exec(t);
  const base = array ? t.slice(0, t.length - array[0].length).trim() : t;
  return (TYPE_ALIASES[base] ?? base) + (array ? '[]'.repeat(array[0].length / 2) : '');
}

/** Input argument types of a parameter list (names, defaults and OUT parameters dropped). */
export function inputArgTypes(paramList: string): string[] {
  const out: string[] = [];
  for (const rawParam of splitTopLevel(paramList)) {
    let p = normalizeSql(rawParam)
      .replace(/\s+default\s+[\s\S]*$/, '')
      .replace(/\s*=\s*[\s\S]*$/, '')
      .replace(/\(\s*\d+(\s*,\s*\d+)?\s*\)/g, '')
      .trim();
    let mode = 'in';
    const m = /^(in|out|inout|variadic)\s+/.exec(p);
    if (m) {
      mode = m[1];
      p = p.slice(m[0].length);
    }
    if (mode === 'out') continue;
    const bare = p.replace(/(\s*\[\])+$/, '');
    const unnamed = !p.includes(' ') || MULTI_WORD_TYPES.includes(bare);
    out.push(normalizeType(unnamed ? p : p.slice(p.indexOf(' ') + 1)));
  }
  return out;
}

const IDENT = '("?[a-z0-9_$]+"?)';
const unquote = (s: string) => s.replace(/"/g, '');

/** Parse "[schema.]name[(args)]" at the start of `text`. */
function parseTarget(text: string): { schema: string; name: string; args: string[] | null; rest: string } | null {
  const m = new RegExp(`^(?:${IDENT}\\.)?${IDENT}\\s*`).exec(text);
  if (!m) return null;
  const schema = m[1] ? unquote(m[1]) : 'public';
  const name = unquote(m[2]);
  let rest = text.slice(m[0].length);
  let args: string[] | null = null;
  if (rest.startsWith('(')) {
    const inner = balancedParens(rest, 0);
    if (!inner) return null;
    args = inputArgTypes(inner.inner);
    rest = rest.slice(inner.end + 1).trim();
  }
  return { schema, name, args, rest };
}

const keyOf = (schema: string, name: string, args: string[]) => `${schema}.${name}(${args.join(',')})`;

/** Dollar-quoted body: $$...$$ or $tag$...$tag$ (the closing tag must repeat the opening one). */
const DOLLAR_BODY = /\$([A-Za-z_][A-Za-z0-9_]*)?\$([\s\S]*?)\$\1\$/g;

/**
 * The statement with the comments INSIDE each dollar-quoted body removed, then normalized. Comments must be removed
 * before whitespace is collapsed: collapsing first would turn a "-- comment" line into a comment that swallows the
 * rest of the body.
 */
function normalizeWithBodyComments(raw: string): { statement: string; bodies: string[] } {
  const bodies: string[] = [];
  const cleaned = raw.replace(DOLLAR_BODY, (_m, tag: string | undefined, inner: string) => {
    const body = stripSqlComments(inner);
    bodies.push(normalizeSql(body));
    return `$${tag ?? ''}$${body}$${tag ?? ''}$`;
  });
  return { statement: normalizeSql(cleaned), bodies };
}

const DYNAMIC_PRIVILEGE_SQL = [
  /\b(grant|revoke)\b[^;]*\bon\s+(function|procedure|routine|all\s+(functions|procedures|routines))\b/,
  /\balter\s+default\s+privileges\b/,
  /\bcreate\s+(or\s+replace\s+)?(function|procedure)\b/,
  /\balter\s+(function|procedure|routine)\b/,
  /\bdrop\s+(function|procedure|routine)\b/,
];

/** Replay the migrations (already in apply order) and return every function's final EXECUTE grantees. */
export function buildFunctionModel(migrations: Migration[]): FunctionModel {
  const functions = new Map<string, FunctionState>();
  const defaultPrivilegeStatements: { file: string; statement: string }[] = [];
  const unsupported: string[] = [];

  const resolve = (file: string, schema: string, name: string, args: string[] | null, kinds: string[]): FunctionState[] => {
    if (args) {
      const f = functions.get(keyOf(schema, name, args));
      return f && kinds.includes(f.kind) ? [f] : [];
    }
    const byName = [...functions.values()].filter((f) => f.schema === schema && f.name === name && kinds.includes(f.kind));
    if (byName.length > 1) throw new Error(`${file}: ${schema}.${name} without an argument list is ambiguous`);
    return byName;
  };

  const rolesOf = (file: string, list: string): string[] =>
    splitTopLevel(list).map((r) => {
      const role = unquote(r.trim().replace(/^group\s+/, ''));
      if (!KNOWN_ROLES.has(role)) unsupported.push(`${file}: grant/revoke names role "${role}"`);
      return role;
    });

  const kindsFor = (word: string) =>
    word.startsWith('procedure') ? ['procedure'] : word.startsWith('routine') ? ['function', 'procedure'] : ['function'];

  for (const { file, sql } of migrations) {
    for (const raw of splitSqlStatements(sql)) {
      const { statement: n, bodies } = normalizeWithBodyComments(raw);

      // Dynamic SQL inside DO blocks and function bodies cannot be replayed: fail closed if it touches functions.
      const isCreateFn = /^create (or replace )?(function|procedure) /.test(n);
      if (/^do\b/.test(n) || isCreateFn) {
        for (const body of bodies) {
          if (DYNAMIC_PRIVILEGE_SQL.some((re) => re.test(body))) {
            unsupported.push(`${file}: ${isCreateFn ? 'a function body' : 'a DO block'} creates, alters or grants on functions in SQL this model cannot replay`);
          }
        }
      }
      if (isCreateFn && /\bbegin atomic\b/.test(n)) unsupported.push(`${file}: a BEGIN ATOMIC function body is not modelled`);

      // CREATE [OR REPLACE] FUNCTION | PROCEDURE
      const create = /^create (or replace )?(function|procedure) /.exec(n);
      if (create) {
        const target = parseTarget(n.slice(create[0].length));
        if (!target || !target.args) throw new Error(`${file}: cannot parse ${n.slice(0, 120)}`);
        const kind = create[2] as 'function' | 'procedure';
        const header = target.rest.replace(DOLLAR_BODY, ' ').replace(/'(?:[^']|'')*'/g, "''");
        const key = keyOf(target.schema, target.name, target.args);
        const existing = functions.get(key);
        if (existing && !create[1]) throw new Error(`${file}: CREATE of existing ${key} would fail in PostgreSQL`);
        if (existing && existing.kind !== kind) throw new Error(`${file}: ${key} changes between function and procedure`);
        const returnWord = (/\breturns (?:setof )?("?[a-z0-9_]+"?)/.exec(header)?.[1] ?? '?').replace(/"/g, '');
        const returns = kind === 'procedure' ? '' : (TYPE_ALIASES[returnWord] ?? returnWord);
        functions.set(key, {
          key,
          schema: target.schema,
          name: target.name,
          args: target.args,
          kind,
          securityDefiner: /\bsecurity definer\b/.test(header),
          returns,
          definition: n,
          definedIn: file,
          execute: existing ? existing.execute : new Set(platformDefaultExecute(target.schema)),
        });
        continue;
      }

      // DROP FUNCTION | PROCEDURE | ROUTINE
      const drop = /^drop (function|procedure|routine) (if exists )?(.+?)(?: (cascade|restrict))?$/.exec(n);
      if (drop) {
        for (const t of splitTopLevel(drop[3])) {
          const target = parseTarget(t);
          if (!target) throw new Error(`${file}: cannot parse drop target ${t}`);
          const found = resolve(file, target.schema, target.name, target.args, kindsFor(drop[1]));
          if (found.length === 0 && !drop[2]) throw new Error(`${file}: DROP of unknown ${t}`);
          for (const f of found) functions.delete(f.key);
        }
        continue;
      }

      // ALTER FUNCTION | PROCEDURE | ROUTINE
      const alter = /^alter (function|procedure|routine) (.+)$/.exec(n);
      if (alter) {
        const target = parseTarget(alter[2]);
        if (!target) throw new Error(`${file}: cannot parse ${n.slice(0, 120)}`);
        const found = resolve(file, target.schema, target.name, target.args, kindsFor(alter[1]));
        if (found.length !== 1) throw new Error(`${file}: ALTER of unknown ${alter[2].slice(0, 80)}`);
        if (/\b(owner to|rename to|set schema|depends on extension)\b/.test(target.rest)) {
          unsupported.push(`${file}: ALTER ${found[0].key} ${target.rest.slice(0, 40)} is not modelled`);
        }
        if (/\bsecurity definer\b/.test(target.rest)) found[0].securityDefiner = true;
        if (/\bsecurity invoker\b/.test(target.rest)) found[0].securityDefiner = false;
        continue;
      }

      if (/^alter default privileges\b/.test(n)) {
        defaultPrivilegeStatements.push({ file, statement: n });
        continue;
      }

      // GRANT / REVOKE ... ON ALL FUNCTIONS|PROCEDURES|ROUTINES IN SCHEMA ...
      const allGrant = /^grant (.+?) on all (functions|procedures|routines) in schema (.+?) to (.+?)(?: with grant option)?(?: granted by \S+)?$/.exec(n);
      const allRevoke = /^revoke (grant option for )?(.+?) on all (functions|procedures|routines) in schema (.+?) from (.+?)(?: granted by \S+)?(?: (?:cascade|restrict))?$/.exec(n);
      if (allGrant || allRevoke) {
        const privileges = allGrant ? allGrant[1] : allRevoke![2];
        if (allRevoke && allRevoke[1]) continue; // REVOKE GRANT OPTION FOR keeps EXECUTE itself
        if (!/\b(execute|all)\b/.test(privileges)) continue;
        const schemas = splitTopLevel(allGrant ? allGrant[3] : allRevoke![4]).map((s) => unquote(s.trim()));
        const kinds = kindsFor(allGrant ? allGrant[2] : allRevoke![3]);
        const roles = rolesOf(file, allGrant ? allGrant[4] : allRevoke![5]);
        for (const f of functions.values()) {
          if (!schemas.includes(f.schema) || !kinds.includes(f.kind)) continue;
          for (const r of roles) (allGrant ? f.execute.add(r) : f.execute.delete(r));
        }
        continue;
      }

      // GRANT / REVOKE ... ON FUNCTION|PROCEDURE|ROUTINE <list>
      const grant = /^grant (.+?) on (function|procedure|routine) (.+?) to (.+?)(?: with grant option)?(?: granted by \S+)?$/.exec(n);
      const revoke = /^revoke (grant option for )?(.+?) on (function|procedure|routine) (.+?) from (.+?)(?: granted by \S+)?(?: (?:cascade|restrict))?$/.exec(n);
      if (grant || revoke) {
        if (revoke && revoke[1]) continue;
        const privileges = grant ? grant[1] : revoke![2];
        if (!/\b(execute|all)\b/.test(privileges)) continue;
        const kinds = kindsFor(grant ? grant[2] : revoke![3]);
        const roles = rolesOf(file, grant ? grant[4] : revoke![5]);
        for (const t of splitTopLevel(grant ? grant[3] : revoke![4])) {
          const target = parseTarget(t);
          if (!target) throw new Error(`${file}: cannot parse privilege target ${t}`);
          const found = resolve(file, target.schema, target.name, target.args, kinds);
          if (found.length !== 1) throw new Error(`${file}: GRANT/REVOKE names unknown function ${t}`);
          for (const r of roles) (grant ? found[0].execute.add(r) : found[0].execute.delete(r));
        }
        continue;
      }
    }
  }
  return { functions, defaultPrivilegeStatements, unsupported };
}

/** True when PUBLIC, anon or authenticated holds EXECUTE (anon and authenticated are members of PUBLIC). */
export function isClientExecutable(f: FunctionState): boolean {
  return CLIENT_ROLES.some((r) => f.execute.has(r));
}

/** Trigger functions cannot be called directly ("trigger functions can only be called as triggers"). */
export function isTriggerFunction(f: FunctionState): boolean {
  return f.returns === 'trigger' || f.returns === 'event_trigger';
}
