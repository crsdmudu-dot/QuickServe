-- =================================================================================================
-- 0067 — Objectionable-language filter (store-compliance F5.3)
-- =================================================================================================
-- WHY. Apple App Review Guideline 1.2 requires "a method for filtering objectionable material from
-- being posted to the app". KwikServe's user-written text is booking chat, review comments, and a
-- provider's bio and skills (shown to customers).
--
-- WHAT.
--   1. private.blocked_terms: the word list. Lower-case words or short phrases, letters and digits
--      only. The private schema is not exposed through the API and every privilege is revoked from
--      client roles. The list is maintained by migration; the starter list at the end was supplied
--      for the owner's review (English plus Swahili/Sheng), leaving out words that also have an
--      everyday meaning.
--   2. normalize_user_text(text): lower case; a small look-alike map (0→o 1→i 3→e 4→a 5→s 7→t @→a
--      $→s); masking characters * . - _ removed ("f*ck", "f.u.c.k"); runs of three or more of the
--      same letter shortened to one ("fuuuck"); every other character becomes a space. contains_blocked_term(text) then matches WHOLE words or phrases
--      only, so "class" never matches "ass".
--   3. tg_filter_user_text(): a BEFORE trigger on
--        booking_messages  INSERT                      (chat)
--        reviews           INSERT, UPDATE OF comment   (new reviews and edit_review)
--        profiles          UPDATE OF bio, skills       (provider profile text)
--      It checks only NEW, non-null text that CHANGED, and only when a signed-in user makes the
--      change. Service-role and account-deletion paths (auth.uid() is null), including the
--      redaction that writes NULL or '[deleted]', are never blocked, and unrelated updates (ratings,
--      job counts) never re-check old text. On a match it raises 'content_not_allowed' with no
--      detail; the offending text is never logged.
--
-- PRIVILEGES. Nothing here is callable by a client role: every function revokes EXECUTE from
-- public, anon and authenticated, and the word list has no client privileges at all.

-- ── 1. The word list ──────────────────────────────────────────────────────────────────────────
create table if not exists private.blocked_terms (
  term     text        primary key check (term ~ '^[a-z0-9]+( [a-z0-9]+)*$'),
  added_at timestamptz not null default now()
);
revoke all on table private.blocked_terms from public, anon, authenticated;

-- ── 2. Matching ───────────────────────────────────────────────────────────────────────────────
create or replace function public.normalize_user_text(p_text text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select btrim(
           regexp_replace(
             regexp_replace(
               regexp_replace(translate(lower(coalesce(p_text, '')), '013457@$', 'oieastas'),
                              '[*._-]', '', 'g'),
               '([a-z])\1\1+', '\1', 'g'),
             '[^a-z0-9]+', ' ', 'g'));
$$;
revoke execute on function public.normalize_user_text(text) from public, anon, authenticated;

create or replace function public.contains_blocked_term(p_text text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from private.blocked_terms bt
     where (' ' || public.normalize_user_text(p_text) || ' ') like ('% ' || bt.term || ' %')
  );
$$;
revoke execute on function public.contains_blocked_term(text) from public, anon, authenticated;

-- ── 3. The trigger ────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_filter_user_text()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_text text;
begin
  -- Service role, the deletion pipeline and other server paths have no signed-in user.
  if auth.uid() is null then
    return new;
  end if;

  if tg_table_name = 'booking_messages' then
    v_text := new.message_text;
  elsif tg_table_name = 'reviews' then
    if tg_op = 'UPDATE' and new.comment is not distinct from old.comment then
      return new;
    end if;
    v_text := new.comment;
  elsif tg_table_name = 'profiles' then
    v_text := concat_ws(' ',
      case when new.bio is distinct from old.bio then new.bio end,
      case when new.skills is distinct from old.skills then array_to_string(new.skills, ' ') end);
  else
    return new;
  end if;

  if v_text is not null and v_text <> '' and public.contains_blocked_term(v_text) then
    raise exception 'content_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_filter_user_text() from public, anon, authenticated;

drop trigger if exists trg_filter_booking_messages on public.booking_messages;
create trigger trg_filter_booking_messages
  before insert on public.booking_messages
  for each row execute function public.tg_filter_user_text();

drop trigger if exists trg_filter_reviews on public.reviews;
create trigger trg_filter_reviews
  before insert or update of comment on public.reviews
  for each row execute function public.tg_filter_user_text();

drop trigger if exists trg_filter_profiles on public.profiles;
create trigger trg_filter_profiles
  before update of bio, skills on public.profiles
  for each row execute function public.tg_filter_user_text();

-- ── 4. Starter word list (for the owner's review) ─────────────────────────────────────────────
-- Whole words only. Words that also have an everyday meaning are deliberately left out (for example
-- "shoga", which also means "friend", and "mbwa" / "nguruwe", which are also just animals).
insert into private.blocked_terms (term) values
  -- English: profanity and sexual insults
  ('fuck'), ('fucking'), ('fucker'), ('fucked'), ('motherfucker'), ('fck'), ('fcking'), ('fcker'), ('fuk'),
  ('cunt'), ('bitch'), ('bitches'), ('bastard'), ('asshole'), ('arsehole'),
  ('pussy'), ('whore'), ('slut'), ('twat'), ('wanker'), ('dickhead'), ('bullshit'), ('shit'),
  -- English: slurs
  ('nigger'), ('nigga'), ('faggot'), ('fag'), ('retard'), ('kaffir'),
  -- Swahili / Sheng: vulgar and sexual
  ('kuma'), ('kumamako'), ('kumanyoko'), ('mkundu'), ('mboro'), ('mboo'),
  ('tomba'), ('kutomba'), ('nitakutomba'), ('malaya'), ('msenge'), ('wasenge'),
  -- Swahili / Sheng: strong insults
  ('mshenzi'), ('washenzi'), ('mpumbavu'), ('wapumbavu'), ('mjinga wewe'), ('fala wewe')
on conflict (term) do nothing;
