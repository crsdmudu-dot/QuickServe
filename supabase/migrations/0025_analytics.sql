-- ============================================================
-- Slice 28 — Read-only admin analytics RPCs (no tables/triggers/writes)
-- ALL functions: language plpgsql security definer set search_path = public
-- ALL functions: open with is_admin() guard, then SELECT-only queries.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. analytics_kpis
--    Returns a single-row KPI summary for a date range:
--    total revenue (paid payments), gross/completed booking counts,
--    distinct active providers & customers, and avg booking value.
-- ----------------------------------------------------------------
create or replace function public.analytics_kpis(
  p_from timestamptz,
  p_to   timestamptz
)
returns table(
  revenue             numeric,
  gross_bookings      int,
  completed_bookings  int,
  active_providers    int,
  active_customers    int,
  avg_booking_value   numeric
)
language plpgsql security definer set search_path = public as $$
declare
  v_revenue            numeric;
  v_gross_bookings     int;
  v_completed_bookings int;
  v_active_providers   int;
  v_active_customers   int;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  select coalesce(sum(p.amount) filter (where p.status = 'paid' and p.paid_at between p_from and p_to), 0)
    into v_revenue
    from public.payments p;

  select
    count(*)                                             ::int,
    count(*) filter (where b.status = 'completed')      ::int,
    count(distinct b.assigned_provider_id) filter (where b.assigned_provider_id is not null)::int,
    count(distinct b.customer_id)                       ::int
  into v_gross_bookings, v_completed_bookings, v_active_providers, v_active_customers
  from public.bookings b
  where b.created_at between p_from and p_to;

  return query select
    v_revenue,
    v_gross_bookings,
    v_completed_bookings,
    v_active_providers,
    v_active_customers,
    v_revenue / nullif(v_completed_bookings, 0);
end; $$;


-- ----------------------------------------------------------------
-- 2. analytics_bookings_timeseries
--    Booking counts (total / completed / cancelled) bucketed by
--    'day', 'week', or 'month', ordered chronologically.
-- ----------------------------------------------------------------
create or replace function public.analytics_bookings_timeseries(
  p_from   timestamptz,
  p_to     timestamptz,
  p_bucket text
)
returns table(
  period    timestamptz,
  total     int,
  completed int,
  cancelled int
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  if p_bucket not in ('day', 'week', 'month') then
    raise exception 'Invalid bucket';
  end if;

  return query
    select
      date_trunc(p_bucket, b.created_at)                           as period,
      count(*)                                                      ::int as total,
      count(*) filter (where b.status = 'completed')               ::int as completed,
      count(*) filter (where b.status = 'cancelled')               ::int as cancelled
    from public.bookings b
    where b.created_at between p_from and p_to
    group by date_trunc(p_bucket, b.created_at)
    order by period;
end; $$;


-- ----------------------------------------------------------------
-- 3. analytics_bookings_summary
--    Completion/cancellation rates, avg minutes to completion,
--    and pending/completed counts for a date range (one row).
-- ----------------------------------------------------------------
create or replace function public.analytics_bookings_summary(
  p_from timestamptz,
  p_to   timestamptz
)
returns table(
  completion_rate       numeric,
  cancellation_rate     numeric,
  avg_completion_minutes numeric,
  pending               int,
  completed             int
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  return query
    select
      (count(*) filter (where b.status = 'completed'))::numeric
        / nullif(count(*), 0)                                        as completion_rate,
      (count(*) filter (where b.status = 'cancelled'))::numeric
        / nullif(count(*), 0)                                        as cancellation_rate,
      (
        select avg(extract(epoch from (ca.done_at - b2.created_at)) / 60.0)
        from public.bookings b2
        join (
          select ba.booking_id, min(ba.created_at) as done_at
          from public.booking_activity ba
          where ba.event_type = 'completed'
          group by ba.booking_id
        ) ca on ca.booking_id = b2.id
        where b2.created_at between p_from and p_to
      )                                                              as avg_completion_minutes,
      (count(*) filter (where b.status = 'pending'))                ::int as pending,
      (count(*) filter (where b.status = 'completed'))              ::int as completed
    from public.bookings b
    where b.created_at between p_from and p_to;
end; $$;


-- ----------------------------------------------------------------
-- 4. analytics_financial_timeseries
--    Revenue, provider payouts, QuickServe take, wallet usage, and
--    promo discounts bucketed by 'day'/'week'/'month'. Uses FULL
--    OUTER JOIN across four CTEs so every occupied period appears.
-- ----------------------------------------------------------------
create or replace function public.analytics_financial_timeseries(
  p_from   timestamptz,
  p_to     timestamptz,
  p_bucket text
)
returns table(
  period            timestamptz,
  revenue           numeric,
  provider_payouts  numeric,
  quickserve_revenue numeric,
  wallet_used       numeric,
  promo_used        numeric
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  if p_bucket not in ('day', 'week', 'month') then
    raise exception 'Invalid bucket';
  end if;

  return query
    with rev as (
      select
        date_trunc(p_bucket, p.paid_at)         as period,
        sum(p.amount)                            as revenue,
        sum(p.quickserve_share)                  as quickserve_revenue
      from public.payments p
      where p.status = 'paid'
        and p.paid_at between p_from and p_to
      group by date_trunc(p_bucket, p.paid_at)
    ),
    pay as (
      select
        date_trunc(p_bucket, pe.created_at)      as period,
        sum(pe.amount)                            as provider_payouts
      from public.provider_earnings pe
      where pe.created_at between p_from and p_to
      group by date_trunc(p_bucket, pe.created_at)
    ),
    wal as (
      select
        date_trunc(p_bucket, wt.created_at)      as period,
        sum(abs(wt.amount))                       as wallet_used
      from public.wallet_transactions wt
      where wt.type = 'payment_applied'
        and wt.created_at between p_from and p_to
      group by date_trunc(p_bucket, wt.created_at)
    ),
    promo as (
      select
        date_trunc(p_bucket, pr.created_at)      as period,
        sum(pr.discount_amount)                   as promo_used
      from public.promo_redemptions pr
      where pr.created_at between p_from and p_to
      group by date_trunc(p_bucket, pr.created_at)
    ),
    all_periods as (
      select period from rev
      union
      select period from pay
      union
      select period from wal
      union
      select period from promo
    )
    select
      ap.period,
      coalesce(r.revenue,           0) as revenue,
      coalesce(p.provider_payouts,  0) as provider_payouts,
      coalesce(r.quickserve_revenue,0) as quickserve_revenue,
      coalesce(w.wallet_used,       0) as wallet_used,
      coalesce(pr.promo_used,       0) as promo_used
    from all_periods ap
    left join rev   r  on r.period  = ap.period
    left join pay   p  on p.period  = ap.period
    left join wal   w  on w.period  = ap.period
    left join promo pr on pr.period = ap.period
    order by ap.period;
end; $$;


-- ----------------------------------------------------------------
-- 5. analytics_financial_summary
--    Same five financial totals as the timeseries but for the whole
--    range (no bucketing); one row.
-- ----------------------------------------------------------------
create or replace function public.analytics_financial_summary(
  p_from timestamptz,
  p_to   timestamptz
)
returns table(
  revenue            numeric,
  provider_payouts   numeric,
  quickserve_revenue numeric,
  wallet_used        numeric,
  promo_used         numeric
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  return query select
    (select coalesce(sum(p.amount), 0)
       from public.payments p
       where p.status = 'paid' and p.paid_at between p_from and p_to)            as revenue,
    (select coalesce(sum(pe.amount), 0)
       from public.provider_earnings pe
       where pe.created_at between p_from and p_to)                               as provider_payouts,
    (select coalesce(sum(p2.quickserve_share), 0)
       from public.payments p2
       where p2.status = 'paid' and p2.paid_at between p_from and p_to)          as quickserve_revenue,
    (select coalesce(sum(abs(wt.amount)), 0)
       from public.wallet_transactions wt
       where wt.type = 'payment_applied' and wt.created_at between p_from and p_to) as wallet_used,
    (select coalesce(sum(pr.discount_amount), 0)
       from public.promo_redemptions pr
       where pr.created_at between p_from and p_to)                               as promo_used;
end; $$;


-- ----------------------------------------------------------------
-- 6. analytics_providers
--    Per-provider leaderboard: completed jobs, avg rating, total
--    earnings, and completion rate, ordered by earnings desc.
-- ----------------------------------------------------------------
create or replace function public.analytics_providers(
  p_from  timestamptz,
  p_to    timestamptz,
  p_limit int default 20
)
returns table(
  provider_id     uuid,
  full_name       text,
  completed_jobs  int,
  avg_rating      numeric,
  total_earnings  numeric,
  completion_rate numeric
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  return query
    select
      b.assigned_provider_id                                              as provider_id,
      pr.full_name,
      count(*) filter (where b.status = 'completed')                     ::int as completed_jobs,
      pr.average_rating                                                   as avg_rating,
      coalesce(
        (select sum(pe.amount)
           from public.provider_earnings pe
           where pe.provider_id = b.assigned_provider_id
             and pe.created_at between p_from and p_to), 0)              as total_earnings,
      (count(*) filter (where b.status = 'completed'))::numeric
        / nullif(count(*), 0)                                             as completion_rate
    from public.bookings b
    join public.profiles pr on pr.id = b.assigned_provider_id
    where b.assigned_provider_id is not null
      and b.created_at between p_from and p_to
    group by b.assigned_provider_id, pr.full_name, pr.average_rating
    order by total_earnings desc nulls last
    limit p_limit;
end; $$;


-- ----------------------------------------------------------------
-- 7. analytics_services
--    Per-service aggregates: booking volume, revenue, avg job value,
--    cancellation rate, ordered by bookings desc.
-- ----------------------------------------------------------------
create or replace function public.analytics_services(
  p_from timestamptz,
  p_to   timestamptz
)
returns table(
  service_id        text,
  bookings          int,
  revenue           numeric,
  avg_job_value     numeric,
  cancellation_rate numeric
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  return query
    select
      b.service_id,
      count(*)                                                        ::int as bookings,
      coalesce(sum(p.amount) filter (where p.status = 'paid'), 0)    as revenue,
      coalesce(sum(p.amount) filter (where p.status = 'paid'), 0)
        / nullif(count(*), 0)                                         as avg_job_value,
      (count(*) filter (where b.status = 'cancelled'))::numeric
        / nullif(count(*), 0)                                         as cancellation_rate
    from public.bookings b
    left join public.payments p on p.booking_id = b.id
    where b.created_at between p_from and p_to
    group by b.service_id
    order by bookings desc;
end; $$;


-- ----------------------------------------------------------------
-- 8. analytics_geography
--    Bookings, revenue, and active providers grouped by address area
--    (coalesced from address_label; blanks map to 'Unknown').
-- ----------------------------------------------------------------
create or replace function public.analytics_geography(
  p_from timestamptz,
  p_to   timestamptz
)
returns table(
  area             text,
  bookings         int,
  revenue          numeric,
  active_providers int
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  return query
    select
      coalesce(nullif(btrim(b.address_label), ''), 'Unknown')         as area,
      count(*)                                                         ::int as bookings,
      coalesce(sum(p.amount) filter (where p.status = 'paid'), 0)     as revenue,
      count(distinct b.assigned_provider_id)
        filter (where b.assigned_provider_id is not null)             ::int as active_providers
    from public.bookings b
    left join public.payments p on p.booking_id = b.id
    where b.created_at between p_from and p_to
    group by coalesce(nullif(btrim(b.address_label), ''), 'Unknown')
    order by bookings desc;
end; $$;


-- ----------------------------------------------------------------
-- 9. analytics_customers
--    New vs returning customer counts, repeat-booking rate, and
--    retention rate for a date range (one row).
--
--    Definitions:
--      in_range          = distinct customers with a booking created in [p_from, p_to]
--      new_customers     = those whose first-ever booking is within range
--      returning_customers = those in_range who also have a booking before p_from
--      repeat_booking_rate = customers in_range with >=2 lifetime bookings / count(in_range)
--      retention_rate    = returning_customers / count(in_range)
-- ----------------------------------------------------------------
create or replace function public.analytics_customers(
  p_from timestamptz,
  p_to   timestamptz
)
returns table(
  new_customers        int,
  returning_customers  int,
  repeat_booking_rate  numeric,
  retention_rate       numeric
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  return query
    with in_range as (
      select distinct b.customer_id
      from public.bookings b
      where b.created_at between p_from and p_to
    ),
    customer_stats as (
      select
        ir.customer_id,
        min(all_b.created_at)   as first_booking,
        count(all_b.id)         as lifetime_bookings,
        bool_or(all_b.created_at < p_from) as has_prior
      from in_range ir
      join public.bookings all_b on all_b.customer_id = ir.customer_id
      group by ir.customer_id
    )
    select
      count(*) filter (where cs.first_booking between p_from and p_to)       ::int as new_customers,
      count(*) filter (where cs.has_prior)                                    ::int as returning_customers,
      (count(*) filter (where cs.lifetime_bookings >= 2))::numeric
        / nullif(count(*), 0)                                                  as repeat_booking_rate,
      (count(*) filter (where cs.has_prior))::numeric
        / nullif(count(*), 0)                                                  as retention_rate
    from customer_stats cs;
end; $$;
