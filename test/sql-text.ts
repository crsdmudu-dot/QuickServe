/**
 * sql-text.ts - small, dependency-free helpers for reading migration SQL in guard tests.
 *
 * Guard tests read supabase/migrations as TEXT; no database is contacted. Plain regular expressions over raw files
 * are easy to fool: a comment that merely MENTIONS "grant insert" looks like a grant, and a semicolon inside a
 * function body looks like the end of a statement. These helpers remove comments and split statements the way
 * PostgreSQL does:
 *   - `-- ...` line comments and nested block comments are dropped;
 *   - 'single-quoted' strings (with '' escapes, and E'...' backslash escapes), "quoted identifiers" and
 *     $tag$ dollar-quoted $tag$ bodies are kept exactly as written, and a semicolon inside them never ends a
 *     statement.
 *
 * Kept free of imports and of TypeScript-only runtime syntax, so the same file also runs under plain Node 24
 * (type stripping) for local checks.
 */

/** Characters that can continue an unquoted SQL identifier. */
function isIdentChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
}

/** If a dollar-quote opening tag ($$ or $name$) starts at index i, return it; otherwise null. */
function dollarTagAt(sql: string, i: number): string | null {
  if (sql[i] !== '$') return null;
  // A dollar quote cannot continue an identifier (e.g. "a$b$") and $1-style parameters are not quotes.
  if (i > 0 && isIdentChar(sql[i - 1])) return null;
  const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
  return m ? m[0] : null;
}

type Piece = { kind: 'code' | 'quoted'; text: string };

/**
 * Split SQL into code and quoted pieces, dropping comments. Quoted pieces are single-quoted strings,
 * quoted identifiers and dollar-quoted bodies, each including its delimiters. A comment becomes one space in the
 * code piece so that the tokens on either side of it never merge.
 */
function scan(sql: string): Piece[] {
  const pieces: Piece[] = [];
  let code = '';
  const flushCode = () => {
    if (code) pieces.push({ kind: 'code', text: code });
    code = '';
  };
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      i = end < 0 ? sql.length : end;
      code += ' ';
      continue;
    }
    if (ch === '/' && next === '*') {
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql[j] === '/' && sql[j + 1] === '*') {
          depth += 1;
          j += 2;
        } else if (sql[j] === '*' && sql[j + 1] === '/') {
          depth -= 1;
          j += 2;
        } else j += 1;
      }
      i = j;
      code += ' ';
      continue;
    }
    if (ch === "'") {
      // E'...' strings treat a backslash as an escape; standard strings only double the quote.
      const escaped = (code.endsWith('E') || code.endsWith('e')) && !isIdentChar(code[code.length - 2]);
      let j = i + 1;
      while (j < sql.length) {
        if (escaped && sql[j] === '\\') {
          j += 2;
          continue;
        }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      flushCode();
      pieces.push({ kind: 'quoted', text: sql.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') {
            j += 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      flushCode();
      pieces.push({ kind: 'quoted', text: sql.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    const tag = dollarTagAt(sql, i);
    if (tag) {
      const close = sql.indexOf(tag, i + tag.length);
      const end = close < 0 ? sql.length : close + tag.length;
      flushCode();
      pieces.push({ kind: 'quoted', text: sql.slice(i, end) });
      i = end;
      continue;
    }
    code += ch;
    i += 1;
  }
  flushCode();
  return pieces;
}

/** The SQL with every comment removed; strings, quoted identifiers and dollar-quoted bodies are untouched. */
export function stripSqlComments(sql: string): string {
  return scan(sql)
    .map((p) => p.text)
    .join('');
}

/**
 * Top-level statements, comment-free and trimmed, without their terminating semicolon. A semicolon inside a
 * string, a quoted identifier or a dollar-quoted body (for example a plpgsql function) does not split.
 */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const piece of scan(sql)) {
    if (piece.kind === 'quoted') {
      cur += piece.text;
      continue;
    }
    for (const ch of piece.text) {
      if (ch === ';') {
        if (cur.trim()) out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Split on a separator that is not inside parentheses, brackets, strings, quoted identifiers or dollar-quoted
 * bodies. Used for column lists, argument lists and role lists. Pieces are trimmed; empty pieces are dropped.
 */
export function splitTopLevel(text: string, sep = ','): string[] {
  const out: string[] = [];
  let cur = '';
  let depth = 0;
  for (const piece of scan(text)) {
    if (piece.kind === 'quoted') {
      cur += piece.text;
      continue;
    }
    for (const ch of piece.text) {
      if (ch === '(' || ch === '[') depth += 1;
      if (ch === ')' || ch === ']') depth -= 1;
      if (ch === sep && depth === 0) {
        if (cur.trim()) out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Lower-case and collapse runs of whitespace to one space. For comparing statement SHAPES, not string contents. */
export function normalizeSql(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Return the text between the parenthesis that opens at `openIndex` and its matching close, respecting strings,
 * quoted identifiers and dollar quotes. Returns null if `openIndex` is not an opening parenthesis or it is never
 * closed.
 */
export function balancedParens(text: string, openIndex: number): { inner: string; end: number } | null {
  if (text[openIndex] !== '(') return null;
  let depth = 0;
  let i = openIndex;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === ch) {
          if (text[j + 1] === ch) {
            j += 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      i = j + 1;
      continue;
    }
    const tag = dollarTagAt(text, i);
    if (tag) {
      const close = text.indexOf(tag, i + tag.length);
      i = close < 0 ? text.length : close + tag.length;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) return { inner: text.slice(openIndex + 1, i), end: i };
    }
    i += 1;
  }
  return null;
}

/**
 * Split a boolean expression on its top-level AND operators only (never inside parentheses, strings or quoted
 * identifiers). Input should already be normalized (lower case, single spaces). Used to read policy expressions
 * conjunct by conjunct.
 */
export function topLevelConjuncts(expr: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  let quote: string | null = null;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (depth === 0 && expr.startsWith(' and ', i)) {
      out.push(cur.trim());
      cur = '';
      i += ' and '.length - 1;
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export type MigrationText = { file: string; sql: string };

/**
 * Every column the migrations give public.<table>: CREATE TABLE column definitions plus ALTER TABLE ... ADD
 * [COLUMN], minus DROP COLUMN. A RENAME, or a DO block that alters the table dynamically, throws: this reader
 * cannot follow it, so the calling guard must be updated by a person.
 */
export function tableColumns(migrations: MigrationText[], table: string): string[] {
  const cols = new Set<string>();
  const name = String.raw`(?:public\.)?"?${table}"?`;
  const unq = (s: string) => s.trim().replace(/^"(.*)"$/, '$1');
  for (const { file, sql } of migrations) {
    for (const stmt of splitSqlStatements(sql)) {
      const n = normalizeSql(stmt);
      const create = new RegExp(String.raw`^create table (?:if not exists )?${name} ?\(`).exec(n);
      if (create) {
        const body = balancedParens(n, create[0].length - 1);
        if (!body) throw new Error(`${file}: unbalanced CREATE TABLE ${table}`);
        for (const def of splitTopLevel(body.inner)) {
          const first = unq(def.split(' ')[0]);
          if (!['constraint', 'primary', 'unique', 'check', 'foreign', 'exclude', 'like'].includes(first)) cols.add(first);
        }
        continue;
      }
      const alter = new RegExp(String.raw`^alter table (?:only )?(?:if exists )?${name} (.*)$`).exec(n);
      if (alter) {
        for (const clause of splitTopLevel(alter[1])) {
          if (/^rename\b/.test(clause)) throw new Error(`${file}: ${table} rename is not modelled; update the guard`);
          const drop = /^drop (?:column )?(?:if exists )?("?[a-z0-9_]+"?)/.exec(clause);
          if (drop && !/^drop constraint\b/.test(clause)) cols.delete(unq(drop[1]));
          const add = /^add (?:column )?(?:if not exists )?("?[a-z0-9_]+"?)/.exec(clause);
          if (add && !/^add (constraint|primary|unique|check|foreign|exclude)\b/.test(clause)) cols.add(unq(add[1]));
        }
        continue;
      }
      // (Dynamic ADD/DROP CONSTRAINT, as 0056 does for a foreign key, does not change the column list.)
      if (/^do\b/.test(n) && new RegExp(String.raw`alter table [^;]*\b${table}\b[^;]* ((add|drop) (?!constraint\b)|rename\b)`).test(n)) {
        throw new Error(`${file}: a DO block alters ${table} dynamically; update the guard`);
      }
    }
  }
  return [...cols].sort();
}

/**
 * The latest CREATE POLICY statement (normalized) for public.<table> policy <policy> across the migrations, or
 * null if the latest event is a DROP. Also reports which file it came from.
 */
export function latestPolicy(
  migrations: MigrationText[],
  table: string,
  policy: string,
): { file: string; statement: string } | null {
  let latest: { file: string; statement: string } | null = null;
  const target = String.raw`"?${policy}"? on (?:public\.)?"?${table}"?`;
  for (const { file, sql } of migrations) {
    for (const stmt of splitSqlStatements(sql)) {
      const n = normalizeSql(stmt);
      if (new RegExp(String.raw`^create policy ${target}\b`).test(n)) latest = { file, statement: n };
      else if (new RegExp(String.raw`^drop policy (?:if exists )?${target}$`).test(n)) latest = null;
      else if (new RegExp(String.raw`^alter policy ${target}\b`).test(n)) throw new Error(`${file}: ALTER POLICY ${policy} is not modelled`);
    }
  }
  return latest;
}

/** The USING and WITH CHECK expressions of a normalized CREATE POLICY statement (without their parentheses). */
export function policyExpressions(statement: string): { using: string | null; check: string | null } {
  const part = (keyword: string): string | null => {
    const at = statement.indexOf(`${keyword} (`);
    if (at < 0) return null;
    const inner = balancedParens(statement, at + keyword.length + 1);
    return inner ? inner.inner.trim() : null;
  };
  return { using: part(' using'), check: part(' with check') };
}
