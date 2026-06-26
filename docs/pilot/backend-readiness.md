# QuickServe Backend Readiness Checklist

**Purpose:** Pilot operator checklist. Work top-to-bottom; all items must be checked before
accepting live traffic. Commands assume `supabase` CLI is authenticated and linked to the pilot
project (`supabase link --project-ref <ref>`).

---

## 1. Supabase Project + Migrations

Apply all migrations **in filename order** against the pilot project.

```bash
supabase db push          # applies every pending migration in order
# — or —
supabase db reset         # on a fresh project: applies from scratch
```

### Migration table

| # | File | What it creates / modifies |
|---|------|---------------------------|
| 0001 | `0001_profiles.sql` | `public.profiles` table (id, full_name, phone, role, approval_status, created_at); RLS (own-select, own-update with role/status guard); `handle_new_user()` trigger; `on_auth_user_created` trigger |
| 0002 | `0002_bookings.sql` | `public.bookings` table (6-status check); customer insert/select RLS |
| 0003 | `0003_admin_dispatch.sql` | Adds `assigned_provider_name/phone/admin_notes` columns to bookings; expands to 7-status constraint; `is_admin()` helper function; admin RLS on bookings + profiles |
| 0004 | `0004_provider_jobs.sql` | Adds `assigned_provider_id` FK column to bookings; provider-scoped select + forward-only status-update RLS on bookings |
| 0005 | `0005_provider_profiles.sql` | Adds `profile_photo_url`, `bio`, `years_experience`, `skills`, `is_verified`, `completed_jobs_count`, `average_rating`, `availability_status` to profiles; `bump_completed_jobs()` trigger; `get_booking_professional()` RPC; strengthens own-update guard |
| 0006 | `0006_booking_photos.sql` | `booking-photos` Storage bucket (private); `storage.objects` policies; `public.booking_photos` metadata table + RLS (participant read, typed insert, admin delete/update) |
| 0007 | `0007_activity_notifications.sql` | `public.booking_activity` table + RLS; `public.notifications` table + RLS; `log_booking_created`, `log_booking_status_activity`, `log_photo_added`, `log_photo_verified` trigger functions |
| 0008 | `0008_reviews.sql` | `public.reviews` table (unique per booking, rating 1-5, is_hidden); `review_count` column on profiles; customer-insert / participant-read / admin-update RLS; `recompute_provider_rating()` trigger (recomputes `average_rating` + `review_count` on insert/update/delete) |
| 0009 | `0009_pin_review_count.sql` | Recreates `profiles_update_own` policy to pin `review_count` (prevents client-side tampering with the trigger-computed value) |
| 0010 | `0010_payments.sql` | `quoted_amount`, `provider_share`, `quote_status` columns on bookings; `public.payments` table; `public.provider_earnings` table; RLS on both; `set_quote`, `accept_quote`, `decline_quote`, `pay_payment`, `override_payment_status`, `mark_payout_paid` RPCs; `create_payment_on_accept` + `create_earning_on_paid` triggers |
| 0011 | `0011_payment_attempts.sql` | `payment_method` column on payments; `public.payment_attempts` table + RLS (customer+admin read only); `initiate_payment_attempt`, `confirm_payment_attempt`, `cancel_payment_attempt` RPCs; drops `pay_payment` (retired) |
| 0012 | `0012_mpesa_callback.sql` | Adds `merchant_request_id`, `checkout_request_id`, `result_code`, `result_desc`, `callback_received_at` to payment_attempts; index on `checkout_request_id`; `apply_mpesa_callback` RPC (service role only); revokes execute from anon/authenticated |
| 0013 | `0013_booking_messages.sql` | `public.booking_messages` table + index + RLS (participant read/insert, no update/delete); `get_chat_peer_name()` RPC (SECURITY DEFINER) |
| 0014 | `0014_device_tokens.sql` | `public.device_tokens` table (user_id+push_token unique); RLS: own CRUD + admin read-only; no admin write path |
| 0015 | `0015_push_triggers.sql` | `pg_net` extension; `private` schema; `private.push_config` table (singleton row, revoked from anon/authenticated); `notify_send_push()` helper; `tg_push_bookings`, `tg_push_payments`, `tg_push_booking_messages` trigger functions; three AFTER triggers with WHEN-clause guards |

### Post-apply verification

- [ ] Run `select count(*) from public.profiles;` — no error (table exists, RLS enabled).
- [ ] Run `select count(*) from public.bookings;` — no error.
- [ ] Run `select count(*) from public.payments;` — no error.
- [ ] Run `select count(*) from public.payment_attempts;` — no error.
- [ ] Run `select count(*) from public.booking_messages;` — no error.
- [ ] Run `select count(*) from public.device_tokens;` — no error.
- [ ] Run `select count(*) from public.reviews;` — no error.
- [ ] Confirm `private.push_config` has one row: `select * from private.push_config;` (run as service role).
- [ ] Confirm `pg_net` extension is enabled: `select extname from pg_extension where extname = 'pg_net';`.
- [ ] Confirm `apply_mpesa_callback` is not callable as `authenticated`: as an authenticated user, `select public.apply_mpesa_callback('x','x',0,'x','{}')` must raise `permission denied`.

---

## 2. Auth Settings

In the Supabase dashboard under **Authentication → Settings**:

- [ ] **Email auth** is enabled (Sign In with Email/Password turned on).
- [ ] **Confirm email** setting matches your pilot decision (can disable for internal testing; enable for real users).
- [ ] **Site URL** is set to your app's deep-link scheme (e.g. `quickserve://`).
- [ ] **Redirect URLs** allowlist includes your Expo deep-link URL if using OAuth or magic links.
- [ ] **JWT expiry** is sane (default 3600 s; increase to 86400 for mobile if needed).
- [ ] **Admin self-signup is blocked by design** — the `handle_new_user()` trigger (0001) ignores any `role=admin` in signup metadata and falls back to `customer`. Admins must be created manually (see section 3). Confirm this is the desired behaviour.

---

## 3. Admin Account Setup

There is no in-app admin signup flow by design. Create admin accounts directly in the database.

**Step 1 — Create the auth user (Supabase dashboard → Authentication → Users → Invite / Add user).**

**Step 2 — Update the profiles row to set role and approval:**

```sql
-- Run as service role in the SQL editor.
update public.profiles
set role = 'admin', approval_status = 'approved'
where id = '<user-uuid-from-auth.users>';
```

> `handle_new_user()` creates the profile row automatically with `role = 'customer'` when the
> auth user is first created. The UPDATE above promotes it to admin.

- [ ] Admin profile row updated: `select role, approval_status from public.profiles where id = '<admin-uuid>';` returns `admin / approved`.
- [ ] Verify admin detection: `select public.is_admin();` returns `true` when run with the admin JWT (SQL editor → paste admin JWT in the auth header).
- [ ] Admin can see all bookings: `select count(*) from public.bookings;` as admin returns total count (not zero).
- [ ] Admin can call `set_quote`: `select public.set_quote('<booking-id>', 100, 80);` — no "Permission denied" error.
- [ ] Admin can call `override_payment_status` and `mark_payout_paid` without error.
- [ ] Non-admin cannot call admin RPCs: as an authenticated customer, `select public.set_quote(...)` raises "Permission denied".

---

## 4. Storage Buckets

Migration `0006_booking_photos.sql` creates the bucket. Verify it exists after migration.

**Bucket name:** `booking-photos` (used in `src/lib/photos.ts` — `supabase.storage.from('booking-photos')`)

**Access model:** Private bucket (public = false). Files are accessed via short-lived **signed URLs** (1-hour expiry, generated in `getBookingPhotos()` via `createSignedUrl`).

**Storage object policies (set by migration):**

| Policy | Operation | Condition |
|--------|-----------|-----------|
| `booking_photos_obj_select` | SELECT | `authenticated` role + `bucket_id = 'booking-photos'` |
| `booking_photos_obj_insert` | INSERT | `authenticated` role + `bucket_id = 'booking-photos'` |
| `booking_photos_obj_delete` | DELETE | `authenticated` + `bucket_id = 'booking-photos'` + `is_admin()` |

**Metadata RLS** (`public.booking_photos`): participants (customer or assigned provider) may read; customer inserts `issue` type, provider inserts `before/after/completion`; admin controls delete/update/verify.

- [ ] Bucket exists: Supabase dashboard → Storage → `booking-photos` is listed.
- [ ] Bucket is **not** public (toggle shows private).
- [ ] Storage object policies are present: Storage → Policies → `booking_photos_obj_select`, `booking_photos_obj_insert`, `booking_photos_obj_delete`.
- [ ] Upload test: authenticated customer can upload a JPEG to `<booking-id>/<uuid>.jpg` — no error.
- [ ] Download test: `createSignedUrl('booking-photos', '<path>', 3600)` returns a working URL.
- [ ] Admin-only delete: non-admin attempting `remove(['<path>'])` receives a policy error.

---

## 5. Edge Function Deployment

Deploy all four functions in one command:

```bash
supabase functions deploy mpesa-stk-push mpesa-callback register-device send-push
```

### JWT verification (matches `supabase/config.toml`)

| Function | `verify_jwt` | Reason |
|----------|--------------|--------|
| `mpesa-stk-push` | `true` | Authenticated customer must supply a valid Supabase JWT |
| `mpesa-callback` | `false` | Daraja cannot supply a JWT; authenticated via `?token=<MPESA_CALLBACK_SECRET>` |
| `register-device` | `true` | Authenticated user must supply a valid Supabase JWT |
| `send-push` | `false` | Called by database pg_net webhook; authenticated via `x-webhook-secret` header |

- [ ] All four functions appear in the Supabase dashboard under **Edge Functions**.
- [ ] `mpesa-stk-push` shows `verify_jwt: true` in its config.
- [ ] `mpesa-callback` shows `verify_jwt: false` in its config.
- [ ] `register-device` shows `verify_jwt: true` in its config.
- [ ] `send-push` shows `verify_jwt: false` in its config.
- [ ] Smoke test `register-device`: POST with a valid JWT and `{ push_token, platform }` body — returns `{ ok: true }`.
- [ ] Smoke test `mpesa-stk-push` in mock mode: POST with valid JWT and `{ payment_id, phone }` — returns `{ ok: true, checkoutRequestId, status: 'pending' }`.

---

## 6. Daraja / M-Pesa Sandbox

Reference: `docs/superpowers/verification/slice-13-daraja.md`

### Required secrets

Set via:
```bash
supabase secrets set \
  MPESA_MODE=<mock|sandbox|live> \
  DARAJA_BASE_URL=https://sandbox.safaricom.co.ke \
  DARAJA_CONSUMER_KEY=<value> \
  DARAJA_CONSUMER_SECRET=<value> \
  DARAJA_SHORTCODE=<value> \
  DARAJA_PASSKEY=<value> \
  DARAJA_CALLBACK_URL=https://<project-ref>.supabase.co/functions/v1/mpesa-callback?token=<MPESA_CALLBACK_SECRET> \
  MPESA_CALLBACK_SECRET=<value>
```

**`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected — do NOT set them manually.**

### MPESA_MODE values

| Value | Behaviour |
|-------|-----------|
| `mock` | No Daraja secrets required. Returns synthetic `checkoutRequestId`. Safe for UI testing with zero credentials. |
| `sandbox` | Hits `sandbox.safaricom.co.ke`. All Daraja secrets required. Use Safaricom test MSISDNs. |
| `live` | Hits `api.safaricom.co.ke`. Real money moves. |

### Callback URL format

The callback URL **must** include the secret as a query parameter:

```
https://<project-ref>.supabase.co/functions/v1/mpesa-callback?token=<MPESA_CALLBACK_SECRET>
```

This is the only authentication channel Daraja supports. The `mpesa-callback` function
rejects requests whose `?token=` does not match `MPESA_CALLBACK_SECRET` (constant-time
comparison; also rejects when the secret is unset).

Generate a strong secret:
```bash
openssl rand -hex 32
```

- [ ] `MPESA_MODE` secret set (start with `mock` for initial verification).
- [ ] In sandbox/live mode: `DARAJA_BASE_URL`, `DARAJA_CONSUMER_KEY`, `DARAJA_CONSUMER_SECRET`, `DARAJA_SHORTCODE`, `DARAJA_PASSKEY` all set.
- [ ] `MPESA_CALLBACK_SECRET` set (≥32 random chars).
- [ ] `DARAJA_CALLBACK_URL` includes `?token=<MPESA_CALLBACK_SECRET>` exactly.
- [ ] The callback URL is registered with Safaricom (sandbox or live portal) as the STK callback URL.
- [ ] **Verify mock mode:** call `mpesa-stk-push` with `MPESA_MODE=mock` — `payment_attempts` row created, `status=pending`, `checkout_request_id` populated.
- [ ] **Verify wrong token rejection:** POST to `mpesa-callback` URL without the correct token — response is HTTP 401.
- [ ] **Verify successful callback:** POST a valid Daraja-format body with `ResultCode=0` and correct `?token=` — `payment_attempts.status` becomes `successful`, `payments.status` becomes `paid`, one `provider_earnings` row inserted.
- [ ] **Verify failure callback:** POST with `ResultCode=1032` — `payment_attempts.status` becomes `failed`, `payments.status` stays `pending`.
- [ ] **Verify idempotency:** replay the same successful callback — no database change (attempt already terminal).

---

## 7. Push Secrets + Config

Reference: `docs/superpowers/verification/slice-15-push.md`

### Required secret

```bash
supabase secrets set PUSH_WEBHOOK_SECRET=<your-high-entropy-secret>
```

Generate:
```bash
openssl rand -hex 32
```

### Configure `private.push_config`

After migration 0015 is applied, fill in the config row using the Supabase SQL editor
(run as service role):

```sql
update private.push_config
set
  send_push_url  = 'https://<project-ref>.supabase.co/functions/v1/send-push',
  webhook_secret = '<same value as PUSH_WEBHOOK_SECRET>'
where id = 1;
```

The `webhook_secret` in `private.push_config` **must exactly match** `PUSH_WEBHOOK_SECRET`
— the `notify_send_push()` function reads the DB value and passes it as the
`x-webhook-secret` header; `send-push` verifies against the env secret.

**Kill switch:** set `send_push_url = null` to stop all push delivery instantly (see section 11).

- [ ] `PUSH_WEBHOOK_SECRET` secret set (≥32 random chars).
- [ ] `private.push_config.send_push_url` set to the deployed `send-push` function URL.
- [ ] `private.push_config.webhook_secret` matches `PUSH_WEBHOOK_SECRET` exactly.
- [ ] `register-device` and `send-push` functions deployed (see section 5).
- [ ] Smoke test: sign in on a device, verify a row appears in `public.device_tokens`.
- [ ] **EAS / FCM:** real push delivery requires a dev or EAS build (not Expo Go on Android). Configure FCM credentials via `eas credentials` if targeting production push.

---

## 8. pg_net Verification

- [ ] `pg_net` extension enabled: `select extname from pg_extension where extname = 'pg_net';` returns one row.
- [ ] `private.push_config` row exists with `id = 1`: `select id from private.push_config;` (service role).
- [ ] **Kill switch no-op confirmed:** set `send_push_url = null`, trigger a booking status change, verify no HTTP call is made (check `net._http_response` or Supabase logs — no entry for `send-push`).
- [ ] **Trigger fires on status change:** update a booking's `status` field — `trg_push_bookings` fires (WHEN clause: `new.status IS DISTINCT FROM old.status OR new.quote_status IS DISTINCT FROM old.quote_status`).
- [ ] **Trigger does NOT fire on unrelated column change:** update `admin_notes` on a booking — no `trg_push_bookings` invocation (WHEN clause is false).
- [ ] **Trigger fires on payment paid:** update a payment `pending → paid` — `trg_push_payments` fires.
- [ ] **Trigger does NOT fire on already-paid payment:** update a paid payment's unrelated field — `trg_push_payments` does not fire.
- [ ] **Trigger fires on new chat message:** insert into `booking_messages` — `trg_push_booking_messages` fires.

---

## 9. RLS Smoke Checks

Run the verification scripts against the pilot project. Replace all `<PLACEHOLDER>` UUIDs
with real users/bookings from the pilot database before running.

```bash
# Payments + earnings isolation (Slice 11)
psql $DATABASE_URL -f docs/superpowers/verification/slice-11-rls.sql

# Payment attempts isolation (Slice 12)
psql $DATABASE_URL -f docs/superpowers/verification/slice-12-attempts.sql

# Chat message isolation (Slice 14)
psql $DATABASE_URL -f docs/superpowers/verification/slice-14-chat.sql

# Device token isolation + push config access (Slice 15)
psql $DATABASE_URL -f docs/superpowers/verification/slice-15-push.sql
```

Key isolation assertions to confirm manually if not using the scripts:

- [ ] **Payments:** Customer B cannot SELECT customer A's `payments` row (RLS: `customer_id = auth.uid()`).
- [ ] **Provider earnings:** Provider cannot SELECT another provider's `provider_earnings` (RLS: `provider_id = auth.uid()`).
- [ ] **Payment attempts:** Provider sees 0 rows in `payment_attempts` (no provider read path in policy).
- [ ] **Messages:** Customer B cannot SELECT or INSERT into a booking they do not own.
- [ ] **Device tokens:** User A cannot SELECT, INSERT, UPDATE, or DELETE user B's `device_tokens` row.
- [ ] **Admin oversight:** Admin can SELECT all `bookings`, `payments`, `provider_earnings`, `booking_messages`, `device_tokens`.
- [ ] **Admin write restriction on device_tokens:** Admin cannot INSERT or UPDATE a token row (policy requires `user_id = auth.uid()`).
- [ ] **`private.push_config` inaccessible:** as `anon` or `authenticated`, `select * from private.push_config;` raises "permission denied".

---

## 10. Critical Flow Checks

Run each flow end-to-end on the pilot project before launch.

### Flow A: Payment attempt (initiate → confirm)

1. Admin calls `set_quote(<booking_id>, <amount>, <provider_share>)`.
2. Customer calls `accept_quote(<booking_id>)` — `payments` row appears, `status=pending`.
3. Customer calls `initiate_payment_attempt(<payment_id>, 'mpesa', '<phone>', ...)` — `payment_attempts` row inserted, `status=pending`.
4. Admin calls `confirm_payment_attempt(<attempt_id>)`:
   - attempt → `successful`
   - payment → `paid`, `payment_method='mpesa'`, `paid_at` set
   - sibling attempts → `cancelled`
   - `provider_earnings` row inserted via `trg_create_earning_on_paid`

- [ ] All four state transitions verified in order.
- [ ] `provider_earnings` row present with correct `amount` (= `provider_share`).
- [ ] Re-confirming the same attempt raises "not in a confirmable status" error.

### Flow B: M-Pesa callback (apply_mpesa_callback → paid)

1. `mpesa-stk-push` creates a `payment_attempts` row with `checkout_request_id` set.
2. Daraja POSTs to `mpesa-callback?token=<MPESA_CALLBACK_SECRET>` with `ResultCode=0`.
3. `mpesa-callback` calls `apply_mpesa_callback(checkout_request_id, ...)`:
   - attempt → `successful`
   - payment → `paid`, `payment_method='mpesa'`
   - `provider_earnings` row inserted

- [ ] Happy-path callback: payment marked paid, earnings created.
- [ ] Non-zero `ResultCode`: attempt → `failed`, payment stays `pending`.
- [ ] Wrong/missing token: HTTP 401, no DB change.
- [ ] Replayed callback: HTTP 200, no DB change (idempotent).

### Flow C: Provider earnings (only on payment → paid)

- [ ] Completing a booking **without** paying does NOT create a `provider_earnings` row (trigger fires on `payments`, not `bookings`).
- [ ] Earnings row is inserted exactly **once** per payment (ON CONFLICT DO NOTHING in trigger).

---

## 11. Rollback / Kill Switches

### Disable live M-Pesa (instant, no redeploy)

```bash
supabase secrets set MPESA_MODE=mock
supabase functions deploy mpesa-stk-push   # redeploy to pick up new secret value
```

Mock mode requires no Daraja credentials and makes no external calls.

### Disable push notifications (instant, no migration)

```sql
-- Service role SQL editor:
update private.push_config set send_push_url = null where id = 1;
```

`notify_send_push()` returns early when `send_push_url IS NULL` — no `pg_net` call is made.
Re-enable by restoring the URL:

```sql
update private.push_config
set send_push_url = 'https://<project-ref>.supabase.co/functions/v1/send-push'
where id = 1;
```

### Delete individual Edge Functions

```bash
supabase functions delete mpesa-stk-push     # disables M-Pesa initiation
supabase functions delete mpesa-callback     # disables Daraja callback processing
supabase functions delete register-device   # disables new token registration
supabase functions delete send-push          # disables push delivery
```

### Drop migrations (forward-only; creates a new migration)

Drop push infrastructure (reverse of 0015):

```sql
-- New file: supabase/migrations/0016_drop_push.sql
drop trigger if exists trg_push_booking_messages on public.booking_messages;
drop trigger if exists trg_push_payments on public.payments;
drop trigger if exists trg_push_bookings on public.bookings;
drop function if exists public.tg_push_booking_messages();
drop function if exists public.tg_push_payments();
drop function if exists public.tg_push_bookings();
drop function if exists public.notify_send_push(jsonb);
drop table if exists private.push_config;
drop schema if exists private cascade;
drop table if exists public.device_tokens;
drop extension if exists pg_net;
```

Reference rollback details: `docs/superpowers/verification/slice-15-push.md` (Rollback section).

### Rotate secrets after leakage

**M-Pesa callback secret:**
```bash
# 1. Generate new secret
openssl rand -hex 32

# 2. Update Supabase secret
supabase secrets set MPESA_CALLBACK_SECRET=<new-secret>

# 3. Update DARAJA_CALLBACK_URL to include new token
supabase secrets set DARAJA_CALLBACK_URL=https://<ref>.supabase.co/functions/v1/mpesa-callback?token=<new-secret>

# 4. Redeploy callback function
supabase functions deploy mpesa-callback

# 5. Re-register new callback URL with Safaricom
```

**Push webhook secret:**
```bash
supabase secrets set PUSH_WEBHOOK_SECRET=<new-secret>
supabase functions deploy send-push
```
```sql
-- Also update the DB config row (must match):
update private.push_config set webhook_secret = '<new-secret>' where id = 1;
```

- [ ] Rollback procedures reviewed by at least one team member before launch.
- [ ] Kill-switch SQL for push (`send_push_url = null`) tested in staging.
- [ ] `MPESA_MODE=mock` toggle tested in staging (switches to mock with redeploy).
