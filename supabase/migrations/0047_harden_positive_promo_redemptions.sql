-- ============================================================================
-- 0047 - POSITIVE PROMO REDEMPTIONS.
--
-- Closes ONE pre-existing defect, present since 0024 and untouched by 0040/0043/0044/0045:
-- a percentage or fixed promo can resolve to a ZERO effective discount and still be accepted.
--
--   v_remaining := v_amount - v_applied - v_promo;
--   ... v_disc := least(v_disc, v_remaining);          -- v_remaining may already be 0
--
-- When the payment is already fully funded from the wallet (or the promo is capped down to
-- nothing), v_disc becomes 0 and the function nevertheless:
--     * stamps payments.promo_code_id,
--     * inserts promo_redemptions with discount_amount = 0,
--     * consumes one unit of BOTH promo caps - max_redemptions and per_user_limit are
--       count(*), never sum(discount_amount), so a worthless row costs a real entitlement.
--
-- No money is mis-collected and provider entitlement is unaffected; this is an entitlement
-- and ledger-truth defect. The customer permanently loses a redemption and receives nothing.
--
-- SCOPE. Two guards inside redeem_promo plus one table constraint. This migration does NOT
-- change payment arithmetic, provider_share/quickserve_share, wallet behaviour, wallet_credit
-- promo behaviour, payment-attempt behaviour, payout behaviour, notification behaviour,
-- ordinary positive promo behaviour, or zero-due settlement for genuinely positive discounts.
--
-- BASE. Section 1 below is the post-0045 definition of redeem_promo copied verbatim from
-- 0045 section 7. The ONLY executable difference is the two inserted guards. Nothing is
-- refactored, reordered or removed: the signature, RETURNS numeric, LANGUAGE plpgsql,
-- SECURITY DEFINER, SET search_path TO 'public', the NULL-safe ownership check, the payments
-- FOR UPDATE (0040), the status and 'Promo already applied' guards, the 0045 blocking-attempt
-- funding freeze, the promo_codes FOR UPDATE (0044), both usage-limit COUNTs, the
-- validity/expiry checks, the percentage and fixed arithmetic, the wallet_credit branch, the
-- payments updates, the promo_redemptions insert and the auto-settle block are all unchanged.
--
-- ACL. CREATE OR REPLACE FUNCTION preserves existing privileges, so the grants established by
-- 0043 (revoked from public and anon, granted to authenticated; service_role and postgres
-- reach it as before) survive untouched. 0044 and 0045 both replaced this function without
-- restating grants for the same reason. NO GRANT IS ISSUED HERE and PUBLIC execute is not
-- broadened.
--
-- PRODUCTION PRECONDITION. Section 2 adds an immediately validated CHECK, so it scans every
-- existing promo_redemptions row and FAILS if any row has discount_amount <= 0 or NULL. That
-- is deliberate - it must fail loudly rather than repair history. A read-only preflight must
-- prove, on the target database, before applying:
--
--   select count(*) from public.promo_redemptions
--    where discount_amount is null or discount_amount <= 0;    -- must be 0
--
-- QA has been preflighted: 8 redemption rows, 0 non-positive, 0 NULL, min 1000, max 4000.
-- PRODUCTION HAS NOT. It needs its own preflight before this migration is applied there.
--
-- NO BACKFILL. This migration contains no INSERT, UPDATE, DELETE, TRUNCATE or MERGE at
-- migration time. If the CHECK fails on some database, the correct response is to investigate
-- the offending rows, not to edit or delete them.
-- ============================================================================

-- ----------------------------------------------------------------
-- 1. redeem_promo - reject a zero-value discount instead of consuming entitlement.
--    Each guard sits AFTER its branch's final effective-discount computation and BEFORE that
--    branch's UPDATE, so no write of any kind has occurred when it raises: the payment row is
--    unstamped, no redemption row exists, and the transaction rolls back with both caps
--    untouched. The existing message 'No external amount due' is reused - it is already the
--    vocabulary 0045 uses for "there is nothing left to fund".
--
--    The wallet_credit branch is deliberately NOT guarded. A wallet_credit promo posts a
--    positive credit to the customer wallet and does not discount the payment at all, so it
--    remains valid on a payment with no external amount due. Guarding the branch structure as
--    a whole would break that.
-- ----------------------------------------------------------------
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
  -- FUNDING-MIX FREEZE (0045). While an external attempt can still collect, the wallet/promo
  -- split must not move: the customer was asked at the till for the frozen figure, so a later
  -- allocation would mean the wallet is debited AND the full external amount collected.
  -- Evaluated inside the payment lock already held above.
  if exists (select 1 from public.payment_attempts a
              where a.payment_id = p_payment_id
                and a.status in ('initiated','pending','timed_out')) then
    raise exception 'Payment has an open external attempt';
  end if;

  -- `for update` (added by 0044): the two usage-limit COUNTs below are only sound if no other
  -- transaction can redeem this same code concurrently. The payment lock above serialises
  -- same-payment races only; two different payments never contend, so before 0044 both could
  -- read the same stale counts and both redeem. Locking the promo row makes every redemption
  -- of this code serialise here, before validity and before either COUNT.
  select * into pc from public.promo_codes where code = upper(btrim(p_code)) for update;
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
    if v_disc <= 0 then
      raise exception 'No external amount due';
    end if;
    update public.payments set promo_discount = v_disc, promo_code_id = pc.id where id = p_payment_id;
  elsif pc.discount_type = 'fixed' then
    v_disc := least(pc.discount_value, v_remaining);
    if v_disc <= 0 then
      raise exception 'No external amount due';
    end if;
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

-- ----------------------------------------------------------------
-- 2. Defence in depth: the ledger itself refuses a worthless redemption.
--    The guards above close the only path that writes this table, but the constraint means a
--    future RPC, a manual repair or a restored backup cannot reintroduce the defect silently.
--    VALIDATED IMMEDIATELY (not NOT VALID): the invariant is meant to hold for all history,
--    and a deferred validation would leave exactly the ambiguity 0046 exists to remove.
--    Strictly > 0. A promo redemption of zero is precisely what this migration forbids.
-- ----------------------------------------------------------------
alter table public.promo_redemptions
  add constraint promo_redemptions_discount_amount_positive_check
  check (discount_amount > 0);
