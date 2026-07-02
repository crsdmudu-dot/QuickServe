-- ============================================================
-- Slice 21 — Provider Locations schema (live tracking)
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Table
-- ----------------------------------------------------------------
create table if not exists public.provider_locations (
  booking_id   uuid primary key references public.bookings(id) on delete cascade,
  provider_id  uuid not null references public.profiles(id),
  latitude     double precision not null,
  longitude    double precision not null,
  heading      double precision,
  speed        double precision,
  updated_at   timestamptz not null default now()
);
alter table public.provider_locations enable row level security;

-- ----------------------------------------------------------------
-- 2. RLS — SELECT only (no write policies; writes via RPC)
-- Readable by the booking's customer, its assigned provider, or admin.
-- ----------------------------------------------------------------
create policy "provider_locations_select" on public.provider_locations
  for select using (
    exists (select 1 from public.bookings b
            where b.id = booking_id
              and (b.customer_id = auth.uid()
                   or b.assigned_provider_id = auth.uid()
                   or public.is_admin()))
  );

-- ----------------------------------------------------------------
-- 3. RPC: upsert_provider_location
-- Only the booking's assigned provider may call this, and only
-- while the booking status is 'on_the_way' or 'in_progress'.
-- ----------------------------------------------------------------
create or replace function public.upsert_provider_location(
  p_booking_id uuid,
  p_lat        double precision,
  p_lng        double precision,
  p_heading    double precision,
  p_speed      double precision
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_assigned_provider_id uuid;
  v_status               text;
begin
  select assigned_provider_id, status
    into v_assigned_provider_id, v_status
    from public.bookings
   where id = p_booking_id;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_assigned_provider_id is distinct from auth.uid() then
    raise exception 'Not the assigned provider';
  end if;

  if v_status not in ('on_the_way', 'in_progress') then
    raise exception 'Booking is not active for tracking';
  end if;

  insert into public.provider_locations (booking_id, provider_id, latitude, longitude, heading, speed, updated_at)
  values (p_booking_id, auth.uid(), p_lat, p_lng, p_heading, p_speed, now())
  on conflict (booking_id) do update
    set provider_id = auth.uid(), latitude = p_lat, longitude = p_lng,
        heading = p_heading, speed = p_speed, updated_at = now();
end; $$;

-- ----------------------------------------------------------------
-- 4. RPC: clear_provider_location
-- Callable by the booking's assigned provider OR an admin.
-- ----------------------------------------------------------------
create or replace function public.clear_provider_location(
  p_booking_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_assigned_provider_id uuid;
begin
  select assigned_provider_id
    into v_assigned_provider_id
    from public.bookings
   where id = p_booking_id;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_assigned_provider_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Permission denied';
  end if;

  delete from public.provider_locations where booking_id = p_booking_id;
end; $$;

-- ----------------------------------------------------------------
-- 5. Realtime publication (idempotent)
-- ----------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'provider_locations'
  ) then
    alter publication supabase_realtime add table public.provider_locations;
  end if;
end $$;
