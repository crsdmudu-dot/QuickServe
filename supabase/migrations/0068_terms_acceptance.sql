-- 0068_terms_acceptance.sql - F5.4: users accept the current Terms before creating content.
-- Store requirement: Google Play's user-generated-content policy (and Apple 1.2) - users must agree to the terms before
-- they can post. Lead-PM stage 06 R11: build the mechanism now; only the version constant changes when the final
-- Terms text exists.
--
-- WHAT THIS ADDS
--   1. public.current_terms_version(): the Terms version, in one place in the database. It must equal the app's
--      CURRENT_TERMS_VERSION (src/constants/terms.ts) and the version on the website; a guard test checks the app.
--      It is a PLACEHOLDER until the owner's final Terms text (due 2026-09-28).
--   2. public.terms_acceptances: one row per user and version, with the source (the register checkbox or the
--      in-app prompt). Readable by the user and active admins; no client can write it directly.
--   3. public.accept_terms(p_version, p_source): the only write path. It records the signed-in, active caller's
--      acceptance of the CURRENT version only (anything else is refused).
--   4. public.has_accepted_current_terms(): yes/no about the caller, used by 5 and 6.
--   5. RESTRICTIVE insert policies on booking_messages and reviews: a signed-in user must have accepted the current
--      Terms to send a chat message or post a review. They only narrow the existing insert policies.
--   6. A trigger with the same rule for content changed outside those inserts: a user's own provider bio or skills,
--      and review comment edits (edit_review is SECURITY DEFINER, so policies do not apply to it).
--
-- NOT BLOCKED: server paths (no signed-in user: the deletion worker, service role), an admin editing someone else's
-- profile, and reporting (a safety tool, deliberately not gated).
-- NOT CHANGED: the certified deletion routines (0059-0061) and the 0065-0067 functions.

-- 1. The current Terms version (PLACEHOLDER: replace with the final version before QA certification).
create or replace function public.current_terms_version()
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select 'draft-2026-09-26'::text
$$;
revoke execute on function public.current_terms_version() from public, anon, authenticated;

-- 2. Acceptance records.
create table if not exists public.terms_acceptances (
  user_id       uuid        not null references public.profiles (id) on delete cascade,
  terms_version text        not null check (char_length(terms_version) between 1 and 64),
  source        text        not null check (source in ('register', 'prompt')),
  accepted_at   timestamptz not null default now(),
  primary key (user_id, terms_version)
);
alter table public.terms_acceptances enable row level security;
revoke all on table public.terms_acceptances from public, anon, authenticated;
grant select on table public.terms_acceptances to authenticated;

drop policy if exists terms_acceptances_select on public.terms_acceptances;
create policy terms_acceptances_select on public.terms_acceptances
  for select to authenticated
  using (user_id = auth.uid() or public.is_active_admin());

-- 3. Recording an acceptance: the signed-in, active caller, the current version only.
create or replace function public.accept_terms(p_version text, p_source text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not public.is_active_user() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_version is null or p_version <> public.current_terms_version() then
    raise exception 'terms_version_mismatch' using errcode = 'P0001';
  end if;
  if p_source is null or p_source not in ('register', 'prompt') then
    raise exception 'invalid_source' using errcode = '22023';
  end if;
  insert into public.terms_acceptances (user_id, terms_version, source)
  values (auth.uid(), p_version, p_source)
  on conflict (user_id, terms_version) do nothing;
end;
$$;
revoke execute on function public.accept_terms(text, text) from public, anon, authenticated;
grant execute on function public.accept_terms(text, text) to authenticated;

-- 4. Has the caller accepted the current version? (false for anyone not signed in)
create or replace function public.has_accepted_current_terms()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.terms_acceptances ta
     where ta.user_id = auth.uid()
       and ta.terms_version = public.current_terms_version()
  );
$$;
revoke execute on function public.has_accepted_current_terms() from public, anon, authenticated;
grant execute on function public.has_accepted_current_terms() to authenticated;

-- 5. New chat messages and new reviews need the current Terms (RESTRICTIVE: narrows, never widens).
drop policy if exists booking_messages_require_terms on public.booking_messages;
create policy booking_messages_require_terms on public.booking_messages
  as restrictive
  for insert to authenticated
  with check (public.has_accepted_current_terms());

drop policy if exists reviews_require_terms on public.reviews;
create policy reviews_require_terms on public.reviews
  as restrictive
  for insert to authenticated
  with check (public.has_accepted_current_terms());

-- 6. The same rule for a user's own bio/skills changes and for review comment edits. The refusal is the fixed
--    message 'terms_not_accepted', which the app turns into "Please accept the Terms of Service first."
create or replace function public.tg_require_current_terms()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new; -- server paths (deletion worker, service role) are never blocked
  end if;
  if tg_table_name = 'profiles' then
    if new.id is distinct from auth.uid() then
      return new; -- an admin editing someone else's profile
    end if;
    if new.bio is not distinct from old.bio and new.skills is not distinct from old.skills then
      return new; -- only a real change to the caller's own bio or skills is checked
    end if;
  elsif tg_table_name = 'reviews' then
    if new.comment is not distinct from old.comment then
      return new;
    end if;
  else
    return new;
  end if;
  if not public.has_accepted_current_terms() then
    raise exception 'terms_not_accepted' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_require_current_terms() from public, anon, authenticated;

drop trigger if exists trg_terms_profiles on public.profiles;
create trigger trg_terms_profiles
  before update of bio, skills on public.profiles
  for each row execute function public.tg_require_current_terms();

drop trigger if exists trg_terms_reviews on public.reviews;
create trigger trg_terms_reviews
  before update of comment on public.reviews
  for each row execute function public.tg_require_current_terms();
