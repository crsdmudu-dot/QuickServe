-- New provider profile columns
alter table public.profiles
  add column if not exists profile_photo_url text,
  add column if not exists bio text,
  add column if not exists years_experience int,
  add column if not exists skills text[],
  add column if not exists is_verified boolean not null default false,
  add column if not exists completed_jobs_count int not null default 0,
  add column if not exists average_rating numeric,
  add column if not exists availability_status text not null default 'available'
    check (availability_status in ('available','unavailable'));

-- Extend self-update guard: pin verify/count/rating in addition to role/approval_status
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and approval_status = (select p.approval_status from public.profiles p where p.id = auth.uid())
    and is_verified = (select p.is_verified from public.profiles p where p.id = auth.uid())
    and completed_jobs_count = (select p.completed_jobs_count from public.profiles p where p.id = auth.uid())
    and average_rating is not distinct from (select p.average_rating from public.profiles p where p.id = auth.uid())
  );

-- Quality system: bump completed_jobs_count when a job transitions into 'completed'
create or replace function public.bump_completed_jobs()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status <> 'completed'
     and new.assigned_provider_id is not null then
    update public.profiles
      set completed_jobs_count = completed_jobs_count + 1
      where id = new.assigned_provider_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_bump_completed_jobs on public.bookings;
create trigger trg_bump_completed_jobs after update on public.bookings
  for each row execute function public.bump_completed_jobs();

-- Curated professional card for a booking; caller must own the booking or be admin.
create or replace function public.get_booking_professional(p_booking_id uuid)
returns table (
  full_name text, skills text[], is_verified boolean,
  completed_jobs_count int, profile_photo_url text
)
language sql security definer set search_path = public as $$
  select pr.full_name, pr.skills, pr.is_verified, pr.completed_jobs_count, pr.profile_photo_url
  from public.bookings b
  join public.profiles pr on pr.id = b.assigned_provider_id
  where b.id = p_booking_id
    and b.assigned_provider_id is not null
    and (b.customer_id = auth.uid() or public.is_admin());
$$;
