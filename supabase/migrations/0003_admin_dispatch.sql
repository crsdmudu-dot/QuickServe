-- Admin dispatch migration: adds provider columns, expands status constraint,
-- creates an is_admin() helper, and adds admin RLS policies.

-- New booking columns
alter table public.bookings add column if not exists assigned_provider_name text;
alter table public.bookings add column if not exists assigned_provider_phone text;
alter table public.bookings add column if not exists admin_notes text;

-- Migrate old status value, then swap the check constraint to the 7-status set
update public.bookings set status = 'provider_assigned' where status = 'assigned';
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending','accepted','provider_assigned','on_the_way','in_progress','completed','cancelled'));

-- Admin detection without RLS recursion
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- Admin policies on bookings
create policy "bookings_select_admin" on public.bookings for select using (public.is_admin());
create policy "bookings_update_admin" on public.bookings for update using (public.is_admin()) with check (public.is_admin());

-- Admin policies on profiles
create policy "profiles_select_admin" on public.profiles for select using (public.is_admin());
create policy "profiles_update_admin" on public.profiles for update using (public.is_admin()) with check (public.is_admin());
