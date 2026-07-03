-- ============================================================
-- Slice 25 — Ratings v2 schema: category ratings + private feedback + breakdown RPC
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Extend public.reviews with category ratings, recommendation flag, and tags
-- ----------------------------------------------------------------
alter table public.reviews
  add column if not exists quality_rating         int     check (quality_rating between 1 and 5),
  add column if not exists punctuality_rating     int     check (punctuality_rating between 1 and 5),
  add column if not exists communication_rating   int     check (communication_rating between 1 and 5),
  add column if not exists professionalism_rating int     check (professionalism_rating between 1 and 5),
  add column if not exists value_rating           int     check (value_rating between 1 and 5),
  add column if not exists would_recommend        boolean,
  add column if not exists tags                   text[]  not null default '{}';

-- Tag vocabulary guard — idempotent (add only if absent), exact 9-tag allowlist
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reviews_tags_allowed') then
    alter table public.reviews add constraint reviews_tags_allowed
      check (tags <@ array['on_time','friendly','clean_work','good_communication','fair_price','late','messy','poor_communication','overpriced']::text[]);
  end if;
end $$;

-- ----------------------------------------------------------------
-- 2. Table: review_private_feedback (provider-invisible)
--    Customer author + admin only; no provider read access, no update/delete
-- ----------------------------------------------------------------
create table if not exists public.review_private_feedback (
  review_id   uuid primary key references public.reviews(id) on delete cascade,
  customer_id uuid not null references public.profiles(id),
  provider_id uuid not null references public.profiles(id),
  feedback    text not null,
  created_at  timestamptz not null default now()
);
alter table public.review_private_feedback enable row level security;

-- INSERT: authoring customer only, tied to their own review
create policy "rpf_insert" on public.review_private_feedback
  for insert with check (
    customer_id = auth.uid()
    and exists (select 1 from public.reviews r where r.id = review_id and r.customer_id = auth.uid())
  );

-- SELECT: authoring customer OR admin. NO provider policy → providers can never read it.
create policy "rpf_select" on public.review_private_feedback
  for select using (customer_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------------------
-- 3. RPC: get_provider_rating_breakdown
--    SECURITY DEFINER, DISPLAY-ONLY. Returns aggregated stats + top tags.
--    NULL averages / 0 count when provider has no non-hidden reviews.
-- ----------------------------------------------------------------
create or replace function public.get_provider_rating_breakdown(p_provider_id uuid)
returns table (
  overall_avg          numeric,
  review_count         int,
  recommend_pct        numeric,
  quality_avg          numeric,
  punctuality_avg      numeric,
  communication_avg    numeric,
  professionalism_avg  numeric,
  value_avg            numeric,
  top_tags             text[]
) language sql security definer set search_path = public as $$
  select
    avg(r.rating)::numeric,
    count(*)::int,
    (100.0 * avg((r.would_recommend)::int))::numeric,
    avg(r.quality_rating)::numeric,
    avg(r.punctuality_rating)::numeric,
    avg(r.communication_rating)::numeric,
    avg(r.professionalism_rating)::numeric,
    avg(r.value_rating)::numeric,
    coalesce((
      select array_agg(tag order by cnt desc)
      from (
        select unnest(tags) as tag, count(*) as cnt
        from public.reviews
        where provider_id = p_provider_id and is_hidden = false
        group by 1 order by cnt desc limit 6
      ) t
    ), '{}')
  from public.reviews r
  where r.provider_id = p_provider_id and r.is_hidden = false;
$$;
