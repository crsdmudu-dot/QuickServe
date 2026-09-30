-- =================================================================================================
-- 0065 — Content reports and moderation (store-compliance F5.1, plus the moderation queue of F5.6)
-- =================================================================================================
-- WHY. Apple App Review Guideline 1.2 requires apps with user-generated content to offer "a mechanism
-- to report offensive content and timely responses to concerns". Google Play's user-generated content
-- policy requires an in-app system for reporting objectionable content and users, and taking action.
-- KwikServe's user content is booking chat, review comments and provider profiles.
--
-- WHAT.
--   1. is_active_admin(): role 'admin', approval 'approved' and not deleted. Every F5 policy and admin
--      function uses it. The older is_admin() (role only) is left unchanged.
--   2. content_reports: one row per report. REFERENCES ONLY: no copy of the reported text and no
--      free-text details from the reporter, so account deletion has nothing extra to anonymise.
--   3. moderation_actions: append-only audit of every moderation decision.
--   4. booking_messages.hidden_at / hidden_by: a hidden message disappears for both participants;
--      admins still see it. Senders cannot insert a message that is already hidden.
--   5. Functions: report_content (users) and the admin queue, resolve and hide actions.
--
-- PRIVILEGES. Both new tables have RLS on, every privilege revoked from public, anon and
-- authenticated, and SELECT granted back to authenticated behind an active-admin policy. No client
-- role can INSERT, UPDATE or DELETE them: rows are written only by the SECURITY DEFINER functions
-- below, which take the actor from auth.uid(), so an audit row cannot be attributed to someone else.
-- Every function revokes EXECUTE from public and anon and grants it to authenticated only.
--
-- Numbering: 0063 (H1) and 0064 (M7) come before this file. 0055 and 0057 stay unused.

-- ── 1. Active-admin check ─────────────────────────────────────────────────────────────────────
create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.role = 'admin'
       and p.approval_status = 'approved'
       and p.deleted_at is null
  );
$$;
revoke execute on function public.is_active_admin() from public, anon;
grant execute on function public.is_active_admin() to authenticated, service_role;

-- ── 2. Reports ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.content_reports (
  id               uuid        primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  -- People are referenced with ON DELETE SET NULL: profiles are tombstoned rather than deleted
  -- today, but a report must never block, or be erased by, removal of a profile row.
  reporter_id      uuid        references public.profiles(id) on delete set null,
  target_type      text        not null check (target_type in ('message', 'review', 'user')),
  target_id        uuid        not null,
  reported_user_id uuid        references public.profiles(id) on delete set null,
  booking_id       uuid        references public.bookings(id) on delete set null,
  reason           text        not null
    check (reason in ('harassment', 'hate', 'sexual', 'violence', 'spam', 'scam', 'other')),
  status           text        not null default 'open'
    check (status in ('open', 'actioned', 'dismissed')),
  resolved_by      uuid        references public.profiles(id) on delete set null,
  resolved_at      timestamptz,
  resolution_note  text        check (resolution_note is null or char_length(resolution_note) <= 1000),
  check (
    (status = 'open' and resolved_at is null and resolved_by is null)
    or (status <> 'open' and resolved_at is not null)
  )
);
alter table public.content_reports enable row level security;

-- One open report per reporter and target: repeat taps return the same report.
create unique index if not exists content_reports_one_open_per_target
  on public.content_reports (reporter_id, target_type, target_id)
  where status = 'open';
create index if not exists content_reports_status_created_idx
  on public.content_reports (status, created_at);
create index if not exists content_reports_reporter_created_idx
  on public.content_reports (reporter_id, created_at);

revoke all on table public.content_reports from public, anon, authenticated;
grant select on table public.content_reports to authenticated;
drop policy if exists "content_reports_select_admin" on public.content_reports;
create policy "content_reports_select_admin" on public.content_reports
  for select to authenticated using (public.is_active_admin());

-- ── 3. Moderation audit ───────────────────────────────────────────────────────────────────────
create table if not exists public.moderation_actions (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  admin_id    uuid        references public.profiles(id) on delete set null,
  action      text        not null check (action in (
                'report_actioned', 'report_dismissed',
                'message_hidden', 'message_unhidden',
                'review_hidden', 'review_unhidden',
                'profile_text_cleared',
                'account_suspended', 'account_unsuspended')),
  target_type text        not null check (target_type in ('report', 'message', 'review', 'user')),
  target_id   uuid        not null,
  report_id   uuid        references public.content_reports(id) on delete set null,
  note        text        check (note is null or char_length(note) <= 1000)
);
alter table public.moderation_actions enable row level security;
create index if not exists moderation_actions_target_idx
  on public.moderation_actions (target_type, target_id, created_at);

revoke all on table public.moderation_actions from public, anon, authenticated;
grant select on table public.moderation_actions to authenticated;
drop policy if exists "moderation_actions_select_admin" on public.moderation_actions;
create policy "moderation_actions_select_admin" on public.moderation_actions
  for select to authenticated using (public.is_active_admin());

-- ── 4. Hidden chat messages ───────────────────────────────────────────────────────────────────
alter table public.booking_messages
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references public.profiles(id) on delete set null;

-- Participants see only messages that are not hidden; admins keep seeing everything. Otherwise the
-- same as 0013, except that both re-created policies now apply TO authenticated only. Anonymous
-- callers could never pass them (every branch needs auth.uid()), and scoping them means an anon
-- query sees no rows instead of evaluating helper functions it may not be allowed to execute.
drop policy if exists "booking_messages_select" on public.booking_messages;
create policy "booking_messages_select" on public.booking_messages
  for select to authenticated using (
    exists (select 1 from public.bookings b
             where b.id = booking_messages.booking_id
               and (public.is_admin()
                    or (booking_messages.hidden_at is null
                        and (b.customer_id = auth.uid()
                             or b.assigned_provider_id = auth.uid()))))
  );

-- As 0013, plus: a message cannot be inserted already hidden. (A hidden message still triggers the
-- chat push, so a pre-hidden insert would deliver text the recipient could never see or report.)
drop policy if exists "booking_messages_insert" on public.booking_messages;
create policy "booking_messages_insert" on public.booking_messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and hidden_at is null
    and hidden_by is null
    and exists (select 1 from public.bookings b
                where b.id = booking_messages.booking_id
                  and b.assigned_provider_id is not null
                  and b.status not in ('completed','cancelled')
                  and (b.customer_id = auth.uid()
                       or b.assigned_provider_id = auth.uid()))
  );

-- ── 5. Reporting (any active signed-in user) ──────────────────────────────────────────────────
-- The reported user is derived here, never taken from the caller:
--   message  the caller must be a participant of the message's booking; reported = the sender
--   review   the caller must be the reviewed provider and the review visible; reported = the author
--   user     an approved, non-deleted provider, or the caller's counterpart in a shared booking
-- "Does not exist" and "not yours to report" give the same error, so the reporter learns nothing.
-- Admins get an alert through notify_admins (0020). The alert names no one and quotes nothing, and a
-- failed alert never loses the report (the 0054 pattern).
create or replace function public.report_content(
  p_target_type text,
  p_target_id   uuid,
  p_reason      text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_reported uuid;
  v_booking  uuid;
  v_id       uuid;
  v_recent   integer;
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_reason is null
     or p_reason not in ('harassment', 'hate', 'sexual', 'violence', 'spam', 'scam', 'other') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  if p_target_type = 'message' then
    select m.sender_id, m.booking_id
      into v_reported, v_booking
      from public.booking_messages m
      join public.bookings b on b.id = m.booking_id
     where m.id = p_target_id
       and (b.customer_id = v_uid or b.assigned_provider_id = v_uid);
  elsif p_target_type = 'review' then
    select r.customer_id, r.booking_id
      into v_reported, v_booking
      from public.reviews r
     where r.id = p_target_id
       and r.provider_id = v_uid
       and r.is_hidden = false;
  elsif p_target_type = 'user' then
    select p.id
      into v_reported
      from public.profiles p
     where p.id = p_target_id
       and p.deleted_at is null
       and ((p.role = 'provider' and p.approval_status = 'approved')
            or exists (select 1 from public.bookings b
                        where (b.customer_id = v_uid and b.assigned_provider_id = p.id)
                           or (b.assigned_provider_id = v_uid and b.customer_id = p.id)));
  else
    raise exception 'invalid_target' using errcode = '22023';
  end if;

  if v_reported is null or v_reported = v_uid then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- Repeat report of the same target while it is still open: return the existing report.
  select cr.id into v_id
    from public.content_reports cr
   where cr.reporter_id = v_uid
     and cr.target_type = p_target_type
     and cr.target_id = p_target_id
     and cr.status = 'open';
  if v_id is not null then
    return v_id;
  end if;

  select count(*) into v_recent
    from public.content_reports cr
   where cr.reporter_id = v_uid
     and cr.created_at > now() - interval '24 hours';
  if v_recent >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  begin
    insert into public.content_reports
      (reporter_id, target_type, target_id, reported_user_id, booking_id, reason)
    values
      (v_uid, p_target_type, p_target_id, v_reported, v_booking, p_reason)
    returning id into v_id;
  exception when unique_violation then
    -- A concurrent identical report won the race; return it.
    select cr.id into v_id
      from public.content_reports cr
     where cr.reporter_id = v_uid
       and cr.target_type = p_target_type
       and cr.target_id = p_target_id
       and cr.status = 'open';
    return v_id;
  end;

  begin
    perform public.notify_admins(
      null,
      'New content report',
      'A user reported a '
        || case p_target_type when 'message' then 'chat message' when 'review' then 'review' else 'user' end
        || '. Review it within 24 hours.',
      'admin_content_report',
      '/moderation',
      v_id::text || ':admin_content_report'
    );
  exception when others then
    -- The report stays; only the alert is lost. Log the class of failure, never the content.
    raise warning 'content_reports %: admin alert failed (SQLSTATE %)', v_id, sqlstate;
  end;

  return v_id;
end;
$$;
revoke execute on function public.report_content(text, uuid, text) from public, anon;
grant execute on function public.report_content(text, uuid, text) to authenticated;

-- ── 6. Admin: the queue ───────────────────────────────────────────────────────────────────────
-- Oldest first, so the 24-hour commitment is worked in order. content_text is the reported message,
-- review comment or provider bio as it is NOW (it may since have been redacted or hidden).
create or replace function public.admin_get_content_reports(p_status text)
returns table (
  report_id        uuid,
  created_at       timestamptz,
  target_type      text,
  target_id        uuid,
  reason           text,
  status           text,
  reporter_id      uuid,
  reporter_name    text,
  reported_user_id uuid,
  reported_name    text,
  reported_role    text,
  booking_id       uuid,
  content_text     text,
  content_hidden   boolean,
  resolved_at      timestamptz,
  resolution_note  text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_active_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('open', 'actioned', 'dismissed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  return query
    select cr.id,
           cr.created_at,
           cr.target_type,
           cr.target_id,
           cr.reason,
           cr.status,
           cr.reporter_id,
           rp.full_name,
           cr.reported_user_id,
           tp.full_name,
           tp.role,
           cr.booking_id,
           case cr.target_type
             when 'message' then (select m.message_text from public.booking_messages m where m.id = cr.target_id)
             when 'review'  then (select rv.comment from public.reviews rv where rv.id = cr.target_id)
             else (select pp.bio from public.profiles pp where pp.id = cr.target_id)
           end,
           case cr.target_type
             when 'message' then coalesce((select m.hidden_at is not null from public.booking_messages m where m.id = cr.target_id), false)
             when 'review'  then coalesce((select rv.is_hidden from public.reviews rv where rv.id = cr.target_id), false)
             else false
           end,
           cr.resolved_at,
           cr.resolution_note
      from public.content_reports cr
      left join public.profiles rp on rp.id = cr.reporter_id
      left join public.profiles tp on tp.id = cr.reported_user_id
     where cr.status = p_status
     order by cr.created_at asc
     limit 200;
end;
$$;
revoke execute on function public.admin_get_content_reports(text) from public, anon;
grant execute on function public.admin_get_content_reports(text) to authenticated;

-- ── 7. Admin: close a report ──────────────────────────────────────────────────────────────────
create or replace function public.admin_resolve_content_report(
  p_report_id uuid,
  p_outcome   text,
  p_note      text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_active_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('actioned', 'dismissed') then
    raise exception 'invalid_outcome' using errcode = '22023';
  end if;

  update public.content_reports
     set status = p_outcome,
         resolved_by = auth.uid(),
         resolved_at = now(),
         resolution_note = v_note
   where id = p_report_id
     and status = 'open';
  if not found then
    raise exception 'report_not_open' using errcode = 'P0002';
  end if;

  insert into public.moderation_actions (admin_id, action, target_type, target_id, report_id, note)
  values (auth.uid(), 'report_' || p_outcome, 'report', p_report_id, p_report_id, v_note);
end;
$$;
revoke execute on function public.admin_resolve_content_report(uuid, text, text) from public, anon;
grant execute on function public.admin_resolve_content_report(uuid, text, text) to authenticated;

-- ── 8. Admin: hide or unhide a chat message ───────────────────────────────────────────────────
-- Hiding also blanks the in-app notification preview the chat trigger (0020) stored for the other
-- participant: same booking, type 'chat_message', a recipient other than the sender, and a body equal
-- to 0020's preview of this message (the first 80 characters plus an ellipsis, chr(8230)). Push
-- notifications already delivered to a device cannot be recalled. Unhiding does not restore the
-- preview.
create or replace function public.admin_set_message_hidden(
  p_message_id uuid,
  p_hidden     boolean,
  p_report_id  uuid,
  p_note       text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_sender  uuid;
  v_booking uuid;
  v_text    text;
begin
  if not public.is_active_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if p_hidden is null then
    raise exception 'invalid_hidden' using errcode = '22023';
  end if;

  update public.booking_messages
     set hidden_at = case when p_hidden then coalesce(hidden_at, now()) else null end,
         hidden_by = case when p_hidden then coalesce(hidden_by, auth.uid()) else null end
   where id = p_message_id
  returning sender_id, booking_id, message_text into v_sender, v_booking, v_text;
  if not found then
    raise exception 'message_not_found' using errcode = 'P0002';
  end if;

  if p_hidden then
    update public.notifications n
       set body = 'Message removed by KwikServe'
     where n.booking_id = v_booking
       and n.type = 'chat_message'
       and n.user_id <> v_sender
       and n.body = case when char_length(v_text) > 80
                         then left(v_text, 80) || chr(8230)
                         else v_text
                    end;
  end if;

  insert into public.moderation_actions (admin_id, action, target_type, target_id, report_id, note)
  values (auth.uid(),
          case when p_hidden then 'message_hidden' else 'message_unhidden' end,
          'message', p_message_id, p_report_id,
          nullif(btrim(coalesce(p_note, '')), ''));
end;
$$;
revoke execute on function public.admin_set_message_hidden(uuid, boolean, uuid, text) from public, anon;
grant execute on function public.admin_set_message_hidden(uuid, boolean, uuid, text) to authenticated;

-- ── 9. Admin: hide or unhide a review ─────────────────────────────────────────────────────────
-- Uses the existing reviews.is_hidden flag, which already hides a review from its provider (0008).
create or replace function public.admin_set_review_hidden(
  p_review_id uuid,
  p_hidden    boolean,
  p_report_id uuid,
  p_note      text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_active_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if p_hidden is null then
    raise exception 'invalid_hidden' using errcode = '22023';
  end if;

  update public.reviews
     set is_hidden = p_hidden
   where id = p_review_id;
  if not found then
    raise exception 'review_not_found' using errcode = 'P0002';
  end if;

  insert into public.moderation_actions (admin_id, action, target_type, target_id, report_id, note)
  values (auth.uid(),
          case when p_hidden then 'review_hidden' else 'review_unhidden' end,
          'review', p_review_id, p_report_id,
          nullif(btrim(coalesce(p_note, '')), ''));
end;
$$;
revoke execute on function public.admin_set_review_hidden(uuid, boolean, uuid, text) from public, anon;
grant execute on function public.admin_set_review_hidden(uuid, boolean, uuid, text) to authenticated;

-- ── 10. Admin: clear a provider's written profile text ────────────────────────────────────────
-- Bio and skills are both free text shown to customers, so they are cleared together.
create or replace function public.admin_clear_profile_text(
  p_user_id   uuid,
  p_report_id uuid,
  p_note      text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_active_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  update public.profiles
     set bio    = null,
         skills = '{}'::text[]
   where id = p_user_id
     and role = 'provider';
  if not found then
    raise exception 'provider_not_found' using errcode = 'P0002';
  end if;

  insert into public.moderation_actions (admin_id, action, target_type, target_id, report_id, note)
  values (auth.uid(), 'profile_text_cleared', 'user', p_user_id, p_report_id,
          nullif(btrim(coalesce(p_note, '')), ''));
end;
$$;
revoke execute on function public.admin_clear_profile_text(uuid, uuid, text) from public, anon;
grant execute on function public.admin_clear_profile_text(uuid, uuid, text) to authenticated;
