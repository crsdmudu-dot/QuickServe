-- ============================================================
-- Slice 15 — Push Notifications: RLS & Security SQL Checks
-- ============================================================
-- Run these cases against your Supabase project using the
-- SQL editor or psql.  Substitute real UUIDs as noted.
-- ============================================================

-- ─── Setup helpers ───────────────────────────────────────────────────────────
-- Replace these with real user UUIDs from auth.users.
-- user_a and user_b must both exist and have rows in public.profiles.

-- \set user_a_id  '<uuid-of-user-a>'
-- \set user_b_id  '<uuid-of-user-b>'
-- \set admin_id   '<uuid-of-admin-user>'    -- a user where is_admin() = true

-- ─── 1. User can SELECT / INSERT / UPDATE / DELETE only their own tokens ─────

-- 1a. Sign in as user_a (anon key + user_a JWT in Authorization header).
--     SELECT should return only user_a's tokens.
select count(*) as "user_a sees only own tokens"
from public.device_tokens
where user_id = auth.uid();  -- should equal total rows for user_a; 0 if none yet.

-- 1b. INSERT a token for user_a — succeeds (user_id = auth.uid()).
insert into public.device_tokens (user_id, platform, push_token)
values (auth.uid(), 'android', 'ExponentPushToken[test_user_a]');

-- 1c. UPDATE own token — succeeds.
update public.device_tokens
set last_seen_at = now()
where user_id = auth.uid()
  and push_token = 'ExponentPushToken[test_user_a]';

-- 1d. DELETE own token — succeeds.
delete from public.device_tokens
where user_id = auth.uid()
  and push_token = 'ExponentPushToken[test_user_a]';

-- ─── 2. User cannot SELECT another user's tokens ──────────────────────────────

-- Signed in as user_a: attempt to read user_b's tokens.
-- Expect: 0 rows returned (RLS filters them out, not a permission error).
select count(*) as "user_a cannot see user_b tokens (expect 0)"
from public.device_tokens
where user_id = '<uuid-of-user-b>';

-- ─── 3. User cannot INSERT a token for another user ──────────────────────────

-- Signed in as user_a: attempt to insert a row owned by user_b.
-- Expect: RLS violation error (new check: user_id = auth.uid() fails).
insert into public.device_tokens (user_id, platform, push_token)
values ('<uuid-of-user-b>', 'android', 'ExponentPushToken[spoofed]');
-- Expected: ERROR: new row violates row-level security policy

-- ─── 4. User cannot UPDATE another user's token ──────────────────────────────

-- Signed in as user_a: attempt to update user_b's row.
-- Expect: 0 rows affected (USING clause blocks matching).
update public.device_tokens
set last_seen_at = now()
where user_id = '<uuid-of-user-b>';
-- Expected: UPDATE 0

-- ─── 5. User cannot DELETE another user's token ──────────────────────────────

-- Signed in as user_a: attempt to delete user_b's row.
-- Expect: 0 rows affected.
delete from public.device_tokens
where user_id = '<uuid-of-user-b>';
-- Expected: DELETE 0

-- ─── 6. Admin can SELECT all tokens ──────────────────────────────────────────

-- Signed in as admin (is_admin() = true): SELECT returns all users' tokens.
-- The device_tokens_select policy is: user_id = auth.uid() OR public.is_admin()
select count(*) as "admin sees all tokens"
from public.device_tokens;
-- Expected: total row count across all users.

-- ─── 7. Admin cannot INSERT a token ──────────────────────────────────────────

-- Signed in as admin: INSERT is blocked (device_tokens_insert requires
-- user_id = auth.uid(), and the admin's uid will not match a target user_id).
insert into public.device_tokens (user_id, platform, push_token)
values ('<uuid-of-user-b>', 'android', 'ExponentPushToken[admin_insert]');
-- Expected: ERROR: new row violates row-level security policy

-- ─── 8. Admin cannot UPDATE a token ──────────────────────────────────────────

-- Signed in as admin: UPDATE is blocked (device_tokens_update USING clause
-- requires user_id = auth.uid(); the admin's uid won't match user_b's rows).
update public.device_tokens
set last_seen_at = now()
where user_id = '<uuid-of-user-b>';
-- Expected: UPDATE 0 (no rows matched by USING)

-- ─── 9. Admin cannot DELETE a token ──────────────────────────────────────────

-- Signed in as admin: DELETE is blocked (device_tokens_delete USING clause
-- requires user_id = auth.uid()).
delete from public.device_tokens
where user_id = '<uuid-of-user-b>';
-- Expected: DELETE 0 (no rows matched by USING)

-- ─── 10. private.push_config is not selectable by anon/authenticated ─────────

-- Signed in as anon (no JWT) or as any authenticated user:
-- Expect: permission denied for schema private, or for table private.push_config.
select * from private.push_config;
-- Expected: ERROR: permission denied for schema private
--           (or: permission denied for table push_config)
-- Migration 0015 runs: revoke all on private.push_config from anon, authenticated;
--                      revoke all on schema private from anon, authenticated;

-- ─── 11. bookings trigger fires only on status/quote_status changes ───────────

-- As service role (or in a Supabase SQL editor with bypass RLS):
-- Insert a booking row, then update an unrelated column — trigger must NOT fire.
-- Then update status — trigger must fire.

-- Step A: Update an unrelated column — trg_push_bookings must NOT fire.
--   (Verified by checking pg_net request log — no HTTP call should appear.)
update public.bookings
set updated_at = now()       -- NOT status or quote_status
where id = '<booking-uuid>';
-- Expected: trigger does not fire (WHEN clause: new.status IS DISTINCT FROM old.status
--           OR new.quote_status IS DISTINCT FROM old.quote_status — both false here).

-- Step B: Update status — trigger fires.
update public.bookings
set status = 'accepted'
where id = '<booking-uuid>';
-- Expected: trg_push_bookings fires; pg_net POST to send_push_url enqueued.

-- Step C: Update quote_status to 'sent' — trigger fires.
update public.bookings
set quote_status = 'sent'
where id = '<booking-uuid>';
-- Expected: trg_push_bookings fires.

-- ─── 12. payments trigger fires only on pending → paid ───────────────────────

-- As service role:
-- Update a payment from pending to paid — trigger fires.
update public.payments
set status = 'paid'
where id = '<payment-uuid>' and status = 'pending';
-- Expected: trg_push_payments fires.

-- Update a payment that is already paid — trigger must NOT fire (WHEN clause:
-- new.status = 'paid' AND old.status IS DISTINCT FROM 'paid' → false).
update public.payments
set updated_at = now()
where id = '<payment-uuid>' and status = 'paid';
-- Expected: trigger does not fire.

-- ─── 13. booking_messages trigger fires on INSERT ────────────────────────────

-- As service role:
insert into public.booking_messages (booking_id, sender_id, message_text)
values ('<booking-uuid>', '<sender-uuid>', 'Hello, test message')
returning id;
-- Expected: trg_push_booking_messages fires; pg_net POST enqueued.

-- ─── 14. notify_send_push no-ops when send_push_url is null (kill switch) ────

-- As service role: set send_push_url to null.
update private.push_config set send_push_url = null where id = 1;

-- Then trigger a booking status change.
update public.bookings set status = 'completed' where id = '<booking-uuid>';
-- Expected: trigger fires, notify_send_push is called, but returns early
--           because v_url IS NULL — no pg_net HTTP call is made.

-- Restore:
update private.push_config
set send_push_url = 'https://<project>.functions.supabase.co/send-push'
where id = 1;
