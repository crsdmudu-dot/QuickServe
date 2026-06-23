-- Activity timeline (read-only to users; written by triggers)
create table if not exists public.booking_activity (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  event_type text not null,
  message text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
alter table public.booking_activity enable row level security;
create policy "booking_activity_select" on public.booking_activity
  for select using (
    exists (select 1 from public.bookings b where b.id = booking_id
      and (b.customer_id = auth.uid() or b.assigned_provider_id = auth.uid() or public.is_admin()))
  );

-- In-app notifications (own-only; written by triggers)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  booking_id uuid references public.bookings(id) on delete cascade,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
create policy "notifications_select" on public.notifications
  for select using (user_id = auth.uid());
-- Users may only flip is_read on their own rows (other columns pinned).
create policy "notifications_update" on public.notifications
  for update using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and booking_id is not distinct from (select n.booking_id from public.notifications n where n.id = notifications.id)
    and title = (select n.title from public.notifications n where n.id = notifications.id)
    and body  = (select n.body  from public.notifications n where n.id = notifications.id)
  );

-- booking_created -> activity
create or replace function public.log_booking_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.booking_activity (booking_id, actor_id, event_type, message)
    values (new.id, new.customer_id, 'booking_created', 'Booking created.');
  return new;
end; $$;
drop trigger if exists trg_log_booking_created on public.bookings;
create trigger trg_log_booking_created after insert on public.bookings
  for each row execute function public.log_booking_created();

-- status change -> activity + notify customer (+ provider on assignment)
create or replace function public.log_booking_status_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_msg text;
begin
  if new.status is distinct from old.status then
    v_msg := case new.status
      when 'accepted' then 'Your booking was accepted.'
      when 'provider_assigned' then 'A professional has been assigned to your booking.'
      when 'on_the_way' then 'Your professional is on the way.'
      when 'in_progress' then 'Work has started on your booking.'
      when 'completed' then 'Your job is complete.'
      when 'cancelled' then 'Your booking was cancelled.'
      else 'Your booking was updated.' end;
    insert into public.booking_activity (booking_id, actor_id, event_type, message)
      values (new.id, auth.uid(), new.status, v_msg);
    insert into public.notifications (user_id, booking_id, title, body)
      values (new.customer_id, new.id, 'Booking update', v_msg);
    if new.status = 'provider_assigned' and new.assigned_provider_id is not null then
      insert into public.notifications (user_id, booking_id, title, body)
        values (new.assigned_provider_id, new.id, 'New job assigned', 'You have been assigned a new job.');
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_log_booking_status on public.bookings;
create trigger trg_log_booking_status after update on public.bookings
  for each row execute function public.log_booking_status_activity();

-- photo added -> activity
create or replace function public.log_photo_added()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_msg text;
begin
  v_msg := case new.photo_type
    when 'issue' then 'Issue photos uploaded.'
    when 'before' then 'Before photos uploaded.'
    when 'after' then 'After photos uploaded.'
    when 'completion' then 'Completion photos uploaded.'
    else 'Photos uploaded.' end;
  insert into public.booking_activity (booking_id, actor_id, event_type, message)
    values (new.booking_id, new.uploaded_by, new.photo_type || '_photo_added', v_msg);
  return new;
end; $$;
drop trigger if exists trg_log_photo_added on public.booking_photos;
create trigger trg_log_photo_added after insert on public.booking_photos
  for each row execute function public.log_photo_added();

-- photo verified (false->true) -> activity
create or replace function public.log_photo_verified()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_verified = true and old.is_verified = false then
    insert into public.booking_activity (booking_id, actor_id, event_type, message)
      values (new.booking_id, auth.uid(), 'photos_verified', 'A photo was verified by QuickServe.');
  end if;
  return new;
end; $$;
drop trigger if exists trg_log_photo_verified on public.booking_photos;
create trigger trg_log_photo_verified after update on public.booking_photos
  for each row execute function public.log_photo_verified();
