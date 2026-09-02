-- Harden authorization on the customer financial RPCs. Forward-only; QA is through 0042 and
-- production through 0039. No historical migration is rewritten.
--
-- TWO INDEPENDENT DEFECTS ARE FIXED HERE, AND NEITHER SUBSTITUTES FOR THE OTHER.
--
-- 1. EXECUTE PRIVILEGE. Every function below was reachable by PUBLIC and by anon. No migration
--    ever granted that: PostgreSQL grants EXECUTE to PUBLIC on every new function by default and
--    it was never revoked, and Supabase's platform-level ALTER DEFAULT PRIVILEGES for role
--    postgres in schema public additionally grants EXECUTE to anon, authenticated and
--    service_role. Migration 0035 already fixed exactly this class of bug for
--    apply_mpesa_callback (0012 revoked from anon/authenticated but missed PUBLIC); 0036 and
--    0042 then adopted the correct "from public, anon" form. These five functions were simply
--    never included in that sweep. Revoking anon alone is NOT sufficient while PUBLIC retains
--    EXECUTE.
--
-- 2. NULL-UNSAFE OWNERSHIP CHECKS. apply_wallet_to_payment, redeem_promo and
--    initiate_payment_attempt each gate ownership with "<> auth.uid()". When auth.uid() is NULL
--    the comparison yields NULL, "if NULL then" is false, and the exception is never raised —
--    the check fails OPEN. is_admin() is unaffected because EXISTS(...) returns false, not NULL.
--    auth.uid() is NULL not only for anon but also for service_role, whose JWT carries no "sub"
--    claim — and service_role EXECUTE is deliberately retained below — so privilege hardening
--    alone would leave this bypass live. The three checks become IS DISTINCT FROM, which is the
--    form already used elsewhere in this schema (set_default_address, touch_saved_address,
--    upsert_provider_location, clear_provider_location).
--
-- SERVICE_ROLE IS DELIBERATELY LEFT UNCHANGED. Nothing found needs it, but the Edge
-- Function / service-role dependency audit is not complete, and revoking a privilege from an
-- unenumerated server-side caller would be a guess. That is tracked separately; the NULL-safe
-- checks above are what make retaining it safe in the meantime.
--
-- _wallet_post AND _ensure_wallet GET PRIVILEGE HARDENING ONLY — NO OWNERSHIP CHECK. They are
-- internal primitives whose legitimate SECURITY DEFINER callers (admin_wallet_adjust,
-- apply_wallet_to_payment, redeem_promo) act on behalf of a customer, so an auth.uid() guard
-- inside them would break those callers. Those callers are owned by postgres and run as the
-- owner, so revoking PUBLIC/anon/authenticated cannot affect them. _wallet_post had no
-- authorization check of any kind and returns void (not trigger), so it was directly callable
-- through PostgREST: any authenticated user could post arbitrary wallet credit to any customer.
-- That is the most severe item in this migration.
--
-- THE THREE FUNCTION BODIES BELOW WERE TAKEN VERBATIM FROM pg_get_functiondef() ON LIVE QA, NOT
-- retyped and NOT copied from an earlier migration file. Exactly one line changed in each: the
-- ownership comparison. In particular the payment-row "for update" added by 0040 is preserved
-- in its original position in apply_wallet_to_payment and redeem_promo, and the wallet locking,
-- promo arithmetic, auto-settlement guards, error messages, signatures, return types,
-- SECURITY DEFINER and search_path are all unchanged.
--
-- NOT ADDRESSED HERE, TRACKED AS SEPARATE OPEN FINDINGS: the cross-payment promotion
-- usage-limit race; the confirm_payment_attempt / override_payment_status settlement-coverage
-- gap; payment_attempt amount semantics; register-device drift; the provider-payout
-- completed-status durability finding; and the analytics semantic debt. This migration is
-- narrowly authorization-focused and contains no data statement.

-- ----------------------------------------------------------------
-- 1. NULL-safe ownership checks (bodies otherwise identical to live QA).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_wallet_to_payment(p_payment_id uuid, p_amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_customer uuid;
  v_amount   numeric;
  v_applied  numeric;
  v_promo    numeric;
  v_status   text;
  v_booking  uuid;
begin
  -- `for update` (added by 0040): the cap below is only sound if wallet_applied and
  -- promo_discount cannot change between this read and the UPDATE. A second concurrent
  -- application blocks here and re-reads the committed wallet_applied, so its own cap check
  -- is evaluated against the true remaining due.
  select customer_id, amount, wallet_applied, promo_discount, status, booking_id
    into v_customer, v_amount, v_applied, v_promo, v_status, v_booking
    from public.payments
    where id = p_payment_id
    for update;
  if not found then
    raise exception 'Payment not found';
  end if;
  if v_customer is distinct from auth.uid() then
    raise exception 'Not your payment';
  end if;
  if v_status <> 'pending' then
    raise exception 'Payment is not pending';
  end if;
  if p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;
  if p_amount > (v_amount - v_applied - v_promo) then
    raise exception 'Exceeds amount due';
  end if;

  -- Deduct from wallet (raises 'Insufficient wallet balance' if over balance)
  perform public._wallet_post(
    v_customer, 'payment_applied', -p_amount,
    'Applied to booking', v_booking, p_payment_id, null
  );

  -- Record the application on the payment row
  update public.payments
    set wallet_applied = wallet_applied + p_amount
    where id = p_payment_id;

  -- Auto-settle ONLY when fully covered AND booking completed (mirrors pay_payment guard)
  if (v_applied + p_amount + v_promo) = v_amount
     and exists (select 1 from public.bookings b where b.id = v_booking and b.status = 'completed') then
    update public.payments
      set status  = 'paid',
          paid_at = now()
      where id = p_payment_id;
  end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.redeem_promo(p_payment_id uuid, p_code text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_customer uuid; v_amount numeric; v_applied numeric; v_promo numeric;
  v_promo_id uuid; v_status text; v_booking uuid;
  pc record; v_remaining numeric; v_disc numeric;
begin
  -- `for update` (added by 0040): serialises concurrent redemptions and wallet applications
  -- against the same payment. A second transaction blocks here and, on resuming, re-reads the
  -- committed promo_code_id — so it fails through the existing 'Promo already applied' guard
  -- below instead of inserting a duplicate redemption.
  select customer_id, amount, wallet_applied, promo_discount, promo_code_id, status, booking_id
    into v_customer, v_amount, v_applied, v_promo, v_promo_id, v_status, v_booking
    from public.payments where id = p_payment_id
    for update;
  if not found then raise exception 'Payment not found'; end if;
  if v_customer is distinct from auth.uid() then raise exception 'Not your payment'; end if;
  if v_status <> 'pending' then raise exception 'Payment is not pending'; end if;
  if v_promo_id is not null then raise exception 'Promo already applied'; end if;

  select * into pc from public.promo_codes where code = upper(btrim(p_code));
  if not found or not pc.is_active
     or (pc.starts_at is not null and pc.starts_at > now())
     or (pc.ends_at   is not null and pc.ends_at   < now()) then
    raise exception 'Promo code is not valid';
  end if;
  if pc.max_redemptions is not null
     and (select count(*) from public.promo_redemptions where promo_code_id = pc.id) >= pc.max_redemptions then
    raise exception 'Promo fully redeemed';
  end if;
  if (select count(*) from public.promo_redemptions where promo_code_id = pc.id and customer_id = auth.uid()) >= pc.per_user_limit then
    raise exception 'Promo limit reached';
  end if;

  v_remaining := v_amount - v_applied - v_promo;   -- promo is 0 here (one-per-payment)

  if pc.discount_type = 'percentage' then
    v_disc := v_amount * pc.discount_value / 100.0;
    if pc.max_discount is not null then v_disc := least(v_disc, pc.max_discount); end if;
    v_disc := least(v_disc, v_remaining);
    update public.payments set promo_discount = v_disc, promo_code_id = pc.id where id = p_payment_id;
  elsif pc.discount_type = 'fixed' then
    v_disc := least(pc.discount_value, v_remaining);
    update public.payments set promo_discount = v_disc, promo_code_id = pc.id where id = p_payment_id;
  else  -- wallet_credit: post to wallet, do NOT discount the payment
    perform public._wallet_post(auth.uid(), 'promo_credit', pc.discount_value, 'Promo: '||pc.code, v_booking, null, null);
    v_disc := pc.discount_value;
    update public.payments set promo_code_id = pc.id where id = p_payment_id;
  end if;

  insert into public.promo_redemptions (promo_code_id, customer_id, booking_id, payment_id, discount_type, discount_amount)
    values (pc.id, auth.uid(), v_booking, p_payment_id, pc.discount_type, v_disc);

  -- Auto-settle (percentage/fixed only) when promo+wallet fully cover a completed booking
  if pc.discount_type in ('percentage','fixed')
     and (v_applied + v_disc) = v_amount
     and exists (select 1 from public.bookings b where b.id = v_booking and b.status = 'completed') then
    update public.payments set status = 'paid', paid_at = now() where id = p_payment_id;
  end if;

  return v_disc;
end; $function$;

CREATE OR REPLACE FUNCTION public.initiate_payment_attempt(p_payment_id uuid, p_provider text, p_phone text, p_external_reference text, p_raw_response jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payment  public.payments%rowtype;
  v_booking  public.bookings%rowtype;
  v_attempt_id uuid;
begin
  -- Load payment
  select * into v_payment
    from public.payments
    where id = p_payment_id;

  if not found then
    raise exception 'Payment not found';
  end if;

  if v_payment.customer_id is distinct from auth.uid() then
    raise exception 'Permission denied: payment does not belong to you';
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'Payment is not in pending status';
  end if;

  if p_provider not in ('mpesa','card','cash') then
    raise exception 'Invalid provider: must be mpesa, card, or cash';
  end if;

  -- Load booking
  select * into v_booking
    from public.bookings
    where id = v_payment.booking_id;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.status <> 'completed' then
    raise exception 'Booking is not completed';
  end if;

  -- Insert attempt (do NOT modify the payment)
  insert into public.payment_attempts (
    payment_id,
    provider,
    phone,
    amount,
    status,
    external_reference,
    raw_response
  ) values (
    p_payment_id,
    p_provider,
    p_phone,
    v_payment.amount,
    'pending',
    p_external_reference,
    p_raw_response
  )
  returning id into v_attempt_id;

  return v_attempt_id;
end; $function$;


-- ----------------------------------------------------------------
-- 2. EXECUTE privileges.
--    Revoking anon without revoking PUBLIC leaves the function reachable, so PUBLIC is revoked
--    first in every case. postgres remains the owner and keeps EXECUTE implicitly; service_role
--    is intentionally not mentioned anywhere below.
-- ----------------------------------------------------------------

-- Internal primitives: no client role may call these directly.
revoke execute on function public._wallet_post(uuid, text, numeric, text, uuid, uuid, uuid) from public;
revoke execute on function public._wallet_post(uuid, text, numeric, text, uuid, uuid, uuid) from anon;
revoke execute on function public._wallet_post(uuid, text, numeric, text, uuid, uuid, uuid) from authenticated;

revoke execute on function public._ensure_wallet(uuid) from public;
revoke execute on function public._ensure_wallet(uuid) from anon;
revoke execute on function public._ensure_wallet(uuid) from authenticated;

-- Customer-facing RPCs: signed-in users only. is_admin()/ownership checks inside remain the
-- actual authorisation gate; these grants only decide who may reach them.
revoke execute on function public.apply_wallet_to_payment(uuid, numeric) from public;
revoke execute on function public.apply_wallet_to_payment(uuid, numeric) from anon;
grant  execute on function public.apply_wallet_to_payment(uuid, numeric) to authenticated;

revoke execute on function public.redeem_promo(uuid, text) from public;
revoke execute on function public.redeem_promo(uuid, text) from anon;
grant  execute on function public.redeem_promo(uuid, text) to authenticated;

revoke execute on function public.initiate_payment_attempt(uuid, text, text, text, jsonb) from public;
revoke execute on function public.initiate_payment_attempt(uuid, text, text, text, jsonb) from anon;
grant  execute on function public.initiate_payment_attempt(uuid, text, text, text, jsonb) to authenticated;
