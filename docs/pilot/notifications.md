# Slice 23 — Unified Notification System: Operator & Verification Guide

Accurate as of migration `0020_notification_system.sql` and commit range `2b95d3f..HEAD`.

---

## 1. Overview — The Unified Pipeline

Every user-facing event in QuickServe produces **exactly one row** in `public.notifications`. That single row is both the in-app bell entry and the push trigger input.

```
DB event (booking / payment / chat / review / profile)
    │
    ▼
event trigger  (tg_notify_booking_created / tg_notify_booking_update /
                tg_notify_payment_paid / tg_notify_payment_failed /
                tg_notify_chat_message / tg_notify_review /
                tg_notify_provider_pending)
    │
    ▼ calls notify_user() / notify_admins()
    │
    ▼
INSERT → public.notifications   ← bell row; in-app history recorded unconditionally
    │
    ▼  AFTER INSERT
trg_push_notification  (calls tg_push_notification())
    │
    ▼  calls notify_send_push() via pg_net
send-push Edge Function
    │
    ├─ prefs gate: isPushAllowed(notification_preferences, category)?
    │       no  → push_status = 'skipped'   (bell row untouched)
    │       yes ↓
    ├─ device_tokens lookup: tokens empty?
    │       yes → push_status = 'no_token'
    │       no  ↓
    ├─ sendExpoPush() → success → push_status = 'sent', push_attempts + 1
    │                 → error   → push_status = 'failed', push_error, push_attempts + 1
    └─ dead tokens pruned from device_tokens (DeviceNotRegistered)
```

**Bell and push are single-sourced.** Disabling push (preferences or kill-switch) never removes the bell row. The in-app notification history is always complete.

---

## 2. Event Matrix

Every wired event, the source trigger, recipients, notification type, category, and deep-link route.

| Source table / trigger | Event condition | Recipient(s) | type | category | route |
|---|---|---|---|---|---|
| `bookings` / `tg_notify_booking_created` | INSERT (new booking) | Customer | `booking_received` | `booking` | `/booking/<id>` |
| `bookings` / `tg_notify_booking_created` | INSERT (new booking) | All approved admins | `admin_new_booking` | `system` | `/admin/booking/<id>` |
| `bookings` / `tg_notify_booking_update` | status → `provider_assigned` | Customer | `provider_assigned` | `booking` | `/booking/<id>` |
| `bookings` / `tg_notify_booking_update` | status → `provider_assigned` | Provider | `booking_assigned` | `booking` | `/provider/job/<id>` |
| `bookings` / `tg_notify_booking_update` | status → `on_the_way` | Customer | `heading_to_you` | `booking` | `/booking/track/<id>` |
| `bookings` / `tg_notify_booking_update` | status → `in_progress` | Customer | `work_started` | `booking` | `/booking/<id>` |
| `bookings` / `tg_notify_booking_update` | status → `completed` | Customer | `work_completed` | `booking` | `/booking/<id>` |
| `bookings` / `tg_notify_booking_update` | status → `completed` | Customer | `review_reminder` | `booking` | `/booking/<id>` |
| `bookings` / `tg_notify_booking_update` | status → `cancelled` (provider assigned) | Provider | `booking_cancelled` | `booking` | `/provider/job/<id>` |
| `bookings` / `tg_notify_booking_update` | status → `cancelled` after assignment | All approved admins | `admin_cancelled_after_assign` | `system` | `/admin/booking/<id>` |
| `bookings` / `tg_notify_booking_update` | `assigned_provider_id` cleared (rejection) | All approved admins | `admin_provider_rejected` | `system` | `/admin/booking/<id>` |
| `bookings` / `tg_notify_booking_update` | `quote_status` → `sent` | Customer | `quote_received` | `booking` | `/booking/<id>` |
| `bookings` / `tg_notify_booking_update` | `quote_status` → `accepted` | Provider | `quote_accepted` | `booking` | `/provider/job/<id>` |
| `bookings` / `tg_notify_booking_update` | `quote_status` → `declined` | Provider | `quote_rejected` | `booking` | `/provider/job/<id>` |
| `payments` / `tg_notify_payment_paid` | status → `paid` | Customer | `payment_confirmed` | `payment` | `/booking/<booking_id>` |
| `payments` / `tg_notify_payment_paid` | status → `paid` | Provider (from bookings.assigned_provider_id) | `payment_received` | `payment` | `/provider/job/<booking_id>` |
| `payment_attempts` / `tg_notify_payment_failed` | status = `failed` | All approved admins | `admin_payment_failed` | `system` | `/admin/booking/<booking_id>` |
| `booking_messages` / `tg_notify_chat_message` | INSERT (new message) | Non-sender (customer or provider) | `chat_message` | `chat` | `/booking/chat/<id>` (customer) or `/provider/job/chat/<id>` (provider) |
| `reviews` / `tg_notify_review` | INSERT (new review) | Provider | `review_received` | `booking` | `/provider/job/<booking_id>` |
| `profiles` / `tg_notify_provider_pending` | INSERT with `role='provider'` and `approval_status='pending'` | All approved admins | `admin_provider_pending` | `system` | `/admin/providers` |

### Schema verification

```sql
-- Confirm all 7 event triggers exist on their tables
select tgname, relname as table_name, tgenabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where tgname in (
  'tg_notify_booking_created',
  'tg_notify_booking_update',
  'tg_notify_payment_paid',
  'tg_notify_payment_failed',
  'tg_notify_chat_message',
  'tg_notify_review',
  'tg_notify_provider_pending'
)
order by tgname;
-- Expected: 7 rows, all tgenabled = 'O' (enabled).
```

---

## 3. dedup_key Strategy

### Design

- **Format:** `<recipient_uuid>:<booking_uuid>:<type>` for user-to-user events.
- **Admin fan-out:** each admin gets a unique key: `<booking_uuid>:<type>:<admin_uuid>` (via `notify_admins` which appends `':' || r.id::text` to `p_dedup_base`).
- **Chat = NULL:** `tg_notify_chat_message` passes `null` for `p_dedup_key`. Every message always inserts a new row. No deduplication.

### Enforcement

A partial unique index enforces deduplication at the database level:

```sql
-- Confirm the partial-unique index exists
select indexname, indexdef
from pg_indexes
where tablename = 'notifications'
  and indexname = 'notifications_dedup_key';
-- Expected:
-- notifications_dedup_key | CREATE UNIQUE INDEX notifications_dedup_key ON public.notifications
--   (dedup_key) WHERE (dedup_key IS NOT NULL)
```

The `notify_user` function restates the predicate for arbiter-index inference (Postgres requirement for partial unique indexes with `ON CONFLICT`):

```sql
-- Relevant snippet from notify_user (already in the DB):
insert into public.notifications (user_id, booking_id, title, body, type, category, route, dedup_key)
values (...)
on conflict (dedup_key) where dedup_key is not null do nothing;
```

### Dedup proof — idempotent event inserts once

```sql
-- As service_role or via a trigger, call notify_user twice for the same event:
select public.notify_user(
  '<some_user_uuid>',
  '<some_booking_uuid>',
  'Test', 'Test body', 'booking_received', 'booking',
  '/booking/<booking_uuid>',
  '<some_user_uuid>:<booking_uuid>:booking_received'
);
select public.notify_user(
  '<some_user_uuid>',
  '<some_booking_uuid>',
  'Test', 'Test body', 'booking_received', 'booking',
  '/booking/<booking_uuid>',
  '<some_user_uuid>:<booking_uuid>:booking_received'
);

-- Check: exactly 1 row with that dedup_key
select count(*) from notifications
where dedup_key = '<some_user_uuid>:<booking_uuid>:booking_received';
-- Expected: 1
```

### Chat proof — NULL dedup_key allows multiple rows

```sql
-- Call tg_notify_chat_message path (two separate chat messages on same booking)
-- Both will produce a row because dedup_key = NULL skips the conflict check.
select count(*) from notifications
where booking_id = '<some_booking_uuid>'
  and type = 'chat_message'
  and dedup_key is null;
-- Expected: count matches the number of chat messages sent (>= 1 per insert, not deduplicated)
```

---

## 4. push_status Outcomes

Every `notifications` row has a `push_status` column. The `send-push` Edge Function sets the final state after attempting delivery.

| `push_status` | Meaning | When set |
|---|---|---|
| `pending` | Default on insert; push not yet attempted | Set by DB schema default |
| `sent` | Push delivered to Expo; `push_attempts` incremented | After `sendExpoPush()` succeeds |
| `skipped` | User preferences blocked the category | `isPushAllowed()` returned false |
| `no_token` | No device token registered for the user | `device_tokens` query returned empty |
| `failed` | Push attempt threw an error; `push_error` + `push_attempts` written | Catch block in `send-push` |

`push_error` holds up to 500 characters of the error message. `push_attempts` counts how many times a push was tried (currently max 1 — no retry queue).

### Verification query

```sql
-- Distribution of push outcomes across all notifications
select push_status, count(*) as n
from notifications
group by push_status
order by n desc;
-- Typical distribution in production:
--   sent      | most
--   no_token  | users who haven't granted push permission
--   skipped   | prefs disabled
--   pending   | rows created in the last few seconds (Edge hasn't run yet)
--   failed    | should be 0 normally; investigate if non-zero
```

```sql
-- Inspect recent failures
select id, user_id, type, push_error, push_attempts, created_at
from notifications
where push_status = 'failed'
order by created_at desc
limit 20;
```

---

## 5. notification_preferences — Owner-Only, Missing = Defaults

### Table definition and RLS

```sql
-- Confirm table exists with RLS enabled
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname = 'notification_preferences';
-- Expected: relrowsecurity = true
```

```sql
-- Confirm exactly 4 policies, all scoped to user_id = auth.uid()
select policyname, cmd, qual
from pg_policies
where tablename = 'notification_preferences'
order by policyname;
-- Expected: exactly 4 rows:
--   notification_preferences_delete | DELETE | (user_id = auth.uid())
--   notification_preferences_insert | INSERT | (user_id = auth.uid())  [with_check]
--   notification_preferences_select | SELECT | (user_id = auth.uid())
--   notification_preferences_update | UPDATE | (user_id = auth.uid())  [using + with_check]
-- NO admin policy, NO provider policy, NO is_admin() reference.
```

### Schema defaults

| Column | Default | Notes |
|---|---|---|
| `push_enabled` | `true` | Master switch for all push |
| `chat_enabled` | `true` | Chat message push |
| `booking_enabled` | `true` | Booking lifecycle push |
| `payment_enabled` | `true` | Payment push |
| `marketing_enabled` | **`false`** | Marketing push off by default |

A user with **no row** in `notification_preferences` gets all defaults applied by the client (`DEFAULT_NOTIFICATION_PREFERENCES` in `src/lib/notifications.ts`) and the Edge Function (`isPushAllowed` null-safe defaults in `_shared/notifications.ts`).

### Cross-user isolation

```sql
-- As Customer A (their JWT): see own row only
select count(*) from notification_preferences;
-- Expected: 0 (no prefs saved yet) or 1 (own row only)

-- As Customer A: direct lookup of Customer B's row returns nothing
select * from notification_preferences where user_id = '<Customer-B-uuid>';
-- Expected: 0 rows (RLS filters it out)

-- As admin or provider (not the owner): same result — 0 rows
select * from notification_preferences where user_id = '<any-other-uuid>';
-- Expected: 0 rows
```

---

## 6. Preferences Gate PUSH ONLY — Bell Always Records

Disabling a notification category in preferences **does not prevent the bell row from being created**. The `notifications` table always gets the row (so the in-app history is complete). Only the push delivery is skipped.

### How it works

1. DB trigger calls `notify_user()` → `notifications` row inserted (bell recorded).
2. `trg_push_notification` fires AFTER INSERT → calls `notify_send_push()` (pg_net webhook).
3. `send-push` Edge Function reads `notification_preferences` for the user.
4. `isPushAllowed(prefs, category)` returns `false` if the category toggle is off or `push_enabled = false`.
5. Edge Function updates `push_status = 'skipped'` and returns 200. **Bell row is not touched.**

### Verification

```sql
-- Step 1: Set payment_enabled = false for a test user
update notification_preferences
set payment_enabled = false
where user_id = '<test-user-uuid>';

-- Step 2: Trigger a payment_confirmed event (via payments status→paid, or direct insert for testing)
select public.notify_user(
  '<test-user-uuid>', '<booking-uuid>',
  'Payment confirmed', 'Your payment has been confirmed.',
  'payment_confirmed', 'payment', '/booking/<booking-uuid>',
  '<test-user-uuid>:<booking-uuid>:payment_confirmed'
);

-- Step 3: Confirm bell row was created (in-app history intact)
select id, type, category, push_status from notifications
where user_id = '<test-user-uuid>'
  and dedup_key = '<test-user-uuid>:<booking-uuid>:payment_confirmed';
-- Expected: 1 row with push_status = 'skipped' (Edge sets this; may be 'pending' briefly)

-- Step 4: Confirm push_status eventually = 'skipped' (after Edge Function runs)
select push_status from notifications
where dedup_key = '<test-user-uuid>:<booking-uuid>:payment_confirmed';
-- Expected: 'skipped'
```

### Master switch

`push_enabled = false` in `notification_preferences` skips ALL push for that user across all categories. The bell records every notification regardless.

---

## 7. No Duplicate Push — Old Triggers Dropped

### Direct-push triggers from Slice 15 are dropped

The old `trg_push_bookings`, `trg_push_payments`, and `trg_push_booking_messages` triggers sent push notifications directly from the source tables. These are **dropped** in migration `0020` to prevent double-push. Push now flows exclusively through `trg_push_notification` on the `notifications` table.

```sql
-- Confirm only trg_push_notification remains; old direct-push triggers are gone
select tgname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where tgname like 'trg_push_%';
-- Expected: exactly 1 row:
--   trg_push_notification  (on public.notifications)
--
-- trg_push_bookings, trg_push_payments, trg_push_booking_messages must NOT appear.
```

The underlying **functions** (`tg_push_bookings`, `tg_push_payments`, `tg_push_booking_messages`, `notify_send_push`) are preserved (harmless when no trigger calls them). Only the trigger bindings were dropped.

### log_booking_status_activity — activity-only, no duplicate bell

`log_booking_status_activity` (called by `trg_log_booking_status` on `bookings` UPDATE) previously inserted both a `booking_activity` row and a `notifications` row. In `0020` it is **recreated** to insert only `booking_activity`. The `tg_notify_booking_update` trigger now owns all booking notification inserts. This prevents double bell rows on status change.

```sql
-- Confirm log_booking_status_activity no longer inserts into notifications
-- (inspect the function body)
select prosrc
from pg_proc
where proname = 'log_booking_status_activity'
  and pronamespace = 'public'::regnamespace;
-- Expected: body contains insert into public.booking_activity
--           and does NOT contain insert into public.notifications
```

```sql
-- Confirm trg_log_booking_status still exists (timeline intact)
select tgname, tgenabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where tgname = 'trg_log_booking_status';
-- Expected: 1 row, tgenabled = 'O'
```

---

## 8. Kill-Switch

### Global push kill-switch (no deploy required)

The `notify_send_push` function reads `private.push_config.send_push_url`. Setting it to `NULL` causes `notify_send_push` to no-op immediately:

```sql
-- Disable all push globally (bell still records)
update private.push_config set send_push_url = null;

-- Re-enable
update private.push_config set send_push_url = '<your-send-push-url>';
```

- All `notifications` rows are still inserted (bell history preserved).
- All rows will have `push_status = 'pending'` indefinitely (no push sent).
- No app restart required.

### Per-user push kill-switch

```sql
-- Disable all push for a specific user
insert into notification_preferences (user_id, push_enabled)
values ('<user-uuid>', false)
on conflict (user_id) do update set push_enabled = false;
```

The `send-push` Edge Function reads `push_enabled` first (master switch). If false, all pushes for that user are skipped regardless of category.

### PUSH_WEBHOOK_SECRET

`send-push` rejects all requests without the correct `x-webhook-secret` header (constant-time comparison). The secret is set via:

```bash
supabase secrets set PUSH_WEBHOOK_SECRET=<high-entropy-value>
```

If the secret is unset or empty, `send-push` rejects every request with 401.

---

## 9. Future-Ready Types (Documented, NOT Wired)

The following notification types have defined routes and column values in the matrix but **no trigger or wiring in Slice 23**. They are reserved for future slices.

| type | Why not wired | What is needed |
|---|---|---|
| `provider_nearby` | Would require tracking-distance logic (Slice 21 tracking is read-only; no proximity computation) | GPS geofence computation or polling |
| `provider_arrived` | Same as `provider_nearby` | GPS geofence computation or polling |
| `booking_reminder` | Requires a scheduler/cron mechanism (no pg_cron in this schema) | Supabase cron or external scheduler |
| `admin_review_flagged` | Requires a flag mechanism on bookings or a dedicated flag table | A new `reviews.flagged` column or `review_flags` table |

### Confirm no trigger references them

```sql
select proname, prosrc
from pg_proc
where pronamespace = 'public'::regnamespace
  and (
    prosrc like '%provider_nearby%'
    or prosrc like '%provider_arrived%'
    or prosrc like '%booking_reminder%'
    or prosrc like '%admin_review_flagged%'
  );
-- Expected: 0 rows (none of the future-ready types are wired to triggers)
```

---

## 10. Backward Compatibility

### In-app bell (getMyNotifications / mark-read)

`getMyNotifications`, `markNotificationRead`, and `markAllNotificationsRead` are **unchanged**. They query `notifications` with `select *`; the new columns (`type`, `category`, `route`, `dedup_key`, `push_status`, `push_error`, `push_attempts`) are returned but optional in `AppNotification`.

### Additive columns with defaults

All 7 new columns on `public.notifications` have SQL defaults:

| Column | Default |
|---|---|
| `type` | `'generic'` |
| `category` | `'booking'` |
| `route` | `NULL` |
| `dedup_key` | `NULL` |
| `push_status` | `'pending'` |
| `push_error` | `NULL` |
| `push_attempts` | `0` |

Any existing `INSERT` that omits these columns continues to work. Legacy rows (pre-Slice-23) retain their original `push_status = 'pending'` (push was never attempted for them — this is correct, the old direct triggers handled it at that time).

### Route-less legacy notifications

The customer notifications screen handles legacy rows (no `route`) with a booking-id fallback:

```typescript
if (!n.route) {
  if (n.booking_id) {
    router.push({ pathname: '/booking/[id]', params: { id: n.booking_id } });
  }
}
```

Route-bearing rows are deep-linked by `NotificationRow` (`router.push(route)`); the fallback is never triggered for them.

### AppNotification type

```typescript
// All Slice-23 fields are optional — no break for callers who
// only use id/title/body/is_read/created_at
type AppNotification = {
  id: string; user_id: string; booking_id: string | null;
  title: string; body: string; is_read: boolean; created_at: string;
  // Optional extended fields (backward-compatible — absent on older rows)
  type?: string; category?: string; route?: string | null;
  dedup_key?: string | null; push_status?: string;
  push_error?: string | null; push_attempts?: number;
};
```

### Reused infrastructure

- `device_tokens` table — unchanged; still used by `send-push` for token lookups and dead-token pruning.
- `private.push_config` / `notify_send_push` — unchanged; the pg_net call path is preserved.
- `PUSH_WEBHOOK_SECRET` — same secret; same constant-time check.
- `_shared/expo-push-client.ts` — unchanged; used by `send-push`.
- `routeForNotificationData` — unchanged; used by the customer `notifications.tsx` for deep-link routing.

---

## 11. Isolation Diff

`git diff 2b95d3f..HEAD --stat` output (run 2026-07-03):

```
 src/__tests__/admin-web-notifications.test.tsx   | 144 ++++++
 src/__tests__/admin.test.tsx                     |   7 +
 src/__tests__/notification-settings.test.tsx     | 129 +++++
 src/__tests__/notifications.test.ts              | 132 +++++
 src/__tests__/profile.test.tsx                   |   6 +
 src/__tests__/provider-profile.test.tsx          |   8 +
 src/app/(admin-web)/notifications/index.tsx      | 169 ++++++
 src/app/(customer)/notifications.tsx             |   8 +-
 src/app/(customer)/profile.tsx                   |   1 +
 src/app/admin/index.tsx                          |   1 +
 src/app/notification-settings.tsx                | 162 ++++++
 src/app/provider/(tabs)/profile.tsx              |   7 +
 src/components/admin-web/admin-sidebar.tsx       |   1 +
 src/components/ui/notification-row.test.tsx      |  26 +-
 src/components/ui/notification-row.tsx           |  10 +-
 src/lib/notification-preferences.test.ts         | 107 ++++
 src/lib/notifications.ts                         |  54 ++
 supabase/functions/_shared/notifications.ts      |  40 ++
 supabase/functions/send-push/index.ts            |  42 ++
 supabase/migrations/0020_notification_system.sql | 620 +++++++++++++++++++++++
 20 files changed, 1670 insertions(+), 4 deletions(-)
```

### Files changed — all in scope

| File | Task | Purpose |
|---|---|---|
| `supabase/migrations/0020_notification_system.sql` | T1 + T2 | Schema foundation, event triggers, old-trigger drops |
| `supabase/functions/_shared/notifications.ts` | T3 | `isPushAllowed`, `specFromNotificationRow`, prefs types |
| `supabase/functions/send-push/index.ts` | T3 | Unified pipeline handler (`table==='notifications'` branch) |
| `src/lib/notifications.ts` | T4 | `AppNotification` extended type, `getNotificationPreferences`, `updateNotificationPreferences` |
| `src/lib/notification-preferences.test.ts` | T4 | Tests for prefs helpers |
| `src/components/ui/notification-row.tsx` | T4 | `handlePress` deep-link + `onPress` always called |
| `src/components/ui/notification-row.test.tsx` | T4 | Route / no-route test coverage |
| `src/app/(customer)/notifications.tsx` | T4 | Route-based deep-link + legacy booking fallback |
| `src/app/notification-settings.tsx` | T5 | Notification preferences settings screen |
| `src/app/(customer)/profile.tsx` | T4 + T5 | "Saved addresses" nav + "Notification settings" entry |
| `src/app/admin/index.tsx` | T5 | Admin header "Notifications" entry point |
| `src/app/provider/(tabs)/profile.tsx` | T5 | Provider profile "Notification settings" entry |
| `src/components/admin-web/admin-sidebar.tsx` | T6 | Notifications nav item added |
| `src/app/(admin-web)/notifications/index.tsx` | T6 | Admin-web operational notifications feed |
| `src/__tests__/notifications.test.ts` | T4 | Prefs lib + row tests |
| `src/__tests__/notification-settings.test.tsx` | T5 | Settings screen tests |
| `src/__tests__/admin-web-notifications.test.tsx` | T6 | Admin-web feed tests |
| `src/__tests__/admin.test.tsx` | T5 | Admin header entry-point test |
| `src/__tests__/profile.test.tsx` | T4 + T5 | Customer profile entry-point tests |
| `src/__tests__/provider-profile.test.tsx` | T5 | Provider profile entry-point test |

### Out-of-scope files — confirmed absent

- `src/lib/{payments,earnings,attempts,tracking,messages,push}.ts` — NOT in diff.
- `src/auth/**` — NOT in diff.
- `src/lib/bookings.ts` — NOT in diff.
- `bookings_messages` / `payments` schema shape — NOT in diff (event triggers read these tables, never alter them).
- Any chat / ChatThread logic — NOT in diff.
- Any migration other than `0020` — NOT in diff.
- `booking_activity` table definition — NOT in diff. (`log_booking_status_activity` was **recreated** to be activity-only, removing its notification insert. This is a notification-wiring change, not a timeline change. The `booking_activity` table structure and the `trg_log_booking_status` trigger binding are unchanged.)

Isolation: **CLEAN**.

---

## 12. Final Gate Results (2026-07-03)

| Check | Result |
|---|---|
| `npm test` | PASS — 112 suites, 840 tests, 0 failures |
| `npx tsc --noEmit` | PASS — no errors |
| `npx expo export --platform web` | PASS — exported to `dist/` |
| `npx expo export --platform android` | PASS — exported to `dist/` |
| `git status` (after doc commit) | CLEAN — only `supabase/.temp/` untracked |

---

## 13. Operator Checklist — Deploying Slice 23

### Pre-deploy

- [ ] Set `PUSH_WEBHOOK_SECRET` in Supabase secrets (high-entropy string, 32+ chars):
  ```bash
  supabase secrets set PUSH_WEBHOOK_SECRET=<your-value>
  ```
- [ ] Confirm `private.push_config.send_push_url` points to the deployed `send-push` URL.
- [ ] Apply migration `0020_notification_system.sql` in the Supabase SQL Editor or via `supabase db push`.

### Deploy

```bash
supabase functions deploy send-push
```

### Post-deploy verification

```sql
-- 1. Confirm notification columns added
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'notifications'
  and column_name in ('type','category','route','dedup_key','push_status','push_error','push_attempts')
order by column_name;
-- Expected: 7 rows with correct defaults.

-- 2. Confirm notification_preferences table exists
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace and relname = 'notification_preferences';
-- Expected: relrowsecurity = true.

-- 3. Confirm trg_push_notification exists and old direct-push triggers are gone
select tgname from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where tgname like 'trg_push_%';
-- Expected: only trg_push_notification.

-- 4. Confirm all 7 event triggers are enabled
select tgname, tgenabled from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where tgname like 'tg_notify_%'
order by tgname;
-- Expected: 7 rows all 'O' (enabled).

-- 5. Smoke-test: create a booking (or use an existing one) and confirm
-- notifications row appears with type/category/route/dedup_key populated.
select id, type, category, route, dedup_key, push_status
from notifications
order by created_at desc limit 5;
```

---

## 14. Rollback Plan

### Option A — Per-task git revert (preserve schema)

Revert commits from newest to oldest (T6 → T1). The `notification_preferences` table and `notifications` columns remain in the DB but the application code is back to pre-Slice-23. Existing bell rows are preserved. Re-enabling the feature is a forward re-apply of the reverted commits.

### Option B — Kill-switch (no revert, no schema change)

Fastest emergency option:

```sql
-- Stop all push globally (bell rows still created)
update private.push_config set send_push_url = null;
```

Optionally also delete `send-push` from Supabase Functions:

```bash
supabase functions delete send-push
```

Application continues to work normally; push notifications are silently skipped.

### Option C — Forward rollback migration `0021_rollback_notifications.sql`

A full schema rollback migration should:

```sql
-- 1. Drop all Slice-23 event triggers
drop trigger if exists tg_notify_booking_created  on public.bookings;
drop trigger if exists tg_notify_booking_update   on public.bookings;
drop trigger if exists tg_notify_payment_paid     on public.payments;
drop trigger if exists tg_notify_payment_failed   on public.payment_attempts;
drop trigger if exists tg_notify_chat_message     on public.booking_messages;
drop trigger if exists tg_notify_review           on public.reviews;
drop trigger if exists tg_notify_provider_pending on public.profiles;
drop trigger if exists trg_push_notification      on public.notifications;

-- 2. Drop the fan-out trigger function and event trigger functions
drop function if exists public.tg_push_notification();
drop function if exists public.tg_notify_booking_created();
drop function if exists public.tg_notify_booking_update();
drop function if exists public.tg_notify_payment_paid();
drop function if exists public.tg_notify_payment_failed();
drop function if exists public.tg_notify_chat_message();
drop function if exists public.tg_notify_review();
drop function if exists public.tg_notify_provider_pending();

-- 3. Drop helper functions
drop function if exists public.notify_user(uuid, uuid, text, text, text, text, text, text);
drop function if exists public.notify_admins(uuid, text, text, text, text, text);

-- 4. Drop notification_preferences (cascades RLS policies)
drop table if exists public.notification_preferences cascade;

-- 5. Drop the dedup index and new columns from notifications
drop index if exists public.notifications_dedup_key;
alter table public.notifications
  drop column if exists type,
  drop column if exists category,
  drop column if exists route,
  drop column if exists dedup_key,
  drop column if exists push_status,
  drop column if exists push_error,
  drop column if exists push_attempts;

-- 6. (Optional) Restore old direct-push triggers if needed for the pre-Slice-23 state
-- This is only necessary if push was working via the old triggers.
-- Recreate trg_push_bookings / trg_push_payments / trg_push_booking_messages here.
```

Bell rows in `notifications` are **preserved** by this migration (we only drop columns and the index). Existing `is_read` / `booking_id` / `title` / `body` data is safe.

> Note: This forward migration is safe at any time — there is no foreign key from any other table into `notification_preferences`, and `notifications` column drops are non-destructive (default columns with no business data that wasn't already in older columns).
