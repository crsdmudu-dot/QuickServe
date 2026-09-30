/**
 * Guard for 0067_content_filter.sql (store-compliance F5.3).
 *
 * Pins the reviewed shape (lead-PM stage 06, design point f):
 *   - the word list lives in the private schema with no client privileges, and no function is
 *     callable by a client role (nobody can read or probe the list);
 *   - whole-word matching only, after normalisation;
 *   - the trigger skips server paths (auth.uid() is null), checks only changed, non-null text, and
 *     refuses with the fixed 'content_not_allowed' and no detail — it never logs the text;
 *   - it covers chat inserts, review comments (insert and edit) and provider bio/skills updates.
 * Behaviour is proven on a real database by the F5 SQL harness (t0067.sql).
 */
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS = path.join(__dirname, '../../supabase/migrations');
const raw = fs.readFileSync(path.join(MIGRATIONS, '0067_content_filter.sql'), 'utf-8');
const sql = raw
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const flat = norm(sql);

function body(name: string): string {
  const start = flat.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  return flat.slice(start, flat.indexOf('$$;', start) + 3);
}
function statement(prefix: string): string {
  const start = flat.indexOf(prefix);
  expect(start).toBeGreaterThanOrEqual(0);
  return flat.slice(start, flat.indexOf(';', start) + 1);
}

const FUNCTIONS: [string, string][] = [
  ['normalize_user_text', 'text'],
  ['contains_blocked_term', 'text'],
  ['tg_filter_user_text', ''],
];

describe('0067 — objectionable-language filter', () => {
  it('is stored byte-exact (no CR bytes)', () => {
    expect(raw.includes('\r')).toBe(false);
  });

  it('the word list is private: no client privileges, letters/digits-only terms', () => {
    expect(flat).toContain('create table if not exists private.blocked_terms');
    expect(flat).toContain("term text primary key check (term ~ '^[a-z0-9]+( [a-z0-9]+)*$')");
    expect(flat).toContain('revoke all on table private.blocked_terms from public, anon, authenticated;');
    expect(flat).not.toMatch(/grant [a-z, ]+ on (table )?private\.blocked_terms/);
  });

  it.each(FUNCTIONS)('%s is callable by no client role', (name, sig) => {
    expect(flat).toContain(`revoke execute on function public.${name}(${sig}) from public, anon, authenticated;`);
    expect(flat).not.toMatch(new RegExp(`grant execute on function public\\.${name}\\(`));
  });

  it('normalisation is a plain immutable function; matching is whole words only', () => {
    const n = body('normalize_user_text');
    expect(n).toContain('immutable');
    expect(n).not.toContain('security definer');
    expect(n).toContain("'[*._-]', '', 'g'");
    expect(n).toContain("'[^a-z0-9]+', ' ', 'g'");
    const c = body('contains_blocked_term');
    expect(c).toContain('security definer');
    expect(c).toContain('set search_path = public, pg_temp');
    expect(c).toContain("(' ' || public.normalize_user_text(p_text) || ' ') like ('% ' || bt.term || ' %')");
  });

  it('the trigger skips server paths first and checks only changed text', () => {
    const t = body('tg_filter_user_text');
    expect(t).toContain('security definer');
    const begin = t.indexOf(' begin ');
    expect(t.slice(begin, begin + 60)).toContain('begin if auth.uid() is null then return new; end if;');
    expect(t).toContain("if tg_op = 'update' and new.comment is not distinct from old.comment then return new;");
    expect(t).toContain('case when new.bio is distinct from old.bio then new.bio end');
    expect(t).toContain('case when new.skills is distinct from old.skills then array_to_string(new.skills');
  });

  it('refuses with the fixed message and no detail, and never logs the text', () => {
    const t = body('tg_filter_user_text');
    expect(t).toContain("raise exception 'content_not_allowed' using errcode = 'p0001';");
    expect(flat).not.toMatch(/\bdetail\s*=/);
    expect(flat).not.toMatch(/\bhint\s*=/);
    expect(flat).not.toMatch(/raise (notice|log|info|debug|warning)/);
  });

  it('covers chat inserts, review comments (insert and edit) and provider bio/skills', () => {
    expect(statement('create trigger trg_filter_booking_messages')).toContain(
      'before insert on public.booking_messages for each row execute function public.tg_filter_user_text()',
    );
    expect(statement('create trigger trg_filter_reviews')).toContain(
      'before insert or update of comment on public.reviews for each row execute function public.tg_filter_user_text()',
    );
    expect(statement('create trigger trg_filter_profiles')).toContain(
      'before update of bio, skills on public.profiles for each row execute function public.tg_filter_user_text()',
    );
  });

  it('ships a starter list and leaves out words with an everyday meaning', () => {
    const terms = [...raw.matchAll(/\('([a-z0-9 ]+)'\)/g)].map((m) => m[1]);
    expect(terms.length).toBeGreaterThanOrEqual(40);
    for (const everyday of ['shoga', 'mbwa', 'nguruwe', 'mjinga', 'fala', 'matako', 'mavi']) {
      expect(terms).not.toContain(everyday);
    }
  });

  it('does not redefine any certified deletion routine', () => {
    for (const routine of ['delete_account', 'complete_account_deletion', '_deletion_inventory', 'list_cleanup_candidates', 'try_complete_cleanup']) {
      expect(flat).not.toContain(`function public.${routine}(`);
    }
  });
});
