create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.profiles(id),
  provider_id uuid not null references public.profiles(id),
  rating int not null check (rating between 1 and 5),
  comment text,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists review_count int not null default 0;
alter table public.reviews enable row level security;

-- Customer may review only their own completed booking with an in-app provider
create policy "reviews_insert_own" on public.reviews for insert with check (
  customer_id = auth.uid()
  and rating between 1 and 5
  and is_hidden = false
  and exists (select 1 from public.bookings b where b.id = booking_id
    and b.customer_id = auth.uid()
    and b.status = 'completed'
    and b.assigned_provider_id is not null
    and b.assigned_provider_id = provider_id)
);
create policy "reviews_select" on public.reviews for select using (
  customer_id = auth.uid()
  or (provider_id = auth.uid() and is_hidden = false)
  or public.is_admin()
);
-- Only admin may hide/unhide; no customer/provider update, no delete
create policy "reviews_update_admin" on public.reviews for update
  using (public.is_admin()) with check (public.is_admin());

-- Recompute provider aggregates over non-hidden reviews
create or replace function public.recompute_provider_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pid uuid; v_avg numeric; v_cnt int;
begin
  v_pid := coalesce(new.provider_id, old.provider_id);
  select avg(rating), count(*) into v_avg, v_cnt
    from public.reviews where provider_id = v_pid and is_hidden = false;
  update public.profiles
    set average_rating = v_avg, review_count = coalesce(v_cnt, 0)
    where id = v_pid;
  return null;
end; $$;
drop trigger if exists trg_recompute_provider_rating on public.reviews;
create trigger trg_recompute_provider_rating
  after insert or update or delete on public.reviews
  for each row execute function public.recompute_provider_rating();
