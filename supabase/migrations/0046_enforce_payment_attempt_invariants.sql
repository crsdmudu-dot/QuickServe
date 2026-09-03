-- ============================================================================
-- PRODUCTION PRECONDITION - READ BEFORE APPLYING.
--
-- DO NOT APPLY 0046 until the mandatory read-only production preflight confirms that ALL
-- historical payment_attempt rows already satisfy the invariants below. Unlike 0045, every
-- object in this migration can FAIL on legacy data, and that is deliberate: 0046 must fail
-- loudly rather than silently repair bad history.
--
-- The preflight must prove, read-only, on the target database:
--
--   1. no payment has more than one attempt in ('initiated','pending','timed_out')
--        select payment_id from public.payment_attempts
--         where status in ('initiated','pending','timed_out')
--         group by payment_id having count(*) > 1;            -- must return 0 rows
--
--   2. no duplicate non-null checkout_request_id
--        select checkout_request_id from public.payment_attempts
--         where checkout_request_id is not null
--         group by checkout_request_id having count(*) > 1;   -- must return 0 rows
--
--   3. no NULL or non-positive payment_attempts.amount
--        select count(*) from public.payment_attempts
--         where amount is null or amount <= 0;                -- must return 0
--
--   4. no paid payment holding a blocking attempt
--        select count(*) from public.payments p
--         where p.status = 'paid'
--           and exists (select 1 from public.payment_attempts a
--                        where a.payment_id = p.id
--                          and a.status in ('initiated','pending','timed_out'));   -- must return 0
--
--   5. timed_out attempts enumerated and reconciled as required
--        select count(*) from public.payment_attempts where status = 'timed_out';
--      Every such row freezes its payment's funding mix until a valid late callback settles it
--      or an admin records an evidenced no-collection reconciliation
--      (reconcile_payment_attempt_no_collection, 0045). They must be worked through BEFORE the
--      one-blocking-attempt index is enabled, or a legacy payment can be left permanently frozen.
--
-- If any check fails, resolve the underlying rows through the 0045 RPCs first. This migration
-- contains NO cleanup, NO reconciliation DML and NO backfill by design.
--
-- WHY THESE ARE NOT IN 0045. 0045 is forward-safe: its only constraint is
-- payment_attempts_amount_positive_check, added NOT VALID so new rows are constrained
-- immediately while legacy rows cannot block the deploy, and its only index covers
-- settlement_reference - a column 0045 itself introduces, so that partial index is provably
-- empty at creation and cannot fail. Everything here depends on history instead.
--
-- A partial UNIQUE INDEX cannot be created NOT VALID; that mechanism exists only for CHECK and
-- FOREIGN KEY constraints. There is therefore no deferred-validation path for objects 1 and 2 -
-- the preflight IS the gate.
--
-- SEMANTICS ARE UNCHANGED HERE. checkout_request_id keeps its existing meaning: the M-Pesa STK
-- REQUEST identifier. It is not, and does not become, proof of collection - that is
-- settlement_reference, introduced and uniqueness-enforced in 0045. Object 2 only removes the
-- ambiguity that let apply_mpesa_callback fall back on "order by created_at desc limit 1" when
-- locating an attempt.
-- ============================================================================

-- ----------------------------------------------------------------
-- 1. At most one attempt per payment may be capable of collecting.
--    Mirrors the procedural guard 0045 applies in initiate_payment_attempt,
--    reserve_mpesa_attempt, apply_wallet_to_payment, redeem_promo, confirm_payment_attempt and
--    apply_mpesa_callback. timed_out is included deliberately: it means "outcome unresolved",
--    not "safe failure", so it must keep blocking.
-- ----------------------------------------------------------------
create unique index if not exists payment_attempts_one_blocking_per_payment
  on public.payment_attempts (payment_id)
  where status in ('initiated','pending','timed_out');

-- ----------------------------------------------------------------
-- 2. A provider request identifier must identify exactly one attempt.
--    Without this, locating an attempt from a callback is ambiguous.
-- ----------------------------------------------------------------
create unique index if not exists payment_attempts_checkout_request_id_uq
  on public.payment_attempts (checkout_request_id)
  where checkout_request_id is not null;

-- ----------------------------------------------------------------
-- 3. Validate the CHECK that 0045 added NOT VALID. This scans every existing row and will fail
--    if any legacy attempt carries a NULL or non-positive amount.
-- ----------------------------------------------------------------
alter table public.payment_attempts validate constraint payment_attempts_amount_positive_check;
