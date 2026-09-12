-- Serialise redemptions of the same promo code. Forward-only; QA is through 0043 and
-- production through 0039. No historical migration is rewritten.
--
-- THE DEFECT. redeem_promo takes SELECT ... FOR UPDATE on the payments row, which correctly
-- serialises two redemptions aimed at the SAME payment (certified by the W3 concurrency gate).
-- It does NOT serialise two redemptions of the same promo code aimed at DIFFERENT payments:
-- those lock different payment rows, never contend, and can therefore both read the same stale
-- promo_redemptions counts, both pass max_redemptions and per_user_limit, and both insert. The
-- usage limits are consequently advisory under concurrency.
--
-- WHY NOT A CONSTRAINT. promo_redemptions has no unique constraint and cannot usefully be given
-- one here. A unique index enforces "at most one" per key tuple; it has no "at most N" form, and
-- these limits are per-row configuration on promo_codes that varies per code. UNIQUE
-- (promo_code_id, customer_id) would express per_user_limit = 1 only, and would actively break
-- any promo legitimately configured with per_user_limit > 1. CHECK constraints cannot reference
-- other rows or tables, so CHECK (count(...) <= N) is not expressible. Correct general
-- enforcement must therefore be serialisation plus a count, which is what this migration adds.
-- No index, unique constraint, counter or advisory lock is introduced.
--
-- THE FIX. One executable line changes: the promo-code lookup takes the row lock. Its position
-- is already correct - it sits after the payment lock and the ownership/pending/already-applied
-- guards, and before the validity check, both COUNTs and every mutation - so locking at the
-- lookup places every usage-limit decision inside the lock without moving any statement.
--
-- ISOLATION DEPENDENCY - READ THIS BEFORE CHANGING THE ISOLATION LEVEL.
-- Correctness rests on PostgreSQL READ COMMITTED, which is the live default on this cluster.
-- The decisive property is not the snapshot of the FOR UPDATE itself but that READ COMMITTED
-- takes a FRESH SNAPSHOT AT THE START OF EACH STATEMENT. A waiter blocks on the promo row,
-- resumes only after the holder commits, and only then runs the COUNT statements - whose new
-- snapshots therefore include the holder's committed redemption, so the limit check rejects
-- correctly. Under REPEATABLE READ or SERIALIZABLE every statement would share the transaction's
-- first snapshot, the COUNTs would NOT see that redemption, and because this migration only
-- LOCKS the promo row and never UPDATEs it, no 40001 serialisation failure would be raised
-- either - the race would survive silently. If the isolation level is ever raised, THIS DESIGN
-- MUST BE REVISITED (e.g. by mutating the promo row so a conflict is detected). No runtime
-- isolation guard is added here; the functional diff is kept narrow deliberately.
--
-- LOCK ORDER. payments -> promo_codes -> wallets (wallets only on the wallet_credit branch).
-- redeem_promo is the only function in the schema that references promo_codes at all, and the
-- only other promo mutation path is an admin PATCH through PostgREST which locks promo_codes
-- alone and never touches payments. No executable path takes promo_codes before payments, or
-- wallets before either, so the order stays acyclic and no deadlock is introduced.
-- CONTENTION CONSEQUENCE: all redemptions of the SAME code now serialise; unrelated codes do
-- not. Note the authenticator role carries lock_timeout = 8s, so a waiter on a very hot code
-- fails fast with SQLSTATE 55P03 rather than queueing indefinitely.
--
-- THE BODY BELOW WAS TAKEN VERBATIM FROM pg_get_functiondef() ON LIVE QA AFTER 0043, NOT
-- retyped and NOT copied from an earlier migration file. Exactly one executable line differs.
-- Preserved unchanged: the 0040 payments FOR UPDATE and its position; the 0043 NULL-safe
-- IS DISTINCT FROM auth.uid() ownership check; the pending and already-applied guards; every
-- active/date semantic; both usage-limit checks; all discount arithmetic including the least()
-- caps on all three branches; the payment UPDATE; _wallet_post behaviour; the promo_redemptions
-- INSERT; the settlement logic; every error message; the (uuid, text) signature; RETURNS
-- numeric; SECURITY DEFINER; and search_path.
--
-- GRANTS. CREATE OR REPLACE FUNCTION preserves the existing ACL, so the 0043 revokes from
-- PUBLIC/anon and the grant to authenticated survive untouched. This migration deliberately
-- re-grants nothing - in particular it does not re-expose PUBLIC or anon. The effective ACL
-- must still be re-verified against the live catalog after apply rather than assumed.
--
-- NOT ADDRESSED HERE, TRACKED SEPARATELY: the admin settlement coverage gap
-- (confirm_payment_attempt / override_payment_status marking a payment paid without proving
-- remaining external collection); payment_attempt amount semantics; register-device drift; the
-- provider-payout completed-status durability finding; and the analytics semantic debt. This
-- migration contains no data statement and no test fixture.

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
