/**
 * Guard for 0068_terms_acceptance.sql (store-compliance F5.4, lead-PM stage 06 R11).
 *
 * Pins the reviewed shape:
 *   - one database Terms version, equal to the app's CURRENT_TERMS_VERSION (so the app and the database agree);
 *   - acceptances are written only through accept_terms(), which requires a signed-in, active caller and the
 *     current version; no client can write the table, and only the user (or an active admin) can read it;
 *   - RESTRICTIVE insert policies on chat messages and reviews, for signed-in users;
 *   - a trigger with the same rule for a user's own bio/skills changes and review comment edits, which skips server
 *     paths and admins editing someone else's profile, and refuses with the fixed 'terms_not_accepted'.
 * Behaviour is proven on a real database by the F5 SQL harness (t0068.sql).
 */
import * as fs from 'fs';
import * as path from 'path';

import { CURRENT_TERMS_VERSION } from '@/constants/terms';
import { databaseLabel } from '../../scripts/check-terms-release';

const MIGRATIONS = path.join(__dirname, '../../supabase/migrations');
const raw = fs.readFileSync(path.join(MIGRATIONS, '0068_terms_acceptance.sql'), 'utf-8');
const sql = raw
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');
const flat = sql.replace(/\s+/g, ' ').trim().toLowerCase();

function body(name: string): string {
  const start = flat.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  return flat.slice(start, flat.indexOf('$$;', start) + 3);
}

describe('0068 — Terms acceptance gate', () => {
  it('is stored byte-exact (no CR bytes)', () => {
    expect(raw.includes('\r')).toBe(false);
  });

  it("the database Terms version (the LAST migration that defines it) equals the app's CURRENT_TERMS_VERSION", () => {
    // 0068 defines the first label; once 0068 is on QA a new label comes as a later forward migration, so the label
    // the database will use is the last definition (the same rule as scripts/check-terms-release.ts).
    const m = /create or replace function public\.current_terms_version\(\)[\s\S]*?select '([^']+)'::text/.exec(raw);
    expect(m).not.toBeNull();
    const latest = databaseLabel(path.join(__dirname, '../..'));
    expect(latest.unparsed).toBeNull();
    expect(latest.label).toBe(CURRENT_TERMS_VERSION);
    expect(body('current_terms_version')).toContain('immutable');
    expect(flat).toContain('revoke execute on function public.current_terms_version() from public, anon, authenticated;');
    expect(flat).not.toMatch(/grant execute on function public\.current_terms_version\(/);
  });

  it('acceptances: no client writes; only the user or an active admin can read them', () => {
    expect(flat).toContain('create table if not exists public.terms_acceptances');
    expect(flat).toContain('references public.profiles (id) on delete cascade');
    expect(flat).toContain("check (source in ('register', 'prompt'))");
    expect(flat).toContain('primary key (user_id, terms_version)');
    expect(flat).toContain('alter table public.terms_acceptances enable row level security;');
    expect(flat).toContain('revoke all on table public.terms_acceptances from public, anon, authenticated;');
    expect(flat).toContain('grant select on table public.terms_acceptances to authenticated;');
    expect(flat).not.toMatch(/grant (insert|update|delete|all)[a-z, ]* on (table )?public\.terms_acceptances/);
    expect(flat).toContain(
      'create policy terms_acceptances_select on public.terms_acceptances for select to authenticated using (user_id = auth.uid() or public.is_active_admin());',
    );
  });

  it('accept_terms: signed-in, active caller, current version only, known source', () => {
    const b = body('accept_terms');
    expect(b).toContain('security definer');
    expect(b).toContain('set search_path = public, pg_temp');
    const begin = b.indexOf(' begin ');
    expect(b.slice(begin, begin + 60)).toContain('if auth.uid() is null then raise exception');
    expect(b).toContain('if not public.is_active_user() then');
    expect(b).toContain('p_version <> public.current_terms_version()');
    expect(b).toContain("p_source not in ('register', 'prompt')");
    expect(b).toContain('values (auth.uid(), p_version, p_source)');
    expect(flat).toContain('revoke execute on function public.accept_terms(text, text) from public, anon, authenticated;');
    expect(flat).toContain('grant execute on function public.accept_terms(text, text) to authenticated;');
  });

  it('has_accepted_current_terms: about the caller only, for signed-in users only', () => {
    const b = body('has_accepted_current_terms');
    expect(b).toContain('security definer');
    expect(b).toContain('ta.user_id = auth.uid()');
    expect(b).toContain('ta.terms_version = public.current_terms_version()');
    expect(flat).toContain('grant execute on function public.has_accepted_current_terms() to authenticated;');
    expect(flat).not.toMatch(/grant execute on function public\.has_accepted_current_terms\(\) to [a-z, ]*anon/);
  });

  it('chat messages and reviews need the current Terms (restrictive insert policies, signed-in users)', () => {
    for (const t of ['booking_messages', 'reviews']) {
      const name = t === 'reviews' ? 'reviews_require_terms' : 'booking_messages_require_terms';
      expect(flat).toContain(
        `create policy ${name} on public.${t} as restrictive for insert to authenticated with check (public.has_accepted_current_terms());`,
      );
    }
  });

  it('the trigger skips server paths and admins editing others, checks only real changes, and refuses without detail', () => {
    const b = body('tg_require_current_terms');
    const begin = b.indexOf(' begin ');
    expect(b.slice(begin, begin + 60)).toContain('begin if auth.uid() is null then return new;');
    expect(b).toContain('if new.id is distinct from auth.uid() then return new;');
    expect(b).toContain('new.bio is not distinct from old.bio and new.skills is not distinct from old.skills');
    expect(b).toContain('if new.comment is not distinct from old.comment then return new;');
    expect(b).toContain("raise exception 'terms_not_accepted' using errcode = 'p0001';");
    expect(flat).not.toMatch(/raise (notice|log|info|debug|warning)/);
    expect(flat).toContain('create trigger trg_terms_profiles before update of bio, skills on public.profiles for each row execute function public.tg_require_current_terms();');
    expect(flat).toContain('create trigger trg_terms_reviews before update of comment on public.reviews for each row execute function public.tg_require_current_terms();');
    expect(flat).toContain('revoke execute on function public.tg_require_current_terms() from public, anon, authenticated;');
  });

  it('does not redefine certified deletion routines or the 0065-0067 functions', () => {
    for (const fn of ['delete_account', 'complete_account_deletion', '_deletion_inventory', 'list_cleanup_candidates', 'try_complete_cleanup',
      'report_content', 'block_user', 'booking_chat_blocked', 'tg_filter_user_text', 'contains_blocked_term', 'is_active_user', 'is_active_admin']) {
      expect(flat).not.toContain(`function public.${fn}(`);
    }
  });
});
