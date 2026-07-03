-- ============================================================
-- Slice 23 — Unified Notification System (FOUNDATION only)
-- ============================================================
-- This migration establishes the foundation for the unified notification system.
-- It extends the notifications table with structured metadata, creates a preferences table,
-- and sets up the fan-out trigger that delegates push delivery to the existing pipeline.
--
-- FUTURE-READY types (not wired to event triggers in this slice; Task 2+ will wire them):
--   - provider_nearby: Requires tracking-distance logic (excluded to honor "no tracking changes")
--   - provider_arrived: Requires tracking-distance logic (excluded to honor "no tracking changes")
--   - booking_reminder: Requires a scheduler/cron mechanism
--   - admin_review_flagged: Requires a flag mechanism on bookings or dedicated flag table

-- ================================================================
-- 1. Extend public.notifications with structured metadata columns
-- ================================================================
-- All new columns have defaults so existing inserts continue to work.
-- The dedup_key supports idempotent fan-out retries.
-- push_* columns are written by the send-push service role (bypasses RLS).

alter table public.notifications
  add column if not exists type          text    not null default 'generic',
  add column if not exists category       text    not null default 'booking'
    check (category in ('booking','chat','payment','marketing','system')),
  add column if not exists route          text,
  add column if not exists dedup_key      text,
  add column if not exists push_status    text    not null default 'pending'
    check (push_status in ('pending','sent','skipped','no_token','failed')),
  add column if not exists push_error     text,
  add column if not exists push_attempts  int     not null default 0;

-- Partial unique index: dedup_key is only unique when NOT NULL.
-- NULL dedup_key (e.g., chat messages) never conflict, so duplicates are allowed.
create unique index if not exists notifications_dedup_key
  on public.notifications (dedup_key) where dedup_key is not null;

-- ================================================================
-- 2. Recreate notifications_update policy to pin new immutable columns
-- ================================================================
-- The existing policy only allowed changing is_read.
-- We drop and recreate it to add pinning for the new columns.
-- type, category, route, and dedup_key are immutable (system-set on insert).
-- push_* columns are intentionally NOT pinned (written by service role).

drop policy if exists "notifications_update" on public.notifications;

create policy "notifications_update" on public.notifications
  for update using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and booking_id is not distinct from (select n.booking_id from public.notifications n where n.id = notifications.id)
    and title    = (select n.title    from public.notifications n where n.id = notifications.id)
    and body     = (select n.body     from public.notifications n where n.id = notifications.id)
    and type     = (select n.type     from public.notifications n where n.id = notifications.id)
    and category = (select n.category from public.notifications n where n.id = notifications.id)
    and route    is not distinct from (select n.route     from public.notifications n where n.id = notifications.id)
    and dedup_key is not distinct from (select n.dedup_key from public.notifications n where n.id = notifications.id)
  );

-- ================================================================
-- 3. Create notification_preferences table (owner-only)
-- ================================================================
-- Preferences are per-user. A missing row is treated as all-defaults by the client/Edge.
-- No backfill here; defaults in the table schema handle it.

create table if not exists public.notification_preferences (
  user_id           uuid primary key references public.profiles(id) on delete cascade,
  push_enabled      boolean not null default true,
  chat_enabled      boolean not null default true,
  booking_enabled   boolean not null default true,
  payment_enabled   boolean not null default true,
  marketing_enabled boolean not null default false,
  updated_at        timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;

-- Owner-only RLS: 4 policies, each checks user_id = auth.uid().
-- NO admin policy, NO provider policy — no cross-user access.
create policy "notification_preferences_select" on public.notification_preferences
  for select using (user_id = auth.uid());

create policy "notification_preferences_insert" on public.notification_preferences
  for insert with check (user_id = auth.uid());

create policy "notification_preferences_update" on public.notification_preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "notification_preferences_delete" on public.notification_preferences
  for delete using (user_id = auth.uid());

-- ================================================================
-- 4. Helper function: notify_user
-- ================================================================
-- Inserts a notification for a single user. Uses ON CONFLICT to deduplicate
-- on dedup_key if provided. Returns early if p_user_id is null (safety).
-- SECURITY DEFINER so it can bypass RLS when called from triggers.

create or replace function public.notify_user(
  p_user_id uuid,
  p_booking_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_category text,
  p_route text,
  p_dedup_key text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null then
    return;
  end if;

  -- ON CONFLICT targets the PARTIAL unique index notifications_dedup_key
  -- (WHERE dedup_key is not null). Postgres arbiter-index inference for a
  -- partial index REQUIRES the predicate be restated here, else it raises
  -- "no unique or exclusion constraint matching the ON CONFLICT specification".
  -- A NULL dedup_key (e.g. chat) simply never conflicts → always inserts.
  insert into public.notifications (user_id, booking_id, title, body, type, category, route, dedup_key)
  values (p_user_id, p_booking_id, p_title, p_body, p_type, p_category, p_route, p_dedup_key)
  on conflict (dedup_key) where dedup_key is not null do nothing;
end; $$;

-- ================================================================
-- 5. Helper function: notify_admins
-- ================================================================
-- Loops over all approved admins and delegates to notify_user for each.
-- Uses a per-admin dedup key (p_dedup_base || ':' || admin_id) to deduplicate
-- per recipient while allowing the same event to notify multiple admins.
-- SECURITY DEFINER so it can query profiles and call notify_user.

create or replace function public.notify_admins(
  p_booking_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_route text,
  p_dedup_base text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in select id from public.profiles where role = 'admin' and approval_status = 'approved' loop
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

-- ================================================================
-- 6. AFTER INSERT push fan-out trigger
-- ================================================================
-- Builds the webhook payload and delegates to the existing notify_send_push.
-- No direct push logic here — the send-push service (Edge Function in Task 3)
-- consumes the webhook payload and respects preferences.
-- SECURITY DEFINER + fixed search_path (hardening).

create or replace function public.tg_push_notification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_send_push(jsonb_build_object(
    'table', 'notifications',
    'op', 'INSERT',
    'record', to_jsonb(new)
  ));
  return new;
end; $$;

drop trigger if exists trg_push_notification on public.notifications;
create trigger trg_push_notification
  after insert on public.notifications
  for each row execute function public.tg_push_notification();
