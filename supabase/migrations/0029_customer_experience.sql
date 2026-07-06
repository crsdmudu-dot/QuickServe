-- ============================================================
-- Slice 34 — Customer experience.
-- Additive: reviews.updated_at + owner-only 24h edit_review RPC
-- (content-only, no scoring change) + favorite_services (owner-only).
-- No existing policy/trigger/data altered.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. reviews — additive column (nullable; set on edit only)
-- ----------------------------------------------------------------
alter table public.reviews add column if not exists updated_at timestamptz;

-- ----------------------------------------------------------------
-- 2. edit_review RPC — owner-only, 24h window, content-only
--    SECURITY DEFINER bypasses the admin-only reviews UPDATE policy,
--    guarded by the owner + window check inside the body.
--    NO scoring logic here. The existing trg_recompute_provider_rating
--    trigger fires automatically on the UPDATE below — UNTOUCHED.
-- ----------------------------------------------------------------
create or replace function public.edit_review(
  p_review_id          uuid,
  p_comment            text,
  p_rating             int,
  p_quality            int,
  p_punctuality        int,
  p_communication      int,
  p_professionalism    int,
  p_value              int,
  p_would_recommend    boolean,
  p_tags               text[]
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.reviews
    where id = p_review_id
      and customer_id = auth.uid()
      and created_at > now() - interval '24 hours'
  ) then
    raise exception 'edit window closed or not owner';
  end if;

  update public.reviews set
    comment              = p_comment,
    rating               = p_rating,
    quality_rating       = p_quality,
    punctuality_rating   = p_punctuality,
    communication_rating = p_communication,
    professionalism_rating = p_professionalism,
    value_rating         = p_value,
    would_recommend      = p_would_recommend,
    tags                 = coalesce(p_tags, '{}'),
    updated_at           = now()
  where id = p_review_id;
end; $$;

-- ----------------------------------------------------------------
-- 3. favorite_services — owner-only favorites (mirror favorite_providers)
--    service_id is a SERVICES code — no FK needed.
-- ----------------------------------------------------------------
create table if not exists public.favorite_services (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.profiles(id) on delete cascade,
  service_id   text not null,
  created_at   timestamptz not null default now(),
  unique (customer_id, service_id)
);

create index if not exists favorite_services_customer_idx
  on public.favorite_services (customer_id, created_at desc);

alter table public.favorite_services enable row level security;

-- ----------------------------------------------------------------
-- 4. RLS — OWNER-ONLY (select / insert / delete; NO update policy)
--    NO provider / admin / public policy.
-- ----------------------------------------------------------------
create policy "favorite_services_select" on public.favorite_services
  for select using (customer_id = auth.uid());

create policy "favorite_services_insert" on public.favorite_services
  for insert with check (customer_id = auth.uid());

create policy "favorite_services_delete" on public.favorite_services
  for delete using (customer_id = auth.uid());
