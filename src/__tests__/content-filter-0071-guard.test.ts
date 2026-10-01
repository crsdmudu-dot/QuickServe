/**
 * Guard for 0071_narrow_content_filter.sql (owner decision 2026-09-27).
 *
 * Pins the reviewed shape of the narrowed filter:
 *   - exactly the 14 mild, everyday or ambiguous entries leave the hard block;
 *   - exactly the 16 plural forms of the clearest slurs and strong profanity are added;
 *   - legitimate multi-word phrases ("kaffir lime") are exempted as whole phrases, from a private table with no
 *     client privileges and row-level security, and a single word can never be exempted;
 *   - contains_blocked_term() stays callable by no client role; the trigger and normalisation are untouched.
 * Behaviour is proven on a real database by the F5 SQL harness (t0071.sql).
 */
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS = path.join(__dirname, '../../supabase/migrations');
const raw = fs.readFileSync(path.join(MIGRATIONS, '0071_narrow_content_filter.sql'), 'utf-8');
const sql = raw
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');
const flat = sql.replace(/\s+/g, ' ').trim().toLowerCase();

const REMOVED = ['shit', 'bullshit', 'bastard', 'mshenzi', 'washenzi', 'mpumbavu', 'wapumbavu', 'mjinga wewe',
  'fala wewe', 'retard', 'pussy', 'fag', 'tomba', 'malaya'];
const ADDED = ['niggers', 'niggas', 'faggots', 'kaffirs', 'fucks', 'fuckin', 'fuckers', 'motherfuckers', 'cunts',
  'whores', 'sluts', 'twats', 'wankers', 'dickheads', 'assholes', 'arseholes'];

function quotedList(statementStart: string, statementEnd: string): string[] {
  const start = flat.indexOf(statementStart);
  expect(start).toBeGreaterThanOrEqual(0);
  const body = flat.slice(start, flat.indexOf(statementEnd, start));
  return [...body.matchAll(/'([a-z0-9 ]+)'/g)].map((m) => m[1]);
}

describe('0071 — narrowed objectionable-language filter', () => {
  it('is stored byte-exact (no CR bytes)', () => {
    expect(raw.includes('\r')).toBe(false);
  });

  it('removes exactly the 14 reviewed entries', () => {
    const removed = quotedList('delete from private.blocked_terms where term in (', ');');
    expect(removed.sort()).toEqual([...REMOVED].sort());
  });

  it('adds exactly the 16 plural forms, none of them a removed entry', () => {
    const added = quotedList('insert into private.blocked_terms (term) values', 'on conflict');
    expect(added.sort()).toEqual([...ADDED].sort());
    expect(added.filter((t) => REMOVED.includes(t))).toEqual([]);
  });

  it('allowed phrases are private, have RLS, and must be at least two words', () => {
    expect(flat).toContain('create table if not exists private.allowed_phrases');
    expect(flat).toContain("phrase text primary key check (phrase ~ '^[a-z0-9]+( [a-z0-9]+)+$')");
    expect(flat).toContain('revoke all on table private.allowed_phrases from public, anon, authenticated;');
    expect(flat).toContain('alter table private.allowed_phrases enable row level security;');
    expect(flat).not.toMatch(/grant [a-z, ]+ on (table )?private\.allowed_phrases/);
    expect(flat).not.toMatch(/create policy/);
    expect(quotedList('insert into private.allowed_phrases (phrase) values', 'on conflict').sort()).toEqual(['kaffir lime', 'kaffir limes']);
  });

  it('contains_blocked_term strips allowed phrases, then keeps whole-word matching, and is not client-callable', () => {
    const start = flat.indexOf('create or replace function public.contains_blocked_term(p_text text)');
    expect(start).toBeGreaterThanOrEqual(0);
    const fn = flat.slice(start, flat.indexOf('$$;', start) + 3);
    expect(fn).toContain('security definer');
    expect(fn).toContain('set search_path = public, pg_temp');
    expect(fn).toContain("v text := ' ' || public.normalize_user_text(p_text) || ' ';");
    expect(fn).toContain('from private.allowed_phrases');
    expect(fn).toContain("where v like ('% ' || bt.term || ' %')");
    expect(flat).toContain('revoke execute on function public.contains_blocked_term(text) from public, anon, authenticated;');
    expect(flat).not.toMatch(/grant execute on function public\.contains_blocked_term/);
  });

  it('leaves the trigger and the normalisation untouched', () => {
    expect(flat).not.toContain('function public.tg_filter_user_text');
    expect(flat).not.toContain('function public.normalize_user_text');
    expect(flat).not.toMatch(/create (or replace )?trigger/);
  });

  it('the final list (0067 minus the 14, plus the 16) has 49 entries and keeps the clear slurs', () => {
    const original = fs.readFileSync(path.join(MIGRATIONS, '0067_content_filter.sql'), 'utf-8');
    const start = original.indexOf('insert into private.blocked_terms (term) values');
    const terms = [...original.slice(start).matchAll(/\('([a-z0-9 ]+)'\)/g)].map((m) => m[1]);
    expect(terms).toHaveLength(47);
    const final = [...terms.filter((t) => !REMOVED.includes(t)), ...ADDED];
    expect(new Set(final).size).toBe(49);
    for (const t of ['nigger', 'faggot', 'kaffir', 'cunt', 'fuck', 'msenge', 'kumanyoko', 'kutomba']) expect(final).toContain(t);
  });
});
