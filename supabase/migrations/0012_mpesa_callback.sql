-- ============================================================
-- Slice 13 — M-Pesa Daraja callback schema
-- ============================================================

-- ----------------------------------------------------------------
-- 1. ALTER payment_attempts — add Daraja columns (all nullable)
-- ----------------------------------------------------------------
alter table public.payment_attempts
  add column if not exists merchant_request_id  text,
  add column if not exists checkout_request_id  text,
  add column if not exists result_code          int,
  add column if not exists result_desc          text,
  add column if not exists callback_received_at timestamptz;

-- ----------------------------------------------------------------
-- 2. Index for callback lookup
-- ----------------------------------------------------------------
create index if not exists payment_attempts_checkout_request_id_idx
  on public.payment_attempts (checkout_request_id);

-- ----------------------------------------------------------------
-- 3. Function: apply_mpesa_callback (service role only)
-- ----------------------------------------------------------------
create or replace function public.apply_mpesa_callback(
  p_checkout_request_id  text,
  p_merchant_request_id  text,
  p_result_code          int,
  p_result_desc          text,
  p_raw                  jsonb
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_attempt public.payment_attempts%rowtype;
begin
  -- Load the most recent attempt matching this checkout request
  select * into v_attempt
    from public.payment_attempts
    where checkout_request_id = p_checkout_request_id
    order by created_at desc
    limit 1;

  if not found then
    return; -- No-op: unknown checkout request
  end if;

  -- Idempotent: already in a terminal state, do nothing
  if v_attempt.status in ('successful', 'failed', 'cancelled') then
    return;
  end if;

  -- Record Daraja fields on the attempt
  update public.payment_attempts
    set merchant_request_id  = coalesce(merchant_request_id, p_merchant_request_id),
        result_code          = p_result_code,
        result_desc          = p_result_desc,
        callback_received_at = now(),
        raw_response         = p_raw
    where id = v_attempt.id;

  if p_result_code = 0 then
    -- Success path

    -- Mark attempt successful
    update public.payment_attempts
      set status = 'successful'
      where id = v_attempt.id;

    -- Atomically mark the payment paid only if still pending
    -- (fires trg_create_earning_on_paid on public.payments)
    update public.payments
      set status         = 'paid',
          paid_at        = now(),
          payment_method = 'mpesa'
      where id     = v_attempt.payment_id
        and status = 'pending';

    -- Cancel sibling open attempts on the same payment
    update public.payment_attempts
      set status = 'cancelled'
      where payment_id = v_attempt.payment_id
        and id <> v_attempt.id
        and status in ('initiated', 'pending');

  else
    -- Failure path: mark attempt failed, do NOT touch the payment
    update public.payment_attempts
      set status = 'failed'
      where id = v_attempt.id;

  end if;
end; $$;

-- ----------------------------------------------------------------
-- 4. Restrict execution to service role only
-- ----------------------------------------------------------------
revoke execute on function public.apply_mpesa_callback(text, text, int, text, jsonb) from anon, authenticated;
