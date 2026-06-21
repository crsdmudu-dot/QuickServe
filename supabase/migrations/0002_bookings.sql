create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  service_id text not null,
  address text not null,
  scheduled_for timestamptz not null,
  notes text,
  status text not null default 'pending'
    check (status in ('pending','assigned','accepted','in_progress','completed','cancelled')),
  created_at timestamptz not null default now()
);
alter table public.bookings enable row level security;
create policy "bookings_insert_own" on public.bookings
  for insert with check (auth.uid() = customer_id);
create policy "bookings_select_own" on public.bookings
  for select using (auth.uid() = customer_id);
