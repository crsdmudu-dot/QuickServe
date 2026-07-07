# Slice 36 — Notifications & Communication Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Slice-23 notification system into a richer Communication Center (types, read/unread history, preferences, filters, deep links, bell/badge) — communication only, no booking/dispatch/payment/ranking/auth/workflow change.

**Architecture:** Migration `0031` ADDS columns to the live `notifications` + `notification_preferences` tables (never rebuilds) + two additive SECURITY DEFINER RPCs (`emit_notification` = unconditional in-app insert; `broadcast_announcement` = admin). Extend `notifications.ts` + a new `constants/notifications.ts`, new components, and enhance the 3 existing notification screens + preferences. The live `notify_user`/booking triggers/push pipeline are UNTOUCHED. **In-app history is durable — preferences gate future delivery layers, never the in-app insert.**

**Tech Stack:** Supabase (additive migration + RPCs), Expo Router (customer/provider apps + `(admin-web)`), TypeScript, Jest + RNTL.

**Spec:** `docs/superpowers/specs/2026-07-07-slice-36-notifications-communication-center-design.md`

## Preference model (the approved clarification — binds every task)

- **`emit_notification` ALWAYS inserts the notification row** (durable in-app history). It does NOT read/skip on category preferences.
- **Preferences gate DELIVERY layers, not in-app history:** push = the EXISTING pipeline (unchanged, already respects `push_enabled`); email/SMS = **future-ready display-only** (send nothing this slice). The category toggles (booking/payments/promotions/quality/system) are stored preferences that *future* delivery layers respect — the in-app Communication Center is unaffected.
- **Users can filter, read, mark-read, and view full history regardless of any push/channel preference.**

## Global Constraints (bind every task)

- **Extend the Slice-23 system additively — do NOT rebuild.** Do NOT change/break `notify_user`, the booking-event triggers, or the push pipeline. All schema changes are `add column if not exists`. No delete (read-state only — consistent with the existing table).
- **In-app history durable; preferences never suppress the in-app insert.** Email/SMS toggles are display-only/future-ready (no send). Push behavior unchanged.
- **No** booking / dispatch / payment / wallet / promotions / ranking / auth / Operations-workflow / analytics change. **No AI. No marketing campaigns.**
- Migration file is `supabase/migrations/0031_communication_center.sql` (next after 0030). Reuse: the existing `notifications` (`type`=notification_type, `category`=filter bucket, `route`=deep_link, `is_read`, `dedup_key`) + owner-select RLS; `notification_preferences` owner-only RLS; `notifications.ts` (`getMyNotifications`/`markNotificationRead`/`markAllNotificationsRead`/`get/updateNotificationPreferences`); the 3 existing screens; `usePaginatedList`; `is_admin()` + SECURITY DEFINER idiom. **Gate every task:** `npm test` green, `npx tsc --noEmit` clean, `expo export` web + android green.

---

## File Structure

**Create**
- `supabase/migrations/0031_communication_center.sql` — additive columns + `emit_notification` + `broadcast_announcement`.
- `src/constants/notifications.ts` (+ test).
- `src/components/ui/` (or `src/components/notifications/`): `notification-card.tsx`, `notification-badge.tsx`, `notification-bell.tsx`, `notification-grouped-list.tsx`, `notification-priority-indicator.tsx`, `notification-empty-state.tsx` (+ tests).
- `docs/pilot/communication-center.md` — verification doc.

**Modify (additive)**
- `src/lib/notifications.ts` — extend types + `getMyNotifications(filter?)` + `getUnreadCount` + `read_at` on mark-read + extended preferences + admin broadcast/emit wrappers.
- `src/app/(customer)/notifications.tsx`, `src/app/provider/(tabs)/notifications.tsx`, `src/app/(admin-web)/notifications/index.tsx` — enhance (filters/mark-all/grouped/deep-link/badge).
- The existing notification-settings screen (`/notification-settings`) — add the new category + future-ready channel toggles.
- Customer/provider header or entry — add `NotificationBell` (additive).

**Reuse (do not change behavior):** `notify_user` + booking triggers + push pipeline + `device_tokens`; existing routes for deep links.

---

## Task Order (dependency-ordered)

1. **T1** — Migration 0031: additive notifications + notification_preferences columns + `emit_notification` (unconditional insert) + `broadcast_announcement` (admin) + schema tests.
2. **T2** — `notifications.ts` extensions + `constants/notifications.ts` (type catalog, filters, priority, toggles, `resolveDeepLink`) + tests.
3. **T3** — Components (card, badge, bell, grouped list, priority indicator, empty state) + tests.
4. **T4** — Customer + provider Notification Center improvements (filters, mark-all, unread badge, grouped, deep links) + tests.
5. **T5** — Admin notifications/announcements screen + preferences screen extension + `NotificationBell` placement + deep-link wiring + tests.
6. **T6** — Verification doc + isolation + no-workflow proof + final gate.

Each task ends green (`npm test` / `tsc` / both exports).

---

### Task 1: Migration 0031 — additive columns + emit/broadcast RPCs

**Files:** Create `supabase/migrations/0031_communication_center.sql`; Test `src/__tests__/communication-center-schema.test.ts`

**Build (SQL):**
- `notifications` — `add column if not exists`: `audience_type text check (audience_type in ('customer','provider','admin'))`; `metadata_json jsonb not null default '{}'`; `priority text not null check (priority in ('low','normal','high','urgent')) default 'normal'`; `read_at timestamptz`. (Reuse `type`/`category`/`route`/`is_read`/`dedup_key`. Do NOT touch existing RLS/triggers/push cols. No delete policy.)
- `notification_preferences` — `add column if not exists`: `quality_enabled boolean not null default true`, `system_enabled boolean not null default true`, `email_enabled boolean not null default false`, `sms_enabled boolean not null default false`. (Reuse booking/payment/marketing/push/chat + owner-only RLS.)
- `emit_notification(p_user_id uuid, p_audience_type text, p_notification_type text, p_category text, p_title text, p_body text, p_deep_link text, p_metadata jsonb, p_priority text) returns uuid` — SECURITY DEFINER, `set search_path = public`. **ALWAYS inserts** into `notifications` (`user_id`, `title`, `body`, `type=p_notification_type`, `category=p_category`, `route=p_deep_link`, `audience_type`, `metadata_json=coalesce(p_metadata,'{}')`, `priority=coalesce(p_priority,'normal')`) — **NO preference read, NO skip** (durable history). Honor `dedup_key` if the app passes one (optional param). **Guard:** allow when `public.is_admin()` OR `p_user_id = auth.uid()` (self-notification) — a non-admin cannot emit to another user. Returns the new id. Performs NO business action (insert only; does NOT invoke the push pipeline — in-app only).
- `broadcast_announcement(p_audience_type text, p_title text, p_body text, p_deep_link text, p_priority text) returns int` — **admin-only** (`if not public.is_admin() then raise ...`); `insert into notifications (...) select id, ... from profiles where role = p_audience_type` (emit a `system` announcement row to every user of the audience — durable, unconditional). Returns the count.
- SQL comments: "additive; in-app insert is unconditional/durable — preferences gate future delivery, not history; existing notify_user/triggers/push unchanged; no delete."

**Test (static fs-read):** the 4 new notifications cols + 4 new preference cols (`add column if not exists`); `emit_notification`/`broadcast_announcement` present + `security definer` + `set search_path = public`; `emit_notification` inserts unconditionally (contains `insert into public.notifications` + NO `notification_preferences` read / NO skip-on-preference) + guard `is_admin() or ... = auth.uid()`; `broadcast_announcement` is `is_admin()`-guarded + inserts per-audience-user; additive (no `drop`, no alter of existing RLS/triggers/`notify_user`, no delete policy).

**Steps:** SQL → static test → `npm test` → `tsc` → both exports → commit `feat: slice36 migration 0031 notification columns + emit/broadcast RPCs`.

---

### Task 2: notifications.ts extensions + constants

**Files:** Modify `src/lib/notifications.ts`; Create `src/constants/notifications.ts`; Tests alongside

**Build:**
- `constants/notifications.ts` — `NOTIFICATION_TYPES` (full customer/provider/admin catalog: `{ type; label; icon; category: 'booking'|'payment'|'promotion'|'system'|'quality'|'chat'; defaultPriority }` — booking-accepted/provider-assigned/arriving/arrived/job-started/job-completed/payment-received/review-reminder/promotion-available/wallet-credit/refund-processed/general-announcement + provider new-job/customer-message/booking-cancelled/payment-released/quality-action/conduct-reminder/system-announcement + admin new-support-case/new-dispute/new-provider-signup/booking-exception/failed-payment/system-alert). `NOTIFICATION_FILTERS` (All / Unread / Booking / Payments / Promotions / System → category/is_read query). `PRIORITY_LEVELS` (low/normal/high/urgent + colors). `PREFERENCE_TOGGLES` (Booking updates→booking_enabled, Payments→payment_enabled, Promotions→marketing_enabled, Quality→quality_enabled, System→system_enabled + future-ready Email→email_enabled, Push→push_enabled, SMS→sms_enabled, each with `futureReady?`). `resolveDeepLink(n: AppNotification): Href | null` — maps `route`/`metadata` to an EXISTING route (booking/[id], wallet, booking/review, (admin-web)/operations/[id], provider/quality, (admin-web)/provider-quality/[id], promotions); null when none. Pure.
- `notifications.ts` — extend `AppNotification` (`audience_type?`, `notification_type` [=type], `deep_link` [=route], `metadata?`, `priority`, `read_at?`); `NotificationPreferences` gains the new toggles. `getMyNotifications(filter?: NotificationFilter, page?, pageSize?)` (filter → `.eq('category',…)`/`.eq('is_read',false)`; `all`→no filter). `getUnreadCount(): Promise<number>` (`select count where is_read=false`). `markNotificationRead`/`markAllNotificationsRead` also set `read_at = now()`. `getNotificationPreferences`/`updateNotificationPreferences` include the new toggles. `adminBroadcastAnnouncement({ audienceType, title, body, deepLink?, priority? })` → rpc; `emitNotification(...)` → rpc (thin). Reads `[]`/0-safe; mutations `{ ok, error? }`.

**Tests:** constants (type catalog covers all listed types, filters, toggles incl futureReady, `resolveDeepLink` maps + null); lib (`getMyNotifications` filter→query; `getUnreadCount`; mark-read sets read_at; preferences round-trip; broadcast/emit rpc params).

**Steps:** TDD → `npm test` → `tsc` → both exports → commit `feat: slice36 notifications lib extensions + constants`.

---

### Task 3: Components

**Files:** Create the components in File Structure; Tests alongside

**Build (presentational; consume the T2 constants/lib types):**
- `notification-card.tsx` `{ notification; onPress }` — icon (from `NOTIFICATION_TYPES`), title, body, relative time, **unread dot**, `PriorityIndicator`, tap → `onPress` (screen resolves the deep link).
- `notification-badge.tsx` `{ count }` — unread-count pill (hidden when 0; `99+` cap).
- `notification-bell.tsx` `{ count; onPress }` — bell icon + `NotificationBadge`, accessible.
- `notification-grouped-list.tsx` `{ notifications; onPressItem }` — group by date (Today / Yesterday / Earlier) with section headers, rendering `NotificationCard`s.
- `notification-priority-indicator.tsx` `{ priority }` — colored dot/label from `PRIORITY_LEVELS` (subtle for normal/low, prominent for high/urgent).
- `notification-empty-state.tsx` `{ variant? }` — friendly empty (all-read / no-notifications).

**Tests:** card renders fields + unread dot + fires onPress; badge hidden at 0 + caps 99+; bell shows badge; grouped list buckets by date; priority indicator per level; empty state.

**Steps:** TDD → `npm test` → `tsc` → both exports → commit `feat: slice36 notification components`.

---

### Task 4: Customer + provider Notification Center improvements

**Files:** Modify `src/app/(customer)/notifications.tsx`, `src/app/provider/(tabs)/notifications.tsx`; Tests

**Build:**
- Each screen: `usePaginatedList((p,s)=>getMyNotifications(filter,p,s))`; a **filter bar** (All / Unread / Booking / Payments / Promotions / System); **unread badge** (from `getUnreadCount`); **Mark all read** button (`markAllNotificationsRead` → reload + refresh count); `NotificationGroupedList`; tapping a card → `markNotificationRead(id)` + `router.push(resolveDeepLink(n))` (when non-null); `NotificationEmptyState`; `Skeleton` while loading. Keep the existing read/nav behavior working.
- Provider screen additionally surfaces provider types (provider-visible quality action, conduct reminder, system announcements) via the same catalog/filters.

**Tests:** renders grouped notifications from a mocked `getMyNotifications`; a filter change refetches with that filter; mark-all calls `markAllNotificationsRead` + refreshes unread count; tapping resolves the deep link + marks read; empty/skeleton states. Keep existing notification tests green.

**Steps:** `expo export --platform android` (route types) → TDD → `npm test` → `tsc` → `expo export --platform web` → commit `feat: slice36 customer + provider notification center`.

---

### Task 5: Admin notifications/announcements + preferences + bell + deep links

**Files:** Modify `src/app/(admin-web)/notifications/index.tsx`, the notification-settings screen, and a customer/provider header/entry; Tests

**Build:**
- **Admin** (`(admin-web)/notifications/index.tsx`) — the admin's own operations notifications (new support case/dispute/provider signup/failed payment/system alerts) with the same filters + read state, PLUS a **broadcast-announcement composer** (audience select customer/provider/admin + title + body + priority → `adminBroadcastAnnouncement`, reload). Admin-only.
- **Preferences** (the existing notification-settings screen) — add the category toggles (Booking updates / Payments / Promotions / Quality / System → the boolean prefs) + the future-ready channel toggles (Email / Push / SMS; Email & SMS shown **disabled "coming soon"** — display-only, no send; Push reflects the existing pipeline). Copy: "Preferences control future push/email/SMS delivery. Your in-app notification history is always kept."
- **`NotificationBell`** — add to the customer + provider header/entry (unread badge via `getUnreadCount`); tap → the existing notifications route. Additive; no new navigation architecture.
- Wire `resolveDeepLink` on tap across the centers (from T4) — ensure admin deep links (support case / provider quality) resolve to existing admin routes.

**Tests:** admin screen renders admin notifications + the broadcast composer submits via `adminBroadcastAnnouncement`; preferences renders the category toggles (update calls `updateNotificationPreferences`) + email/sms disabled "coming soon" (no send) + the durable-history copy; NotificationBell shows the unread badge + routes to notifications. Keep existing admin/settings tests green.

**Steps:** `expo export --platform android` (route types) → TDD → `npm test` → `tsc` → `expo export --platform web` → commit `feat: slice36 admin notifications/announcements + preferences + bell`.

---

### Task 6: Verification + isolation + no-workflow proof + final gate (FINAL)

**Files:** Create `docs/pilot/communication-center.md`

- **Preference-model proof:** document + grep — `emit_notification`/`broadcast_announcement` insert the in-app row UNCONDITIONALLY (no preference read/skip); preferences are stored for future delivery (email/sms send nothing; push = existing pipeline). In-app history is durable; users filter/read/mark-read regardless of push preference.
- **as-role RLS spot-audit (documented):** notifications owner-select (a user reads only their own; no cross-user); preferences owner-only; `emit_notification` guard (admin OR self); `broadcast_announcement` admin-only; no delete policy. SQL + expected results.
- **Read state / counts / filters:** mark-read sets `is_read`+`read_at`; unread count correct; filters (All/Unread/Booking/Payments/Promotions/System) narrow correctly.
- **Isolation / no-workflow proof:** `git diff main..HEAD --name-only` — only additive notification columns + the 2 RPCs + `notifications.ts`/`constants/notifications.ts` + notification components + the 3 notification screens + notification-settings + the bell + docs/tests. Prove the existing `notify_user`, booking triggers, and push pipeline are UNCHANGED; NO booking/dispatch/payment/wallet/promotions/ranking/auth/Operations-workflow/analytics file changed; no delete policy; only migration 0031.
- **Final gate:** `npm test` green, `tsc` clean (run `expo export --platform android` before tsc), `expo export` web + android green, `git status` clean.
- Commit `test: slice36 communication center verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-36-communication-center`. Abandon = `git checkout main` + delete branch.
- **Per-task revert:** independent commits — `git revert <commit>`. Reverting the screen/lib changes restores the Slice-23 notification screens (the added columns are harmless if unused).
- **DB rollback:** additive migration — undo = `drop function emit_notification, broadcast_announcement;` + `alter table notifications drop column audience_type, drop column metadata_json, drop column priority, drop column read_at;` + `alter table notification_preferences drop column quality_enabled, system_enabled, email_enabled, sms_enabled;`. The Slice-23 system (base columns, `notify_user`, booking triggers, push pipeline, existing screens) is intact throughout — no data to reverse.
- **No booking/dispatch/payment/workflow involvement** — rollback confined to the additive notification columns/RPCs + the (revertible) Center UI; the live notification pipeline is untouched.

---

## Self-Review

- **Requirement coverage:** migration 0031 (T1) · additive notifications columns (T1) · additive notification_preferences columns (T1) · emit_notification RPC [unconditional insert] (T1) · broadcast_announcement RPC (T1) · preference-model clarification [insert always; prefs gate future delivery] (Preference model + T1 + T6) · notifications.ts extensions (T2) · constants/notifications.ts (T2) · NotificationCard/Badge/Bell (T3) · grouped list (T3) · priority indicator (T3) · customer + provider center improvements (T4) · admin notifications/announcements screen (T5) · notification preferences screen extension (T5) · deep-link resolver (T2 resolveDeepLink + T4/T5 wiring) · unread count (T2 getUnreadCount + T4/T5) · mark all read (T4) · filters (T2 + T4) · rollback (this section). Every "Include" item mapped.
- **Constraint coverage:** extend Slice-23 not rebuild + don't break notify_user/triggers/push (Global + T1 additive + T6 proof) · in-app history durable, prefs never suppress insert (Preference model + T1 emit unconditional + T6) · email/sms display-only (T5) · no booking/dispatch/payment/wallet/promotions/ranking/auth/Operations-workflow/analytics change (T6 isolation) · no AI/marketing.
- **Placeholder scan:** none (future-ready channels + deferred emit-wiring intentional).
- **Name consistency:** RPC names (`emit_notification`/`broadcast_announcement`) identical T1(SQL)↔T2(rpc wrapper)↔T5(UI); `AppNotification`/`NotificationPreferences`/`NotificationFilter` T2↔T3↔T4↔T5; `NOTIFICATION_TYPES`/`NOTIFICATION_FILTERS`/`PRIORITY_LEVELS`/`PREFERENCE_TOGGLES`/`resolveDeepLink` T2↔T3↔T4↔T5; component filenames T3↔T4↔T5; reuse of `type`/`category`/`route` columns as notification_type/filter/deep_link throughout.
