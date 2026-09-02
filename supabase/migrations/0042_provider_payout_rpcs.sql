-- Provider payout write path — admin-only RPCs, reconciliation view, legacy path removed.
--
-- 0041 created the ledger tables with no write policies at all, so nothing could write them.
-- This migration supplies the only write path: three admin-only SECURITY DEFINER RPCs. The
-- tables stay unwritable through PostgREST, and no INSERT/UPDATE/DELETE policy is added here.
--
-- MONEY FLOW: customer -> KwikServe/platform -> provider, two separate financial events.
-- provider_earnings.amount is the entitlement and is ALREADY post-split (payments enforces
-- provider_share + quickserve_share = amount), so commission is never subtracted again here.
-- Customer wallet credit and customer promo discount are customer-side instruments and are
-- absent from every calculation below — they can never reduce what a provider is owed.
--
-- APPEND-ONLY. Nothing in this file updates or deletes a deduction or a payout row. A wrong
-- deduction is corrected by a full reversal plus a fresh deduction; more money owed is a further
-- payout row. The only UPDATE performed anywhere is provider_earnings.payout_status, which is a
-- cached projection of the ledger, never an independent source of truth.
--
-- ARITHMETIC IS EXPRESSED TWICE, DELIBERATELY. The mutating RPCs below do every pre-check and
-- post-insert projection through _provider_earning_state(). The provider_payout_ledger view does
-- NOT call that helper: it recomputes the equivalent aggregates inline over the base tables.
-- The duplication is required by the security model, not an oversight. _provider_earning_state
-- is SECURITY DEFINER and takes an arbitrary earning_id, so it reads the ledger with RLS
-- bypassed; EXECUTE is therefore revoked from public, anon AND authenticated. The view must stay
-- security_invoker so each caller sees only their own rows, which means it cannot invoke a
-- function that no caller is allowed to execute. Granting EXECUTE to authenticated instead would
-- let any signed-in user read any provider's entitlement, deductions and outstanding balance.
-- The two formulations are kept identical by review; any change to one must be mirrored in the
-- other.
--
-- CONCURRENCY. Every mutating RPC takes SELECT ... FOR UPDATE on the authoritative
-- provider_earnings row BEFORE reading aggregates and BEFORE writing. Read-check-write is
-- therefore atomic per earning. Lock order across the whole system stays acyclic: the customer
-- path locks payments -> wallets (0040) and inserts provider_earnings inside the payment
-- transaction; these RPCs lock provider_earnings ONLY and never touch payments or wallets, so no
-- path acquires a payment after an earning and no cycle can form.
--
-- RETURNS jsonb, deliberately. A RETURNS TABLE signature cannot be extended without DROP+CREATE,
-- which breaks live callers — exactly the trap the existing analytics_financial_* functions are
-- caught in. jsonb lets a later migration add fields without changing the signature.
--
-- KNOWN SEPARATE FINDING, not solved here: bookings.status = 'completed' is enforced below at
-- payout time, but it is not irreversible. bookings_update_admin (0003) is
-- USING (is_admin()) WITH CHECK (is_admin()) with no transition guard, so an admin can move a
-- booking from 'completed' to 'cancelled' after a payout was recorded. The payout row is
-- append-only and survives that, and the reconciliation view can surface the mismatch, but a
-- booking state machine is out of scope for this migration.
--
-- NOT DONE HERE: no hold/review window column (no duration has been defined); no Daraja, M-Pesa,
-- B2C, HTTP or Edge Function call of any kind — record_provider_payout records a transfer the
-- admin states has ALREADY happened externally; and no change to payments, wallets, promo_codes,
-- their RPCs, or 0040.

-- ----------------------------------------------------------------
-- 1. _provider_earning_state — the single canonical calculation.
--    Pure read, no locking of its own: callers that mutate must already hold
--    provider_earnings FOR UPDATE. Underscore prefix follows _wallet_post/_ensure_wallet.
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

  -- Deductions net of their reversals. A reversal carries the SAME positive amount as the
  -- deduction it reverses, and UNIQUE(reversal_of) caps it at one reversal per original, so
  -- this subtraction is exactly "sum of unreversed deductions" — no mutable flag needed.
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

  if v_disbursed = 0 then
    v_derived := 'pending';
  elsif v_disbursed < v_net then
    v_derived := 'partially_paid';
  else
    v_derived := 'paid';
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

-- ----------------------------------------------------------------
-- 2. record_provider_deduction — admin records a provider-borne deduction
-- ----------------------------------------------------------------
create or replace function public.record_provider_deduction(
  p_earning_id uuid,
  p_amount     numeric,
  p_category   text,
  p_reason     text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_locked_id   uuid;
  v_state       jsonb;
  v_entitlement numeric;
  v_disbursed   numeric;
  v_new_ded     numeric;
  v_new_net     numeric;
  v_id          uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;
  if p_category is null or p_category not in
     ('service_issue','damage_or_loss','cancellation_or_no_show','other_authorized') then
    raise exception 'Invalid deduction category';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Reason required';
  end if;

  -- Authoritative lock, taken before any aggregate is read.
  select e.id into v_locked_id
    from public.provider_earnings e where e.id = p_earning_id for update;
  if not found then
    raise exception 'Provider earning not found';
  end if;

  v_state       := public._provider_earning_state(p_earning_id);
  v_entitlement := (v_state->>'provider_entitlement')::numeric;
  v_disbursed   := (v_state->>'amount_disbursed')::numeric;
  v_new_ded     := (v_state->>'deductions_total')::numeric + p_amount;
  v_new_net     := v_entitlement - v_new_ded;

  if v_new_ded > v_entitlement then
    raise exception 'Deductions exceed provider entitlement';
  end if;
  -- Recovering an over-payment is not a deduction; refuse to strand disbursed money.
  if v_new_net < v_disbursed then
    raise exception 'Deduction would fall below amount already paid out';
  end if;

  insert into public.provider_earning_deductions
    (earning_id, amount, category, reason, reversal_of, created_by)
  values
    (p_earning_id, p_amount, p_category, btrim(p_reason), null, auth.uid())
  returning id into v_id;

  v_state := public._provider_earning_state(p_earning_id);
  update public.provider_earnings
     set payout_status = v_state->>'derived_payout_status'
   where id = p_earning_id;

  return v_state || jsonb_build_object('deduction_id', v_id);
end; $$;

-- ----------------------------------------------------------------
-- 3. reverse_provider_deduction — full reversal only, append-only
--    The caller supplies only the target and a reason; amount and category are copied from the
--    original inside the lock so a partial or re-categorised reversal is impossible.
-- ----------------------------------------------------------------
create or replace function public.reverse_provider_deduction(
  p_deduction_id uuid,
  p_reason       text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_earning_id uuid;
  v_locked_id  uuid;
  v_orig       public.provider_earning_deductions%rowtype;
  v_state      jsonb;
  v_id         uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Reason required';
  end if;

  -- Resolve the earning first so the lock can be taken on the authoritative row, then re-read
  -- the original INSIDE that lock so the validation below cannot race.
  select d.earning_id into v_earning_id
    from public.provider_earning_deductions d where d.id = p_deduction_id;
  if not found then
    raise exception 'Deduction not found';
  end if;

  select e.id into v_locked_id
    from public.provider_earnings e where e.id = v_earning_id for update;
  if not found then
    raise exception 'Provider earning not found';
  end if;

  select * into v_orig
    from public.provider_earning_deductions d where d.id = p_deduction_id;

  if v_orig.reversal_of is not null then
    raise exception 'Cannot reverse a reversal';
  end if;
  if v_orig.earning_id <> v_earning_id then
    raise exception 'Deduction does not belong to the locked earning';
  end if;
  if exists (select 1 from public.provider_earning_deductions r
              where r.reversal_of = p_deduction_id) then
    raise exception 'Deduction already reversed';
  end if;

  -- UNIQUE(reversal_of) from 0041 remains the database backstop behind this check.
  insert into public.provider_earning_deductions
    (earning_id, amount, category, reason, reversal_of, created_by)
  values
    (v_orig.earning_id, v_orig.amount, v_orig.category, btrim(p_reason), v_orig.id, auth.uid())
  returning id into v_id;

  -- A reversal only ever raises net payable, so no invariant can break. It can, correctly, move
  -- a fully 'paid' earning back to 'partially_paid': the platform now owes more than it has paid.
  v_state := public._provider_earning_state(v_earning_id);
  update public.provider_earnings
     set payout_status = v_state->>'derived_payout_status'
   where id = v_earning_id;

  return v_state || jsonb_build_object('reversal_id', v_id, 'reversed_deduction_id', p_deduction_id);
end; $$;

-- ----------------------------------------------------------------
-- 4. record_provider_payout — records an external disbursement that already happened
-- ----------------------------------------------------------------
create or replace function public.record_provider_payout(
  p_earning_id      uuid,
  p_amount          numeric,
  p_method          text,
  p_reference       text,
  p_note            text,
  p_idempotency_key uuid,
  p_paid_at         timestamptz
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_provider_id uuid;
  v_booking_id  uuid;
  v_status      text;
  v_existing    public.provider_payouts%rowtype;
  v_state       jsonb;
  v_id          uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;
  if p_method is null or p_method not in ('mpesa_manual','bank_transfer','cash','other') then
    raise exception 'Invalid payout method';
  end if;
  if p_idempotency_key is null then
    raise exception 'Idempotency key required';
  end if;
  if p_paid_at is null then
    raise exception 'paid_at required';
  end if;
  -- Mirrors provider_payouts_evidence_check (0041) so the caller gets a clear message rather
  -- than a raw constraint violation. Every disbursement carries written external evidence.
  if p_method in ('mpesa_manual','bank_transfer')
     and (p_reference is null or btrim(p_reference) = '') then
    raise exception 'Reference required for this payout method';
  end if;
  if p_method in ('cash','other')
     and (p_note is null or btrim(p_note) = '') then
    raise exception 'Note required for this payout method';
  end if;

  -- Authoritative lock before any aggregate read or write.
  select e.provider_id, e.booking_id into v_provider_id, v_booking_id
    from public.provider_earnings e where e.id = p_earning_id for update;
  if not found then
    raise exception 'Provider earning not found';
  end if;

  -- Idempotent retry: the same key returns the SAME payout instead of creating a second record.
  -- The key is only a safe shortcut if it identifies the same financial event, so the materially
  -- identifying fields are compared before the existing row is returned. Reusing one key for
  -- different money is a caller bug and must fail loudly, not silently succeed.
  select * into v_existing
    from public.provider_payouts p where p.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.earning_id <> p_earning_id
       or v_existing.amount   <> p_amount
       or v_existing.method   <> p_method
       or v_existing.paid_at  <> p_paid_at then
      raise exception 'Idempotency key conflict: key already used for a different payout';
    end if;
    return public._provider_earning_state(v_existing.earning_id)
           || jsonb_build_object('payout_id', v_existing.id, 'idempotent_replay', true);
  end if;

  -- Eligibility: direct provider_earnings.booking_id -> bookings.id relation. Server-side, not
  -- a UI-only guard. See the header note: 'completed' is enforced here but is not irreversible.
  select b.status into v_status
    from public.bookings b where b.id = v_booking_id;
  if not found then
    raise exception 'Booking not found';
  end if;
  if v_status <> 'completed' then
    raise exception 'Booking is not completed';
  end if;

  v_state := public._provider_earning_state(p_earning_id);
  if p_amount > (v_state->>'outstanding_provider_liability')::numeric then
    raise exception 'Payout exceeds outstanding provider liability';
  end if;

  -- provider_id and recorded_by are derived, never caller-supplied.
  insert into public.provider_payouts
    (earning_id, provider_id, amount, method, reference, note,
     idempotency_key, paid_at, recorded_by)
  values
    (p_earning_id, v_provider_id, p_amount, p_method,
     nullif(btrim(coalesce(p_reference, '')), ''),
     nullif(btrim(coalesce(p_note, '')), ''),
     p_idempotency_key, p_paid_at, auth.uid())
  returning id into v_id;

  v_state := public._provider_earning_state(p_earning_id);
  update public.provider_earnings
     set payout_status = v_state->>'derived_payout_status'
   where id = p_earning_id;

  return v_state || jsonb_build_object('payout_id', v_id, 'idempotent_replay', false);
end; $$;

-- ----------------------------------------------------------------
-- 5. Retire the legacy payout path.
--    mark_payout_paid(p_earning_id uuid) set payout_status='paid' with no amount, method,
--    reference, actor or payout row. Under the ledger model that is a status with no evidence
--    behind it, so the function is removed rather than revoked: it is SECURITY DEFINER, so
--    revoking EXECUTE would still leave it reachable from other definer/service-role contexts.
--    After this, no callable path can set payout_status='paid' without a provider_payouts row.
--    Signature verified against the live catalog before dropping.
-- ----------------------------------------------------------------
drop function if exists public.mark_payout_paid(uuid);

-- ----------------------------------------------------------------
-- 6. Reconciliation read model.
--    security_invoker = true is REQUIRED, not optional. A normal view executes with the view
--    OWNER's privileges, which would bypass RLS on provider_earnings / deductions / payouts and
--    expose every provider's financial position to any authenticated caller. With
--    security_invoker the underlying policies apply to the querying user: provider sees own,
--    admin sees all, customer sees nothing. PostgreSQL 17.6 supports it (available since 15).
--    Exposes provider-side figures only — no customer, payment, wallet or promo data.
-- ----------------------------------------------------------------
create or replace view public.provider_payout_ledger
with (security_invoker = true) as
select
  e.id           as earning_id,
  e.booking_id,
  e.provider_id,
  e.amount       as provider_entitlement,
  coalesce(d.deductions_total, 0)                              as deductions_total,
  e.amount - coalesce(d.deductions_total, 0)                   as net_provider_payable,
  coalesce(p.amount_disbursed, 0)                              as amount_disbursed,
  e.amount - coalesce(d.deductions_total, 0)
           - coalesce(p.amount_disbursed, 0)                   as outstanding_provider_liability,
  e.payout_status                                              as stored_payout_status,
  case
    when coalesce(p.amount_disbursed, 0) = 0 then 'pending'
    when coalesce(p.amount_disbursed, 0)
       < e.amount - coalesce(d.deductions_total, 0) then 'partially_paid'
    else 'paid'
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

-- ----------------------------------------------------------------
-- 7. Privileges.
--    Financial mutations must not be reachable by anon. They stay callable by 'authenticated'
--    because admins reach PostgREST with that role — is_admin() inside each function is the
--    actual authorisation gate, and it fails closed for every non-admin.
--    _provider_earning_state is an internal helper: no role may call it directly.
-- ----------------------------------------------------------------
revoke execute on function public._provider_earning_state(uuid) from public, anon, authenticated;

revoke execute on function public.record_provider_deduction(uuid, numeric, text, text) from public, anon;
grant  execute on function public.record_provider_deduction(uuid, numeric, text, text) to authenticated;

revoke execute on function public.reverse_provider_deduction(uuid, text) from public, anon;
grant  execute on function public.reverse_provider_deduction(uuid, text) to authenticated;

revoke execute on function public.record_provider_payout(uuid, numeric, text, text, text, uuid, timestamptz) from public, anon;
grant  execute on function public.record_provider_payout(uuid, numeric, text, text, text, uuid, timestamptz) to authenticated;

revoke all on public.provider_payout_ledger from public, anon;
grant  select on public.provider_payout_ledger to authenticated;
