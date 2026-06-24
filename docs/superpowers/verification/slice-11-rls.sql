-- ============================================================
-- Slice 11 — Payments & Wallets: RLS / RPC Verification Script
-- ============================================================
-- Run this against your Supabase project via:
--   psql <CONNECTION_STRING> -f slice-11-rls.sql
-- or paste blocks into the Supabase SQL editor (Auth → SQL Editor).
--
-- Prerequisites:
--   • Two customer accounts: CUSTOMER_A_ID, CUSTOMER_B_ID
--   • One provider account:  PROVIDER_ID
--   • One admin account:     ADMIN_ID
--   • A booking owned by customer A, assigned to the provider,
--     with status = 'completed'.  Call it BOOKING_A_ID.
--
-- Replace every <PLACEHOLDER> with a real UUID before running.
-- ============================================================

-- ============================================================
-- SETUP: helper variables (edit before running)
-- ============================================================
\set customer_a  '<CUSTOMER_A_ID>'
\set customer_b  '<CUSTOMER_B_ID>'
\set provider    '<PROVIDER_ID>'
\set admin       '<ADMIN_ID>'
\set booking_a   '<BOOKING_A_ID>'   -- owned by customer_a, assigned to provider, status=completed

-- ============================================================
-- TEST 1: set_quote rejects non-admin
-- ============================================================
-- Expected: raises 'Permission denied' for customer and provider.
-- Run as customer_a:
set local role authenticated;
set local request.jwt.claim.sub = :'customer_a';

select public.set_quote(:'booking_a', 1000, 800);
-- EXPECT: ERROR — "Permission denied"

-- Run as provider:
set local request.jwt.claim.sub = :'provider';

select public.set_quote(:'booking_a', 1000, 800);
-- EXPECT: ERROR — "Permission denied"

-- ============================================================
-- TEST 1b: set_quote succeeds as admin, sets correct fields
-- ============================================================
-- Run as admin:
set local request.jwt.claim.sub = :'admin';

select public.set_quote(:'booking_a', 1000, 800);
-- EXPECT: no error

select quoted_amount, provider_share, quote_status
  from public.bookings
  where id = :'booking_a';
-- EXPECT: quoted_amount=1000, provider_share=800, quote_status='sent'

-- ============================================================
-- TEST 2: set_quote rejects provider_share > amount
-- ============================================================
-- Run as admin:
set local request.jwt.claim.sub = :'admin';

select public.set_quote(:'booking_a', 1000, 1001);
-- EXPECT: ERROR — "provider_share must be between 0 and amount"

-- Also verify the DB constraint on payments table (provider_share + quickserve_share = amount):
-- (This is enforced by payments_shares_check CHECK constraint, not just the RPC guard.)

-- ============================================================
-- TEST 3a: accept_quote creates exactly one pending payment
-- ============================================================
-- First make sure quote_status = 'sent' (run TEST 1b above first).
-- Run as customer_a:
set local request.jwt.claim.sub = :'customer_a';

select public.accept_quote(:'booking_a');
-- EXPECT: no error

select count(*), status, amount, provider_share, quickserve_share
  from public.payments
  where booking_id = :'booking_a'
  group by status, amount, provider_share, quickserve_share;
-- EXPECT: count=1, status='pending', amount=1000, provider_share=800, quickserve_share=200

-- ============================================================
-- TEST 3b: re-accepting (idempotency) creates no duplicate
-- ============================================================
-- The trigger uses ON CONFLICT (booking_id) DO NOTHING.
-- Forcibly re-run the trigger scenario by updating booking to re-trigger:
--   (In practice, accept_quote guards against this with quote_status='sent' check.)
-- Verify at DB level via direct INSERT conflict:

insert into public.payments (booking_id, customer_id, amount, provider_share, quickserve_share)
  values (:'booking_a', :'customer_a', 1000, 800, 200)
  on conflict (booking_id) do nothing;

select count(*) from public.payments where booking_id = :'booking_a';
-- EXPECT: still 1 (unique constraint on booking_id prevents duplicates)

-- ============================================================
-- TEST 4: Customer B cannot SELECT customer A's payment (RLS)
-- ============================================================
-- Run as customer_b:
set local request.jwt.claim.sub = :'customer_b';

select id from public.payments where booking_id = :'booking_a';
-- EXPECT: 0 rows (RLS policy: customer_id = auth.uid() — customer_b's uid ≠ customer_a)

-- ============================================================
-- TEST 5: Provider cannot SELECT any payments row (RLS)
-- ============================================================
-- The payments_select policy allows: customer_id = auth.uid() OR is_admin().
-- A provider is neither the customer_id nor an admin.
-- Run as provider:
set local request.jwt.claim.sub = :'provider';

select count(*) from public.payments;
-- EXPECT: 0 rows visible

-- ============================================================
-- TEST 6a: pay_payment rejected before booking is completed
-- ============================================================
-- Create a second booking owned by customer_a with status='accepted' (not completed).
-- Then try to pay its payment.

-- (Manually create a booking_b with status='accepted', quote accepted → payment row created.)
-- Assume BOOKING_B_ID is a booking with status='accepted' and a pending payment PAYMENT_B_ID.
\set booking_b  '<BOOKING_B_ID>'   -- status='accepted', NOT completed
\set payment_b  '<PAYMENT_B_ID>'   -- pending payment for booking_b

set local request.jwt.claim.sub = :'customer_a';
select public.pay_payment(:'payment_b');
-- EXPECT: ERROR — "Payment cannot be completed (not found, not yours, not pending, or booking not completed)"

-- ============================================================
-- TEST 6b: pay_payment succeeds for owner when booking is completed
-- ============================================================
-- booking_a is already status='completed' (from setup).
-- Get its payment ID:
\set payment_a_id (select id from public.payments where booking_id = :'booking_a' limit 1)

set local request.jwt.claim.sub = :'customer_a';
select public.pay_payment(:'payment_a_id');
-- EXPECT: no error

select status, paid_at
  from public.payments
  where booking_id = :'booking_a';
-- EXPECT: status='paid', paid_at IS NOT NULL

-- ============================================================
-- TEST 7a: Paying creates exactly one provider_earnings row (pending)
-- ============================================================
select count(*), payout_status, amount
  from public.provider_earnings
  where booking_id = :'booking_a'
  group by payout_status, amount;
-- EXPECT: count=1, payout_status='pending', amount=800 (= provider_share)

-- ============================================================
-- TEST 7b: Completing a booking WITHOUT payment creates NO earning
-- ============================================================
-- This is guaranteed by the trigger: create_earning_on_paid fires only on
-- payments status transition to 'paid'. If a booking is marked completed
-- without a payment being paid, no earning row is inserted.
-- Verify: create a booking that reaches completed status without any payment paid.
\set booking_c '<BOOKING_C_ID>'   -- completed booking, no payment paid

select count(*) from public.provider_earnings where booking_id = :'booking_c';
-- EXPECT: 0 rows

-- ============================================================
-- TEST 8: Customer cannot SELECT provider_earnings; provider sees only own
-- ============================================================
-- Run as customer_a:
set local request.jwt.claim.sub = :'customer_a';

select count(*) from public.provider_earnings;
-- EXPECT: 0 rows (RLS: provider_id = auth.uid() OR is_admin() — customer is neither)

-- Run as provider (who is assigned to booking_a):
set local request.jwt.claim.sub = :'provider';

select count(*) from public.provider_earnings;
-- EXPECT: 1 row (their own earning for booking_a)

-- Run as a different provider (PROVIDER_B_ID) who has no bookings:
\set provider_b '<PROVIDER_B_ID>'
set local request.jwt.claim.sub = :'provider_b';

select count(*) from public.provider_earnings;
-- EXPECT: 0 rows

-- ============================================================
-- TEST 9a: override_payment_status rejected for non-admin
-- ============================================================
set local request.jwt.claim.sub = :'customer_a';

select public.override_payment_status(:'payment_a_id', 'refunded');
-- EXPECT: ERROR — "Permission denied"

set local request.jwt.claim.sub = :'provider';

select public.override_payment_status(:'payment_a_id', 'refunded');
-- EXPECT: ERROR — "Permission denied"

-- ============================================================
-- TEST 9b: override_payment_status succeeds for admin
-- ============================================================
set local request.jwt.claim.sub = :'admin';

select public.override_payment_status(:'payment_a_id', 'refunded');
-- EXPECT: no error

select status, paid_at from public.payments where id = :'payment_a_id';
-- EXPECT: status='refunded', paid_at=NULL (case when sets null for non-paid)

-- Reset back to paid for payout test:
select public.override_payment_status(:'payment_a_id', 'paid');

-- ============================================================
-- TEST 9c: mark_payout_paid rejected for non-admin; succeeds for admin
-- ============================================================
\set earning_a (select id from public.provider_earnings where booking_id = :'booking_a' limit 1)

set local request.jwt.claim.sub = :'customer_a';
select public.mark_payout_paid(:'earning_a');
-- EXPECT: ERROR — "Permission denied"

set local request.jwt.claim.sub = :'provider';
select public.mark_payout_paid(:'earning_a');
-- EXPECT: ERROR — "Permission denied"

set local request.jwt.claim.sub = :'admin';
select public.mark_payout_paid(:'earning_a');
-- EXPECT: no error

select payout_status from public.provider_earnings where id = :'earning_a';
-- EXPECT: payout_status='paid'

-- ============================================================
-- DEFERRED DESIGN ITEMS (do not add to tests; document for human review)
-- ============================================================
-- ITEM A (Minor → Important): provider_share is stored on public.bookings.
--   Customers have a select_own policy on bookings → they can read provider_share
--   from the bookings row directly (not just through the payments row).
--   The UI treats this as non-sensitive; the DB cannot hide it without a separate
--   quotes table or a column-level security view.
--   Merge decision: acceptable for MVP; revisit if business requires split opacity.
--
-- ITEM B (Minor): pay_payment and payment_select RPCs return all columns including
--   provider_share and quickserve_share. Customers can see the split amounts.
--   Same root cause as Item A; same recommendation.
--   Merge decision: acceptable for MVP; add a restricted view (payments_customer_view)
--   that omits split columns if opacity is required before launch.
-- ============================================================
