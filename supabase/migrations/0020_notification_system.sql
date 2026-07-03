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

-- ================================================================
-- Task 2: Event-trigger matrix + drop old direct-push triggers
-- ================================================================
-- This section appended by Slice 23 Task 2.
-- It adds notification fan-out triggers for all booking lifecycle events
-- and removes the Slice-15 raw push triggers to avoid duplicate pushes.

-- ----------------------------------------------------------------
-- Step 1: Recreate log_booking_status_activity as ACTIVITY-ONLY
-- ----------------------------------------------------------------
-- The Slice-7 version inserted BOTH booking_activity AND notifications rows.
-- The new tg_notify_booking_update (below) now owns notifications.
-- Keeping ONLY the booking_activity insert prevents duplicate notifications.
-- The existing trigger trg_log_booking_status is left as-is (unchanged).

create or replace function public.log_booking_status_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_msg text;
begin
  if new.status is distinct from old.status then
    v_msg := case new.status
      when 'accepted'          then 'Your booking was accepted.'
      when 'provider_assigned' then 'A professional has been assigned to your booking.'
      when 'on_the_way'        then 'Your professional is on the way.'
      when 'in_progress'       then 'Work has started on your booking.'
      when 'completed'         then 'Your job is complete.'
      when 'cancelled'         then 'Your booking was cancelled.'
      else 'Your booking was updated.' end;
    insert into public.booking_activity (booking_id, actor_id, event_type, message)
      values (new.id, auth.uid(), new.status, v_msg);
    -- Notifications removed: tg_notify_booking_update now owns them.
  end if;
  return new;
end; $$;

-- ----------------------------------------------------------------
-- Step 2: Drop old Slice-15 direct-push triggers (avoid double-push)
-- ----------------------------------------------------------------
-- The functions (tg_push_bookings, tg_push_payments, tg_push_booking_messages,
-- notify_send_push, private.push_config) are preserved — harmless when unused.
-- Only the TRIGGERS are dropped so the new fan-out path (tg_push_notification
-- on notifications) is the sole push sender.

drop trigger if exists trg_push_bookings         on public.bookings;
drop trigger if exists trg_push_payments         on public.payments;
drop trigger if exists trg_push_booking_messages on public.booking_messages;

-- ----------------------------------------------------------------
-- 2a. tg_notify_booking_created — AFTER INSERT ON bookings
-- ----------------------------------------------------------------
create or replace function public.tg_notify_booking_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Notify customer
  perform public.notify_user(
    new.customer_id,
    new.id,
    'Booking received',
    'We received your booking.',
    'booking_received',
    'booking',
    '/booking/' || new.id::text,
    new.customer_id::text || ':' || new.id::text || ':booking_received'
  );
  -- Notify all approved admins
  perform public.notify_admins(
    new.id,
    'New booking',
    'A new booking was created.',
    'admin_new_booking',
    '/admin/booking/' || new.id::text,
    new.id::text || ':admin_new_booking'
  );
  return new;
end; $$;

drop trigger if exists tg_notify_booking_created on public.bookings;
create trigger tg_notify_booking_created
  after insert on public.bookings
  for each row execute function public.tg_notify_booking_created();

-- ----------------------------------------------------------------
-- 2b. tg_notify_booking_update — AFTER UPDATE ON bookings
-- ----------------------------------------------------------------
create or replace function public.tg_notify_booking_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- ── Status change branch ─────────────────────────────────────
  if new.status is distinct from old.status then
    case new.status

      when 'provider_assigned' then
        -- Customer: provider was assigned
        perform public.notify_user(
          new.customer_id,
          new.id,
          'Provider assigned',
          'A professional has been assigned to your booking.',
          'provider_assigned',
          'booking',
          '/booking/' || new.id::text,
          new.customer_id::text || ':' || new.id::text || ':provider_assigned'
        );
        -- Provider: new job (null-safe via notify_user guard)
        perform public.notify_user(
          new.assigned_provider_id,
          new.id,
          'New job assigned',
          'You have been assigned a new job.',
          'booking_assigned',
          'booking',
          '/provider/job/' || new.id::text,
          new.assigned_provider_id::text || ':' || new.id::text || ':booking_assigned'
        );

      when 'on_the_way' then
        perform public.notify_user(
          new.customer_id,
          new.id,
          'Your provider is on the way',
          'Your provider is on the way.',
          'heading_to_you',
          'booking',
          '/booking/track/' || new.id::text,
          new.customer_id::text || ':' || new.id::text || ':heading_to_you'
        );

      when 'in_progress' then
        perform public.notify_user(
          new.customer_id,
          new.id,
          'Work started',
          'Your provider has started the work.',
          'work_started',
          'booking',
          '/booking/' || new.id::text,
          new.customer_id::text || ':' || new.id::text || ':work_started'
        );

      when 'completed' then
        -- Job complete
        perform public.notify_user(
          new.customer_id,
          new.id,
          'Job completed',
          'Your job has been completed.',
          'work_completed',
          'booking',
          '/booking/' || new.id::text,
          new.customer_id::text || ':' || new.id::text || ':work_completed'
        );
        -- Review prompt
        perform public.notify_user(
          new.customer_id,
          new.id,
          'How was your service?',
          'Leave a review for your provider.',
          'review_reminder',
          'booking',
          '/booking/' || new.id::text,
          new.customer_id::text || ':' || new.id::text || ':review_reminder'
        );

      when 'cancelled' then
        -- Notify provider (null-safe)
        perform public.notify_user(
          new.assigned_provider_id,
          new.id,
          'Booking cancelled',
          'A booking was cancelled.',
          'booking_cancelled',
          'booking',
          '/provider/job/' || new.id::text,
          new.assigned_provider_id::text || ':' || new.id::text || ':booking_cancelled'
        );
        -- Notify admins if a provider was already assigned
        if old.assigned_provider_id is not null then
          perform public.notify_admins(
            new.id,
            'Booking cancelled',
            'A booking was cancelled after assignment.',
            'admin_cancelled_after_assign',
            '/admin/booking/' || new.id::text,
            new.id::text || ':admin_cancelled_after_assign'
          );
        end if;

      else
        null;
    end case;
  end if;

  -- ── Assignment cleared / provider rejected ───────────────────
  if old.assigned_provider_id is not null and new.assigned_provider_id is null then
    perform public.notify_admins(
      new.id,
      'Provider unassigned',
      'A provider was unassigned from a booking.',
      'admin_provider_rejected',
      '/admin/booking/' || new.id::text,
      new.id::text || ':admin_provider_rejected'
    );
  end if;

  -- ── Quote status change branch ───────────────────────────────
  if new.quote_status is distinct from old.quote_status then
    case new.quote_status

      when 'sent' then
        perform public.notify_user(
          new.customer_id,
          new.id,
          'New quote',
          'You have a new quote to review.',
          'quote_received',
          'booking',
          '/booking/' || new.id::text,
          new.customer_id::text || ':' || new.id::text || ':quote_received'
        );

      when 'accepted' then
        perform public.notify_user(
          new.assigned_provider_id,
          new.id,
          'Quote accepted',
          'Your quote was accepted.',
          'quote_accepted',
          'booking',
          '/provider/job/' || new.id::text,
          new.assigned_provider_id::text || ':' || new.id::text || ':quote_accepted'
        );

      when 'declined' then
        perform public.notify_user(
          new.assigned_provider_id,
          new.id,
          'Quote declined',
          'Your quote was declined.',
          'quote_rejected',
          'booking',
          '/provider/job/' || new.id::text,
          new.assigned_provider_id::text || ':' || new.id::text || ':quote_rejected'
        );

      else
        null;
    end case;
  end if;

  return new;
end; $$;

drop trigger if exists tg_notify_booking_update on public.bookings;
create trigger tg_notify_booking_update
  after update on public.bookings
  for each row
  when (
    new.status                 is distinct from old.status
    or new.quote_status        is distinct from old.quote_status
    or new.assigned_provider_id is distinct from old.assigned_provider_id
  )
  execute function public.tg_notify_booking_update();

-- ----------------------------------------------------------------
-- 2c. tg_notify_payment_paid — AFTER UPDATE ON payments
-- ----------------------------------------------------------------
create or replace function public.tg_notify_payment_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prov uuid;
begin
  -- Notify customer
  perform public.notify_user(
    new.customer_id,
    new.booking_id,
    'Payment confirmed',
    'Your payment has been confirmed.',
    'payment_confirmed',
    'payment',
    '/booking/' || new.booking_id::text,
    new.customer_id::text || ':' || new.booking_id::text || ':payment_confirmed'
  );
  -- Notify provider (look up from bookings)
  select assigned_provider_id into v_prov
    from public.bookings where id = new.booking_id;
  perform public.notify_user(
    v_prov,
    new.booking_id,
    'Payment received',
    'A payment has been received.',
    'payment_received',
    'payment',
    '/provider/job/' || new.booking_id::text,
    v_prov::text || ':' || new.booking_id::text || ':payment_received'
  );
  return new;
end; $$;

drop trigger if exists tg_notify_payment_paid on public.payments;
create trigger tg_notify_payment_paid
  after update on public.payments
  for each row
  when (new.status = 'paid' and old.status is distinct from 'paid')
  execute function public.tg_notify_payment_paid();

-- ----------------------------------------------------------------
-- 2d. tg_notify_payment_failed — AFTER INSERT OR UPDATE ON payment_attempts
-- ----------------------------------------------------------------
-- On INSERT old.status is null so (null is distinct from 'failed') = true → fires once.
-- Dedup key is per attempt-id so a retry on a new attempt row notifies once per row.

create or replace function public.tg_notify_payment_failed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_booking uuid;
begin
  select booking_id into v_booking
    from public.payments where id = new.payment_id;
  perform public.notify_admins(
    v_booking,
    'Payment failed',
    'A payment attempt failed.',
    'admin_payment_failed',
    '/admin/booking/' || v_booking::text,
    new.id::text || ':admin_payment_failed'
  );
  return new;
end; $$;

drop trigger if exists tg_notify_payment_failed on public.payment_attempts;
create trigger tg_notify_payment_failed
  after insert or update on public.payment_attempts
  for each row
  when (new.status = 'failed' and old.status is distinct from 'failed')
  execute function public.tg_notify_payment_failed();

-- ----------------------------------------------------------------
-- 2e. tg_notify_chat_message — AFTER INSERT ON booking_messages
-- ----------------------------------------------------------------
-- NULL dedup_key: every new message triggers a notification (no dedup).
-- Body is truncated to 80 chars with ellipsis if longer.

create or replace function public.tg_notify_chat_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cust      uuid;
  v_prov      uuid;
  v_recipient uuid;
  v_route     text;
  v_body      text;
begin
  select customer_id, assigned_provider_id
    into v_cust, v_prov
    from public.bookings where id = new.booking_id;

  -- The recipient is whoever did NOT send the message
  if new.sender_id = v_cust then
    v_recipient := v_prov;
    v_route     := '/provider/job/chat/' || new.booking_id::text;
  else
    v_recipient := v_cust;
    v_route     := '/booking/chat/' || new.booking_id::text;
  end if;

  v_body := case
    when char_length(new.message_text) > 80
    then left(new.message_text, 80) || '…'
    else new.message_text
  end;

  -- NULL dedup_key → every message notifies (no conflict check)
  perform public.notify_user(
    v_recipient,
    new.booking_id,
    'New message',
    v_body,
    'chat_message',
    'chat',
    v_route,
    null
  );
  return new;
end; $$;

drop trigger if exists tg_notify_chat_message on public.booking_messages;
create trigger tg_notify_chat_message
  after insert on public.booking_messages
  for each row execute function public.tg_notify_chat_message();

-- ----------------------------------------------------------------
-- 2f. tg_notify_review — AFTER INSERT ON reviews
-- ----------------------------------------------------------------
create or replace function public.tg_notify_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_user(
    new.provider_id,
    new.booking_id,
    'New review',
    'You received a new review.',
    'review_received',
    'booking',
    '/provider/job/' || new.booking_id::text,
    new.provider_id::text || ':' || new.id::text || ':review_received'
  );
  return new;
end; $$;

drop trigger if exists tg_notify_review on public.reviews;
create trigger tg_notify_review
  after insert on public.reviews
  for each row execute function public.tg_notify_review();

-- ----------------------------------------------------------------
-- 2g. tg_notify_provider_pending — AFTER INSERT ON profiles
-- ----------------------------------------------------------------
-- Fires only when a new profile row has role='provider' and approval_status='pending'.
-- p_booking_id is NULL (no booking involved); notify_admins handles the fan-out.

create or replace function public.tg_notify_provider_pending()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_admins(
    null,
    'New provider',
    'A provider is awaiting approval.',
    'admin_provider_pending',
    '/admin/providers',
    new.id::text || ':admin_provider_pending'
  );
  return new;
end; $$;

drop trigger if exists tg_notify_provider_pending on public.profiles;
create trigger tg_notify_provider_pending
  after insert on public.profiles
  for each row
  when (new.role = 'provider' and new.approval_status = 'pending')
  execute function public.tg_notify_provider_pending();
