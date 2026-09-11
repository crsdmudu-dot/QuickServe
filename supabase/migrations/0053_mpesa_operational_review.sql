-- 0053 — M-PESA operational review read model + idempotent admin alert sweep
--
-- Goal: make ambiguous / stuck M-PESA attempts visible and understandable to an operator, and
-- raise an admin notification exactly once when human attention is required. Nothing here
-- moves money, changes an attempt or payment status, or changes any settlement rule.
--
-- Operational invariants preserved (see docs/pilot/mpesa-operations-runbook.md):
--   * synchronous STK acceptance is not settlement; only verified collection evidence
--     (callback with parseable receipt+amount, or admin confirm_payment_attempt with exact
--     amount + receipt) makes a payment paid — those rules live in 0045/0050 and are untouched;
--   * a transport timeout, a missing callback and a timed_out attempt are AMBIGUOUS, not failed;
--   * retries stay blocked while any initiated/pending/timed_out attempt exists (0046 index).
--
-- Category derivation (no new persisted state; derived from existing columns):
--   investigate    discrepancy evidence recorded on the attempt (any status) — a callback
--                  arrived but was refused (amount mismatch, malformed evidence, late/conflicting
--                  success, sibling risk, receipt reuse ...). Operator must look.
--   settled        successful, payment paid.
--   failed         explicit provider failure (e.g. 1032, 1038) — terminal, retry allowed.
--   no_collection  cancelled by an operator (reconcile_payment_attempt_no_collection).
--   superseded     cancelled automatically because a sibling attempt settled (0050).
--   reconcile      timed_out — past the callback window with no outcome; still blocking.
--   ambiguous      initiated/pending and older than the callback window but not yet aged by the
--                  0036 cron (or a pending attempt whose callback never arrived) — cannot be ruled
--                  in or out yet.
--   waiting        initiated/pending and younger than the callback window.
--
-- Urgency (derived from age against the two centralised thresholds):
--   normal  < callback window          watch  >= callback window
--   due     timed_out / investigate     stale  unresolved for >= mpesa_ops_stale_after()
--
-- Thresholds are defined ONCE as immutable SQL functions and mirrored in src/lib/mpesa-ops.ts,
-- with a test asserting the two agree. The 0036 cron keeps its own literal 5-minute argument;
-- mpesa_ops_callback_window() documents the same value.
--
-- Forward-only. 0050, 0051, 0052 untouched. NOT read-only: it adds review/evidence columns to
-- payment_attempts, replaces the no-collection RPC with an evidence-bearing signature, and its
-- cron writes operational admin notifications. It performs NO financial data mutation: no
-- payment, attempt status, amount, receipt or earning is changed by anything in this file.

-- ----------------------------------------------------------------
-- 0. Additive columns on payment_attempts (no backfill, no defaults that change meaning).
--    discrepancy_reviewed_*   an operator's acknowledgement of contradictory evidence. The
--                             discrepancy array itself is append-only and never edited; a review
--                             records how many entries were examined, so any LATER entry makes the
--                             attempt actionable again.
--    resolution_evidence_source  the structured statement behind a no-collection reconciliation:
--                             'provider_reference' (a Safaricom enquiry/case reference is stored in
--                             resolution_reference) or 'portal_lookup' (the authoritative business
--                             portal was checked and shows no transaction). A free-text note alone
--                             can no longer release a blocking attempt.
-- ----------------------------------------------------------------
alter table public.payment_attempts
  add column if not exists discrepancy_reviewed_at    timestamptz,
  add column if not exists discrepancy_reviewed_by    uuid references public.profiles(id),
  add column if not exists discrepancy_reviewed_count integer,
  add column if not exists discrepancy_review_note    text,
  add column if not exists resolution_evidence_source text
    check (resolution_evidence_source in ('provider_reference','portal_lookup'));

-- ----------------------------------------------------------------
-- 1. Thresholds — single source of truth.
-- ----------------------------------------------------------------
create or replace function public.mpesa_ops_callback_window()
returns interval language sql immutable as $$ select interval '5 minutes' $$;

create or replace function public.mpesa_ops_stale_after()
returns interval language sql immutable as $$ select interval '60 minutes' $$;

-- ----------------------------------------------------------------
-- 2. Operational review — admin-only read model.
--    Exposes no secret and no raw provider payload; the customer phone is masked to its last
--    three digits, enough to correlate with an M-PESA SMS without exposing the MSISDN.
-- ----------------------------------------------------------------
-- RETURNS TABLE cannot be altered in place; a fresh install has nothing to drop.
drop function if exists public.admin_mpesa_attempt_review();

create or replace function public.admin_mpesa_attempt_review()
returns table(
  attempt_id               uuid,
  payment_id               uuid,
  booking_id               uuid,
  status                   text,
  amount                   numeric,
  created_at               timestamptz,
  age_seconds              integer,
  callback_received_at     timestamptz,
  result_code              integer,
  result_desc              text,
  checkout_request_id      text,
  merchant_request_id      text,
  has_collected_amount     boolean,
  has_settlement_reference boolean,
  discrepancy_count        integer,
  latest_discrepancy_type  text,
  discrepancy_unresolved   boolean,
  discrepancy_reviewed_at  timestamptz,
  payment_status           text,
  blocks_retry             boolean,
  needs_operator           boolean,
  resolved_at              timestamptz,
  resolved_by_present      boolean,
  resolution_note          text,
  resolution_reference     text,
  category                 text,
  urgency                  text,
  phone_masked             text
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  return query
    with base as (
      select
        a.id, a.payment_id, p.booking_id, a.status, a.amount, a.created_at,
        a.callback_received_at, a.result_code, a.result_desc,
        a.checkout_request_id, a.merchant_request_id,
        a.collected_amount, a.settlement_reference,
        coalesce(jsonb_array_length(case when jsonb_typeof(a.discrepancy) = 'array' then a.discrepancy else '[]'::jsonb end), 0) as disc_count,
        case when jsonb_typeof(a.discrepancy) = 'array' and jsonb_array_length(a.discrepancy) > 0
             then a.discrepancy -> (jsonb_array_length(a.discrepancy) - 1) ->> 'type' end     as disc_type,
        -- Unresolved = more discrepancy entries than an operator has reviewed. A settled
        -- attempt with a later conflicting callback therefore stays actionable until reviewed.
        coalesce(jsonb_array_length(case when jsonb_typeof(a.discrepancy) = 'array' then a.discrepancy else '[]'::jsonb end), 0)
          > coalesce(a.discrepancy_reviewed_count, 0)                                        as disc_unresolved,
        a.discrepancy_reviewed_at,
        p.status as pay_status,
        a.resolved_at, a.resolved_by, a.resolution_note, a.resolution_reference, a.phone,
        extract(epoch from (now() - a.created_at))::integer                                  as age_s,
        a.status in ('initiated','pending','timed_out')                                       as blocks_retry
      from public.payment_attempts a
      join public.payments p on p.id = a.payment_id
      where a.provider = 'mpesa'
    ),
    classified as (
      select b.*,
        case
          when b.disc_unresolved                                                     then 'investigate'
          when b.status = 'successful' and b.pay_status = 'paid'                     then 'settled'
          when b.status = 'successful'                                               then 'investigate'
          when b.status = 'failed'                                                   then 'failed'
          when b.status = 'cancelled' and b.resolved_by is not null                  then 'no_collection'
          when b.status = 'cancelled'                                                then 'superseded'
          when b.status = 'timed_out'                                                then 'reconcile'
          when b.status in ('initiated','pending')
               and now() - b.created_at >= public.mpesa_ops_callback_window()          then 'ambiguous'
          else 'waiting'
        end as cat
      from base b
    )
    select
      c.id, c.payment_id, c.booking_id, c.status, c.amount, c.created_at, c.age_s,
      c.callback_received_at, c.result_code, c.result_desc,
      c.checkout_request_id, c.merchant_request_id,
      c.collected_amount is not null, c.settlement_reference is not null,
      c.disc_count, c.disc_type, c.disc_unresolved, c.discrepancy_reviewed_at, c.pay_status, c.blocks_retry,
      c.cat in ('reconcile','investigate')                                              as needs_operator,
      c.resolved_at, c.resolved_by is not null, c.resolution_note, c.resolution_reference,
      c.cat,
      case
        when c.cat in ('settled','failed','no_collection','superseded')                 then 'normal'
        when c.cat in ('reconcile','investigate')
             and now() - c.created_at >= public.mpesa_ops_stale_after()                  then 'stale'
        when c.cat in ('reconcile','investigate')                                       then 'due'
        when c.cat = 'ambiguous'                                                        then 'watch'
        else 'normal'
      end                                                                               as urgency,
      case when c.phone is null then null
           else '***' || right(regexp_replace(c.phone, '\D', '', 'g'), 3) end            as phone_masked
    from classified c
    order by
      case c.cat when 'investigate' then 0 when 'reconcile' then 1 when 'ambiguous' then 2 when 'waiting' then 3 else 4 end,
      c.created_at asc;
end; $$;

revoke execute on function public.admin_mpesa_attempt_review() from public, anon;
grant  execute on function public.admin_mpesa_attempt_review() to authenticated;

-- ----------------------------------------------------------------
-- 2b. Operator review of contradictory evidence. Records WHO examined WHAT (how many entries)
--     and WHEN, with a mandatory note. It never changes attempt or payment status, never
--     touches money, never edits the discrepancy array. A later discrepancy entry re-opens the
--     attempt for investigation automatically (count comparison in the review/sweep).
-- ----------------------------------------------------------------
create or replace function public.review_attempt_discrepancy(
  p_attempt_id  uuid,
  p_review_note text
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_attempt public.payment_attempts%rowtype;
  v_count   integer;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  if p_review_note is null or btrim(p_review_note) = '' then
    raise exception 'Review note required';
  end if;

  select * into v_attempt from public.payment_attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'Payment attempt not found';
  end if;
  v_count := case when jsonb_typeof(v_attempt.discrepancy) = 'array'
                  then jsonb_array_length(v_attempt.discrepancy) else 0 end;
  if v_count = 0 then
    raise exception 'No discrepancy recorded on this attempt';
  end if;
  if v_count <= coalesce(v_attempt.discrepancy_reviewed_count, 0) then
    raise exception 'Discrepancy already reviewed';
  end if;

  update public.payment_attempts
     set discrepancy_reviewed_at    = now(),
         discrepancy_reviewed_by    = auth.uid(),
         discrepancy_reviewed_count = v_count,
         discrepancy_review_note    = btrim(p_review_note)
   where id = p_attempt_id;
end; $fn$;

revoke execute on function public.review_attempt_discrepancy(uuid, text) from public, anon;
grant  execute on function public.review_attempt_discrepancy(uuid, text) to authenticated;

-- ----------------------------------------------------------------
-- 2c. No-collection reconciliation now requires STRUCTURED evidence server-side.
--     0045's three-argument form let a direct RPC caller release a blocking attempt with any
--     non-blank note. Financial safety takes priority over that signature: it is dropped and
--     replaced by a four-argument form whose p_evidence_source is persisted. Every other 0045
--     guard is preserved verbatim (admin, payment lock then attempt lock, pending payment,
--     resolvable status, never writes settlement_reference, never touches payments).
-- ----------------------------------------------------------------
drop function if exists public.reconcile_payment_attempt_no_collection(uuid, text, text);

create or replace function public.reconcile_payment_attempt_no_collection(
  p_attempt_id          uuid,
  p_reconciliation_note text,
  p_provider_reference  text,
  p_evidence_source     text
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_payment_id uuid;
  v_payment    public.payments%rowtype;
  v_attempt    public.payment_attempts%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Permission denied';
  end if;
  if p_reconciliation_note is null or btrim(p_reconciliation_note) = '' then
    raise exception 'Reconciliation note required';
  end if;
  if p_evidence_source is null or p_evidence_source not in ('provider_reference','portal_lookup') then
    raise exception 'Evidence source must be provider_reference or portal_lookup';
  end if;
  if p_evidence_source = 'provider_reference'
     and (p_provider_reference is null or btrim(p_provider_reference) = '') then
    raise exception 'Provider reference required for provider_reference evidence';
  end if;

  select payment_id into v_payment_id from public.payment_attempts where id = p_attempt_id;
  if not found then
    raise exception 'Payment attempt not found';
  end if;

  select * into v_payment from public.payments where id = v_payment_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;
  select * into v_attempt from public.payment_attempts where id = p_attempt_id for update;

  if v_payment.status <> 'pending' then
    raise exception 'Payment is not pending';
  end if;
  if v_attempt.status not in ('initiated','pending','timed_out') then
    raise exception 'Payment attempt is not in a reconcilable status';
  end if;

  update public.payment_attempts
     set status                     = 'cancelled',
         resolved_by                = auth.uid(),
         resolved_at                = now(),
         resolution_note            = btrim(p_reconciliation_note),
         resolution_reference       = nullif(btrim(coalesce(p_provider_reference, '')), ''),
         resolution_evidence_source = p_evidence_source
   where id = p_attempt_id;
end; $fn$;

revoke execute on function public.reconcile_payment_attempt_no_collection(uuid, text, text, text) from public, anon;
grant  execute on function public.reconcile_payment_attempt_no_collection(uuid, text, text, text) to authenticated;

-- ----------------------------------------------------------------
-- 3. Alert sweep — one admin notification per attempt per kind, ever.
--    notify_admins() fans out through notify_user(), whose insert is
--    `on conflict (dedup_key) where dedup_key is not null do nothing`, so re-running the sweep
--    (every 5 minutes) can never repeat an alert. Resolution (successful/cancelled/failed) removes
--    the attempt from the sweep predicates; the historical notification remains as audit.
--    Kinds:
--      admin_attempt_timed_out    attempt aged to timed_out by the 0036 cron (blocking, unresolved)
--      admin_attempt_discrepancy  a callback was refused and evidence was recorded on the attempt
--      admin_attempt_stale        a blocking attempt has been unresolved for >= stale threshold
-- ----------------------------------------------------------------
create or replace function public.mpesa_ops_alert_sweep()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_emitted integer := 0;
  r record;
begin
  -- timed_out: needs a human decision in one direction or the other.
  for r in
    select a.id, p.booking_id, a.amount
      from public.payment_attempts a
      join public.payments p on p.id = a.payment_id
     where a.provider = 'mpesa' and a.status = 'timed_out'
  loop
    perform public.notify_admins(
      r.booking_id,
      'M-PESA attempt timed out',
      'Attempt #' || left(r.id::text, 8) || ' (KES ' || r.amount::text || ') has no provider outcome and is blocking retries. Reconcile from evidence.',
      'admin_attempt_timed_out',
      '/payment-attempts',
      r.id::text || ':admin_attempt_timed_out');
    v_emitted := v_emitted + 1;
  end loop;

  -- discrepancy: contradictory evidence was recorded and has not been reviewed — on ANY status,
  -- including a settled attempt that later received a conflicting callback.
  for r in
    select a.id, p.booking_id, a.amount,
           a.discrepancy -> (jsonb_array_length(a.discrepancy) - 1) ->> 'type' as disc_type
      from public.payment_attempts a
      join public.payments p on p.id = a.payment_id
     where a.provider = 'mpesa'
       and jsonb_typeof(a.discrepancy) = 'array'
       and jsonb_array_length(a.discrepancy) > coalesce(a.discrepancy_reviewed_count, 0)
  loop
    perform public.notify_admins(
      r.booking_id,
      'M-PESA callback needs investigation',
      'Attempt #' || left(r.id::text, 8) || ' recorded "' || coalesce(r.disc_type, 'discrepancy') || '". Do not retry; review the evidence.',
      'admin_attempt_discrepancy',
      '/payment-attempts',
      r.id::text || ':admin_attempt_discrepancy');
    v_emitted := v_emitted + 1;
  end loop;

  -- stale: still blocking after the stale threshold.
  for r in
    select a.id, p.booking_id, a.amount
      from public.payment_attempts a
      join public.payments p on p.id = a.payment_id
     where a.provider = 'mpesa'
       and a.status in ('initiated','pending','timed_out')
       and now() - a.created_at >= public.mpesa_ops_stale_after()
  loop
    perform public.notify_admins(
      r.booking_id,
      'M-PESA attempt unresolved for over an hour',
      'Attempt #' || left(r.id::text, 8) || ' (KES ' || r.amount::text || ') is still blocking the customer. Reconcile or escalate.',
      'admin_attempt_stale',
      '/payment-attempts',
      r.id::text || ':admin_attempt_stale');
    v_emitted := v_emitted + 1;
  end loop;

  return v_emitted;   -- attempts examined, not new notifications (dedup happens in notify_user)
end; $$;

revoke execute on function public.mpesa_ops_alert_sweep() from public, anon, authenticated;
grant  execute on function public.mpesa_ops_alert_sweep() to service_role;

-- Runs after the 0036 aging job in the same 5-minute cadence. pg_cron is already enabled (0036).
select cron.schedule(
  'mpesa-ops-alert-sweep',
  '*/5 * * * *',
  $cron$ select public.mpesa_ops_alert_sweep() $cron$
);
