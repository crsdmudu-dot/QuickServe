-- Make the M-Pesa callback amount extraction parse-safe. FUNCTION BODY ONLY - no row is altered.
--
-- THE DEFECT. apply_mpesa_callback extracted the collected amount with a bare cast:
--
--     select (i->>'Value')::numeric into v_amount
--       from jsonb_array_elements(v_meta) i where i->>'Name' = 'Amount' limit 1;
--
-- jsonb ->> always yields text, so any CallbackMetadata Amount that is not a valid numeric
-- literal - a quoted non-numeric string, an empty string, a nested object/array, or a value too
-- large for numeric - raises SQLSTATE 22P02 (or 22003) and aborts the whole function. Because the
-- callback runs as one transaction, the abort discards EVERYTHING: no status change, no
-- discrepancy row, no callback_received_at, no raw_response. A genuine collection whose callback
-- carried a malformed Amount would leave no trace at all, and mpesa-callback returns HTTP 200
-- regardless, so Safaricom never retries. That is the worst possible failure shape for a payment
-- system: money may have moved and the database would not know the callback ever arrived.
--
-- THE FIX. Read the Amount as text, then cast it inside a block that traps exactly the two
-- conversion errors. An unparseable amount becomes NULL and is recorded, instead of destroying
-- the transaction.
--
-- WHY EXCEPTION HANDLING AND NOT A REGEX GUARD. A regex pre-check would have to re-implement
-- PostgreSQL's numeric literal grammar. Anything it failed to anticipate ('1e3', '+5', leading
-- '.') would be newly REJECTED even though the old bare cast accepted it - a silent behaviour
-- change on valid input. Trapping the cast is behaviour-preserving by construction: every value
-- that converted before still converts to the same numeric; only values that previously aborted
-- the transaction now yield NULL. The trap names the two conversion SQLSTATEs and nothing else,
-- so unrelated failures (deadlock, serialization, unique_violation) still propagate normally.
--
-- WHY NULL AND NOT 0. Zero is a legitimate settlement amount elsewhere in this schema, so
-- coercing an unparseable amount to 0 would launder bad evidence into a valid-looking figure.
-- NULL flows into the pre-existing fail-closed guard
--     if v_amount is null or v_amount <= 0 or v_receipt is null then
--         v_reason := 'missing_or_invalid_callback_evidence';
-- so a malformed amount takes the SAME path it would have taken had the Amount been absent: the
-- attempt is NOT marked successful, the payment is NOT marked paid, no provider earning is
-- created, and the evidence is appended to discrepancy. The reason string is deliberately
-- unchanged so any existing consumer keying on it keeps working.
--
-- NOT SILENT. 'observed_amount' alone cannot distinguish "Amount absent" from "Amount present but
-- unparseable" - both are NULL. Two additive jsonb keys close that gap for reconciliation:
-- 'observed_amount_raw' (the exact text Safaricom sent) and 'amount_parse_failed' (boolean). They
-- are added only to the not-settled discrepancy payload. Nothing is removed or renamed.
--
-- CREATE OR REPLACE, NEVER DROP/CREATE. Replacing in place preserves the EXECUTE ACL established
-- by 0035 and re-asserted by 0043/0045 (revoked from public, anon and authenticated; reachable by
-- service_role and postgres). A DROP would silently discard it and re-open the authorization hole
-- 0035 closed. NO GRANT OR REVOKE IS ISSUED HERE.
--
-- SCOPE. Exactly one object changes: public.apply_mpesa_callback. The body below is the 0045
-- section 10 definition copied verbatim apart from the three edits described above. The attempt
-- lookup, the payment-then-attempt lock order, the failure-callback branch, the late-failure
-- evidence path, the identical-duplicate idempotent no-op, the whole contradiction matrix, the
-- amount equality checks against both v_attempt.amount and external due, the unique_violation
-- handling, the payments update and the sibling-cancellation are all unchanged.
--
-- NO DATA DEPENDENCY. This migration contains no DML, no constraint, no index and no backfill, so
-- it cannot fail on legacy rows and needs no production data preflight.

create or replace function public.apply_mpesa_callback(
  p_checkout_request_id text,
  p_merchant_request_id text,
  p_result_code         integer,
  p_result_desc         text,
  p_raw                 jsonb
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_attempt      public.payment_attempts%rowtype;
  v_payment      public.payments%rowtype;
  v_booking_status text;
  v_meta         jsonb;
  v_amount       numeric;
  v_amount_text  text;
  v_amount_bad   boolean := false;
  v_receipt      text;
  v_due          numeric;
  v_reason       text;
  v_settled      boolean := false;
begin
  -- Locate the attempt by the authoritative request identifier (non-locking discovery).
  select * into v_attempt
    from public.payment_attempts
   where checkout_request_id = p_checkout_request_id
   order by created_at desc
   limit 1;
  if not found then
    return; -- unknown checkout request: no-op
  end if;

  -- Payment lock FIRST, then re-read the attempt under it.
  select * into v_payment from public.payments where id = v_attempt.payment_id for update;
  if not found then
    return;
  end if;
  select * into v_attempt from public.payment_attempts where id = v_attempt.id for update;

  select b.status into v_booking_status from public.bookings b where b.id = v_payment.booking_id;

  -- ---- failure callbacks -------------------------------------------------
  if p_result_code is distinct from 0 then
    if v_attempt.status in ('initiated','pending') then
      update public.payment_attempts
         set status               = 'failed',
             merchant_request_id  = coalesce(merchant_request_id, p_merchant_request_id),
             result_code          = p_result_code,
             result_desc          = p_result_desc,
             callback_received_at = now(),
             raw_response         = p_raw
       where id = v_attempt.id;
    else
      -- A failure arriving after a terminal state must never revert it; keep the evidence.
      update public.payment_attempts
         set callback_received_at = now(),
             discrepancy = coalesce(discrepancy, '[]'::jsonb) || jsonb_build_object(
               'at', now(), 'type', 'late_failure_after_terminal',
               'attempt_status', v_attempt.status,
               'result_code', p_result_code, 'result_desc', p_result_desc,
               'checkout_request_id', p_checkout_request_id)
       where id = v_attempt.id;
    end if;
    return;
  end if;

  -- ---- success callbacks: fail-closed evidence extraction ----------------
  v_meta := p_raw #> '{Body,stkCallback,CallbackMetadata,Item}';
  if v_meta is not null and jsonb_typeof(v_meta) = 'array' then
    select btrim(i->>'Value') into v_amount_text
      from jsonb_array_elements(v_meta) i where i->>'Name' = 'Amount' limit 1;
    if v_amount_text is not null then
      begin
        v_amount := v_amount_text::numeric;
      exception when invalid_text_representation or numeric_value_out_of_range then
        v_amount     := null;
        v_amount_bad := true;
      end;
    end if;
    select btrim(i->>'Value') into v_receipt
      from jsonb_array_elements(v_meta) i where i->>'Name' = 'MpesaReceiptNumber' limit 1;
  end if;
  v_receipt := nullif(coalesce(v_receipt, ''), '');

  v_due := v_payment.amount - v_payment.wallet_applied - v_payment.promo_discount;

  -- Decide whether this success may settle. Every failure mode records evidence instead.
  if v_amount is null or v_amount <= 0 or v_receipt is null then
    v_reason := 'missing_or_invalid_callback_evidence';
  elsif v_attempt.status = 'successful' then
    if v_attempt.settlement_reference is not distinct from v_receipt
       and v_attempt.collected_amount is not distinct from v_amount then
      return; -- identical duplicate callback: idempotent no-op
    end if;
    v_reason := 'conflicting_callback_after_settlement';
  elsif v_attempt.status = 'failed' then
    v_reason := 'success_after_definitive_failure';
  elsif v_payment.status <> 'pending' then
    v_reason := 'payment_already_settled_elsewhere';
  elsif v_booking_status is distinct from 'completed' then
    v_reason := 'booking_not_completed';
  elsif exists (select 1 from public.payment_attempts a
                 where a.payment_id = v_payment.id and a.id <> v_attempt.id
                   and a.status in ('initiated','pending','timed_out','successful')) then
    -- Sibling conflict applies to EVERY source status, not only 'cancelled'. A sibling that is
    -- live (initiated/pending/timed_out) may still collect, and a successful one already did, so
    -- settling from this attempt could double-collect - and the sibling-cancel below would then
    -- silently deactivate a request the customer can still pay. Refuse and record instead.
    v_reason := 'sibling_attempt_exists_double_collection_risk';
  elsif v_amount <> v_attempt.amount or v_amount <> v_due then
    v_reason := 'amount_mismatch';
  else
    v_settled := true;
  end if;

  if not v_settled then
    update public.payment_attempts
       set callback_received_at = now(),
           result_code          = p_result_code,
           result_desc          = coalesce(p_result_desc, result_desc),
           collected_amount     = coalesce(v_amount, collected_amount),
           discrepancy = coalesce(discrepancy, '[]'::jsonb) || jsonb_build_object(
             'at', now(), 'type', v_reason,
             'attempt_status', v_attempt.status,
             'observed_amount', v_amount, 'observed_receipt', v_receipt,
             'observed_amount_raw', v_amount_text, 'amount_parse_failed', v_amount_bad,
             'expected_amount', v_attempt.amount, 'external_due', v_due,
             'checkout_request_id', p_checkout_request_id,
             'merchant_request_id', p_merchant_request_id,
             'result_code', p_result_code, 'result_desc', p_result_desc)
     where id = v_attempt.id;
    return;
  end if;

  -- ---- settle: initiated/pending, late timed_out, or the cancelled C1 contradiction ----
  begin
    update public.payment_attempts
       set status               = 'successful',
           settlement_reference = v_receipt,
           collected_amount     = v_amount,
           merchant_request_id  = coalesce(merchant_request_id, p_merchant_request_id),
           result_code          = p_result_code,
           result_desc          = p_result_desc,
           callback_received_at = now(),
           raw_response         = p_raw,
           discrepancy = case when v_attempt.status in ('timed_out','cancelled')
             then coalesce(discrepancy, '[]'::jsonb) || jsonb_build_object(
               'at', now(), 'type', 'late_success_from_' || v_attempt.status,
               'observed_amount', v_amount, 'observed_receipt', v_receipt)
             else discrepancy end
     where id = v_attempt.id;
  exception when unique_violation then
    update public.payment_attempts
       set callback_received_at = now(),
           collected_amount     = v_amount,
           discrepancy = coalesce(discrepancy, '[]'::jsonb) || jsonb_build_object(
             'at', now(), 'type', 'settlement_reference_already_used',
             'observed_amount', v_amount, 'observed_receipt', v_receipt)
     where id = v_attempt.id;
    return;
  end;

  update public.payments
     set status         = 'paid',
         paid_at        = now(),
         payment_method = 'mpesa'
   where id     = v_payment.id
     and status = 'pending';

  -- Sibling open attempts can no longer collect once this payment is settled.
  update public.payment_attempts
     set status          = 'cancelled',
         resolution_note = coalesce(resolution_note, 'Superseded by settled attempt')
   where payment_id = v_payment.id
     and id <> v_attempt.id
     and status in ('initiated','pending','timed_out');
end; $fn$;
