-- Payment settlement hardening. Forward-only; QA is through 0044 and production through 0039.
--
-- WHAT THIS FIXES. Before 0045 no settlement path evaluated any amount at all:
-- confirm_payment_attempt loaded the attempt rowtype and never read .amount;
-- override_payment_status set 'paid' with no evidence of any kind; apply_mpesa_callback settled
-- on result_code alone and never extracted the transacted amount it was already being handed in
-- p_raw. A payment could therefore reach 'paid' - minting a full provider_share entitlement via
-- trg_create_earning_on_paid - while the customer had paid a fraction of what was owed, or
-- nothing at all.
--
-- THE OBLIGATION EQUATION was already expressed twice in the customer-side RPCs (both auto-settle
-- exactly when it reaches zero) and is now enforced on the settlement side too:
--     external_due = payments.amount - payments.wallet_applied - payments.promo_discount
-- payments_wallet_promo_within_amount_check (0040) guarantees external_due >= 0.
--
-- EXACT EQUALITY, never >=. Underpayment must fail; overpayment must not silently become valid
-- settlement. Overpayment is an exception requiring explicit handling, not automatic acceptance.
--
-- ATTEMPT AMOUNT SEMANTICS. payment_attempts.amount is the FULL REMAINING EXTERNAL amount for
-- that attempt. This is not an invention: mpesa-stk-push has always computed
-- amount - wallet_applied - promo_discount and inserted that value. The gross semantic existed
-- only in initiate_payment_attempt, which has zero application callers. 0045 makes SQL agree with
-- the live production writer. No backfill: legacy rows keep their recorded value and simply fail
-- closed, because settlement now requires attempt.amount = current external_due.
--
-- NO PARTIAL EXTERNAL PAYMENTS in V1. One open attempt represents the full remaining external
-- due; attempt amounts are never summed. Partial settlement has no coherent meaning downstream,
-- where create_earning_on_paid is all-or-nothing on the paid transition.
--
-- BLOCKING ATTEMPT SET = ('initiated','pending','timed_out'), used identically for new-attempt
-- eligibility, the wallet freeze, the promo freeze, retry eligibility and operational reopening.
-- timed_out is DELIBERATELY blocking: it means "outcome unresolved", not "safe failure". An
-- ambiguous Daraja request may still complete, so permitting retry on timed_out would let the
-- customer be charged twice while our database settles once.
--
-- RESERVE BEFORE PROVIDER. mpesa-stk-push previously called Daraja and only then inserted the
-- attempt, so two concurrent invocations could both reach Daraja before either row existed - two
-- live STK requests against one payment. reserve_mpesa_attempt creates the row (and its
-- uniqueness) first. The cost is that a transport-ambiguous initiation leaves an 'initiated' row
-- holding the freeze; the already-scheduled cron (reconcile_stale_payment_attempts, every 5
-- minutes) ages it to 'timed_out', released only by a valid late callback or an evidenced
-- no-collection reconciliation. A bounded freeze is strictly less harmful than an unbounded
-- double charge.
--
-- SETTLEMENT REFERENCE. settlement_reference is a NEW column holding the authoritative identity
-- of a successful external transaction (M-Pesa MpesaReceiptNumber; a verified bank/card
-- reference; NULL for cash). external_reference is NOT repurposed: on live rows it holds an STK
-- REQUEST identifier (mpesa-stk-push writes checkoutRequestId) or a caller-supplied label, so
-- redefining it would rewrite the meaning of existing production data AND produce a unique index
-- that appears to protect receipt identity while actually protecting request identity - a control
-- that looks real and is not. Uniqueness is (provider, settlement_reference) among successful
-- rows only, so a non-successful row may retain a contested reference as evidence without
-- consuming identity. Contrast 0041, where provider_payouts.reference was deliberately left
-- non-unique: that is OUTBOUND, where bank refs and cash receipt numbers legitimately repeat.
-- Inbound reference reuse is double settlement.
--
-- CROSS-PAYMENT SERIALISATION. Two admins confirming two DIFFERENT payments with the same receipt
-- never contend on a payment row, so FOR UPDATE cannot serialise them. The partial unique index is
-- the only mechanism that can, and the settlement RPCs translate its unique_violation into the
-- domain error 'Settlement reference already used' so no raw 23505 leaks as an expected outcome.
--
-- LOCK ORDER, unchanged and extended: payments -> promo_codes -> wallets, with payment_attempts
-- locked only AFTER payments. Attempt -> payment is a non-locking discovery read, so no reverse
-- path exists and the graph stays acyclic.
--
-- COMPLETED-BOOKING POLICY PRESERVED. apply_wallet_to_payment, redeem_promo,
-- initiate_payment_attempt and mpesa-stk-push already required booking.status='completed'; the
-- three settlement paths did not. 0045 adds that requirement to them rather than relaxing it
-- anywhere, so no provider earning can be created before the booking is complete.
--
-- CALLBACK PAYLOAD CAVEAT - READ BEFORE CERTIFYING. The CallbackMetadata JSON path below is
-- SPECIFICATION-DERIVED. CallbackMetadata appears nowhere in this repository: parseStkCallback
-- extracts only MerchantRequestID, CheckoutRequestID, ResultCode and ResultDesc, and the receipt
-- has never been stored anywhere. Extraction is therefore FAIL-CLOSED, so a wrong path can only
-- refuse to settle, never wrongly settle. M-Pesa settlement MUST NOT be treated as runtime
-- certified until a representative Daraja-shaped callback carrying Amount, MpesaReceiptNumber,
-- TransactionDate and PhoneNumber has been exercised.
--
-- NOT IN THIS MIGRATION. Every invariant whose success depends on historical rows lives in 0046
-- (one-blocking-attempt index, unique checkout_request_id, VALIDATE of the amount CHECK), gated on
-- a mandatory read-only production preflight. The settlement_reference index IS here because the
-- column is new and its partial index is provably empty at creation.
--
-- ALSO NOT ADDRESSED, tracked separately: refund accounting and provider-earning retraction;
-- register-device drift; analytics semantic debt; the provider-payout completed-status durability
-- finding. No change to create_earning_on_paid, tg_notify_payment_paid,
-- reconcile_stale_payment_attempts or its cron schedule.

-- ----------------------------------------------------------------
-- 1. Settlement evidence columns. All nullable, no backfill.
-- ----------------------------------------------------------------
alter table public.payment_attempts add column if not exists settlement_reference text;
alter table public.payment_attempts add column if not exists resolved_by          uuid references public.profiles(id);
alter table public.payment_attempts add column if not exists resolved_at          timestamptz;
alter table public.payment_attempts add column if not exists resolution_note      text;
alter table public.payment_attempts add column if not exists resolution_reference text;
alter table public.payment_attempts add column if not exists collected_amount     numeric;
alter table public.payment_attempts add column if not exists discrepancy          jsonb;

comment on column public.payment_attempts.settlement_reference is
  'Authoritative identity of a SUCCESSFUL external transaction: M-Pesa MpesaReceiptNumber, or a verified bank/card reference. NULL for cash. Written only at settlement and never overwritten. Distinct from external_reference, which is a provider REQUEST identifier.';
comment on column public.payment_attempts.resolution_reference is
  'Supplemental human-reconciliation evidence (portal case number, statement reference, ticket). NEVER evidence that money was collected.';
comment on column public.payment_attempts.collected_amount is
  'Externally collected amount as verified at settlement, or the observed amount on a REFUSED settlement.';
comment on column public.payment_attempts.discrepancy is
  'Append-only JSON array of contradictory provider evidence. Never overwrites raw_response or settlement_reference.';

-- ----------------------------------------------------------------
-- 2. Settlement-reference uniqueness. Safe here: the column is new, so the partial index is
--    empty at creation and cannot fail on legacy rows.
-- ----------------------------------------------------------------
create unique index if not exists payment_attempts_settlement_reference_uq
  on public.payment_attempts (provider, settlement_reference)
  where settlement_reference is not null and status = 'successful';

-- ----------------------------------------------------------------
-- 3. amount > 0, NOT VALID. New rows constrained immediately; historical validation is 0046's
--    job, behind the production preflight.
-- ----------------------------------------------------------------
alter table public.payment_attempts drop constraint if exists payment_attempts_amount_positive_check;
alter table public.payment_attempts add  constraint payment_attempts_amount_positive_check
  check (amount > 0) not valid;

-- ----------------------------------------------------------------
-- 4. initiate_payment_attempt - customer/manual reservation.
-- ----------------------------------------------------------------
create or replace function public.initiate_payment_attempt(
  p_payment_id         uuid,
  p_provider           text,
  p_phone              text,
  p_external_reference text,
  p_raw_response       jsonb
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_due     numeric;
  v_id      uuid;
begin
  -- Payment lock FIRST; every decision below is made under it.
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;
  if v_payment.customer_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Permission denied: payment does not belong to you';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Payment is not in pending status';
  end if;
  if p_provider is null or p_provider not in ('mpesa','card','cash') then
    raise exception 'Invalid provider: must be mpesa, card, or cash';
  end if;

  select * into v_booking from public.bookings where id = v_payment.booking_id;
  if not found then
    raise exception 'Booking not found';
  end if;
  if v_booking.status <> 'completed' then
    raise exception 'Booking is not completed';
  end if;

  if exists (select 1 from public.payment_attempts a
              where a.payment_id = p_payment_id
                and a.status in ('initiated','pending','timed_out')) then
    raise exception 'Payment has an open external attempt';
  end if;

  v_due := v_payment.amount - v_payment.wallet_applied - v_payment.promo_discount;
  if v_due <= 0 then
    raise exception 'No external amount due';
  end if;

  insert into public.payment_attempts
    (payment_id, provider, phone, amount, status, external_reference, raw_response)
  values
    (p_payment_id, p_provider, p_phone, v_due, 'initiated', p_external_reference, p_raw_response)
  returning id into v_id;

  return v_id;
end; $fn$;

-- ----------------------------------------------------------------
-- 5. M-Pesa reservation surface, replacing the unlocked service-role INSERT in mpesa-stk-push.
--    reserve -> call Daraja -> accepted | definitively failed | (ambiguous: leave 'initiated').
-- ----------------------------------------------------------------
create or replace function public.reserve_mpesa_attempt(
  p_payment_id uuid,
  p_phone      text
) returns table (attempt_id uuid, amount numeric)
language plpgsql security definer set search_path = public as $fn$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_due     numeric;
  v_id      uuid;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;
  -- The trusted backend reaches this with auth.uid() NULL; when a user identity IS present it
  -- must own the payment (or be an admin).
  if auth.uid() is not null
     and v_payment.customer_id is distinct from auth.uid()
     and not public.is_admin() then
    raise exception 'Permission denied: payment does not belong to you';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Payment is not in pending status';
  end if;

  select * into v_booking from public.bookings where id = v_payment.booking_id;
  if not found then
    raise exception 'Booking not found';
  end if;
  if v_booking.status <> 'completed' then
    raise exception 'Booking is not completed';
  end if;

  if exists (select 1 from public.payment_attempts a
              where a.payment_id = p_payment_id
                and a.status in ('initiated','pending','timed_out')) then
    raise exception 'Payment has an open external attempt';
  end if;

  v_due := v_payment.amount - v_payment.wallet_applied - v_payment.promo_discount;
  if v_due <= 0 then
    raise exception 'No external amount due';
  end if;

  insert into public.payment_attempts (payment_id, provider, phone, amount, status)
  values (p_payment_id, 'mpesa', p_phone, v_due, 'initiated')
  returning id into v_id;

  attempt_id := v_id;
  amount     := v_due;
  return next;
end; $fn$;

create or replace function public.mark_attempt_accepted(
  p_attempt_id          uuid,
  p_merchant_request_id text,
  p_checkout_request_id text,
  p_raw                 jsonb
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_payment_id uuid;
begin
  select payment_id into v_payment_id from public.payment_attempts where id = p_attempt_id;
  if not found then
    raise exception 'Payment attempt not found';
  end if;
  perform 1 from public.payments where id = v_payment_id for update;

  update public.payment_attempts
     set status              = 'pending',
         merchant_request_id = p_merchant_request_id,
         checkout_request_id = p_checkout_request_id,
         external_reference  = coalesce(external_reference, p_checkout_request_id),
         raw_response        = coalesce(p_raw, raw_response)
   where id = p_attempt_id
     and status = 'initiated';
  if not found then
    raise exception 'Attempt is not in the initiated state';
  end if;
end; $fn$;

create or replace function public.mark_attempt_failed(
  p_attempt_id uuid,
  p_reason     text,
  p_raw        jsonb
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_payment_id uuid;
begin
  -- DEFINITIVE provider rejection ONLY. Transport ambiguity must leave the attempt 'initiated'
  -- so it keeps the freeze and is aged to 'timed_out' by the existing cron.
  select payment_id into v_payment_id from public.payment_attempts where id = p_attempt_id;
  if not found then
    raise exception 'Payment attempt not found';
  end if;
  perform 1 from public.payments where id = v_payment_id for update;

  update public.payment_attempts
     set status       = 'failed',
         result_desc  = coalesce(p_reason, result_desc),
         raw_response = coalesce(p_raw, raw_response)
   where id = p_attempt_id
     and status = 'initiated';
  if not found then
    raise exception 'Attempt is not in the initiated state';
  end if;
end; $fn$;

-- ----------------------------------------------------------------
-- 6. apply_wallet_to_payment - funding-mix freeze ONLY.
--    Body taken verbatim from the live post-0044 definition; the only change is the inserted
--    freeze guard. The 0040 payment FOR UPDATE, the 0043 NULL-safe ownership check, the cap
--    arithmetic, _wallet_post and the auto-settle guard are untouched.
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
  -- FUNDING-MIX FREEZE (0045). While an external attempt can still collect, the wallet/promo
  -- split must not move: the customer was asked at the till for the frozen figure, so a later
  -- allocation would mean the wallet is debited AND the full external amount collected.
  -- Evaluated inside the payment lock already held above.
  if exists (select 1 from public.payment_attempts a
              where a.payment_id = p_payment_id
                and a.status in ('initiated','pending','timed_out')) then
    raise exception 'Payment has an open external attempt';
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

-- ----------------------------------------------------------------
-- 7. redeem_promo - funding-mix freeze ONLY.
--    Body taken verbatim from the live post-0044 definition; the only change is the inserted
--    freeze guard. The 0040 payments FOR UPDATE, the 0044 promo_codes FOR UPDATE, the 0043
--    NULL-safe ownership check, both usage-limit COUNTs and all discount arithmetic are
--    untouched.
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

-- ----------------------------------------------------------------
-- 8. confirm_payment_attempt - evidenced manual settlement.
--    The old 1-argument form is DROPPED, not kept as a compatibility overload: retaining it
--    would preserve the evidence-free settlement path this migration exists to remove.
-- ----------------------------------------------------------------
drop function if exists public.confirm_payment_attempt(uuid);

create or replace function public.confirm_payment_attempt(
  p_attempt_id             uuid,
  p_collected_amount       numeric,
  p_confirmation_note      text,
  p_confirmation_reference text
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_payment_id uuid;
  v_payment    public.payments%rowtype;
  v_attempt    public.payment_attempts%rowtype;
  v_booking_status text;
  v_due        numeric;
  v_ref        text;
begin
  if not public.is_admin() then
    raise exception 'Permission denied';
  end if;

  -- Non-locking discovery of the payment, then payment lock FIRST, then the attempt.
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
    raise exception 'Payment attempt is not in a confirmable status';
  end if;

  select b.status into v_booking_status from public.bookings b where b.id = v_payment.booking_id;
  if v_booking_status is distinct from 'completed' then
    raise exception 'Booking is not completed';
  end if;

  if exists (select 1 from public.payment_attempts a
              where a.payment_id = v_payment_id
                and a.id <> p_attempt_id
                and a.status in ('initiated','pending','timed_out')) then
    raise exception 'Payment has another open external attempt';
  end if;
  if exists (select 1 from public.payment_attempts a
              where a.payment_id = v_payment_id and a.status = 'successful') then
    raise exception 'Payment already has a successful attempt';
  end if;

  v_due := v_payment.amount - v_payment.wallet_applied - v_payment.promo_discount;
  if v_due <= 0 then
    raise exception 'No external amount due';
  end if;
  if p_collected_amount is null or p_collected_amount <= 0 then
    raise exception 'Collected amount must be positive';
  end if;
  -- EXACT equality, both ways: underpayment fails, overpayment fails.
  if p_collected_amount <> v_attempt.amount or p_collected_amount <> v_due then
    raise exception 'Collected amount does not match the amount due';
  end if;

  if p_confirmation_note is null or btrim(p_confirmation_note) = '' then
    raise exception 'Confirmation note required';
  end if;

  v_ref := nullif(btrim(coalesce(p_confirmation_reference, '')), '');
  if v_attempt.provider in ('mpesa','card') and v_ref is null then
    raise exception 'Transaction reference required for this provider';
  end if;

  begin
    update public.payment_attempts
       set status               = 'successful',
           settlement_reference = v_ref,
           collected_amount     = p_collected_amount,
           resolved_by          = auth.uid(),
           resolved_at          = now(),
           resolution_note      = btrim(p_confirmation_note)
     where id = p_attempt_id;
  exception when unique_violation then
    raise exception 'Settlement reference already used';
  end;

  update public.payments
     set status         = 'paid',
         paid_at        = now(),
         payment_method = v_attempt.provider
   where id     = v_payment_id
     and status = 'pending';
end; $fn$;

-- ----------------------------------------------------------------
-- 9. reconcile_payment_attempt_no_collection - evidenced negative reconciliation.
--    Replaces cancel_payment_attempt, which could move timed_out -> cancelled with no actor,
--    timestamp, note or payment lock. "Collection did NOT occur" is a financially material
--    assertion and cannot be evidence-free. This RPC never writes settlement_reference.
-- ----------------------------------------------------------------
drop function if exists public.cancel_payment_attempt(uuid);

create or replace function public.reconcile_payment_attempt_no_collection(
  p_attempt_id          uuid,
  p_reconciliation_note text,
  p_provider_reference  text
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
     set status               = 'cancelled',
         resolved_by          = auth.uid(),
         resolved_at          = now(),
         resolution_note      = btrim(p_reconciliation_note),
         resolution_reference = nullif(btrim(coalesce(p_provider_reference, '')), '')
   where id = p_attempt_id;
end; $fn$;

-- ----------------------------------------------------------------
-- 10. apply_mpesa_callback - the production settlement path.
--     Fail-closed amount/receipt extraction plus the full contradiction matrix.
--     CheckoutRequestID is a REQUEST identifier and is never accepted as proof of collection.
-- ----------------------------------------------------------------
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
    select (i->>'Value')::numeric into v_amount
      from jsonb_array_elements(v_meta) i where i->>'Name' = 'Amount' limit 1;
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

-- ----------------------------------------------------------------
-- 11. override_payment_status - operational only, never financial settlement.
-- ----------------------------------------------------------------
create or replace function public.override_payment_status(
  p_payment_id uuid,
  p_status     text
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_payment public.payments%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Permission denied';
  end if;
  if p_status is null or p_status not in ('pending','cancelled') then
    -- 'paid' is reachable only through an evidenced settlement path. 'refunded' stays unavailable
    -- until refund accounting exists, because provider_earnings is never retracted.
    raise exception 'Status not available through this override';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;

  if v_payment.status = 'paid' then
    raise exception 'A paid payment cannot be changed through this override';
  end if;
  if v_payment.status = 'refunded' then
    raise exception 'A refunded payment cannot be changed through this override';
  end if;

  if v_payment.status = 'cancelled' and p_status = 'pending'
     and exists (select 1 from public.payment_attempts a
                  where a.payment_id = p_payment_id
                    and a.status in ('initiated','pending','timed_out','successful')) then
    raise exception 'Payment has an attempt that may have collected; reconcile first';
  end if;

  update public.payments set status = p_status, paid_at = null where id = p_payment_id;
end; $fn$;

-- ----------------------------------------------------------------
-- 12. Zero-external-due settlement at booking completion.
--     A fully wallet/promo-covered payment needs no external attempt, but the completed-booking
--     policy must still gate the paid transition (and therefore the provider earning). This
--     trigger is the minimal mechanism; it never creates an attempt.
-- ----------------------------------------------------------------
create or replace function public.settle_zero_due_on_completion()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  update public.payments p
     set status  = 'paid',
         paid_at = now()
   where p.booking_id = new.id
     and p.status = 'pending'
     and (p.amount - p.wallet_applied - p.promo_discount) = 0
     and not exists (select 1 from public.payment_attempts a
                      where a.payment_id = p.id
                        and a.status in ('initiated','pending','timed_out','successful'));
  return new;
end; $fn$;

drop trigger if exists trg_settle_zero_due_on_completion on public.bookings;
create trigger trg_settle_zero_due_on_completion
  after update on public.bookings
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.settle_zero_due_on_completion();

-- ----------------------------------------------------------------
-- 13. Privileges. Same conservative pattern as 0043: PUBLIC and anon revoked everywhere,
--     authenticated granted where a signed-in user or admin must reach the RPC, service_role
--     left untouched. is_admin()/ownership checks inside remain the real gate.
-- ----------------------------------------------------------------
revoke execute on function public.initiate_payment_attempt(uuid, text, text, text, jsonb) from public;
revoke execute on function public.initiate_payment_attempt(uuid, text, text, text, jsonb) from anon;
grant  execute on function public.initiate_payment_attempt(uuid, text, text, text, jsonb) to authenticated;

revoke execute on function public.reserve_mpesa_attempt(uuid, text) from public;
revoke execute on function public.reserve_mpesa_attempt(uuid, text) from anon;
grant  execute on function public.reserve_mpesa_attempt(uuid, text) to authenticated;

revoke execute on function public.mark_attempt_accepted(uuid, text, text, jsonb) from public;
revoke execute on function public.mark_attempt_accepted(uuid, text, text, jsonb) from anon;
revoke execute on function public.mark_attempt_accepted(uuid, text, text, jsonb) from authenticated;

revoke execute on function public.mark_attempt_failed(uuid, text, jsonb) from public;
revoke execute on function public.mark_attempt_failed(uuid, text, jsonb) from anon;
revoke execute on function public.mark_attempt_failed(uuid, text, jsonb) from authenticated;

revoke execute on function public.confirm_payment_attempt(uuid, numeric, text, text) from public;
revoke execute on function public.confirm_payment_attempt(uuid, numeric, text, text) from anon;
grant  execute on function public.confirm_payment_attempt(uuid, numeric, text, text) to authenticated;

revoke execute on function public.reconcile_payment_attempt_no_collection(uuid, text, text) from public;
revoke execute on function public.reconcile_payment_attempt_no_collection(uuid, text, text) from anon;
grant  execute on function public.reconcile_payment_attempt_no_collection(uuid, text, text) to authenticated;

revoke execute on function public.override_payment_status(uuid, text) from public;
revoke execute on function public.override_payment_status(uuid, text) from anon;
grant  execute on function public.override_payment_status(uuid, text) to authenticated;

revoke execute on function public.apply_mpesa_callback(text, text, integer, text, jsonb) from public;
revoke execute on function public.apply_mpesa_callback(text, text, integer, text, jsonb) from anon;
revoke execute on function public.apply_mpesa_callback(text, text, integer, text, jsonb) from authenticated;

revoke execute on function public.settle_zero_due_on_completion() from public;
revoke execute on function public.settle_zero_due_on_completion() from anon;
revoke execute on function public.settle_zero_due_on_completion() from authenticated;
