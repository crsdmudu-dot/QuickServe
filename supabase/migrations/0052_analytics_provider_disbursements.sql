-- 0052 — "Provider payouts" analytics: real disbursements + current outstanding liability
--
-- Problem (0025). analytics_financial_summary / analytics_financial_timeseries expose a column
-- named `provider_payouts` that is sum(provider_earnings.amount) bucketed by the EARNING's
-- created_at — i.e. gross provider entitlement accrued when the customer paid. It ignores
-- deductions and ignores whether any money was ever transferred to the provider. 0041 is
-- explicit that customer collection and provider payout are separate financial events that
-- must never be conflated, and `public.provider_payouts` is the table of real disbursements.
--
-- Decision (product): "Provider payouts" means money actually disbursed to providers;
-- "Outstanding to providers" means the current net liability from the canonical ledger.
--
-- Contract: ADDITIVE and backward compatible. The legacy `provider_payouts` column keeps its
-- exact 0025 formula (documented here as legacy gross entitlement) so existing consumers and
-- exports keep working. New columns are appended:
--
--   provider_payouts_disbursed      sum(provider_payouts.amount) whose paid_at (the date the
--                                   money moved, entered by the admin — not created_at, the
--                                   date the evidence was recorded) falls within [p_from, p_to],
--                                   BETWEEN-inclusive, timestamptz, identical to the revenue
--                                   window semantics. provider_payouts is append-only with no
--                                   reversal/cancellation state (0041), so every row is final.
--   provider_outstanding_liability  sum(outstanding_provider_liability) over the canonical
--                                   provider_payout_ledger view = entitlement − effective
--                                   deductions − disbursed, for EVERY earning. A current
--                                   balance-sheet snapshot: deliberately NOT filtered by the
--                                   analytics window. Not clamped: a negative row (impossible via
--                                   the RPCs, only corrupt data) stays visible in the total.
--
-- The timeseries gains a per-bucket `provider_payouts_disbursed` only. No historical liability
-- series is exposed: point-in-time liability cannot be reconstructed honestly from these rows.
--
-- RETURNS TABLE cannot be altered in place, so both functions are dropped and re-created with
-- the SAME argument signatures. 0025 granted nothing explicitly (default EXECUTE), and the
-- sole authorisation gate — is_admin(), fail-closed — is preserved verbatim. security definer
-- and the pinned search_path are unchanged. The view is read as the function owner, so all
-- providers are aggregated (admin-only path), exactly like every other analytics_* RPC.
--
-- Forward-only. 0051 and earlier are untouched. No table, view, trigger, grant or data change.

-- ----------------------------------------------------------------
-- 1. analytics_financial_summary — legacy columns first, new columns appended.
-- ----------------------------------------------------------------
drop function if exists public.analytics_financial_summary(timestamptz, timestamptz);

create or replace function public.analytics_financial_summary(
  p_from timestamptz,
  p_to   timestamptz
)
returns table(
  revenue                        numeric,
  provider_payouts               numeric,   -- LEGACY: gross provider entitlement by earning created_at (0025)
  quickserve_revenue             numeric,
  wallet_used                    numeric,
  promo_used                     numeric,
  provider_payouts_disbursed     numeric,   -- real disbursements by paid_at within the window
  provider_outstanding_liability numeric    -- current snapshot from provider_payout_ledger
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
       where pr.created_at between p_from and p_to)                               as promo_used,
    (select coalesce(sum(pp.amount), 0)
       from public.provider_payouts pp
       where pp.paid_at between p_from and p_to)                                  as provider_payouts_disbursed,
    (select coalesce(sum(l.outstanding_provider_liability), 0)
       from public.provider_payout_ledger l)                                      as provider_outstanding_liability;
end; $$;

-- ----------------------------------------------------------------
-- 2. analytics_financial_timeseries — legacy columns first, disbursement series appended.
-- ----------------------------------------------------------------
drop function if exists public.analytics_financial_timeseries(timestamptz, timestamptz, text);

create or replace function public.analytics_financial_timeseries(
  p_from   timestamptz,
  p_to     timestamptz,
  p_bucket text
)
returns table(
  period                     timestamptz,
  revenue                    numeric,
  provider_payouts           numeric,   -- LEGACY: gross provider entitlement by earning created_at (0025)
  quickserve_revenue         numeric,
  wallet_used                numeric,
  promo_used                 numeric,
  provider_payouts_disbursed numeric    -- real disbursements bucketed by paid_at
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
    disb as (
      select
        date_trunc(p_bucket, pp.paid_at)         as period,
        sum(pp.amount)                            as provider_payouts_disbursed
      from public.provider_payouts pp
      where pp.paid_at between p_from and p_to
      group by date_trunc(p_bucket, pp.paid_at)
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
      -- Column references are qualified on purpose: inside a plpgsql function whose RETURNS
      -- TABLE declares an OUT column named `period`, a bare `select period from rev` raises
      -- 42702 "column reference period is ambiguous" at execution time. 0025 shipped with the
      -- bare form, so this RPC failed on every call and the client silently returned [].
      select rev.period   from rev
      union
      select pay.period   from pay
      union
      select disb.period  from disb
      union
      select wal.period   from wal
      union
      select promo.period from promo
    )
    select
      ap.period,
      coalesce(r.revenue,                    0) as revenue,
      coalesce(p.provider_payouts,           0) as provider_payouts,
      coalesce(r.quickserve_revenue,         0) as quickserve_revenue,
      coalesce(w.wallet_used,                0) as wallet_used,
      coalesce(pr.promo_used,                0) as promo_used,
      coalesce(d.provider_payouts_disbursed, 0) as provider_payouts_disbursed
    from all_periods ap
    left join rev   r  on r.period  = ap.period
    left join pay   p  on p.period  = ap.period
    left join disb  d  on d.period  = ap.period
    left join wal   w  on w.period  = ap.period
    left join promo pr on pr.period = ap.period
    order by ap.period;
end; $$;
