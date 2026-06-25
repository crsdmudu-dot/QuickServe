-- ============================================================
-- Slice 15 — Push notification triggers via pg_net
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Enable pg_net extension (available in Supabase)
-- ----------------------------------------------------------------
create extension if not exists pg_net;

-- ----------------------------------------------------------------
-- 2. Private config table (locked down; operator fills it later)
-- ----------------------------------------------------------------
create schema if not exists private;

create table if not exists private.push_config (
  id             int primary key default 1 check (id = 1),
  send_push_url  text,
  webhook_secret text
);
insert into private.push_config (id) values (1) on conflict (id) do nothing;

revoke all on private.push_config from anon, authenticated;
revoke all on schema private from anon, authenticated;

-- ----------------------------------------------------------------
-- 3. Helper: notify_send_push
--    SECURITY DEFINER so it can read private.push_config even
--    when called from a trigger running as the DML user's role.
--    send_push_url IS NULL acts as the kill switch — no-op.
-- ----------------------------------------------------------------
create or replace function public.notify_send_push(p_payload jsonb)
returns void language plpgsql security definer set search_path = public, private as $$
declare
  v_url    text;
  v_secret text;
begin
  select send_push_url, webhook_secret into v_url, v_secret
    from private.push_config where id = 1;

  -- Kill switch: if no URL configured, do nothing.
  if v_url is null then
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    body    := p_payload,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-webhook-secret', coalesce(v_secret, '')
               )
  );
end; $$;

-- ----------------------------------------------------------------
-- 4. Trigger functions — each builds the webhook payload and
--    delegates to notify_send_push.
--    SECURITY DEFINER + fixed search_path (best-practice hardening).
--    Returns NEW (required for AFTER triggers).
-- ----------------------------------------------------------------

create or replace function public.tg_push_bookings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_send_push(jsonb_build_object(
    'table',      tg_table_name,
    'op',         tg_op,
    'record',     to_jsonb(new),
    'old_record', to_jsonb(old)
  ));
  return new;
end; $$;

create or replace function public.tg_push_payments()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_send_push(jsonb_build_object(
    'table',      tg_table_name,
    'op',         tg_op,
    'record',     to_jsonb(new),
    'old_record', to_jsonb(old)
  ));
  return new;
end; $$;

create or replace function public.tg_push_booking_messages()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_send_push(jsonb_build_object(
    'table',      tg_table_name,
    'op',         tg_op,
    'record',     to_jsonb(new),
    'old_record', to_jsonb(old)
  ));
  return new;
end; $$;

-- ----------------------------------------------------------------
-- 5. Triggers (drop-if-exists then create)
--    - bookings:         AFTER UPDATE, only when status or
--                        quote_status actually changed.
--    - payments:         AFTER UPDATE, only on pending → paid
--                        transition.
--    - booking_messages: AFTER INSERT (old is null → JSON null).
-- ----------------------------------------------------------------
drop trigger if exists trg_push_bookings on public.bookings;
create trigger trg_push_bookings
  after update on public.bookings
  for each row
  when (new.status is distinct from old.status
        or new.quote_status is distinct from old.quote_status)
  execute function public.tg_push_bookings();

drop trigger if exists trg_push_payments on public.payments;
create trigger trg_push_payments
  after update on public.payments
  for each row
  when (new.status = 'paid' and old.status is distinct from 'paid')
  execute function public.tg_push_payments();

drop trigger if exists trg_push_booking_messages on public.booking_messages;
create trigger trg_push_booking_messages
  after insert on public.booking_messages
  for each row
  execute function public.tg_push_booking_messages();
