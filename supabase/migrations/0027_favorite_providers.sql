-- ============================================================
-- Slice 32 — Marketplace discovery.
-- Additive: favorite_providers (owner-only) + curated read-only provider RPCs.
-- No PII exposed. No existing table/policy/data changed. No dispatch/ranking.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Table — owner-only favorites
-- ----------------------------------------------------------------
create table if not exists public.favorite_providers (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.profiles(id) on delete cascade,
  provider_id  uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (customer_id, provider_id)
);

create index if not exists favorite_providers_customer_idx
  on public.favorite_providers (customer_id, created_at desc);

alter table public.favorite_providers enable row level security;

-- ----------------------------------------------------------------
-- 2. RLS — OWNER-ONLY (select / insert / delete; NO update policy)
-- ----------------------------------------------------------------
create policy "favorite_providers_select" on public.favorite_providers
  for select using (customer_id = auth.uid());

create policy "favorite_providers_insert" on public.favorite_providers
  for insert with check (customer_id = auth.uid());

create policy "favorite_providers_delete" on public.favorite_providers
  for delete using (customer_id = auth.uid());

-- ----------------------------------------------------------------
-- 3. Curated read RPCs — no PII, no existing object altered
-- ----------------------------------------------------------------

-- Returns the safe display fields for all visible (approved) providers.
-- curated — no PII
create or replace function public.list_public_providers()
returns table (
  provider_id          uuid,
  full_name            text,
  average_rating       numeric,
  review_count         int,
  completed_jobs_count int,
  is_verified          boolean,
  years_experience     int,
  availability_status  text,
  profile_photo_url    text,
  created_at           timestamptz
)
language sql security definer set search_path = public as $$
  select
    p.id,
    p.full_name,
    p.average_rating,
    p.review_count,
    p.completed_jobs_count,
    p.is_verified,
    p.years_experience,
    p.availability_status,
    p.profile_photo_url,
    p.created_at
  from public.profiles p
  where p.role = 'provider'
    and p.approval_status = 'approved';
$$;

-- Returns the same curated fields, scoped to the calling customer's favorites.
-- curated — no PII
create or replace function public.get_my_favorite_providers()
returns table (
  provider_id          uuid,
  full_name            text,
  average_rating       numeric,
  review_count         int,
  completed_jobs_count int,
  is_verified          boolean,
  years_experience     int,
  availability_status  text,
  profile_photo_url    text,
  created_at           timestamptz
)
language sql security definer set search_path = public as $$
  select
    p.id,
    p.full_name,
    p.average_rating,
    p.review_count,
    p.completed_jobs_count,
    p.is_verified,
    p.years_experience,
    p.availability_status,
    p.profile_photo_url,
    p.created_at
  from public.favorite_providers f
  join public.profiles p on p.id = f.provider_id
  where f.customer_id = auth.uid()
  order by f.created_at desc;
$$;
