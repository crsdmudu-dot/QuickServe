-- =================================================================================================
-- 0071 — Narrow the objectionable-language filter (owner decision 2026-09-27)
-- =================================================================================================
-- WHY. The 0067 starter list refused ordinary text: mild words that appear in honest reviews ("shit service"),
-- everyday Swahili insults the owner decided not to hard-block, and words with innocent service or place meanings
-- (a mechanic's "retard the timing", "Tomba road", "Malaya Street", a "pussy cat", "fag" for a cigarette). The
-- owner approved a narrower automatic filter:
--   * clear slurs and strong abuse stay blocked;
--   * the mild and ambiguous entries leave the hard block;
--   * the plural forms of the clearest slurs and strong profanity are added;
--   * a legitimate phrase that contains a slur ("kaffir lime", a grocery item) is exempted as a whole phrase,
--     without unblocking the slur itself.
-- Deferred pending a usage review (NOT added here): "shoga", "mjinga" and "fala" on their own, and animal-insult
-- phrases. Reporting, blocking and admin moderation remain the backstop for everything the filter does not catch.
--
-- WHAT.
--   1. Remove 14 entries from private.blocked_terms (47 -> 33).
--   2. Add 16 plural and variant entries (33 -> 49).
--   3. private.allowed_phrases: multi-word phrases removed from the normalised text before matching.
--   4. contains_blocked_term() strips the allowed phrases first; matching is otherwise unchanged (whole words or
--      whole phrases after normalize_user_text()).
-- The trigger (0067, extended by 0069) and normalize_user_text() are unchanged.
--
-- PRIVILEGES. The new table has no client privileges and row-level security with no policies (as 0069 did for
-- private.blocked_terms). contains_blocked_term() stays callable by no client role.

-- ── 1. Leave the hard block: mild, everyday or ambiguous entries ───────────────────────────────
delete from private.blocked_terms
 where term in ('shit', 'bullshit', 'bastard',
                'mshenzi', 'washenzi', 'mpumbavu', 'wapumbavu', 'mjinga wewe', 'fala wewe',
                'retard', 'pussy', 'fag', 'tomba', 'malaya');

-- ── 2. Plural forms of the clearest slurs and strong profanity ────────────────────────────────
insert into private.blocked_terms (term) values
  ('niggers'), ('niggas'), ('faggots'), ('kaffirs'),
  ('fucks'), ('fuckin'), ('fuckers'), ('motherfuckers'), ('cunts'), ('whores'), ('sluts'), ('twats'),
  ('wankers'), ('dickheads'), ('assholes'), ('arseholes')
on conflict (term) do nothing;

-- ── 3. Legitimate phrases that contain a blocked word ─────────────────────────────────────────
-- At least two words, so an allowed phrase can never unblock a single word on its own.
create table if not exists private.allowed_phrases (
  phrase   text        primary key check (phrase ~ '^[a-z0-9]+( [a-z0-9]+)+$'),
  added_at timestamptz not null default now()
);
revoke all on table private.allowed_phrases from public, anon, authenticated;
alter table private.allowed_phrases enable row level security;

insert into private.allowed_phrases (phrase) values
  ('kaffir lime'), ('kaffir limes')
on conflict (phrase) do nothing;

-- ── 4. Matching: strip allowed phrases, then the same whole-word match ────────────────────────
create or replace function public.contains_blocked_term(p_text text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v text := ' ' || public.normalize_user_text(p_text) || ' ';
  a text;
begin
  for a in select phrase from private.allowed_phrases loop
    -- repeat until gone: replace() cannot remove back-to-back occurrences that share a space
    while strpos(v, ' ' || a || ' ') > 0 loop
      v := replace(v, ' ' || a || ' ', ' ');
    end loop;
  end loop;
  return exists (
    select 1
      from private.blocked_terms bt
     where v like ('% ' || bt.term || ' %')
  );
end;
$$;
revoke execute on function public.contains_blocked_term(text) from public, anon, authenticated;
