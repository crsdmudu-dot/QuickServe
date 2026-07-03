# Slice 23 — Notifications 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One unified operational notification pipeline — every event inserts a `notifications` row (bell) that fans out push through the existing infra — covering the full customer/provider/admin matrix, with per-user preferences (push-gated) and de-duplication.

**Architecture:** `public.notifications` is the single source of truth. Event triggers on source tables INSERT enriched rows (`type`/`category`/`route`/`dedup_key`); one `AFTER INSERT` trigger fans out push via the existing `notify_send_push` (pg_net → `send-push`). The bell always records; only push respects `notification_preferences`. Old direct-push triggers are dropped to prevent double-push.

**Tech Stack:** Supabase (Postgres triggers/RLS/RPCs, pg_net, Edge Function/Deno), Expo RN + TS, Expo Router, Jest + RNTL.

## Global Constraints

- **Unified `notifications` table is the source of truth** — one row per logical event → bell + push. NO second notification store.
- **Preferences gate PUSH ONLY** — the in-app bell row is ALWAYS written; `send-push` applies `notification_preferences` (absent = defaults; **marketing default OFF**). Categories→toggle: `chat/booking/payment/marketing`; `system`→gated only by `push_enabled`.
- **Avoid duplicate pushes** — DROP the old direct-push triggers (`trg_push_bookings`, `trg_push_payments`, `trg_push_booking_messages`); push now flows only from the `AFTER INSERT ON notifications` fan-out. Dedup via partial-unique `dedup_key` + `on conflict do nothing`; **chat `dedup_key = NULL`** (never deduped).
- **`dedup_key` format** = `'<recipient_id>:<booking_id>:<type>'` for idempotent events; admin fan-out appends admin id (`<base>:<admin_id>`). NULL for chat.
- **NO pg_cron / retry queue this slice** — durable bell row + `push_status` (`pending/sent/skipped/no_token/failed`) + `push_error` text + `push_attempts`; prune dead tokens (existing). Missing token → `no_token`, never an error. `send-push` always returns 200.
- **Nearby/arrived + scheduled booking_reminder + admin_review_flagged = future-ready** — types/routes documented in the migration comment, NOT triggered.
- **No payment/auth/chat/tracking business-logic change** — triggers only READ those tables to route notifications. No schema change to `bookings`/`payments`/`booking_messages`/tracking. `booking_activity` timeline writes unchanged.
- **Reuse** `device_tokens`, `private.push_config` + `notify_send_push` + kill-switch, the `PUSH_WEBHOOK_SECRET`, `_shared/expo-push-client.ts`, `routeForNotificationData` deep-linking. Existing `_shared/notifications.ts` pure helpers + tests KEPT (superseded, not deleted).
- Gate every task: `npm test` green, `npx tsc --noEmit` clean, `expo export --platform web` AND `--platform android` succeed.

---

## File Structure

**Create**
- `supabase/migrations/0020_notification_system.sql` — columns + dedup index, `notification_preferences` + RLS, `notify_user`/`notify_admins`, fan-out trigger, event triggers, drop-old-triggers, future-ready comment.
- `src/app/notification-settings.tsx` — root pushable settings screen.
- `src/__tests__/notification-settings.test.tsx`, `src/lib/notification-preferences.test.ts` (or fold into notifications.test), `supabase/functions/_shared/notifications.test.ts` additions.
- `docs/pilot/notifications.md` — verification doc.

**Modify**
- `supabase/functions/_shared/notifications.ts` — add pure `specFromNotificationRow` + `isPushAllowed`.
- `supabase/functions/send-push/index.ts` — add `table === 'notifications'` branch (prefs gate + `push_status`).
- `src/lib/notifications.ts` — extend `AppNotification`; add `getNotificationPreferences`/`updateNotificationPreferences`.
- `src/components/ui/notification-row.tsx` — deep-link on tap via `route` (additive).
- `src/app/(customer)/profile.tsx`, `src/app/(provider)/profile.tsx` (or provider equiv), `src/app/(admin)/…profile/settings` — "Notification settings" entry.
- Admin-web: an operational notifications feed screen/section (reuse `notification-list`).

**Reuse (do not modify):** `device_tokens`, `push_config`/`notify_send_push`, `_shared/expo-push-client.ts`, `push.ts`, `booking_activity`.

---

## Task Order (dependency-ordered)

1. **T1** — Migration `0020`: notifications columns + dedup index + `notification_preferences` + RLS + `notify_user`/`notify_admins` + fan-out trigger. (No event triggers yet — foundation only.)
2. **T2** — Migration `0020` (same file, continued): event triggers for the full matrix + **drop old direct-push triggers**. (Split as its own task/commit for review clarity; edits the same migration file.)
3. **T3** — `send-push` `notifications` branch + pure helpers (`specFromNotificationRow`, `isPushAllowed`) + Edge tests.
4. **T4** — Client lib: extend `AppNotification` + preferences helpers + notification-row deep-link (+ tests).
5. **T5** — Notification Settings screen + profile entry points (customer/provider/admin) (+ tests).
6. **T6** — Admin-web operational notifications feed (+ tests).
7. **T7** — Verification `docs/pilot/notifications.md` + backward-compat + isolation + final gate.

Each task ends green (tests / tsc / both exports).

---

### Task 1: Migration `0020` — foundation (columns, prefs, helpers, fan-out)

**Files:** Create `supabase/migrations/0020_notification_system.sql`

**Build (mirror `0015`/`0019` style):**
- **Extend `notifications`** (all `add column if not exists`, defaults so old inserts still work):
  `type text not null default 'generic'`; `category text not null default 'booking' check (category in ('booking','chat','payment','marketing','system'))`; `route text`; `dedup_key text`; `push_status text not null default 'pending' check (push_status in ('pending','sent','skipped','no_token','failed'))`; `push_error text`; `push_attempts int not null default 0`.
- Partial unique index `notifications_dedup_key on notifications (dedup_key) where dedup_key is not null`.
- Extend the existing `notifications_update` policy so the `with check` also pins the new immutable columns (`type`/`category`/`route`/`dedup_key` unchanged) — users may still only flip `is_read`. (`push_status`/`push_error`/`push_attempts` are set by `send-push` via service role → bypasses RLS.)
- **`notification_preferences`** table (§3b of spec) + `enable row level security` + owner-only select/insert/update (`user_id = auth.uid()`, insert/update `with check`). NO admin/provider policy.
- **`notify_user(p_user_id uuid, p_booking_id uuid, p_title text, p_body text, p_type text, p_category text, p_route text, p_dedup_key text) returns void`** `security definer set search_path=public`: `if p_user_id is null then return; end if;` then `insert into notifications (user_id, booking_id, title, body, type, category, route, dedup_key) values (...) on conflict (dedup_key) do nothing;`.
- **`notify_admins(p_booking_id uuid, p_title text, p_body text, p_type text, p_route text, p_dedup_base text) returns void`** `security definer`: `for v_admin in select id from profiles where role='admin' and approval_status='approved' loop perform notify_user(v_admin.id, p_booking_id, p_title, p_body, p_type, 'system', p_route, p_dedup_base||':'||v_admin.id); end loop;`.
- **Fan-out trigger** `tg_push_notification()` `after insert on notifications`: `perform notify_send_push(jsonb_build_object('table','notifications','op','INSERT','record',to_jsonb(new)));` then `return new;`. `drop trigger if exists trg_push_notification on notifications; create trigger ...`.
- Header comment block listing **future-ready** types (`provider_nearby`, `provider_arrived`, `booking_reminder`, `admin_review_flagged`) as documented-not-wired.

**Steps:** write migration → `npm test` (unchanged; ~797) → `tsc` → both exports → commit `feat: slice23 notifications schema + prefs + fan-out (0020)`.
> DB not applied locally (no Postgres) — behavioral verify in T7.

---

### Task 2: Migration `0020` — event triggers + drop old direct-push

**Files:** Modify `supabase/migrations/0020_notification_system.sql` (append)

**Build — one trigger function per source, each calling `notify_user`/`notify_admins`:**
- **`bookings` AFTER INSERT** `tg_notify_booking_created`: `notify_user(new.customer_id, new.id, 'Booking received', 'We received your booking.', 'booking_received', 'booking', '/booking/'||new.id, new.customer_id||':'||new.id||':booking_received')`; `notify_admins(new.id, 'New booking', 'A new booking was created.', 'admin_new_booking', '/admin/booking/'||new.id, new.id||':admin_new_booking')`. (Keep existing `log_booking_created` activity write — either extend it or add a separate trigger; do NOT remove the activity insert.)
- **`bookings` AFTER UPDATE** `tg_notify_booking_update` (fires when status OR quote_status OR assigned_provider_id changed):
  - status transitions (`new.status is distinct from old.status`): map to §3e table — `provider_assigned`→customer `provider_assigned` + provider `booking_assigned` (`/provider/job/{id}`); `on_the_way`→customer `heading_to_you` (`/booking/track/{id}`); `in_progress`→customer `work_started`; `completed`→customer `work_completed` **and** `review_reminder` (`/booking/{id}`); `cancelled`→ assigned provider `booking_cancelled` + (if `old.assigned_provider_id is not null`) `notify_admins ... 'admin_cancelled_after_assign'`.
  - assignment cleared (`old.assigned_provider_id is not null and new.assigned_provider_id is null`): `notify_admins ... 'admin_provider_rejected' '/admin/booking/{id}'`.
  - quote_status (`new.quote_status is distinct from old.quote_status`): `sent`→customer `quote_received`; `accepted`→provider `quote_accepted` (`/provider/job/{id}`); `declined`→provider `quote_rejected`.
  - Keep the existing `log_booking_status_activity` **activity** insert (timeline) — but REMOVE its now-duplicate `notifications` inserts (the new trigger owns notifications). Net: activity unchanged, notifications richer + single-sourced.
- **`payments` AFTER UPDATE → paid** `tg_notify_payment_paid` (`when new.status='paid' and old.status is distinct from 'paid'`): customer `payment_confirmed` (`/booking/{booking_id}`, category `payment`) + assigned provider (look up `bookings.assigned_provider_id`) `payment_received` (category `payment`).
- **`payment_attempts` AFTER INSERT OR UPDATE → failed** `tg_notify_payment_failed` (`when new.status='failed'`): resolve `booking_id` via `payments` (`payment_id`→`booking_id`); `notify_admins(..., 'admin_payment_failed', '/admin/booking/'||booking_id, booking_id||':admin_payment_failed')`. Dedup on the attempt id to avoid re-fire: base `= new.id||':admin_payment_failed'`.
- **`booking_messages` AFTER INSERT** `tg_notify_chat_message`: resolve booking (`customer_id`, `assigned_provider_id`); recipient = non-sender; route customer `/booking/chat/{id}` else `/provider/job/chat/{id}`; body ≤80 chars + '…'; **`dedup_key = NULL`** (pass NULL → no conflict target: insert directly, do NOT use `on conflict`). category `chat`.
- **`reviews` AFTER INSERT** `tg_notify_review`: `notify_user(new.provider_id, new.booking_id, 'New review', 'You received a new review.', 'review_received', 'booking', '/provider/job/'||new.booking_id, new.provider_id||':'||new.id||':review_received')`.
- **`profiles` AFTER INSERT** `tg_notify_provider_pending` (`when new.role='provider' and new.approval_status='pending'`): `notify_admins(null, 'New provider', 'A provider is awaiting approval.', 'admin_provider_pending', '/admin/providers', new.id||':admin_provider_pending')`.
- **DROP** `trg_push_bookings`, `trg_push_payments`, `trg_push_booking_messages` (old direct-push) — superseded by the notifications fan-out. Leave `tg_push_*` functions defined (harmless) OR drop them too; do NOT drop `notify_send_push`.

> `notify_user` uses `on conflict (dedup_key) do nothing`; for chat (NULL key) the trigger inserts WITHOUT the conflict path (a NULL dedup_key can't violate the partial index; but `on conflict do nothing` is still safe since NULLs are distinct — either is fine, keep it simple).

**Steps:** append triggers → `npm test` → `tsc` → both exports → commit `feat: slice23 notification event triggers + drop old push triggers`.

---

### Task 3: `send-push` notifications branch + pure helpers

**Files:** Modify `supabase/functions/_shared/notifications.ts`, `supabase/functions/send-push/index.ts`; Test `supabase/functions/_shared/notifications.test.ts`

**Build:**
- Pure `isPushAllowed(prefs: { push_enabled; chat_enabled; booking_enabled; payment_enabled; marketing_enabled } | null, category: string): boolean` — `null`/undefined fields default (push/chat/booking/payment = true, marketing = false); `false` when `!push_enabled`; else map category→toggle (`system` → true when `push_enabled`).
- Pure `specFromNotificationRow(record: { user_id; title; body; type; route }): NotificationSpec` → `{ recipientUserId: user_id, title, body, data: { type, route: route ?? '' } }`.
- `send-push` `table === 'notifications'` branch: build spec; fetch `notification_preferences` (service role, `maybeSingle`, absent → null → defaults); `if (!isPushAllowed(prefs, record.category)) → update notifications set push_status='skipped' where id=record.id; continue;`. Else fetch `device_tokens`; none → `push_status='no_token'`. Else send → `push_status = 'sent' | 'failed'`, `push_error` on failure, `push_attempts = (record.push_attempts ?? 0)+1`; prune dead tokens (existing). Update the row via service role. Keep old branches (dead once triggers dropped; preserves their tests). Always 200.

**Tests (Jest, Deno-free):** `isPushAllowed` — each category on/off, missing prefs = defaults, marketing off by default, `push_enabled=false` blocks all. `specFromNotificationRow` — maps fields, null route → ''. Existing helper tests unchanged.

**Steps:** TDD helpers → wire branch → `tsc` (app tsconfig excludes Deno files; helper tests run under Jest per existing setup) → `npm test` → both exports → commit `feat: slice23 send-push notifications branch + prefs gating`.

---

### Task 4: Client lib — extended type + preferences helpers + row deep-link

**Files:** Modify `src/lib/notifications.ts`, `src/components/ui/notification-row.tsx`; Test `src/lib/notifications.test.ts` (or new `notification-preferences.test.ts`), `src/components/ui/notification-row.test.tsx`

**Build:**
- Extend `AppNotification` with optional `type?: string; category?: string; route?: string | null; push_status?: string`. (Backward-compatible — existing reads unaffected.)
- `type NotificationPreferences = { push_enabled; chat_enabled; booking_enabled; payment_enabled; marketing_enabled: boolean }`.
- `getNotificationPreferences(): Promise<NotificationPreferences>` — select own row `maybeSingle`; absent/error → the defaults object (marketing false).
- `updateNotificationPreferences(patch: Partial<NotificationPreferences>): Promise<{ ok; error? }>` — `upsert({ user_id: auth user, ...patch, updated_at })` onto `notification_preferences` (owner-only). Not signed in → `{ ok:false }`.
- `notification-row.tsx`: when the notification has a non-empty `route`, wrap/press → `router.push(route)`; keep existing rendering + read-marking behavior intact.

**Tests:** prefs get (row → values; absent → defaults with marketing false); update (upsert with user id + updated_at; not-signed-in → ok:false); row tap with route → `router.push(route)`, row without route → no navigation; existing notification-row/list tests stay green (add `expo-router` mock if needed).

**Steps:** TDD → `tsc` → `npm test` → both exports → commit `feat: slice23 notification prefs lib + row deep-link`.

---

### Task 5: Notification Settings screen + profile entries

**Files:** Create `src/app/notification-settings.tsx`; Modify customer/provider/admin profile screens; Test `src/__tests__/notification-settings.test.tsx` (+ profile nav tests)

**Build (mirror Slice-22 `saved-addresses.tsx` root-pushable pattern):**
- Root screen `/notification-settings`: on mount `getNotificationPreferences()` → local toggles; five switches (push / chat / booking / payment / marketing[off]); each toggle → `updateNotificationPreferences({ [key]: value })` (optimistic + reload on error). Loading skeleton; a note that toggles affect push only (bell always records). Owner-only.
- Add a **"Notification settings"** button → `router.push('/notification-settings')` on each role's profile/settings screen (customer `src/app/(customer)/profile.tsx`; provider profile; admin profile/settings — locate each). Additive; don't disturb existing entries.

**Tests:** settings screen renders toggles from mocked prefs; toggling calls `updateNotificationPreferences` with the key; profile entry navigates to `/notification-settings`. Keep existing profile tests green (add `expo-router` mock where needed; never weaken).

**Steps:** `expo export --platform android` first (new route type) → `tsc` → `npm test` → `expo export --platform web` → commit `feat: slice23 notification settings screen + profile entries`.

---

### Task 6: Admin-web operational notifications feed

**Files:** Create/Modify an admin-web screen under `src/app/(admin-web)/…`; Test the corresponding admin-web test

**Build:**
- An **Operational notifications** feed for the signed-in admin: reuse `getMyNotifications` + `notification-list`/rows to show the admin's own `system`-category rows (new bookings, provider-pending, failed payments, cancellations, rejections), newest first, with deep-link on tap. Read-only (no new write path; RLS keeps it own-only).
- Surface it where useful in the admin-web IA (a nav entry or a dashboard panel) — additive; don't disturb existing admin-web screens.

**Tests:** feed renders admin notifications from mocked lib; tap deep-links; existing admin-web tests stay green.

**Steps:** `tsc` → `npm test` → both exports → commit `feat: slice23 admin-web operational notifications feed`.

---

### Task 7: Verification, backward-compat, isolation, final gate

**Files:** Create `docs/pilot/notifications.md`

- **Matrix + dedup verification (documented SQL + manual):** for each §3e event, exactly one bell row is created for the right recipient(s) (customer/provider/admin) with correct `type`/`category`/`route`; **dedup** prevents a duplicate on trigger re-run (`on conflict do nothing`); **chat is NOT deduped** (two messages = two rows); admin fan-out reaches only `role='admin' and approval_status='approved'`; **prefs gate push, NOT the bell** (disable a category → bell still records, `push_status='skipped'`); kill-switch (`send_push_url` NULL) → bell works, push silent; missing token → `no_token`.
- **No-duplicate-push check:** confirm the old `trg_push_bookings/payments/booking_messages` are dropped and push flows only via `trg_push_notification` (one push per notifications row).
- **Backward-compat:** existing bell (`getMyNotifications`/mark-read) unchanged; new columns additive with defaults; `device_tokens`/`push_config`/secret/deep-linking reused.
- **Isolation:** `git diff <base>..HEAD --stat` — only notification files changed; NO `bookings`/`payments`/`booking_messages`/tracking schema or business-logic change; `booking_activity` writes unchanged; no `src/auth/**`; no chat/payment/tracking lib change.
- **Future-ready audit:** `provider_nearby`/`provider_arrived`/`booking_reminder`/`admin_review_flagged` documented, NOT triggered.
- **Final gate:** `expo export` web + android, `tsc` clean, `npm test` green, `git status` clean.
- Commit `test: slice23 notifications verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-23-notifications`. Abandon = `git checkout main` + delete branch.
- **Per-task revert:** independent commits — `git revert <commit>` rolls back one task. Reverting T3 (send-push branch) leaves the bell working, push simply no-ops the notifications table (old branches gone → nothing sent) — safe. Reverting T2 restores the old direct-push triggers behavior only if T2's DROP is also reverted (the revert includes re-adding them).
- **Kill-switch (no revert):** set `private.push_config.send_push_url = NULL` → all push silent instantly; bell unaffected. Per-user: `notification_preferences.push_enabled=false`.
- **Schema rollback:** forward-only `0021_rollback_notifications.sql` — drop the event triggers + `tg_push_notification` + `notify_user`/`notify_admins`, drop `notification_preferences`, drop the new `notifications` columns + dedup index, and (optionally) recreate the old direct-push triggers. Notifications table itself and existing bell rows preserved.
- **No payment/auth/chat/tracking involvement** — rollback confined to notification wiring.

---

## Self-Review

- **Spec coverage:** columns+dedup (T1), prefs+RLS+helpers+fan-out (T1), event matrix + drop-old-triggers (T2), send-push branch+gating+`push_status` (T3), client type+prefs+deep-link (T4), settings screen+entries (T5), admin-web feed (T6), verification+isolation+future-ready (T7). Preferences gate push-only (T3), bell always records (T2 inserts unconditionally). No pg_cron/retry (durable row + `push_status`/`push_error` only). Nearby/arrived future-ready (T1 comment, not triggered). No payment/auth/chat/tracking business-logic change (triggers read-only; T7 isolation). Duplicate pushes avoided (T2 drops old triggers; single fan-out).
- **Placeholder scan:** none; concrete SQL/handlers/tests per task.
- **Name consistency:** `notify_user`/`notify_admins`/`tg_push_notification` (T1) used by T2 triggers; `dedup_key` format consistent T1↔T2↔T7; `push_status`/`push_error`/`push_attempts` consistent T1↔T3↔T7; `isPushAllowed`/`specFromNotificationRow` (T3) match send-push usage; `getNotificationPreferences`/`updateNotificationPreferences` + `NotificationPreferences` consistent T4↔T5; `route`/`category`/`type` fields consistent across T1/T3/T4; reuses `notify_send_push`/`device_tokens`/`routeForNotificationData`.
