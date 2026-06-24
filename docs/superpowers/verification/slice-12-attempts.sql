-- ============================================================
-- Slice 12 — Payment Attempts: RLS / RPC Verification Script
-- ============================================================
-- Run this against your Supabase project via:
--   psql <CONNECTION_STRING> -f slice-12-attempts.sql
-- or paste blocks into the Supabase SQL editor (Auth → SQL Editor).
--
-- Prerequisites:
--   • Two customer accounts:  CUSTOMER_A_ID, CUSTOMER_B_ID
--   • One provider account:   PROVIDER_ID
--   • One admin account:      ADMIN_ID
--   • A booking owned by customer_a, assigned to the provider,
--     with status = 'completed' and quote_status = 'accepted'.
--     Call it BOOKING_A_ID.
--   • The booking must already have a pending payments row
--     (created by the trg_create_payment_on_accept trigger).
--
-- Replace every <PLACEHOLDER> with a real UUID before running.
--
-- Migrations covered:
--   supabase/migrations/0011_payment_attempts.sql  (Slice 12 schema)
--   supabase/migrations/0010_payments.sql          (Slice 11: earnings trigger)
-- ============================================================

-- ============================================================
-- SETUP: helper variables (edit before running)
-- ============================================================
\set customer_a   '<CUSTOMER_A_ID>'
\set customer_b   '<CUSTOMER_B_ID>'
\set provider     '<PROVIDER_ID>'
\set admin        '<ADMIN_ID>'
\set booking_a    '<BOOKING_A_ID>'   -- completed, assigned to provider, payment pending

-- Derive the payment_id for booking_a (run once as admin after setup):
-- \set payment_a (select id from public.payments where booking_id = :'booking_a' limit 1)
-- Replace the placeholder below with the actual UUID returned.
\set payment_a    '<PAYMENT_A_ID>'

-- ============================================================
-- TEST 1a: Non-admin calling confirm_payment_attempt → rejected
-- ============================================================
-- Assumption 1: only an admin can confirm an attempt.
-- First create an attempt as customer_a (initiate), then try to confirm as customer.

-- Step 1: customer_a initiates an attempt
set local role authenticated;
set local request.jwt.claim.sub = :'customer_a';

select public.initiate_payment_attempt(
  :'payment_a',
  'mpesa',
  '+254700000001',
  'EXT-REF-001',
  '{"status": "queued"}'::jsonb
);
-- EXPECT: no error; returns a UUID (the attempt id)

-- Capture the attempt id for use below:
-- \set attempt_1 (select id from public.payment_attempts where payment_id = :'payment_a' order by created_at desc limit 1)
-- Replace the placeholder below with the returned UUID.
\set attempt_1 '<ATTEMPT_1_ID>'

-- Step 2: customer_a tries to confirm their own attempt — must be rejected
set local request.jwt.claim.sub = :'customer_a';

select public.confirm_payment_attempt(:'attempt_1');
-- EXPECT: ERROR — "Permission denied"

-- Step 3: provider tries to confirm — must also be rejected
set local request.jwt.claim.sub = :'provider';

select public.confirm_payment_attempt(:'attempt_1');
-- EXPECT: ERROR — "Permission denied"

-- ============================================================
-- TEST 1b: Admin calling confirm_payment_attempt → succeeds;
--          payment is set to 'paid'; payment_method is set
-- ============================================================
-- Assumption 1 (admin path) + Assumption 4 (payment_method set on confirm only).

set local request.jwt.claim.sub = :'admin';

select public.confirm_payment_attempt(:'attempt_1');
-- EXPECT: no error

-- Verify attempt status
select status
  from public.payment_attempts
  where id = :'attempt_1';
-- EXPECT: status = 'successful'

-- Verify payment transition
select status, paid_at, payment_method
  from public.payments
  where id = :'payment_a';
-- EXPECT: status='paid', paid_at IS NOT NULL, payment_method='mpesa'
-- (payment_method is set to the attempt's provider only by confirm_payment_attempt)

-- ============================================================
-- TEST 2a: Non-admin calling cancel_payment_attempt → rejected
-- ============================================================
-- Assumption 2: only an admin can cancel an attempt.
-- Create a fresh attempt to cancel (payment is now paid, so initiate will fail;
-- use a second payment from a separate booking for this test, or run TEST 2 before TEST 1).
--
-- NOTE: Run TEST 2 on a DIFFERENT (pending) payment. For isolation, set up:
--   BOOKING_B_ID — completed booking owned by customer_a, separate from booking_a
--   PAYMENT_B_ID — pending payment for booking_b
\set booking_b  '<BOOKING_B_ID>'
\set payment_b  '<PAYMENT_B_ID>'

set local request.jwt.claim.sub = :'customer_a';

select public.initiate_payment_attempt(
  :'payment_b',
  'cash',
  null,
  null,
  null
);
-- EXPECT: no error; returns a UUID

\set attempt_2 '<ATTEMPT_2_ID>'

-- customer_a tries to cancel — must be rejected
set local request.jwt.claim.sub = :'customer_a';

select public.cancel_payment_attempt(:'attempt_2');
-- EXPECT: ERROR — "Permission denied"

-- provider tries to cancel — must also be rejected
set local request.jwt.claim.sub = :'provider';

select public.cancel_payment_attempt(:'attempt_2');
-- EXPECT: ERROR — "Permission denied"

-- ============================================================
-- TEST 2b: Admin calling cancel_payment_attempt → succeeds
-- ============================================================

set local request.jwt.claim.sub = :'admin';

select public.cancel_payment_attempt(:'attempt_2');
-- EXPECT: no error

select status from public.payment_attempts where id = :'attempt_2';
-- EXPECT: status = 'cancelled'

-- Attempt to cancel again (terminal state guard):
select public.cancel_payment_attempt(:'attempt_2');
-- EXPECT: ERROR — "Attempt is already in a terminal state"

-- ============================================================
-- TEST 3: Customer cannot set a payment to 'paid' by any path
-- ============================================================
-- Assumption 3: no direct customer escalation path exists.
--
-- 3a. Direct UPDATE — blocked by RLS (no UPDATE policy on payments for customers):
set local request.jwt.claim.sub = :'customer_a';

update public.payments
  set status = 'paid'
  where id = :'payment_b';
-- EXPECT: 0 rows updated (RLS blocks the write; no error is raised but row count = 0)

select status from public.payments where id = :'payment_b';
-- EXPECT: status still = 'pending' (the update was silently filtered by RLS)

-- 3b. pay_payment was dropped in 0011_payment_attempts.sql (line: drop function if exists public.pay_payment):
select public.pay_payment(:'payment_b');
-- EXPECT: ERROR — function pay_payment(uuid) does not exist

-- 3c. initiate_payment_attempt does NOT touch the payment row (only inserts an attempt):
--     (Verified by reading the function body: INSERT into payment_attempts; no UPDATE on payments.)
--     After initiating, payment must still be 'pending':
set local request.jwt.claim.sub = :'customer_a';

select public.initiate_payment_attempt(
  :'payment_b',
  'card',
  null,
  'EXT-REF-CARD-001',
  '{"status": "initiated"}'::jsonb
);
-- EXPECT: no error (returns attempt UUID)

select status, payment_method
  from public.payments
  where id = :'payment_b';
-- EXPECT: status='pending', payment_method=NULL
-- (initiate never touches the payment row)

-- ============================================================
-- TEST 4: payment_method is set ONLY when confirm_payment_attempt runs
-- ============================================================
-- Assumption 4: already exercised in TEST 1b above (payment_method='mpesa').
-- Here, verify that after initiate only, payment_method remains NULL.

-- (Covered by TEST 3c: after initiate, payment_method=NULL — see EXPECT above.)

-- Additional check: after confirm, payment_method matches the attempt's provider:
select pa.provider, p.payment_method
  from public.payment_attempts pa
  join public.payments p on p.id = pa.payment_id
  where pa.id = :'attempt_1';
-- EXPECT: pa.provider = 'mpesa', p.payment_method = 'mpesa'  (they match)

-- ============================================================
-- TEST 5: provider_earnings created ONLY after payment status = 'paid'
--         (i.e. on confirm — not on initiate)
-- ============================================================
-- Assumption 5: the trigger trg_create_earning_on_paid fires on payments UPDATE
--               where new.status = 'paid'. initiate does not touch payments.
--
-- 5a. After initiate only, no earning row exists yet:
set local request.jwt.claim.sub = :'customer_a';

select public.initiate_payment_attempt(
  :'payment_b',
  'mpesa',
  '+254700000002',
  'EXT-REF-002',
  '{"status": "queued"}'::jsonb
);
-- EXPECT: no error

select count(*)
  from public.provider_earnings
  where booking_id = :'booking_b';
-- EXPECT: 0 rows  — no earning until payment is confirmed

-- 5b. After admin confirms the attempt (payment transitions to 'paid'), earning appears:
-- (Get the new attempt_id from payment_b's attempts)
\set attempt_3 '<ATTEMPT_3_ID>'   -- the mpesa attempt just initiated above

set local request.jwt.claim.sub = :'admin';

select public.confirm_payment_attempt(:'attempt_3');
-- EXPECT: no error

select count(*), payout_status, amount
  from public.provider_earnings
  where booking_id = :'booking_b'
  group by payout_status, amount;
-- EXPECT: count=1, payout_status='pending', amount = booking_b's provider_share
-- (trigger create_earning_on_paid inserted the row when payment.status → 'paid')

-- ============================================================
-- TEST 6: Providers cannot SELECT payment_attempts (no provider RLS path)
-- ============================================================
-- Assumption 6: RLS policy payment_attempts_select allows:
--   is_admin() OR (payment.customer_id = auth.uid())
-- A provider is neither; they see 0 rows.

set local request.jwt.claim.sub = :'provider';

select count(*) from public.payment_attempts;
-- EXPECT: 0 rows  — provider has no read path on payment_attempts

-- Double-check: the provider's own booking's attempts are also hidden
select count(*)
  from public.payment_attempts pa
  join public.payments p on p.id = pa.payment_id
  where p.booking_id = :'booking_a';
-- EXPECT: 0 rows  — RLS prevents the join from returning any rows

-- ============================================================
-- TEST 7: Customer A cannot SELECT customer B's attempts;
--         customer sees only attempts whose parent payment.customer_id = auth.uid()
-- ============================================================
-- Assumption 7: the subquery in the RLS policy checks payment.customer_id = auth.uid()

-- Setup: customer_b must have their own booking with a payment and at least one attempt.
-- (Create BOOKING_C_ID owned by customer_b, completed, with a pending payment.)
\set booking_c  '<BOOKING_C_ID>'
\set payment_c  '<PAYMENT_C_ID>'

-- First, customer_b creates an attempt on their own payment:
set local request.jwt.claim.sub = :'customer_b';

select public.initiate_payment_attempt(
  :'payment_c',
  'mpesa',
  '+254700000003',
  'EXT-REF-B-001',
  '{"status": "queued"}'::jsonb
);
-- EXPECT: no error

-- Now customer_a tries to read all attempts — should see NONE of customer_b's:
set local request.jwt.claim.sub = :'customer_a';

select count(*)
  from public.payment_attempts pa
  join public.payments p on p.id = pa.payment_id
  where p.booking_id = :'booking_c';
-- EXPECT: 0 rows  — RLS: p.customer_id = customer_b ≠ auth.uid() (customer_a)

-- Customer_a sees only their own attempts:
select count(*)
  from public.payment_attempts pa
  join public.payments p on p.id = pa.payment_id
  where p.booking_id = :'booking_a';
-- EXPECT: ≥1 row  (attempts created for booking_a above belong to customer_a)

-- Customer_b sees only their own attempts:
set local request.jwt.claim.sub = :'customer_b';

select count(*)
  from public.payment_attempts pa
  join public.payments p on p.id = pa.payment_id
  where p.booking_id = :'booking_a';
-- EXPECT: 0 rows  — booking_a belongs to customer_a; invisible to customer_b

-- ============================================================
-- TEST 8: Confirm cancels all sibling open attempts (same payment)
-- ============================================================
-- When confirm_payment_attempt succeeds, all OTHER pending/initiated attempts
-- on the same payment are set to 'cancelled'.

-- Setup: create two attempts on payment_b's sibling (use a new PAYMENT_D_ID)
\set booking_d  '<BOOKING_D_ID>'
\set payment_d  '<PAYMENT_D_ID>'

set local request.jwt.claim.sub = :'customer_a';

select public.initiate_payment_attempt(:'payment_d','mpesa','+254700000004','EXT-D-1','{"s":1}'::jsonb);
select public.initiate_payment_attempt(:'payment_d','card',null,'EXT-D-2','{"s":2}'::jsonb);
-- EXPECT: two UUIDs returned (two separate pending attempts on the same payment)

-- Confirm one (admin):
\set attempt_d1 '<ATTEMPT_D1_ID>'   -- the mpesa one

set local request.jwt.claim.sub = :'admin';
select public.confirm_payment_attempt(:'attempt_d1');
-- EXPECT: no error

-- Verify the confirmed attempt is 'successful'; the card sibling is 'cancelled':
select id, provider, status
  from public.payment_attempts
  where payment_id = :'payment_d'
  order by created_at;
-- EXPECT:
--   attempt_d1  mpesa  successful
--   attempt_d2  card   cancelled

-- ============================================================
-- TEST 9: Re-confirming an already-successful attempt is a no-op
-- ============================================================
-- confirm_payment_attempt checks: status not in ('initiated','pending') → raises exception.
-- After TEST 8, attempt_d1 is 'successful'; trying to re-confirm must be rejected.

set local request.jwt.claim.sub = :'admin';
select public.confirm_payment_attempt(:'attempt_d1');
-- EXPECT: ERROR — "Payment attempt is not in a confirmable status (must be initiated or pending)"

-- Also: the payment for booking_d should still be 'paid' (not double-billed):
select status, payment_method from public.payments where id = :'payment_d';
-- EXPECT: status='paid', payment_method='mpesa'  (unchanged from first confirm)

-- ============================================================
-- TEST 10: pay_payment no longer exists (dropped in 0011)
-- ============================================================
-- Assumption from checklist: drop function if exists public.pay_payment(uuid) was applied.
-- Any call to pay_payment must return a "function does not exist" error.

select public.pay_payment(:'payment_a');
-- EXPECT: ERROR — function pay_payment(uuid) does not exist
-- (This function was retired in 0011_payment_attempts.sql to prevent customers from
--  self-authorising payment completion outside the attempt flow.)

-- ============================================================
-- DESIGN NOTES (not tested here; document for human review)
-- ============================================================
--
-- NOTE A (Intentional admin escape hatch):
--   override_payment_status (0010_payments.sql) is still present and can set
--   status='paid' directly without a confirmed attempt. This also fires
--   trg_create_earning_on_paid. This is intentional for admin edge-case recovery
--   (e.g. payment confirmed externally without an attempt record). It is admin-only
--   and SECURITY DEFINER; it is NOT a bug. Operators should use confirm_payment_attempt
--   for normal flows and reserve override_payment_status for manual reconciliation.
--
-- NOTE B (Visible provider_share):
--   Customers can read provider_share from their own payments row (via payments_select).
--   Same known design trade-off documented in slice-11-rls.sql ITEM B; acceptable for MVP.
-- ============================================================
