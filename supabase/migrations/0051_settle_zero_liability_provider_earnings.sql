-- 0051 — zero-liability provider earnings are settled, not pending
--
-- Root cause (0042). Both `_provider_earning_state()` and the `provider_payout_ledger` view
-- derive the payout status from `amount_disbursed` alone:
--
--     if v_disbursed = 0 then 'pending' ...
--
-- so an earning with NOTHING outstanding — a zero-share earning (provider_share 0 → amount 0,
-- observed on the first certified Production M-PESA settlement) or an earning whose deductions
-- consumed the whole entitlement — derives 'pending' forever. No payout can ever be recorded
-- against it (record_provider_payout refuses non-positive amounts and anything above the
-- outstanding liability), so the row is permanently presented as "KES 0 pending".
--
-- Invariant restored here: an earning with zero outstanding liability is never presented as
-- money awaiting payout. Status is derived LIABILITY-FIRST, in both SQL copies:
--
--     outstanding = 0    → 'paid'            (settled; nothing owed — includes amount 0)
--     disbursed = 0      → 'pending'
--     otherwise          → 'partially_paid'
--
-- Exactly zero, not "<= 0": a negative liability cannot be produced by the RPCs (see §1) and
-- would mean corrupt data, so it is never derived 'paid' and stays detectable.
--
-- Positive earnings are unaffected: 'pending' until the first payout, 'partially_paid' while
-- liability remains, 'paid' once disbursed >= net — the same values 0042 produced for them.
--
-- Deliberately NOT changed: the payout_status domain (0041), earning creation
-- (create_earning_on_paid, 0010), settlement (apply_mpesa_callback, 0050), every payout /
-- deduction RPC and its guards, and the view's column set. Zero-value rows are RETAINED as
-- audit history; only their stored label is corrected by the backfill below.
--
-- Forward-only. 0042 and earlier are untouched.

-- ----------------------------------------------------------------
-- 1. Canonical state function — same body as 0042, derivation reordered.
--    security definer + pinned search_path + no EXECUTE for any role, exactly as 0042.
-- ----------------------------------------------------------------
create or replace function public._provider_earning_state(p_earning_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_entitlement numeric;
  v_deductions  numeric;
  v_disbursed   numeric;
  v_net         numeric;
  v_outstanding numeric;
  v_derived     text;
begin
  select e.amount into v_entitlement
    from public.provider_earnings e where e.id = p_earning_id;
  if not found then
    raise exception 'Provider earning not found';
  end if;

  -- Deductions net of their reversals (unchanged from 0042).
  select coalesce(sum(d.amount) filter (where d.reversal_of is null), 0)
       - coalesce(sum(d.amount) filter (where d.reversal_of is not null), 0)
    into v_deductions
    from public.provider_earning_deductions d
   where d.earning_id = p_earning_id;

  select coalesce(sum(p.amount), 0) into v_disbursed
    from public.provider_payouts p
   where p.earning_id = p_earning_id;

  v_net         := v_entitlement - v_deductions;
  v_outstanding := v_net - v_disbursed;

  -- Liability first: exactly nothing outstanding means settled, whatever was (or was not)
  -- disbursed. Exactly zero, never "<= 0": record_provider_deduction keeps deductions within
  -- the entitlement and net >= disbursed, record_provider_payout keeps payouts within the
  -- outstanding amount, reversals only add liability, and every RPC locks the earning row —
  -- so a negative liability is impossible through the RPCs and can only be corrupt data. It
  -- must remain detectable (never derived 'paid').
  if v_outstanding = 0 then
    v_derived := 'paid';
  elsif v_disbursed = 0 then
    v_derived := 'pending';
  else
    v_derived := 'partially_paid';
  end if;

  return jsonb_build_object(
    'earning_id',                     p_earning_id,
    'provider_entitlement',           v_entitlement,
    'deductions_total',               v_deductions,
    'net_provider_payable',           v_net,
    'amount_disbursed',               v_disbursed,
    'outstanding_provider_liability', v_outstanding,
    'derived_payout_status',          v_derived
  );
end; $$;

revoke execute on function public._provider_earning_state(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------
-- 2. Read model — same columns as 0042, same security_invoker, CASE reordered to match §1.
-- ----------------------------------------------------------------
create or replace view public.provider_payout_ledger
with (security_invoker = true) as
select
  e.id           as earning_id,
  e.booking_id   as booking_id,
  e.provider_id  as provider_id,
  e.amount       as provider_entitlement,
  coalesce(d.deductions_total, 0)                              as deductions_total,
  e.amount - coalesce(d.deductions_total, 0)                   as net_provider_payable,
  coalesce(p.amount_disbursed, 0)                              as amount_disbursed,
  e.amount - coalesce(d.deductions_total, 0)
           - coalesce(p.amount_disbursed, 0)                   as outstanding_provider_liability,
  e.payout_status                                              as stored_payout_status,
  case
    when e.amount - coalesce(d.deductions_total, 0)
                  - coalesce(p.amount_disbursed, 0) = 0 then 'paid'
    when coalesce(p.amount_disbursed, 0) = 0 then 'pending'
    else 'partially_paid'
  end                                                          as derived_payout_status
from public.provider_earnings e
left join (
  select dd.earning_id,
         coalesce(sum(dd.amount) filter (where dd.reversal_of is null), 0)
       - coalesce(sum(dd.amount) filter (where dd.reversal_of is not null), 0) as deductions_total
    from public.provider_earning_deductions dd
   group by dd.earning_id
) d on d.earning_id = e.id
left join (
  select pp.earning_id, sum(pp.amount) as amount_disbursed
    from public.provider_payouts pp
   group by pp.earning_id
) p on p.earning_id = e.id;

-- 0048 ACL re-asserted: the view is reachable by authenticated only; RLS applies via invoker.
revoke all on public.provider_payout_ledger from public, anon, authenticated;
grant select on public.provider_payout_ledger to authenticated;

-- ----------------------------------------------------------------
-- 3. Backfill — correct only rows already stuck by the 0042 derivation:
--    nothing outstanding, nothing disbursed, label still 'pending'. Rows with a real liability
--    and rows already 'paid'/'partially_paid' are untouched. No row is deleted.
-- ----------------------------------------------------------------
update public.provider_earnings e
   set payout_status = 'paid'
  from public.provider_payout_ledger l
 where l.earning_id = e.id
   and e.payout_status = 'pending'
   and l.outstanding_provider_liability = 0
   and l.amount_disbursed = 0;
