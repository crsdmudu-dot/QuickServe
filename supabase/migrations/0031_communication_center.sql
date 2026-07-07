-- ============================================================
-- Slice 36 — Communication Center.
-- ADDITIVE extension of the Slice-23 notification system.
-- In-app insert is UNCONDITIONAL/durable — preferences gate future delivery
-- (push=existing pipeline; email/sms future/display-only), NOT in-app history.
-- Existing notify_user/booking triggers/push pipeline + RLS UNCHANGED.
-- No delete.
-- ============================================================

-- ================================================================
-- 1. Extend public.notifications — additive columns only
--    (add column if not exists; do NOT touch existing cols/RLS/triggers)
-- ================================================================

alter table public.notifications
  add column if not exists audience_type text check (audience_type in ('customer','provider','admin'));

alter table public.notifications
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

alter table public.notifications
  add column if not exists priority text not null check (priority in ('low','normal','high','urgent')) default 'normal';

alter table public.notifications
  add column if not exists read_at timestamptz;

-- ================================================================
-- 2. Extend public.notification_preferences — additive columns only
--    (add column if not exists; existing owner-only RLS untouched)
-- ================================================================

alter table public.notification_preferences add column if not exists quality_enabled boolean not null default true;
alter table public.notification_preferences add column if not exists system_enabled  boolean not null default true;
alter table public.notification_preferences add column if not exists email_enabled   boolean not null default false;
alter table public.notification_preferences add column if not exists sms_enabled     boolean not null default false;

-- ================================================================
-- 3. emit_notification
--    SECURITY DEFINER; ALWAYS INSERTS (no preference read/skip).
--    Durable in-app history. Guard: admin OR self (p_user_id = auth.uid()).
--    Insert-only — no business action, no push-pipeline call (in-app only).
-- ================================================================

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
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (public.is_admin() or p_user_id = auth.uid()) then
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

-- ================================================================
-- 4. broadcast_announcement
--    Admin-only; inserts a durable row for every user of the audience.
--    Unconditional durable insert — announcements.
-- ================================================================

create or replace function public.broadcast_announcement(
  p_audience_type text,
  p_title         text,
  p_body          text,
  p_deep_link     text,
  p_priority      text
)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  insert into public.notifications (user_id, title, body, type, category, route, audience_type, priority)
  select p.id, p_title, p_body, 'general_announcement', 'system', p_deep_link, p_audience_type,
         coalesce(p_priority,'normal')
  from public.profiles p
  where p.role = p_audience_type;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;
