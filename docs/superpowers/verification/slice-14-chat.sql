-- ============================================================
-- Slice 14 — In-App Chat: RLS / Function Verification Script
-- ============================================================
-- Run this against your Supabase project via:
--   psql <CONNECTION_STRING> -f slice-14-chat.sql
-- or paste blocks into the Supabase SQL editor (Auth → SQL Editor).
--
-- Migration covered:
--   supabase/migrations/0013_booking_messages.sql
--
-- Schema created by that migration:
--   Table: public.booking_messages
--     id           uuid        PK  default gen_random_uuid()
--     booking_id   uuid        NOT NULL  → bookings(id) ON DELETE CASCADE
--     sender_id    uuid        NOT NULL  → profiles(id)
--     message_text text        NOT NULL  CHECK (char_length(btrim(message_text)) BETWEEN 1 AND 2000)
--     created_at   timestamptz NOT NULL  default now()
--     read_at      timestamptz           NULL (reserved; not written this slice)
--   Index: booking_messages_booking_created_idx ON (booking_id, created_at)
--   RLS: ENABLED
--
--   Function: public.get_chat_peer_name(p_booking_id uuid) → text
--     SECURITY DEFINER (bypasses RLS on profiles)
--     • caller = booking.customer_id   → provider full_name
--     • caller = booking.assigned_provider_id → split_part(customer full_name, ' ', 1)
--     • caller is neither (admin / non-participant / unknown booking) → NULL
--
-- Prerequisites:
--   • Three user accounts:
--       CUSTOMER_A_ID  — owns BOOKING_A
--       CUSTOMER_B_ID  — a different customer (no relation to BOOKING_A)
--       PROVIDER_ID    — assigned provider for BOOKING_A
--       PROVIDER_B_ID  — a second provider NOT assigned to BOOKING_A
--       ADMIN_ID       — role='admin' in public.profiles
--   • One ACTIVE booking (BOOKING_A_ID):
--       customer_id            = CUSTOMER_A_ID
--       assigned_provider_id   = PROVIDER_ID   (NOT NULL)
--       status                 = 'in_progress'  (not 'completed' or 'cancelled')
--   • One COMPLETED booking (BOOKING_DONE_ID):
--       customer_id            = CUSTOMER_A_ID
--       assigned_provider_id   = PROVIDER_ID
--       status                 = 'completed'
--   • One UNASSIGNED booking (BOOKING_UNASSIGNED_ID):
--       customer_id            = CUSTOMER_A_ID
--       assigned_provider_id   = NULL
--       status                 = 'pending'
--
-- Replace every <PLACEHOLDER> with a real UUID before running.
-- ============================================================

-- ============================================================
-- SETUP: helper variables (edit before running)
-- ============================================================
\set customer_a          '<CUSTOMER_A_ID>'
\set customer_b          '<CUSTOMER_B_ID>'
\set provider            '<PROVIDER_ID>'
\set provider_b          '<PROVIDER_B_ID>'
\set admin               '<ADMIN_ID>'
\set booking_active      '<BOOKING_A_ID>'          -- in_progress, provider assigned
\set booking_done        '<BOOKING_DONE_ID>'        -- completed, provider assigned
\set booking_unassigned  '<BOOKING_UNASSIGNED_ID>'  -- pending, assigned_provider_id IS NULL

-- ============================================================
-- TEST 1: Customer can SELECT + INSERT for their OWN booking
--         (booking is active and provider is assigned)
-- ============================================================
-- Policy: booking_messages_select — USING (exists(select 1 from bookings b where b.id = booking_id
--   and (b.customer_id = auth.uid() or b.assigned_provider_id = auth.uid() or is_admin())))
-- Policy: booking_messages_insert — WITH CHECK (sender_id = auth.uid() and exists(... and
--   b.assigned_provider_id is not null and b.status not in ('completed','cancelled') and
--   (b.customer_id = auth.uid() or b.assigned_provider_id = auth.uid())))

set local role authenticated;
set local request.jwt.claim.sub = :'customer_a';

-- 1a. INSERT a message as the customer into their own booking:
insert into public.booking_messages (booking_id, sender_id, message_text)
  values (:'booking_active', :'customer_a', 'Hello from customer');
-- EXPECT: INSERT 1 row (no error)

-- 1b. SELECT messages for own booking — should see the row just inserted:
select count(*)
  from public.booking_messages
  where booking_id = :'booking_active';
-- EXPECT: 1 row (at minimum; the one just inserted)

-- ============================================================
-- TEST 2: Assigned provider can SELECT + INSERT for their assigned booking
-- ============================================================

set local request.jwt.claim.sub = :'provider';

-- 2a. Provider INSERT into the same active booking:
insert into public.booking_messages (booking_id, sender_id, message_text)
  values (:'booking_active', :'provider', 'Hello from provider');
-- EXPECT: INSERT 1 row (no error)

-- 2b. Provider SELECT — sees all messages in the booking (both from TEST 1a and 2a):
select count(*)
  from public.booking_messages
  where booking_id = :'booking_active';
-- EXPECT: 2 rows (customer + provider message)

-- ============================================================
-- TEST 3: A different customer / an unassigned provider can
--         NEITHER SELECT NOR INSERT
-- ============================================================

-- 3a. customer_b SELECT on booking_active (customer_b is not the owner):
set local request.jwt.claim.sub = :'customer_b';

select count(*)
  from public.booking_messages
  where booking_id = :'booking_active';
-- EXPECT: 0 rows (RLS hides rows; b.customer_id = customer_a ≠ auth.uid())

-- 3b. customer_b INSERT attempt — must be silently blocked (RLS returns 0 rows, no error):
insert into public.booking_messages (booking_id, sender_id, message_text)
  values (:'booking_active', :'customer_b', 'Intruder message');
-- EXPECT: ERROR — violates row-level security policy for table "booking_messages"
--         (WITH CHECK on INSERT raises a permission error, unlike SELECT which silently returns 0)

-- 3c. provider_b SELECT (not assigned to booking_active):
set local request.jwt.claim.sub = :'provider_b';

select count(*)
  from public.booking_messages
  where booking_id = :'booking_active';
-- EXPECT: 0 rows (b.assigned_provider_id = provider ≠ auth.uid() = provider_b)

-- 3d. provider_b INSERT attempt:
insert into public.booking_messages (booking_id, sender_id, message_text)
  values (:'booking_active', :'provider_b', 'Unassigned provider message');
-- EXPECT: ERROR — violates row-level security policy for table "booking_messages"

-- ============================================================
-- TEST 4: Admin can SELECT ALL messages (across all bookings)
-- ============================================================
-- Policy: booking_messages_select includes OR public.is_admin()

set local request.jwt.claim.sub = :'admin';

select count(*)
  from public.booking_messages;
-- EXPECT: ≥2 rows (all messages inserted above; admin sees everything)

select count(*)
  from public.booking_messages
  where booking_id = :'booking_active';
-- EXPECT: 2 rows (customer + provider messages from TEST 1 and 2)

-- ============================================================
-- TEST 5: Admin INSERT is REJECTED (no admin insert policy exists)
-- ============================================================
-- The booking_messages_insert WITH CHECK clause requires:
--   (b.customer_id = auth.uid() OR b.assigned_provider_id = auth.uid())
-- An admin's auth.uid() is never the customer_id or assigned_provider_id of a booking,
-- so this condition is FALSE even though is_admin() is TRUE — admin cannot INSERT.

set local request.jwt.claim.sub = :'admin';

insert into public.booking_messages (booking_id, sender_id, message_text)
  values (:'booking_active', :'admin', 'Admin trying to chat');
-- EXPECT: ERROR — violates row-level security policy for table "booking_messages"
--         (admin is not b.customer_id nor b.assigned_provider_id)

-- ============================================================
-- TEST 6: INSERT blocked when assigned_provider_id IS NULL
--         or when booking status IN ('completed', 'cancelled')
-- ============================================================

-- 6a. Unassigned booking (assigned_provider_id IS NULL) — customer_a tries to INSERT:
set local request.jwt.claim.sub = :'customer_a';

insert into public.booking_messages (booking_id, sender_id, message_text)
  values (:'booking_unassigned', :'customer_a', 'Message to unassigned booking');
-- EXPECT: ERROR — violates row-level security policy for table "booking_messages"
--         (INSERT WITH CHECK: b.assigned_provider_id IS NOT NULL fails)

-- 6b. Completed booking (status = 'completed') — customer_a tries to INSERT:
insert into public.booking_messages (booking_id, sender_id, message_text)
  values (:'booking_done', :'customer_a', 'Message to completed booking');
-- EXPECT: ERROR — violates row-level security policy for table "booking_messages"
--         (INSERT WITH CHECK: b.status not in ('completed','cancelled') fails)

-- 6c. Verify SELECT still works on the completed booking (history is readable):
-- The SELECT policy does NOT restrict by booking status — chat history survives completion.
select count(*)
  from public.booking_messages
  where booking_id = :'booking_done';
-- EXPECT: 0 rows (no messages were ever inserted there in this test run)
-- NOTE: If you insert messages to booking_done BEFORE it reaches 'completed' status,
-- customer_a and provider can still read them after completion. This is intentional:
-- the SELECT policy only checks participant membership, not booking status.

-- ============================================================
-- TEST 7: No UPDATE and no DELETE possible by anyone
--         (no such policies exist; read_at is never written by users)
-- ============================================================

-- 7a. Customer tries to UPDATE their own message (mark as read):
set local request.jwt.claim.sub = :'customer_a';

update public.booking_messages
  set read_at = now()
  where booking_id = :'booking_active'
    and sender_id = :'provider';
-- EXPECT: 0 rows updated (no UPDATE policy → RLS silently blocks; no error raised,
--         but row count = 0 — verify with: GET DIAGNOSTICS n = ROW_COUNT)

-- Verify read_at remains NULL (the UPDATE was a no-op):
select read_at
  from public.booking_messages
  where booking_id = :'booking_active'
    and sender_id = :'provider'
  limit 1;
-- EXPECT: read_at IS NULL (unchanged)

-- 7b. Provider tries to DELETE their own message:
set local request.jwt.claim.sub = :'provider';

delete from public.booking_messages
  where booking_id = :'booking_active'
    and sender_id = :'provider';
-- EXPECT: 0 rows deleted (no DELETE policy → RLS silently blocks)

-- Confirm the row still exists:
select count(*)
  from public.booking_messages
  where booking_id = :'booking_active'
    and sender_id = :'provider';
-- EXPECT: 1 row (message still present)

-- 7c. Admin tries to DELETE all messages:
set local request.jwt.claim.sub = :'admin';

delete from public.booking_messages
  where booking_id = :'booking_active';
-- EXPECT: 0 rows deleted (no DELETE policy; even admin cannot delete)

-- 7d. Confirm messages still there after delete attempts:
select count(*)
  from public.booking_messages
  where booking_id = :'booking_active';
-- EXPECT: 2 rows (both messages intact)

-- ============================================================
-- TEST 8: message_text CHECK constraint rejects empty/blank
--         strings and strings longer than 2000 characters
-- ============================================================
-- Constraint: CHECK (char_length(btrim(message_text)) BETWEEN 1 AND 2000)
-- btrim trims leading/trailing whitespace (spaces, tabs, newlines).
-- The INSERT policy is irrelevant here — the CHECK constraint fires at the DB layer
-- regardless of who inserts. We use a context where the INSERT policy would pass
-- (customer_a on their active booking) to isolate the constraint check.

set local request.jwt.claim.sub = :'customer_a';

-- 8a. Empty string:
insert into public.booking_messages (booking_id, sender_id, message_text)
  values (:'booking_active', :'customer_a', '');
-- EXPECT: ERROR — violates check constraint "booking_messages_message_text_check"
--         (char_length(btrim('')) = 0; not between 1 and 2000)

-- 8b. Whitespace-only string (spaces only):
insert into public.booking_messages (booking_id, sender_id, message_text)
  values (:'booking_active', :'customer_a', '   ');
-- EXPECT: ERROR — violates check constraint "booking_messages_message_text_check"
--         (btrim('   ') = ''; char_length = 0; not between 1 and 2000)

-- 8c. Tab-only string:
insert into public.booking_messages (booking_id, sender_id, message_text)
  values (:'booking_active', :'customer_a', E'\t\t');
-- EXPECT: ERROR — violates check constraint "booking_messages_message_text_check"

-- 8d. String of exactly 2001 characters (one over the limit):
insert into public.booking_messages (booking_id, sender_id, message_text)
  values (:'booking_active', :'customer_a', repeat('x', 2001));
-- EXPECT: ERROR — violates check constraint "booking_messages_message_text_check"
--         (char_length = 2001; not between 1 and 2000)

-- 8e. String of exactly 2000 characters (at the limit — must succeed):
insert into public.booking_messages (booking_id, sender_id, message_text)
  values (:'booking_active', :'customer_a', repeat('x', 2000));
-- EXPECT: INSERT 1 row (no error; 2000 is the inclusive upper bound)

-- 8f. Single character (minimum valid length):
insert into public.booking_messages (booking_id, sender_id, message_text)
  values (:'booking_active', :'customer_a', 'x');
-- EXPECT: INSERT 1 row (no error; 1 is the inclusive lower bound)

-- 8g. String padded with whitespace but non-empty core (btrim should not strip internal):
insert into public.booking_messages (booking_id, sender_id, message_text)
  values (:'booking_active', :'customer_a', '  hello  ');
-- EXPECT: INSERT 1 row (btrim('  hello  ') = 'hello'; char_length = 5; valid)

-- ============================================================
-- TEST 9: get_chat_peer_name(booking_id) — peer name resolution
-- ============================================================
-- The function is SECURITY DEFINER, so it bypasses profiles RLS.
-- Caller context is set via request.jwt.claim.sub as usual for Supabase.
--
-- Expected behaviour:
--   • caller = booking.customer_id       → provider's full_name (never split)
--   • caller = booking.assigned_provider_id → split_part(customer_full_name, ' ', 1)
--                                             (first name only; privacy: last name hidden)
--   • caller is neither (admin / non-participant / unknown booking) → NULL
--   • phone and email are NEVER returned (function only queries profiles.full_name)

-- 9a. Customer caller → should see the assigned provider's FULL name:
set local request.jwt.claim.sub = :'customer_a';

select public.get_chat_peer_name(:'booking_active');
-- EXPECT: the full_name value from profiles WHERE id = PROVIDER_ID
--         (e.g. 'John Doe' if that is the provider's registered full_name)
--         NOT NULL (assuming provider has a full_name set)

-- 9b. Assigned provider caller → should see customer's FIRST name only:
set local request.jwt.claim.sub = :'provider';

select public.get_chat_peer_name(:'booking_active');
-- EXPECT: split_part(customer_full_name, ' ', 1) — the substring before the first space
--         (e.g. if customer full_name = 'Alice Smith', result is 'Alice')
--         If full_name has no space (single token), split_part returns the whole token.
--         If full_name is NULL, split_part(NULL, ' ', 1) returns NULL.

-- 9c. Non-participant (different customer) caller → NULL:
set local request.jwt.claim.sub = :'customer_b';

select public.get_chat_peer_name(:'booking_active');
-- EXPECT: NULL
--         (auth.uid() = customer_b ≠ v_customer_id AND ≠ v_assigned_provider_id → else branch)

-- 9d. Unassigned provider caller → NULL:
set local request.jwt.claim.sub = :'provider_b';

select public.get_chat_peer_name(:'booking_active');
-- EXPECT: NULL (provider_b is not the assigned provider for this booking)

-- 9e. Admin caller → NULL:
set local request.jwt.claim.sub = :'admin';

select public.get_chat_peer_name(:'booking_active');
-- EXPECT: NULL
--         (admin's uid is not customer_id or assigned_provider_id → else returns null)

-- 9f. Unknown booking_id → NULL:
set local request.jwt.claim.sub = :'customer_a';

select public.get_chat_peer_name('00000000-0000-0000-0000-000000000000');
-- EXPECT: NULL (not found → early return null)

-- 9g. Verify NO phone or email is ever returned by the function:
--     The function only queries profiles.full_name (never phone, email, or any auth.users column).
--     Confirmed by reading the function body: single SELECT into v_result from profiles WHERE id = ...
--     No phone/email column is referenced. This is a static assertion (no runtime check needed).
-- STATIC PASS: function body at 0013_booking_messages.sql lines 52-60 queries only full_name.

-- ============================================================
-- DESIGN NOTES — NOT bugs; documenting intentional decisions
-- ============================================================
--
-- NOTE A (Intentional): Chat history readable after booking completes.
--   The SELECT policy does NOT filter by booking status. Messages inserted while
--   booking was active remain readable (by customer + provider) after the booking
--   reaches 'completed' or 'cancelled'. This allows users to review past conversations.
--   The INSERT policy still blocks new messages on closed bookings (TEST 6b).
--   Decision: correct and intentional for MVP.
--
-- NOTE B (Intentional): Admin can read but not write.
--   Admin SELECT is allowed (is_admin() in SELECT policy). Admin INSERT is rejected
--   because the INSERT WITH CHECK requires auth.uid() to be either customer_id or
--   assigned_provider_id — an admin user is never stored in those booking FK columns.
--   This is the correct design: admins observe but do not inject messages.
--
-- NOTE C (Intentional): read_at column is reserved but never written.
--   No UPDATE policy exists. Even if a client sends an UPDATE, RLS silently ignores it
--   (0 rows updated). A future "mark as read" feature must be implemented as a
--   SECURITY DEFINER RPC to avoid adding a broad UPDATE policy.
--
-- NOTE D (Minor): split_part behaviour when full_name is a single word.
--   split_part('Alice', ' ', 1) returns 'Alice' (the whole string), not ''.
--   This is correct: providers see the customer's first name, which is the full_name
--   when no surname is stored. Not a bug.
--
-- NOTE E (Minor): is_admin() caches a SELECT on profiles.
--   Used in the SELECT policy. Performance impact is minimal on small tables;
--   Supabase caches the function result within a single statement evaluation.
-- ============================================================
