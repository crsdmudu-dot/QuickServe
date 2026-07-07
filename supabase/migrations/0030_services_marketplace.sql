-- ============================================================
-- Slice 35 — Services marketplace (SCHEMA + RLS; RPCs+seed in the same file appended by T2).
-- Non-admin SELECT active only; admin SELECT all; admin-only INSERT/UPDATE; NO DELETE (archive path).
-- slug = compatibility key (== old service id), immutable, format-checked.
-- Additive; no existing object altered.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. service_categories
-- slug immutable (enforced by the T2 update RPC) + format-checked here;
-- non-admin select active only; admin all; admin-only write; no delete.
-- ----------------------------------------------------------------
create table if not exists public.service_categories (
  id            uuid        primary key default gen_random_uuid(),
  slug          text        not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text        not null,
  icon          text,
  color         text,
  display_order int         not null default 0,
  active        boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists service_categories_order_idx on public.service_categories (display_order);

alter table public.service_categories enable row level security;

create policy "service_categories_select" on public.service_categories
  for select using (active = true or public.is_admin());

create policy "service_categories_insert" on public.service_categories
  for insert with check (public.is_admin());

create policy "service_categories_update" on public.service_categories
  for update using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------
-- 2. services
-- slug immutable (enforced by the T2 update RPC) + format-checked here;
-- non-admin select active only; admin all; admin-only write; no delete.
-- ----------------------------------------------------------------
create table if not exists public.services (
  id                   uuid        primary key default gen_random_uuid(),
  slug                 text        not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                 text        not null,
  short_description    text,
  full_description     text,
  category_id          uuid        references public.service_categories(id),
  icon                 text,
  color                text,
  display_order        int         not null default 0,
  status               text        not null
    check (status in ('draft','active','hidden','disabled','archived'))
    default 'draft',
  featured             boolean     not null default false,
  trending             boolean     not null default false,
  emergency_available  boolean     not null default false,
  inspection_required  boolean     not null default false,
  available_24_7       boolean     not null default false,
  estimated_duration   text,
  starting_price_text  text,
  active_from          timestamptz,
  active_until         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (category_id, name)
);

create index if not exists services_status_idx    on public.services (status);
create index if not exists services_category_idx  on public.services (category_id);
create index if not exists services_order_idx     on public.services (display_order);

alter table public.services enable row level security;

create policy "services_select" on public.services
  for select using (status = 'active' or public.is_admin());

create policy "services_insert" on public.services
  for insert with check (public.is_admin());

create policy "services_update" on public.services
  for update using (public.is_admin()) with check (public.is_admin());
