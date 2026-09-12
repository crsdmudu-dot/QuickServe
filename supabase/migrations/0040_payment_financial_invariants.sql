-- Payment financial invariants — payment-row locking + a declarative over-application guard.
--
-- WHY THIS MIGRATION EXISTS
--
-- `apply_wallet_to_payment` and `redeem_promo` both follow a read → check → write shape:
-- they SELECT the payment's amount / wallet_applied / promo_discount / status into locals,
-- validate the request against those locals, then UPDATE. Under PostgreSQL's default READ
-- COMMITTED isolation that sequence is NOT atomic, so two concurrent calls against the SAME
-- payment can both read the same pre-state, both pass their cap check, and both write.
--
-- The arithmetic itself is already correct. 0024 recreated `apply_wallet_to_payment` so its
-- cap subtracts promo_discount (`p_amount > v_amount - v_applied - v_promo`) and its
-- auto-settle includes it (`v_applied + p_amount + v_promo = v_amount`); `redeem_promo`
-- likewise caps the discount at `v_amount - v_applied - v_promo`. Nothing here changes any of
-- that. The defect is the missing serialisation, not the formula.
--
-- Worked failure this fixes. Payment amount 1000, wallet balance 1600, two concurrent
-- apply_wallet_to_payment(p, 800) calls:
--   1. both read wallet_applied = 0, promo_discount = 0;
--   2. both evaluate 800 > (1000 - 0 - 0) as false and proceed;
--   3. _wallet_post serialises on the wallet row (it already does `for update`), so the
--      balance goes 1600 -> 800 -> 0 and NEITHER call trips 'Insufficient wallet balance';
--   4. both UPDATE, leaving wallet_applied = 1600 on a 1000 payment.
-- The wallet-row lock masks the race only while the balance happens to run out first. With
-- enough balance the invariant breaks, and the resulting row is unrecoverable through the
-- RPCs: every later request fails 'Exceeds amount due' (remaining is negative) and the
-- `= v_amount` auto-settle can never match, so the payment is stuck pending forever.
--
-- The same window lets two concurrent redeem_promo calls on one payment both observe
-- promo_code_id IS NULL, so both pass the 'Promo already applied' guard and both insert a
-- promo_redemptions row — inflating usage against max_redemptions and per_user_limit.
--
-- WHAT THIS MIGRATION DOES
--
--   1. Recreates both RPCs with `for update` on the payment SELECT. Bodies are otherwise
--      reproduced verbatim from 0024 — same signatures, same arithmetic, same error strings,
--      same settlement behaviour.
--   2. Adds a CHECK constraint so wallet_applied + promo_discount can never exceed amount,
--      independently of RPC correctness or any future writer.
--
-- Lock order is payment -> wallet in both functions, and `_wallet_post` is the only place a
-- wallet row is locked. `admin_wallet_adjust` reaches `_wallet_post` without touching
-- public.payments at all, so no path acquires a wallet row before a payment row and no
-- deadlock cycle exists.
--
-- DELIBERATELY NOT CHANGED
--   * The `= v_amount` auto-settle comparison stays exact rather than `>=`. Once the
--     constraint holds, over-application cannot occur, so a defensive `>=` would be an
--     untested semantic change bundled into a concurrency fix.
--   * No unique index on promo_redemptions. Same-payment double redemption is closed by the
--     payment lock; a broader uniqueness rule has product semantics (per_user_limit may
--     legitimately exceed one) that need separate analysis.
--   * pay_payment, mpesa-stk-push, mpesa-callback, application code, and every previously
--     applied migration are untouched.
--
-- KNOWN REMAINING GAP, recorded not fixed: two redemptions of the same promo code against
-- DIFFERENT payments still race on the max_redemptions / per_user_limit counts, because those
-- read promo_redemptions rather than the locked payment row.
--
-- Compatibility: QA and Production both hold zero payment rows (verified read-only), so the
-- constraint validates trivially and `create or replace` alters no live state.

-- ----------------------------------------------------------------
-- 1. redeem_promo — payment row locked before any read/check/write
-- ----------------------------------------------------------------
create or replace function public.redeem_promo(
  p_payment_id uuid,
  p_code       text
)
returns numeric language plpgsql security definer set search_path = public as $$
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
  if v_customer <> auth.uid() then raise exception 'Not your payment'; end if;
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
end; $$;

-- ----------------------------------------------------------------
-- 2. apply_wallet_to_payment — payment row locked before any read/check/write
--    Body is the promo-aware 0024 implementation, unchanged apart from `for update`.
-- ----------------------------------------------------------------
create or replace function public.apply_wallet_to_payment(
  p_payment_id uuid,
  p_amount     numeric
)
returns void language plpgsql security definer set search_path = public as $$
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
  if v_customer <> auth.uid() then
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
end; $$;

-- ----------------------------------------------------------------
-- 3. Declarative invariant — wallet + promo may never exceed the payment total.
--    Backstop that holds regardless of RPC correctness or any future writer.
--    drop-then-add (the 0036 convention) is idempotent AND deterministic: re-running this
--    migration cannot leave an earlier constraint of a DIFFERENT definition in place.
--    All three columns are NOT NULL, so the expression is never NULL (never trivially true).
-- ----------------------------------------------------------------
alter table public.payments
  drop constraint if exists payments_wallet_promo_within_amount_check;
alter table public.payments
  add constraint payments_wallet_promo_within_amount_check
  check (wallet_applied + promo_discount <= amount);
