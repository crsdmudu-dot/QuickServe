-- 0069_suspension_and_hardening.sql - F5.6: account suspension (database side), plus the reviewed hardening bundle.
-- Store requirement: Apple 1.2 and Google Play's user-generated-content policy expect a way to act on abusive users.
-- Reports (0065), blocks (0066) and the filter (0067) exist; this adds the enforcement: a suspended account is refused
-- everything at the data layer at once. The Edge Function `admin-account-suspension` (F5.6b) calls suspend/lift with
-- the admin's own token, then uses the service role only to ban or unban the Auth identity and record the outcome.
--
-- WHAT THIS ADDS (suspension)
--   1. public.account_suspensions: one row per suspension, with its reason, who and when, the optional report, the
--      lift, and the Auth ban outcome. Active admins can read it; no client can write it.
--   2. public.is_active_user() is re-created: not deleted AND not suspended. Every restrictive "deny deleted
--      identity" policy (0056, 26 tables) and the booking-photos upload therefore refuse a suspended user at once,
--      including for access tokens that are still valid. It stays TRUE when there is no signed-in user.
--   3. admin_suspend_account / admin_lift_account_suspension: active admins only (is_active_admin(), as the 0065
--      moderation RPCs); the acting admin is auth.uid(), never a parameter. Each writes a moderation_actions row.
--      set_suspension_ban_state: SERVICE ROLE ONLY, records the Auth ban outcome.
--   4. get_my_account_state(): active, suspended or deleted, about the caller only, so the app can sign a suspended
--      user out with a neutral message (their other reads are refused).
--
-- THE REVIEWED BUNDLE (lead-PM findings)
--   5. R5: edit_review gets `and public.is_active_user()` and `pg_temp`. That also closes the gap where a deleted or
--      suspended user could still edit (for example restore a comment the deletion cleared).
--   6. S8-1 body: emit_notification refuses a caller who is not signed in. Its old check was NULL for anon, so the
--      IF was skipped. Production's EXECUTE for anon was revoked on 2026-09-26; this fixes the body itself.
--   7. F51-6: notify_admins skips deleted admins.
--   8. F52-1: the blocked-pair dispatch trigger also runs when customer_id changes.
--   9. F53-1: the language filter (0067) also checks booking notes and access notes, which the provider reads.
--  10. F53-2: row-level security on private.blocked_terms (no policies; no client ever had privileges).
--  11. S15-2: notification routes must be plain in-app paths (the same rule as the app's safeInternalRoute, S11-1).
--      Added NOT VALID: it holds for every new row; existing rows are checked separately before VALIDATE.
--
-- NOT CHANGED: the certified deletion routines (0059-0061), 0065-0068 functions other than those named above, and
-- is_admin() (L1 stays separate).

-- ── 1. Suspensions ────────────────────────────────────────────────────────────────────────────
create table if not exists public.account_suspensions (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references public.profiles (id) on delete cascade,
  reason         text        not null check (char_length(btrim(reason)) between 1 and 500),
  suspended_by   uuid        references public.profiles (id) on delete set null,
  suspended_at   timestamptz not null default now(),
  report_id      uuid        references public.content_reports (id) on delete set null,
  lifted_by      uuid        references public.profiles (id) on delete set null,
  lifted_at      timestamptz,
  lift_note      text        check (lift_note is null or char_length(lift_note) between 1 and 500),
  -- pending: the Auth ban (or unban, after a lift) has not been confirmed yet.
  auth_ban_state text        not null default 'pending'
    check (auth_ban_state in ('pending', 'banned', 'failed', 'unbanned')),
  check (lifted_at is not null or (lifted_by is null and lift_note is null)),
  check (auth_ban_state <> 'banned' or lifted_at is null),
  check (auth_ban_state <> 'unbanned' or lifted_at is not null)
);
-- At most one active suspension per user.
create unique index if not exists account_suspensions_one_active
  on public.account_suspensions (user_id)
  where lifted_at is null;
alter table public.account_suspensions enable row level security;
revoke all on table public.account_suspensions from public, anon, authenticated;
grant select on table public.account_suspensions to authenticated;
drop policy if exists account_suspensions_select_admin on public.account_suspensions;
create policy account_suspensions_select_admin on public.account_suspensions
  for select to authenticated
  using (public.is_active_admin());

-- ── 2. is_active_user(): not deleted and not suspended ───────────────────────────────────────
-- Same signature, grants and "true when not signed in" as 0056; only the suspension test is new.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.deleted_at is null
            and not exists (select 1
                              from public.account_suspensions s
                             where s.user_id = p.id
                               and s.lifted_at is null)
       from public.profiles p
      where p.id = auth.uid()),
    true
  );
$$;
revoke execute on function public.is_active_user() from public;
grant execute on function public.is_active_user() to anon, authenticated, service_role;

-- ── 3. Suspend and lift: active admins only; the acting admin is the caller ─────────────────
-- Same pattern as the 0065 moderation RPCs: is_active_admin() and auth.uid(). The Edge Function calls these with the
-- admin's own token, so the actor can never come from a request body.
create or replace function public.admin_suspend_account(p_user uuid, p_reason text, p_report uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_role   text;
  v_gone   timestamptz;
  v_id     uuid;
begin
  if not public.is_active_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  select p.role, p.deleted_at into v_role, v_gone from public.profiles p where p.id = p_user;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if v_role not in ('customer', 'provider') then
    raise exception 'user_not_suspendable' using errcode = '22023';
  end if;
  if v_gone is not null then
    raise exception 'user_deleted' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 1 and 500 then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  if exists (select 1 from public.account_suspensions s where s.user_id = p_user and s.lifted_at is null) then
    raise exception 'already_suspended' using errcode = '23505';
  end if;

  insert into public.account_suspensions (user_id, reason, suspended_by, report_id)
  values (p_user, v_reason, auth.uid(), p_report)
  returning id into v_id;

  insert into public.moderation_actions (admin_id, action, target_type, target_id, report_id, note)
  values (auth.uid(), 'account_suspended', 'user', p_user, p_report, v_reason);
  return v_id;
end;
$$;
revoke execute on function public.admin_suspend_account(uuid, text, uuid) from public, anon;
grant execute on function public.admin_suspend_account(uuid, text, uuid) to authenticated;

create or replace function public.admin_lift_account_suspension(p_user uuid, p_note text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id   uuid;
begin
  if not public.is_active_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  update public.account_suspensions
     set lifted_at = now(), lifted_by = auth.uid(), lift_note = v_note, auth_ban_state = 'pending'
   where user_id = p_user and lifted_at is null
  returning id into v_id;
  if v_id is null then
    raise exception 'not_suspended' using errcode = 'P0002';
  end if;

  insert into public.moderation_actions (admin_id, action, target_type, target_id, note)
  values (auth.uid(), 'account_unsuspended', 'user', p_user, v_note);
  return v_id;
end;
$$;
revoke execute on function public.admin_lift_account_suspension(uuid, text) from public, anon;
grant execute on function public.admin_lift_account_suspension(uuid, text) to authenticated;

-- Records the Auth ban outcome: banned or failed while suspended; unbanned or failed after a lift.
create or replace function public.set_suspension_ban_state(p_suspension uuid, p_state text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_lifted timestamptz;
begin
  if p_state is null or p_state not in ('banned', 'unbanned', 'failed') then
    raise exception 'invalid_state' using errcode = '22023';
  end if;
  select s.lifted_at into v_lifted from public.account_suspensions s where s.id = p_suspension;
  if not found then
    raise exception 'suspension_not_found' using errcode = 'P0002';
  end if;
  if (p_state = 'banned' and v_lifted is not null) or (p_state = 'unbanned' and v_lifted is null) then
    raise exception 'invalid_state' using errcode = '22023';
  end if;
  update public.account_suspensions set auth_ban_state = p_state where id = p_suspension;
end;
$$;
revoke execute on function public.set_suspension_ban_state(uuid, text) from public, anon, authenticated;
grant execute on function public.set_suspension_ban_state(uuid, text) to service_role;

-- ── 4. The caller's own account state ─────────────────────────────────────────────────────────
-- NULL when not signed in (or without a profile row).
create or replace function public.get_my_account_state()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
           when p.deleted_at is not null then 'deleted'
           when exists (select 1 from public.account_suspensions s
                         where s.user_id = p.id and s.lifted_at is null) then 'suspended'
           else 'active'
         end
    from public.profiles p
   where p.id = auth.uid();
$$;
revoke execute on function public.get_my_account_state() from public, anon;
grant execute on function public.get_my_account_state() to authenticated;

-- ── 5. R5: edit_review refuses deleted and suspended users ───────────────────────────────────
-- Body as 0029 apart from the active-user condition; grants as 0064.
create or replace function public.edit_review(
  p_review_id          uuid,
  p_comment            text,
  p_rating             int,
  p_quality            int,
  p_punctuality        int,
  p_communication      int,
  p_professionalism    int,
  p_value              int,
  p_would_recommend    boolean,
  p_tags               text[]
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from public.reviews
    where id = p_review_id
      and customer_id = auth.uid()
      and created_at > now() - interval '24 hours'
  ) or not public.is_active_user() then
    raise exception 'edit window closed or not owner';
  end if;

  update public.reviews set
    comment              = p_comment,
    rating               = p_rating,
    quality_rating       = p_quality,
    punctuality_rating   = p_punctuality,
    communication_rating = p_communication,
    professionalism_rating = p_professionalism,
    value_rating         = p_value,
    would_recommend      = p_would_recommend,
    tags                 = coalesce(p_tags, '{}'),
    updated_at           = now()
  where id = p_review_id;
end; $$;
revoke execute on function public.edit_review(uuid, text, integer, integer, integer, integer, integer, integer, boolean, text[]) from public, anon;
grant execute on function public.edit_review(uuid, text, integer, integer, integer, integer, integer, integer, boolean, text[]) to authenticated;

-- ── 6. S8-1 body: emit_notification refuses anyone not signed in ─────────────────────────────
-- `(...) is not true` is NULL-safe: a NULL result (no signed-in user, or a NULL p_user_id) now raises.
create or replace function public.emit_notification(
  p_user_id          uuid,
  p_audience_type    text,
  p_notification_type text,
  p_category         text,
  p_title            text,
  p_body             text,
  p_deep_link        text,
  p_metadata         jsonb,
  p_priority         text
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null or (public.is_admin() or p_user_id = auth.uid()) is not true then
    raise exception 'not authorized';
  end if;
  insert into public.notifications
    (user_id, title, body, type, category, route, audience_type, metadata_json, priority)
  values (p_user_id, p_title, p_body, coalesce(p_notification_type,'generic'),
          coalesce(p_category,'system'), p_deep_link, p_audience_type,
          coalesce(p_metadata,'{}'::jsonb), coalesce(p_priority,'normal'))
  returning id into v_id;
  return v_id;
end; $$;
revoke execute on function public.emit_notification(uuid, text, text, text, text, text, text, jsonb, text) from public, anon;
grant execute on function public.emit_notification(uuid, text, text, text, text, text, text, jsonb, text) to authenticated;

-- ── 7. F51-6: notify_admins skips deleted admins ──────────────────────────────────────────────
create or replace function public.notify_admins(
  p_booking_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_route text,
  p_dedup_base text
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
begin
  for r in select id from public.profiles
            where role = 'admin' and approval_status = 'approved' and deleted_at is null loop
    perform public.notify_user(
      r.id,
      p_booking_id,
      p_title,
      p_body,
      p_type,
      'system',
      p_route,
      p_dedup_base || ':' || r.id::text
    );
  end loop;
end; $$;
revoke execute on function public.notify_admins(uuid, text, text, text, text, text) from public, anon, authenticated;

-- ── 8. F52-1: the blocked-pair check also runs when the customer changes ─────────────────────
create or replace function public.tg_bookings_block_pairing()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.assigned_provider_id is not null
     and (tg_op = 'INSERT'
          or new.assigned_provider_id is distinct from old.assigned_provider_id
          or new.customer_id is distinct from old.customer_id)
     and exists (
       select 1 from public.user_blocks ub
        where (ub.blocker_id = new.customer_id and ub.blocked_id = new.assigned_provider_id)
           or (ub.blocker_id = new.assigned_provider_id and ub.blocked_id = new.customer_id)
     ) then
    raise exception 'blocked_pair' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_bookings_block_pairing() from public, anon, authenticated;

drop trigger if exists trg_bookings_block_pairing on public.bookings;
create trigger trg_bookings_block_pairing
  before insert or update of assigned_provider_id, customer_id on public.bookings
  for each row execute function public.tg_bookings_block_pairing();

-- ── 9. F53-1: the language filter also covers booking notes and access notes ────────────────
-- Same function as 0067 plus the bookings branch; only new or changed text is checked.
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
  elsif tg_table_name = 'bookings' then
    if tg_op = 'INSERT' then
      v_text := concat_ws(' ', new.notes, new.access_notes);
    else
      v_text := concat_ws(' ',
        case when new.notes is distinct from old.notes then new.notes end,
        case when new.access_notes is distinct from old.access_notes then new.access_notes end);
    end if;
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

drop trigger if exists trg_filter_bookings on public.bookings;
create trigger trg_filter_bookings
  before insert or update of notes, access_notes on public.bookings
  for each row execute function public.tg_filter_user_text();

-- ── 10. F53-2: row-level security on the word list ───────────────────────────────────────────
alter table private.blocked_terms enable row level security;

-- ── 11. S15-2: notification routes are plain in-app paths ────────────────────────────────────
-- The app's rule (src/lib/safe-route.ts): one leading "/" (not "//"), no whitespace, backslash or control
-- characters, at most 512 characters. NOT VALID: enforced for every new or changed row from now on.
alter table public.notifications drop constraint if exists notifications_route_internal;
alter table public.notifications
  add constraint notifications_route_internal
  check (route is null
         or (char_length(route) <= 512
             and left(route, 1) = '/'
             and left(route, 2) <> '//'
             and route !~ '[\\[:space:][:cntrl:]]'))
  not valid;
