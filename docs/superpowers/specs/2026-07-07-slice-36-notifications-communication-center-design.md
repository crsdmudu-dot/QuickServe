# Slice 36 — Notifications & Communication Center (Design Spec)

**Date:** 2026-07-07
**Status:** Design → (user review, then implementation plan)
**Builds on / consolidates (reuses):** the EXISTING notification system — `notifications` table (0007 base + 0020: `user_id`, `title`, `body`, `is_read`, `created_at`, `type`, `category`, `route`, `dedup_key`, push-pipeline cols), `notification_preferences` (0020: owner-only RLS; `push_enabled`/`chat_enabled`/`booking_enabled`/`payment_enabled`/`marketing_enabled`), `device_tokens` (0014) + the live push triggers (0015/0020) + the `notify_user` RPC (fires booking notifications), `src/lib/notifications.ts` (`getMyNotifications`/`markNotificationRead`/`markAllNotificationsRead`/`get/updateNotificationPreferences`), and the 3 existing screens (`(customer)/notifications.tsx`, `provider/(tabs)/notifications.tsx`, `(admin-web)/notifications/index.tsx`). **This slice EXTENDS that live system into a richer Communication Center — it does not rebuild it.** Nothing in booking/dispatch/payment/wallet/promotions/ranking/auth/Operations-workflow/analytics is touched.

## 1. Goal & Decisions

A centralized notification & communication center for customers, providers and admins — richer types, read/unread + history, preferences, filters, deep links, and a notification bell/badge. **Communication only** — no booking/dispatch/payment/ranking/auth workflow change.

**Confirmed decisions (brainstorm):**
- **Extend the existing tables additively.** ADD to `notifications`: `audience_type`, `metadata_json`, `priority`, `read_at` (reuse `type` as notification-type, `category` as the filter bucket, `route` as the deep-link, `is_read`/`dedup_key`/push-cols). Extend `notification_preferences` with the new category/channel toggles. **The live booking triggers + push pipeline + existing screens keep working.**
- **Generic `emit_notification` RPC** (preference-respecting) + **reuse the existing booking-event triggers** (already emit booking notifications). **NO new triggers** on operations/quality/payment/wallet tables (honors "no Operations/payment/wallet workflow change"). New notification types are schema-ready + emit-ready; specific auto-wiring is deferred/opt-in.
- **Email/SMS toggles are display-only (send nothing this slice).** Push reflects the existing pipeline (unchanged). The **in-app notification center is the only active delivery**.

## 2. Scope & Constraints (hard rules)

**In scope:** additive schema (richer notification fields + extended preferences); a generic preference-respecting `emit_notification` RPC + an admin `broadcast_announcement` RPC; read/unread + `read_at`; unread counts; category filters; the notification-type catalog (all customer/provider/admin types); deep links (reuse existing routes); enhanced Notification Center screens (customer/provider/admin) + a notification bell/badge; components (`NotificationCard`/`NotificationBadge`/`NotificationBell`/empty state/grouped list/priority indicator); verification.

**Out of scope / MUST NOT change:**
- No booking-workflow / dispatch / payment-logic / wallet-logic / promotions-logic / ranking / auth / Operations-workflow / analytics change. No AI. No marketing campaigns.
- The existing `notify_user` RPC + booking-event triggers + push pipeline are UNCHANGED (additive columns only). `emit_notification` is a NEW additive helper; it never alters any business workflow — it only inserts a notification (respecting prefs).
- Email/SMS integration is out of scope — those toggles store a preference and send nothing. No new push-provider work (existing pipeline as-is).
- No hard delete of notifications (read-state only) — consistent with the existing table.

## 3. Data model — migration `0031_communication_center.sql` (additive)

### 3.1 `notifications` — ADD columns (all `add column if not exists`)
- `audience_type text check (audience_type in ('customer','provider','admin'))` (nullable; set by emit).
- `metadata_json jsonb not null default '{}'` (ids/context for deep links).
- `priority text not null check (priority in ('low','normal','high','urgent')) default 'normal'`.
- `read_at timestamptz` (set when marked read).
- **Reuse:** `type` = the granular notification_type, `category` = the filter bucket (booking/payment/promotion/system/quality/chat), `route` = the deep_link, `is_read`, `user_id`, `title`, `body`, `created_at`, `dedup_key`. **No new RLS/no delete** — the existing owner-select RLS + no-delete stand.

### 3.2 `notification_preferences` — ADD columns (`add column if not exists`)
- `quality_enabled boolean not null default true`, `system_enabled boolean not null default true`, `email_enabled boolean not null default false`, `sms_enabled boolean not null default false`.
- **Reuse:** `booking_enabled` (Booking updates), `payment_enabled` (Payments), `marketing_enabled` (Promotions), `push_enabled` (Push — existing pipeline), `chat_enabled`. Existing owner-only RLS unchanged. Email/SMS default `false` (future-ready, no send).

### 3.3 RPCs (additive; SECURITY DEFINER, `set search_path = public`)
- `emit_notification(p_user_id uuid, p_audience_type text, p_notification_type text, p_category text, p_title text, p_body text, p_deep_link text, p_metadata jsonb, p_priority text) returns uuid` — **preference-respecting:** look up the recipient's `notification_preferences`; if the category's toggle is OFF (booking→booking_enabled, payment→payment_enabled, promotion→marketing_enabled, quality→quality_enabled, system→system_enabled; default-on when no prefs row), **skip the insert and return null**; else insert into `notifications` (reusing `type`=notification_type, `category`, `route`=deep_link + the new cols), honoring `dedup_key` if present. **Guarded:** callable by admins (announcements) and by SECURITY DEFINER internal callers; a non-admin cannot emit to another user (a non-admin may only emit to themselves for safe self-notifications, e.g. a client review reminder — or restrict entirely to admin/definer). It performs NO business action — only the notification insert.
- `broadcast_announcement(p_audience_type text, p_title text, p_body text, p_deep_link text, p_priority text) returns int` — **admin-only** (`is_admin()` guard); emits a `system`/announcement notification to every user of the audience (customer/provider/admin), respecting each recipient's `system_enabled`. Returns the count. (Covers "General announcements" / "System announcements".)
- (The existing booking triggers keep using `notify_user` unchanged. Wiring emit points for other types — refund/wallet-credit/quality/support-case/etc. — is deferred/opt-in and NOT added as new triggers this slice.)

## 4. Client — libs & constants

- `src/lib/notifications.ts` (extend) — `AppNotification` gains `audience_type?`, `notification_type` (=type), `deep_link` (=route), `metadata?`, `priority`, `read_at?`. `getMyNotifications(filter?, page?, pageSize?)` (filter: all/unread/booking/payments/promotions/system → category/is_read query). `getUnreadCount(): Promise<number>`. `markNotificationRead`/`markAllNotificationsRead` also set `read_at = now()`. `getNotificationPreferences`/`updateNotificationPreferences` extended with the new toggles. Admin: `adminBroadcastAnnouncement(...)`, `emitNotification(...)` (thin wrappers over the RPCs). Reads `[]`/0-safe; mutations `{ ok, error? }`.
- `src/constants/notifications.ts` — `NOTIFICATION_TYPES` (the full customer/provider/admin catalog with `{ type, label, icon, category, defaultPriority, deepLinkTemplate? }`), `NOTIFICATION_FILTERS` (All / Unread / Booking / Payments / Promotions / System), `PRIORITY_LEVELS` (+ colors), `PREFERENCE_TOGGLES` (Booking updates / Payments / Promotions / Quality / System + future-ready Email / Push / SMS, each with a `futureReady?` flag), and a `resolveDeepLink(notification)` helper (maps a notification's `deep_link`/`metadata` to an existing route — booking/payment/wallet/review/support-case/provider-quality/promotions).

## 5. Components

`NotificationCard` (icon, title, body, time, unread dot, priority indicator, tap→deep link), `NotificationBadge` (unread count pill), `NotificationBell` (bell icon + badge for headers), `NotificationEmptyState`, `NotificationGroupedList` (grouped by date: Today / Yesterday / Earlier), `PriorityIndicator`. Reuse existing UI primitives + tokens.

## 6. Screens (enhance the existing — do not rebuild)

- **Customer Notification Center** (`(customer)/notifications.tsx`) — unread badge, mark-read (tap), **mark all read**, **filters** (All/Unread/Booking/Payments/Promotions/System), grouped list, deep-link on tap. Paginated (`usePaginatedList`).
- **Provider Notification Center** (`provider/(tabs)/notifications.tsx`) — same concept (provider types incl provider-visible quality action, conduct reminder, system announcements).
- **Admin Operations notifications** (`(admin-web)/notifications/index.tsx`) — the admin's own notifications (new support case/dispute/provider signup/failed payment/system alerts) with filters + read state, PLUS a **broadcast-announcement composer** (audience + title + body + priority → `broadcast_announcement`). Admin-only.
- **Preferences** — extend the existing notification-settings screen (reachable from profile) with the new category toggles (Booking/Payments/Promotions/Quality/System) + the future-ready channel toggles (Email/Push/SMS shown, Email/SMS disabled "coming soon", no send).
- **Notification bell/badge** — add a `NotificationBell` (unread badge) to the customer/provider header/entry where a header exists (additive; no new navigation architecture — tapping opens the existing notifications route).

## 7. Deep links

A notification's `deep_link` (existing `route`) + `metadata_json` open an EXISTING route via `router.push` — Booking (`/booking/[id]`), Payment/Wallet (`/wallet`/payment context), Review (`/booking/review`), Support case (`/(admin-web)/operations/[id]`), Provider quality (`/provider/quality` or admin `/(admin-web)/provider-quality/[id]`), Promotions. **No new navigation architecture** — `resolveDeepLink` maps to routes that already exist.

## 8. Testing / Verification

- **DB/RLS (as-role):** notifications stay owner-select (a user reads only their own; no cross-user); preferences owner-only; the added columns are additive (existing rows valid). `emit_notification` respects the category preference (skips when OFF); `broadcast_announcement` is admin-only + respects `system_enabled`. No delete policy added.
- **Read state:** mark-read sets `is_read`+`read_at`; mark-all-read; unread count correct after read.
- **Filters:** All/Unread/Booking/Payments/Promotions/System narrow correctly (by category/is_read).
- **Preferences respected:** emit skipped when the recipient disabled that category; email/sms toggles store-only (no send).
- **Isolation / no-workflow proof:** only additive notification columns + the 2 RPCs + the lib/constants/components/screens changed — NO booking/dispatch/payment/wallet/promotions/ranking/auth/Operations-workflow/analytics file; the existing `notify_user`/booking triggers/push pipeline UNCHANGED.
- Gate: `npm test` green, `npx tsc --noEmit` clean, `expo export` web + android green.

## 9. Guardrails restated (verification will prove)

Additive extension of the live notification system; existing booking triggers + `notify_user` + push pipeline untouched; `emit_notification` inserts-with-preference-respect only (no business action); `broadcast_announcement` admin-only; email/sms send nothing; in-app center = only active delivery; no delete (read-state only); no booking/dispatch/payment/wallet/promotions/ranking/auth/Operations-workflow/analytics change; no AI; no marketing campaigns.

## 10. Open assumptions

- `notification_type` reuses the existing `type` column (semantic granular type); the filter bucket reuses `category`. The full type catalog lives in `constants/notifications.ts`; some types already auto-emit (booking) via existing triggers, others are schema/emit-ready with wiring deferred (per the decision) — the Center displays/filters/reads all types regardless of emit source.
- `deep_link` reuses `route`; `resolveDeepLink` maps only to existing routes (no new nav).
- Admin "Operations notifications" = the admin user's own notifications (owner-select), not a shared feed; broadcasts create per-user rows.
- Future-ready channels (email/sms) are stored preferences with no send; push reflects the existing pipeline (no push-provider change).
- Rollback: drop the added columns + the 2 new RPCs → the live pre-slice notification system remains intact (no data to reverse; existing notifications keep their base columns).
