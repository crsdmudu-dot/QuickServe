-- ============================================================
-- Slice 38 — Executive Analytics Dashboard (read-only RPCs + indexes)
-- ALL functions: language plpgsql security definer set search_path = public
-- ALL functions: open with is_admin() guard, then SELECT-only queries.
-- Additive only: no table/column/trigger/RLS/policy change; indexes if not exists.
-- ============================================================

-- ---------------- 1. composite executive overview ----------------
create or replace function public.analytics_executive_overview(
  p_from timestamptz,
  p_to   timestamptz
)
returns table(
  current_wallet_balance   numeric,
  current_active_customers int,
  current_active_providers int,
  current_platform_rating  numeric,
  active_disputes          int,
  open_support_tickets     int,
  pending_jobs             int,
  in_progress_jobs         int,
  total_bookings           int,
  active_bookings          int,
  completed_bookings       int,
  cancelled_bookings       int,
  total_revenue            numeric,
  platform_commission      numeric,
  avg_booking_value        numeric,
  repeat_customer_rate     numeric,
  new_customers            int,
  new_providers            int,
  avg_response_minutes     numeric,
  avg_completion_minutes   numeric,
  failed_payments          int,
  period_avg_rating        numeric
)
language plpgsql security definer set search_path = public as $$
declare
  v_completed_in_range int;
  v_distinct_customers int;
  v_repeat_customers   int;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  -- ---- Health snapshots (filter-independent) ----
  select coalesce(sum(w.balance), 0) into current_wallet_balance from public.wallets w;

  select count(distinct b.customer_id) into current_active_customers
    from public.bookings b
    where b.status <> 'cancelled' and b.created_at >= now() - interval '30 days';

  select count(distinct b.assigned_provider_id) into current_active_providers
    from public.bookings b
    where b.assigned_provider_id is not null
      and b.status <> 'cancelled' and b.created_at >= now() - interval '30 days';

  select coalesce(avg(r.rating), 0) into current_platform_rating from public.reviews r;

  select count(*) into active_disputes from public.support_cases s
    where s.case_type = 'dispute' and s.status not in ('resolved','closed');
  select count(*) into open_support_tickets from public.support_cases s
    where s.case_type = 'support' and s.status not in ('resolved','closed');

  select count(*) into pending_jobs     from public.bookings b where b.status = 'pending';
  select count(*) into in_progress_jobs from public.bookings b where b.status = 'in_progress';

  -- ---- Activity (range-scoped) ----
  select
    count(*)::int,
    count(*) filter (where b.status not in ('completed','cancelled'))::int,
    count(*) filter (where b.status = 'completed')::int,
    count(*) filter (where b.status = 'cancelled')::int
  into total_bookings, active_bookings, completed_bookings, cancelled_bookings
  from public.bookings b
  where b.created_at between p_from and p_to;

  select coalesce(sum(p.amount) filter (where p.status = 'paid' and p.paid_at between p_from and p_to), 0),
         coalesce(sum(p.quickserve_share) filter (where p.status = 'paid' and p.paid_at between p_from and p_to), 0)
    into total_revenue, platform_commission
    from public.payments p;

  avg_booking_value := total_revenue / nullif(completed_bookings, 0);

  -- repeat customer rate over range: customers with >1 booking in range / distinct customers in range
  select count(distinct b.customer_id) into v_distinct_customers
    from public.bookings b where b.created_at between p_from and p_to;
  select count(*) into v_repeat_customers from (
    select b.customer_id from public.bookings b
      where b.created_at between p_from and p_to
      group by b.customer_id having count(*) > 1
  ) rc;
  repeat_customer_rate := coalesce(v_repeat_customers::numeric / nullif(v_distinct_customers, 0), 0);

  select count(*) filter (where pr.role = 'customer')::int,
         count(*) filter (where pr.role = 'provider')::int
    into new_customers, new_providers
    from public.profiles pr where pr.created_at between p_from and p_to;

  -- avg response minutes: booking created -> first accepted/provider_assigned activity
  select avg(extract(epoch from (fr.first_at - b.created_at)) / 60.0)
    into avg_response_minutes
    from public.bookings b
    join lateral (
      select min(ba.created_at) as first_at from public.booking_activity ba
       where ba.booking_id = b.id and ba.event_type in ('accepted','provider_assigned')
    ) fr on true
    where b.created_at between p_from and p_to and fr.first_at is not null;

  -- avg completion minutes: created -> completion activity, for completed bookings in range
  select avg(extract(epoch from (fc.done_at - b.created_at)) / 60.0)
    into avg_completion_minutes
    from public.bookings b
    join lateral (
      select min(ba.created_at) as done_at from public.booking_activity ba
       where ba.booking_id = b.id and ba.event_type = 'completed'
    ) fc on true
    where b.status = 'completed' and b.created_at between p_from and p_to and fc.done_at is not null;

  select count(*)::int into failed_payments from public.payment_attempts pa
    where pa.status = 'failed' and pa.created_at between p_from and p_to;

  select coalesce(avg(r.rating), 0) into period_avg_rating from public.reviews r
    where r.created_at between p_from and p_to;

  return next;
end; $$;

-- ---------------- 2. service category distribution + featured perf ----------------
create or replace function public.analytics_service_categories(
  p_from timestamptz,
  p_to   timestamptz
)
returns table(category text, bookings int, revenue numeric, featured_bookings int)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  return query
    select coalesce(sc.name, 'Uncategorized') as category,
           count(b.id)::int as bookings,
           coalesce(sum(p.amount) filter (where p.status = 'paid'), 0) as revenue,
           count(b.id) filter (where s.featured)::int as featured_bookings
      from public.bookings b
      left join public.services s on s.slug = b.service_id
      left join public.service_categories sc on sc.id = s.category_id
      left join public.payments p on p.booking_id = b.id
     where b.created_at between p_from and p_to
     group by coalesce(sc.name, 'Uncategorized')
     order by bookings desc;
end; $$;

-- ---------------- 3. customer/provider growth timeseries ----------------
create or replace function public.analytics_growth_timeseries(
  p_from   timestamptz,
  p_to     timestamptz,
  p_bucket text
)
returns table(period text, new_customers int, new_providers int)
language plpgsql security definer set search_path = public as $$
declare v_trunc text;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  v_trunc := case lower(p_bucket) when 'week' then 'week' when 'month' then 'month' else 'day' end;
  return query
    select to_char(date_trunc(v_trunc, pr.created_at), 'YYYY-MM-DD') as period,
           count(*) filter (where pr.role = 'customer')::int as new_customers,
           count(*) filter (where pr.role = 'provider')::int as new_providers
      from public.profiles pr
     where pr.created_at between p_from and p_to
     group by date_trunc(v_trunc, pr.created_at)
     order by date_trunc(v_trunc, pr.created_at);
end; $$;

-- ---------------- 4. notification delivery summary ----------------
create or replace function public.analytics_notification_delivery(
  p_from timestamptz,
  p_to   timestamptz
)
returns table(push_status text, total int)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  return query
    select n.push_status, count(*)::int as total
      from public.notifications n
     where n.created_at between p_from and p_to
     group by n.push_status
     order by total desc;
end; $$;

-- ---------------- 5. additive supporting indexes (if not exists) ----------------
create index if not exists bookings_created_at_idx    on public.bookings (created_at);
create index if not exists bookings_status_idx         on public.bookings (status);
create index if not exists payments_paid_at_idx        on public.payments (paid_at);
create index if not exists profiles_created_role_idx   on public.profiles (created_at, role);
create index if not exists reviews_created_at_idx      on public.reviews (created_at);
create index if not exists support_cases_type_status_idx on public.support_cases (case_type, status);
create index if not exists notifications_created_status_idx on public.notifications (created_at, push_status);
create index if not exists payment_attempts_status_created_idx on public.payment_attempts (status, created_at);
