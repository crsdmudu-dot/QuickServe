-- ============================================================
-- Slice 22 — Customer Addresses schema
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Table
-- ----------------------------------------------------------------
create table if not exists public.customer_addresses (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.profiles(id) on delete cascade,
  label_type    text not null default 'other' check (label_type in ('home','work','other')),
  nickname      text,
  address       text not null,
  address_label text,
  latitude      double precision,
  longitude     double precision,
  building_name text,
  floor         text,
  door_number   text,
  landmark      text,
  access_notes  text,
  is_default    boolean not null default false,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.customer_addresses enable row level security;

-- ----------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------
create unique index if not exists customer_addresses_one_default
  on public.customer_addresses (customer_id) where is_default;
create index if not exists customer_addresses_customer_idx
  on public.customer_addresses (customer_id, last_used_at desc);

-- ----------------------------------------------------------------
-- 3. RLS — OWNER-ONLY, all four ops
-- ----------------------------------------------------------------
create policy "customer_addresses_select" on public.customer_addresses
  for select using (customer_id = auth.uid());

create policy "customer_addresses_insert" on public.customer_addresses
  for insert with check (customer_id = auth.uid());

create policy "customer_addresses_update" on public.customer_addresses
  for update using (customer_id = auth.uid()) with check (customer_id = auth.uid());

create policy "customer_addresses_delete" on public.customer_addresses
  for delete using (customer_id = auth.uid());

-- ----------------------------------------------------------------
-- 4. RPC: set_default_address
-- ----------------------------------------------------------------
create or replace function public.set_default_address(
  p_address_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_customer_id uuid;
begin
  select customer_id into v_customer_id
    from public.customer_addresses
   where id = p_address_id;

  if not found then
    raise exception 'Address not found';
  end if;

  if v_customer_id is distinct from auth.uid() then
    raise exception 'Not the address owner';
  end if;

  update public.customer_addresses
     set is_default = false, updated_at = now()
   where customer_id = auth.uid() and is_default;

  update public.customer_addresses
     set is_default = true, updated_at = now()
   where id = p_address_id;
end; $$;

-- ----------------------------------------------------------------
-- 5. RPC: touch_saved_address
-- ----------------------------------------------------------------
create or replace function public.touch_saved_address(
  p_address_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_customer_id uuid;
begin
  select customer_id into v_customer_id
    from public.customer_addresses
   where id = p_address_id;

  if not found then
    raise exception 'Address not found';
  end if;

  if v_customer_id is distinct from auth.uid() then
    raise exception 'Not the address owner';
  end if;

  update public.customer_addresses
     set last_used_at = now()
   where id = p_address_id;
end; $$;
