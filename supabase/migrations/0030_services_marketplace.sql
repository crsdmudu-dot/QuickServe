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

-- ============================================================
-- T2 — Admin CRUD RPCs (all SECURITY DEFINER + is_admin guard; no hard delete)
-- slug immutable on update (no p_slug param in any update RPC).
-- ============================================================

-- ----------------------------------------------------------------
-- Category RPCs
-- ----------------------------------------------------------------

-- admin_create_category: validates slug format, inserts, returns new id.
create or replace function public.admin_create_category(
  p_slug  text,
  p_name  text,
  p_icon  text,
  p_color text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  -- is_admin-guarded
  if not public.is_admin() then raise exception 'not authorized'; end if;

  -- validate slug format
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid slug format';
  end if;

  insert into public.service_categories (slug, name, icon, color, display_order)
  values (
    p_slug,
    p_name,
    p_icon,
    p_color,
    coalesce((select max(display_order) + 1 from public.service_categories), 0)
  )
  returning id into v_id;

  return v_id;
end; $$;

-- admin_update_category: updates name/icon/color only — slug is immutable, not accepted.
create or replace function public.admin_update_category(
  p_id    uuid,
  p_name  text,
  p_icon  text,
  p_color text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- is_admin-guarded; slug immutable on update (no p_slug param)
  if not public.is_admin() then raise exception 'not authorized'; end if;

  update public.service_categories
  set
    name       = coalesce(p_name, name),
    icon       = coalesce(p_icon, icon),
    color      = coalesce(p_color, color),
    updated_at = now()
  where id = p_id;
end; $$;

-- admin_set_category_active: category-active guard prevents archiving a category that still
-- has active services (no hard delete; archive path only).
create or replace function public.admin_set_category_active(
  p_id     uuid,
  p_active boolean
)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- is_admin-guarded
  if not public.is_admin() then raise exception 'not authorized'; end if;

  -- category-active guard: cannot deactivate while active services exist
  if not p_active then
    if exists (
      select 1 from public.services where category_id = p_id and status = 'active'
    ) then
      raise exception 'category has active services';
    end if;
  end if;

  update public.service_categories
  set
    active     = p_active,
    updated_at = now()
  where id = p_id;
end; $$;

-- admin_reorder_categories: sets display_order atomically using array position.
create or replace function public.admin_reorder_categories(
  p_ordered_ids uuid[]
)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- is_admin-guarded; reorder sets display_order by array position
  if not public.is_admin() then raise exception 'not authorized'; end if;

  update public.service_categories sc
  set
    display_order = ord.pos - 1,
    updated_at    = now()
  from (
    select unnest(p_ordered_ids) as id,
           generate_subscripts(p_ordered_ids, 1) as pos
  ) as ord
  where sc.id = ord.id;
end; $$;

-- ----------------------------------------------------------------
-- Service RPCs
-- ----------------------------------------------------------------

-- admin_create_service: validates slug format, inserts with status='draft', returns new id.
create or replace function public.admin_create_service(
  p_slug                text,
  p_name                text,
  p_short_description   text,
  p_full_description    text,
  p_category_id         uuid,
  p_icon                text,
  p_color               text,
  p_estimated_duration  text,
  p_starting_price_text text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  -- is_admin-guarded
  if not public.is_admin() then raise exception 'not authorized'; end if;

  -- validate slug format
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid slug format';
  end if;

  insert into public.services (
    slug, name, short_description, full_description,
    category_id, icon, color, estimated_duration, starting_price_text,
    status, display_order
  )
  values (
    p_slug, p_name, p_short_description, p_full_description,
    p_category_id, p_icon, p_color, p_estimated_duration, p_starting_price_text,
    'draft',
    coalesce(
      (select max(display_order) + 1 from public.services where category_id = p_category_id),
      0
    )
  )
  returning id into v_id;

  return v_id;
end; $$;

-- admin_update_service: updates all editable fields + 5 boolean toggles.
-- SLUG IMMUTABLE: does NOT accept or change slug (no p_slug param).
create or replace function public.admin_update_service(
  p_id                  uuid,
  p_name                text,
  p_short_description   text,
  p_full_description    text,
  p_category_id         uuid,
  p_icon                text,
  p_color               text,
  p_estimated_duration  text,
  p_starting_price_text text,
  p_featured            boolean,
  p_trending            boolean,
  p_emergency_available boolean,
  p_inspection_required boolean,
  p_available_24_7      boolean
)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- is_admin-guarded; slug immutable on update (no p_slug param — do not accept or change slug)
  if not public.is_admin() then raise exception 'not authorized'; end if;

  update public.services
  set
    name                = coalesce(p_name, name),
    short_description   = coalesce(p_short_description, short_description),
    full_description    = coalesce(p_full_description, full_description),
    category_id         = coalesce(p_category_id, category_id),
    icon                = coalesce(p_icon, icon),
    color               = coalesce(p_color, color),
    estimated_duration  = coalesce(p_estimated_duration, estimated_duration),
    starting_price_text = coalesce(p_starting_price_text, starting_price_text),
    featured            = coalesce(p_featured, featured),
    trending            = coalesce(p_trending, trending),
    emergency_available = coalesce(p_emergency_available, emergency_available),
    inspection_required = coalesce(p_inspection_required, inspection_required),
    available_24_7      = coalesce(p_available_24_7, available_24_7),
    updated_at          = now()
  where id = p_id;
end; $$;

-- admin_set_service_status: validates status value, updates status + updated_at.
-- Covers activate/hide/disable/archive/restore — no hard delete.
create or replace function public.admin_set_service_status(
  p_id     uuid,
  p_status text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- is_admin-guarded
  if not public.is_admin() then raise exception 'not authorized'; end if;

  if p_status not in ('draft', 'active', 'hidden', 'disabled', 'archived') then
    raise exception 'invalid status value';
  end if;

  update public.services
  set
    status     = p_status,
    updated_at = now()
  where id = p_id;
end; $$;

-- admin_duplicate_service: copies source row, suffix slug with -copy (unique-ified),
-- name with ' (copy)', status='draft', display_order at end of category.
create or replace function public.admin_duplicate_service(
  p_id uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  src          public.services%rowtype;
  v_new_slug   text;
  v_new_id     uuid;
  v_suffix_num int := 1;
  v_candidate  text;
begin
  -- is_admin-guarded; duplicate→draft + -copy slug
  if not public.is_admin() then raise exception 'not authorized'; end if;

  select * into src from public.services where id = p_id;

  -- build unique -copy slug (append -2, -3, … if needed)
  v_candidate := src.slug || '-copy';
  loop
    if not exists (select 1 from public.services where slug = v_candidate) then
      v_new_slug := v_candidate;
      exit;
    end if;
    v_suffix_num := v_suffix_num + 1;
    v_candidate  := src.slug || '-copy-' || v_suffix_num;
  end loop;

  insert into public.services (
    slug, name, short_description, full_description,
    category_id, icon, color, estimated_duration, starting_price_text,
    status, featured, trending, emergency_available, inspection_required,
    available_24_7, active_from, active_until, display_order
  )
  values (
    v_new_slug,
    src.name || ' (copy)',
    src.short_description,
    src.full_description,
    src.category_id,
    src.icon,
    src.color,
    src.estimated_duration,
    src.starting_price_text,
    'draft',
    false,
    false,
    src.emergency_available,
    src.inspection_required,
    src.available_24_7,
    src.active_from,
    src.active_until,
    coalesce(
      (select max(display_order) + 1 from public.services where category_id = src.category_id),
      0
    )
  )
  returning id into v_new_id;

  return v_new_id;
end; $$;

-- admin_reorder_services: sets display_order atomically for services within a category.
create or replace function public.admin_reorder_services(
  p_category_id uuid,
  p_ordered_ids uuid[]
)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- is_admin-guarded; reorder sets display_order by array position
  if not public.is_admin() then raise exception 'not authorized'; end if;

  update public.services svc
  set
    display_order = ord.pos - 1,
    updated_at    = now()
  from (
    select unnest(p_ordered_ids) as id,
           generate_subscripts(p_ordered_ids, 1) as pos
  ) as ord
  where svc.id = ord.id
    and svc.category_id = p_category_id;
end; $$;

-- ============================================================
-- T2 — Idempotent non-destructive seed
-- on conflict (slug) do nothing on BOTH inserts — never overwrites admin edits on rerun.
-- 4 categories + 19 services (slug=old id, status='active').
-- featured/trending flags set per discovery.ts FEATURED_SERVICE_IDS / TRENDING_SERVICE_IDS.
-- ============================================================

insert into public.service_categories (slug, name, icon, color, display_order, active) values
  ('home',     'Home Services',     null, null, 0, true),
  ('auto',     'Auto Services',     null, null, 1, true),
  ('delivery', 'Delivery Services', null, null, 2, true),
  ('personal', 'Personal Care',     null, null, 3, true)
on conflict (slug) do nothing;

-- 19 services — slug = old id; status='active'; featured/trending per discovery.ts
-- FEATURED_SERVICE_IDS: house-cleaning, mechanic, food-delivery, massage, ac-repair
-- TRENDING_SERVICE_IDS: plumbing, grocery-delivery, handyman, haircuts, movers-packers, tire-replacement
insert into public.services (
  slug, name, short_description, icon, category_id,
  starting_price_text, display_order, status, featured, trending
) values
  -- home category (display_order 0..8)
  ('house-cleaning',  'House Cleaning',       'Deep & regular cleaning',   '🧹',
   (select id from public.service_categories where slug = 'home'), '1500', 0, 'active', true,  false),
  ('plumbing',        'Plumbing',             'Leaks, fittings & repairs', '🔧',
   (select id from public.service_categories where slug = 'home'), '2000', 1, 'active', false, true),
  ('electrical',      'Electrical Repairs',   'Wiring & fixtures',         '⚡',
   (select id from public.service_categories where slug = 'home'), '1800', 2, 'active', false, false),
  ('ac-repair',       'AC Repair & Servicing','Cooling & maintenance',     '❄️',
   (select id from public.service_categories where slug = 'home'), '2500', 3, 'active', true,  false),
  ('painting',        'Home Painting',        'Interior & exterior',       '🎨',
   (select id from public.service_categories where slug = 'home'), '3000', 4, 'active', false, false),
  ('pest-control',    'Pest Control',         'Safe & thorough',           '🐜',
   (select id from public.service_categories where slug = 'home'), '2200', 5, 'active', false, false),
  ('handyman',        'Handyman Services',    'Fixes & odd jobs',          '🛠️',
   (select id from public.service_categories where slug = 'home'), '1200', 6, 'active', false, true),
  ('appliance-repair','Appliance Repair',     'Fridges, washers & more',   '🔌',
   (select id from public.service_categories where slug = 'home'), '1600', 7, 'active', false, false),
  ('movers-packers',  'Movers & Packers',     'Pack, move & unpack',       '📦',
   (select id from public.service_categories where slug = 'home'), '5000', 8, 'active', false, true),
  -- auto category (display_order 0..2)
  ('mechanic',        'Mechanic On Demand',   'Roadside & at-home',        '🚗',
   (select id from public.service_categories where slug = 'auto'), '2000', 0, 'active', true,  false),
  ('tire-replacement','Tire Replacement',     'Change & balancing',        '🛞',
   (select id from public.service_categories where slug = 'auto'), '1500', 1, 'active', false, true),
  ('car-towing',      'Car Towing',           '24/7 recovery',             '🚙',
   (select id from public.service_categories where slug = 'auto'), '3500', 2, 'active', false, false),
  -- delivery category (display_order 0..3)
  ('grocery-delivery','Grocery Delivery',     'Fresh to your door',        '🛒',
   (select id from public.service_categories where slug = 'delivery'), '300',  0, 'active', false, true),
  ('food-delivery',   'Food Delivery',        'From local restaurants',    '🍔',
   (select id from public.service_categories where slug = 'delivery'), '250',  1, 'active', true,  false),
  ('medicine-delivery','Medicine Delivery',   'Pharmacy on demand',        '💊',
   (select id from public.service_categories where slug = 'delivery'), '300',  2, 'active', false, false),
  ('package-delivery','Package Delivery',     'Send anything, fast',       '📮',
   (select id from public.service_categories where slug = 'delivery'), '400',  3, 'active', false, false),
  -- personal category (display_order 0..2)
  ('haircuts',        'Haircuts',             'Barbers & stylists',        '✂️',
   (select id from public.service_categories where slug = 'personal'), '800',  0, 'active', false, true),
  ('makeup',          'Makeup',               'Events & occasions',        '💄',
   (select id from public.service_categories where slug = 'personal'), '2500', 1, 'active', false, false),
  ('massage',         'Massage',              'Relax at home',             '💆',
   (select id from public.service_categories where slug = 'personal'), '2000', 2, 'active', true,  false)
on conflict (slug) do nothing;
