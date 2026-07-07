# Slice 36 — Communication Center: Verification & Pilot Guide

Accurate as of migration `0031_communication_center.sql` and commit range `5f23d66..dd10151` (branch `feat/slice-36-communication-center`).

---

## 1. Overview

The Communication Center (Slice 36) provides every user type with a structured, durable in-app notification inbox and gives admins a broadcast tool to reach all customers, providers, or everyone at once.

It is a **purely additive extension** of the Slice-23 Unified Notification System. It does not rebuild or replace the existing pipeline — it adds new database columns, two new RPCs, a full suite of notification UI components, per-role notification center screens, and a preference settings screen. The Slice-23 event-trigger → `notify_user` → `notifications` insert → `trg_push_notification` → `send-push` pipeline is preserved exactly and continues to be the sole push path.

Five tasks make up this slice:

| Task | Commit | Content |
|---|---|---|
| T1 | `2d822bf` | Migration `0031_communication_center.sql` |
| T2 | `e7e8d55` | `src/lib/notifications.ts` + `src/constants/notifications.ts` |
| T3 | `44e587e` | `src/components/notifications/*` (6 components) |
| T4 | `4742396` | Customer + provider notification centers + home bell |
| T5 | `b5a2727` | Admin center, broadcast composer, preferences screen, admin-shell bell, sidebar entries |

---

## 2. Existing System Extension (Preserved)

Slice 36 is **additive only**. The migration header states it explicitly:

> "ADDITIVE extension of the Slice-23 notification system … Existing notify_user/booking triggers/push pipeline + RLS UNCHANGED. No delete."
> — `supabase/migrations/0031_communication_center.sql:1–8`

**Evidence that no existing object was dropped or redefined:**

- `grep -i "drop\|alter.*drop"` over `0031_communication_center.sql` returns zero hits. Every statement is `ALTER TABLE … ADD COLUMN IF NOT EXISTS` or `CREATE OR REPLACE FUNCTION` for the two *new* RPCs (`emit_notification`, `broadcast_announcement`). No existing function or trigger is modified.
- `notify_user` RPC — defined at `supabase/migrations/0020_notification_system.sql:98–122` — is not referenced in `0031_communication_center.sql` at all.
- Booking event triggers (`tg_notify_booking_created`, `tg_notify_booking_update`, `tg_notify_payment_paid`, etc.) are defined in `0020_notification_system.sql` and are absent from `0031_communication_center.sql`.
- `tg_push_notification` (AFTER INSERT on notifications → send-push) is defined at `0020_notification_system.sql:166–180` and is not touched by `0031`.
- The RLS select policy on `notifications` (`user_id = auth.uid()`) is defined in earlier migrations and is not redefined in `0031`.
- No `.delete()` call on the `notifications` table appears anywhere in `src/` (grep of `src/**/*.{ts,tsx}` for `.delete\(` shows only `saved-addresses.ts`, `favorites.ts`, `favorite-services.ts`, and `photos.ts` — all unrelated to notifications).

**Push pipeline preserved, single path:**

The Slice-23 push path remains the only push path: `notify_user()` INSERT → `trg_push_notification` AFTER INSERT → `notify_send_push()` pg_net call → `send-push` Edge Function. The new RPCs `emit_notification` and `broadcast_announcement` insert durable in-app rows only; they do not call `notify_send_push` or any push mechanism.

---

## 3. Migration 0031

File: `supabase/migrations/0031_communication_center.sql`

### 3.1 Additive columns on `public.notifications` (lines 15–25)

| Column | Type | Default / Check | Line |
|---|---|---|---|
| `audience_type` | `text` | `CHECK (audience_type IN ('customer','provider','admin'))`, nullable | 16 |
| `metadata_json` | `jsonb` | `NOT NULL DEFAULT '{}'::jsonb` | 19 |
| `priority` | `text` | `NOT NULL DEFAULT 'normal'` + `CHECK (priority IN ('low','normal','high','urgent'))` | 22 |
| `read_at` | `timestamptz` | nullable (no default) | 25 |

All use `ADD COLUMN IF NOT EXISTS` — backward-compatible with existing rows.

### 3.2 Additive columns on `public.notification_preferences` (lines 32–35)

| Column | Type | Default | Line |
|---|---|---|---|
| `quality_enabled` | `boolean NOT NULL` | `true` | 32 |
| `system_enabled` | `boolean NOT NULL` | `true` | 33 |
| `email_enabled` | `boolean NOT NULL` | `false` | 34 |
| `sms_enabled` | `boolean NOT NULL` | `false` | 35 |

All use `ADD COLUMN IF NOT EXISTS`. `email_enabled` and `sms_enabled` default `false` (future-ready placeholders only).

### 3.3 `emit_notification` RPC (lines 44–68)

```sql
create or replace function public.emit_notification(
  p_user_id          uuid,
  p_audience_type    text,
  p_notification_type text,
  p_category         text,
  p_title            text,
  p_body             text,
  p_deep_link        text,
  p_metadata         jsonb,
  p_priority         text
)
returns uuid language plpgsql security definer set search_path = public
```

Guard (line 58): `if not (public.is_admin() or p_user_id = auth.uid()) then raise exception 'not authorized'; end if;`

Unconditional INSERT at lines 61–66 — no read of `notification_preferences` before insert.

### 3.4 `broadcast_announcement` RPC (lines 76–94)

```sql
create or replace function public.broadcast_announcement(
  p_audience_type text,
  p_title         text,
  p_body          text,
  p_deep_link     text,
  p_priority      text
)
returns int language plpgsql security definer set search_path = public
```

Guard (line 86): `if not public.is_admin() then raise exception 'not authorized'; end if;`

Inserts one row per `profiles.role = p_audience_type` (lines 87–91). Returns `row_count` (int). No preference read. No push call.

---

## 4. Preference Model

### In-app history is always durable

`emit_notification` inserts **unconditionally** — there is no read of `notification_preferences` or any `_enabled` column before the INSERT. Evidence: the full RPC body (`0031_communication_center.sql:55–68`) contains only the authorization guard and a single `INSERT INTO public.notifications … RETURNING id`. No `SELECT` from `notification_preferences` appears anywhere in `0031_communication_center.sql`.

Similarly, `broadcast_announcement` (lines 86–93) inserts unconditionally for every matching profile. No preference check.

### Email/SMS toggles are future-ready display-only

`src/app/notification-settings.tsx:63–74` defines `FUTURE_ROWS`:

```typescript
const FUTURE_ROWS: { label: string; key: PrefKey; description: string }[] = [
  { key: 'email_enabled',  label: 'Email notifications', description: 'Coming soon — email delivery is not yet available.' },
  { key: 'sms_enabled',    label: 'SMS notifications',   description: 'Coming soon — SMS delivery is not yet available.'  },
];
```

These rows are rendered as **disabled switches** (`disabled` prop, `onValueChange={() => { /* future-ready: no-op */ }}` — `notification-settings.tsx:198`). They do NOT write to the DB and do NOT trigger any delivery.

### Push = existing Slice-23 pipeline

`push_enabled` in `notification_preferences` gates the existing Slice-23 push pipeline (read by `send-push` Edge Function via `isPushAllowed`). Slice 36 does not add a second push path. The `emit_notification` and `broadcast_announcement` RPCs produce in-app rows only; the `trg_push_notification` AFTER-INSERT trigger fires on those rows exactly as it does for Slice-23 notify_user inserts.

### Preference model summary

| Channel | Gated by preference? | Delivery implemented? |
|---|---|---|
| In-app history | No — always written | Yes (every insert = durable bell row) |
| Push | Yes — existing `push_enabled` + category booleans via Slice-23 Edge Function | Yes (Slice-23 pipeline) |
| Email | Display-only toggle, no write on switch (future-ready) | No |
| SMS | Display-only toggle, no write on switch (future-ready) | No |

---

## 5. Read State

### markNotificationRead — updates `is_read` AND `read_at`

`src/lib/notifications.ts:113–119`:

```typescript
export async function markNotificationRead(id: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id);
```

### markAllNotificationsRead — updates `is_read` AND `read_at`

`src/lib/notifications.ts:123–133`:

```typescript
const { error } = await supabase
  .from('notifications')
  .update({ is_read: true, read_at: new Date().toISOString() })
  .eq('user_id', user.id)
  .eq('is_read', false);
```

### No delete / no history mutation

A grep of `src/**/*.{ts,tsx}` for `.delete(` on anything related to notifications finds zero hits. No screen calls `.delete()` on the `notifications` table. Mark-read updates `is_read` and `read_at` only — the row is never deleted.

### Unread count

`src/lib/notifications.ts:101–108` — `getUnreadNotificationCount` uses a `count: 'exact', head: true` query filtered by `is_read = false`. RLS scopes it to the signed-in user. Returns 0 on error.

### Filters are display-only (client-side)

All three notification centers apply `filterNotifications(notifications, filter)` to a locally-loaded list (`src/app/(customer)/notifications.tsx:75`; `src/app/provider/(tabs)/notifications.tsx:78`; `src/app/(admin-web)/notifications/index.tsx:81`). `filterNotifications` is a pure function (`src/lib/notifications.ts:198–203`) that calls `filterMatches` from constants. No filter writes to the DB or suppresses history.

---

## 6. Communication Center UI

### Customer Notification Center

`src/app/(customer)/notifications.tsx`

- Loads all notifications via `getMyNotifications` + `usePaginatedList` (paginated, line 51–56).
- Filter chips (6): All / Unread / Booking / Payments / Promotions / System — client-side (line 75).
- "Mark all read" button → `markAllNotificationsRead` (line 89–93).
- Unread badge count in header (line 62–67).
- Tap → `markNotificationRead(n.id)` + `resolveNotificationDeepLink(n)` → `router.push(route)` (lines 79–87).
- Renders `NotificationGroupedList` with `Today / Yesterday / Earlier` sections.
- `NotificationEmptyState` for no-results case.
- `LoadMoreButton` for pagination.

### Provider Notification Center

`src/app/provider/(tabs)/notifications.tsx`

- Same pattern: `getMyNotifications`, filter chips, unread badge, "Mark all read", grouped list (lines 44–175).
- Provider-specific deep-link fallback: if `resolveNotificationDeepLink` returns null AND `n.booking_id` exists, routes to `/provider/job/[id]` (lines 89–92).
- Uses `NotificationGroupedList`, `NotificationEmptyState`, `NotificationBadge`.

### Admin Notification Center

`src/app/(admin-web)/notifications/index.tsx`

- Same pattern: paginated list, 6 filter chips, unread badge, "Mark all read" (lines 52–99).
- Additional "Broadcast" button in header → navigates to `/(admin-web)/broadcast` (line 133).
- Error state with "Retry" button (lines 175–180).
- Wrapped by `AdminShell` via `(admin-web)/_layout.tsx`.

### Grouped List Component

`src/components/notifications/notification-grouped-list.tsx` — calls `groupNotificationsByDate` from lib, renders `SectionHeader` for each bucket (Today / Yesterday / Earlier), delegates card rendering to `NotificationCard`.

### Filter Tabs (6)

Defined at `src/constants/notifications.ts:277–284` — `NOTIFICATION_FILTERS`:
`all`, `unread`, `booking`, `payments`, `promotions`, `system`.

### Unread Badge

`src/components/notifications/notification-badge.tsx` — pill-shaped, hides when `count <= 0`, caps at `"99+"` (line 27).

### Notification Bell

`src/components/notifications/notification-bell.tsx` — pressable bell icon with `NotificationBadge` overlay; fires `onPress` for routing.

**Customer home bell** (`src/app/(customer)/index.tsx:19`) — imports `NotificationBell`, fetches `getUnreadNotificationCount` on mount (line 50), navigates to `/(customer)/notifications` on press.

**Provider home bell** (`src/app/provider/(tabs)/index.tsx:25`) — same pattern, navigates to provider notifications.

**Admin shell bell** (`src/components/admin-web/admin-shell.tsx:92–95`) — `NotificationBell` always present in admin top bar, navigates to `/(admin-web)/notifications` (line 73).

### Deep Links (`resolveNotificationDeepLink`)

`src/constants/notifications.ts:313–392` — pure function; prefers `n.route` (DB column), falls back to type + `metadata_json`/`booking_id`. Key routes: `/booking/:id` (booking types), `/wallet` (payment types), `/provider/quality` (quality types), `/(admin-web)/operations/:id` (admin ops), `/promotions` (promotion types). Returns `null` when unresolvable. Never throws.

### Admin Broadcast Composer

`src/app/(admin-web)/broadcast.tsx`

- Audience: Customers / Providers / Everyone (lines 46–50).
- "Everyone" = calls `broadcastAnnouncement` TWICE — once for `'customer'`, once for `'provider'` — then sums counts (lines 87–111). Does NOT use a literal `'everyone'` audience value (the DB RPC accepts only `'customer'`, `'provider'`, `'admin'`).
- Title + message inputs, priority selector, live preview panel, confirmation dialog, success banner showing total recipient count.
- No push, no email/SMS send, no second pipeline.

### Preferences Extension

`src/app/notification-settings.tsx`

- `FUNCTIONAL_ROWS` (7 toggles, lines 49–57): `booking_enabled`, `payment_enabled`, `quality_enabled`, `system_enabled`, `chat_enabled`, `marketing_enabled`, `push_enabled` — read/write via `updateNotificationPreferences`.
- `FUTURE_ROWS` (2 disabled, lines 63–74): `email_enabled`, `sms_enabled` — rendered disabled, no-op on change.
- `NOTIFICATION_HISTORY_NOTE` from `constants/notifications.ts:457–459` shown in a banner (line 135).
- Reachable from customer, provider, and admin profile screens.

### Notification Components (T3)

All in `src/components/notifications/`:

| Component | File | Purpose |
|---|---|---|
| `NotificationCard` | `notification-card.tsx` | Single notification card with icon, title, body, category pill, priority indicator, unread dot |
| `NotificationBadge` | `notification-badge.tsx` | Count pill; hides at 0; caps at 99+ |
| `NotificationBell` | `notification-bell.tsx` | Bell icon + badge overlay; routing delegated to screen |
| `NotificationGroupedList` | `notification-grouped-list.tsx` | Today/Yesterday/Earlier grouping wrapper |
| `NotificationPriorityIndicator` | `notification-priority-indicator.tsx` | Colored priority dot/label |
| `NotificationEmptyState` | `notification-empty-state.tsx` | Empty state for `all`, `unread`, and `filtered` variants |

---

## 7. As-Role RLS / Privacy

### notifications table RLS (unchanged from Slice 23)

The owner-select policy is defined in `supabase/migrations/0020_notification_system.sql`. Migration `0031` does NOT redefine or drop any RLS policy on `notifications`. The update policy (line 47–58 of `0020`) scopes writes to `user_id = auth.uid()` and pins immutable columns.

### notification_preferences RLS (unchanged from Slice 23)

Defined at `0020_notification_system.sql:79–89` — four policies (select/insert/update/delete), all `user_id = auth.uid()`. Migration `0031` only adds columns (`ADD COLUMN IF NOT EXISTS`) — no policy is added or changed.

### As-role spot audit

| Role | What they can read | What they can emit | What they can broadcast |
|---|---|---|---|
| **Customer** | Own notifications only (RLS: `user_id = auth.uid()`) | Own notifications only via `emit_notification` (guard: `p_user_id = auth.uid()`) | Cannot — `broadcast_announcement` raises "not authorized" for non-admins |
| **Provider** | Own notifications only (same RLS) | Own notifications only (same guard) | Cannot — same guard |
| **Admin** | Own notifications only for their inbox (RLS still scoped to their user_id); can broadcast to any audience | Any user's notifications via `emit_notification` (`is_admin()` guard passes) | All users of a given role via `broadcast_announcement` (`is_admin()` guard) |

No public/anon access to notifications. `emit_notification` and `broadcast_announcement` are `SECURITY DEFINER` but both check their authorization guards before any insert (`0031_communication_center.sql:58`, `86`).

---

## 8. Guardrails Honored

`git diff --name-only 5f23d66..dd10151` output (38 files):

```
src/__tests__/admin-web-notifications.test.tsx
src/__tests__/communication-center-schema.test.ts
src/__tests__/customer-home-enhanced.test.tsx
src/__tests__/customer-notifications.test.tsx
src/__tests__/home-screen.test.tsx
src/__tests__/provider-notifications.test.tsx
src/__tests__/provider.test.tsx
src/__tests__/s36-admin-notifications.test.tsx
src/__tests__/s36-customer-notifications.test.tsx
src/__tests__/s36-notification-bell-home.test.tsx
src/__tests__/s36-provider-notifications.test.tsx
src/app/(admin-web)/broadcast.tsx
src/app/(admin-web)/notifications/index.tsx
src/app/(customer)/index.tsx
src/app/(customer)/notifications.tsx
src/app/notification-settings.tsx
src/app/provider/(tabs)/index.tsx
src/app/provider/(tabs)/notifications.tsx
src/components/admin-web/admin-shell.tsx
src/components/admin-web/admin-sidebar.tsx
src/components/notifications/notification-badge.test.tsx
src/components/notifications/notification-badge.tsx
src/components/notifications/notification-bell.test.tsx
src/components/notifications/notification-bell.tsx
src/components/notifications/notification-card.test.tsx
src/components/notifications/notification-card.tsx
src/components/notifications/notification-empty-state.test.tsx
src/components/notifications/notification-empty-state.tsx
src/components/notifications/notification-grouped-list.test.tsx
src/components/notifications/notification-grouped-list.tsx
src/components/notifications/notification-priority-indicator.test.tsx
src/components/notifications/notification-priority-indicator.tsx
src/constants/notifications.test.ts
src/constants/notifications.ts
src/lib/notification-preferences.test.ts
src/lib/notifications.test.ts
src/lib/notifications.ts
supabase/migrations/0031_communication_center.sql
```

**All 38 changed files are notification-related only.** Confirmed absent from the diff:

- No booking workflow, dispatch, or booking-status logic touched (`src/lib/bookings.ts` — NOT in diff).
- No payment / wallet / earnings logic (`src/lib/payments.ts`, `src/lib/earnings.ts` — NOT in diff).
- No promotions or ranking logic — NOT in diff.
- No auth files — NOT in diff.
- No Operations workflow files — NOT in diff.
- No analytics — NOT in diff.
- No AI — no LLM calls anywhere in the branch.
- No email/SMS delivery — `notification-settings.tsx` FUTURE_ROWS are disabled switches with no-op handlers (`notification-settings.tsx:198`); the broadcast RPC only inserts in-app rows.
- Only one new migration (`0031`) — no other migration touched.

Isolation: **CLEAN**.

---

## 9. Rollback Plan

The migration is purely additive — no existing object was modified, dropped, or redefined. Rollback is clean and non-destructive.

### App-side revert

```bash
git revert feat/slice-36-communication-center
# or
git checkout 5f23d66
```

This removes all Slice-36 screens, components, constants, and lib extensions. The Slice-23 system continues working normally.

### Schema revert (drop only what was added in 0031)

```sql
-- Drop the two new RPCs
drop function if exists public.emit_notification(uuid, text, text, text, text, text, text, jsonb, text);
drop function if exists public.broadcast_announcement(text, text, text, text, text);

-- Drop the 4 additive columns from notifications
alter table public.notifications
  drop column if exists audience_type,
  drop column if exists metadata_json,
  drop column if exists priority,
  drop column if exists read_at;

-- Drop the 4 additive columns from notification_preferences
alter table public.notification_preferences
  drop column if exists quality_enabled,
  drop column if exists system_enabled,
  drop column if exists email_enabled,
  drop column if exists sms_enabled;
```

Because no existing column, trigger, function, RLS policy, or index was modified by `0031`, this rollback has **zero impact** on the Slice-23 notification pipeline. Existing notification rows are preserved. `notify_user`, `tg_push_notification`, and all booking event triggers continue working exactly as before.

---

## 10. Verification Summary

### Final Gate Results

| Check | Result |
|---|---|
| `npm test` | PASS — 210 suites, 2852 tests, 0 failures |
| `npx tsc --noEmit` | PASS — clean (run `npx expo export --platform android` first to regenerate route types) |
| `npx expo export --platform android` | PASS — exported to `dist/` |
| `npx expo export --platform web` | PASS — exported to `dist/` |
| `git status` | Clean working tree (branch `feat/slice-36-communication-center`) |

### Resolved concern — tsc error in test file (fixed)

During verification, `npx tsc --noEmit` surfaced one pre-existing type defect from T5: `src/__tests__/admin-web-notifications.test.tsx:31` declared `mockFilterNotifications` as `jest.fn((ns: any[]) => ns)` (one parameter) but invoked it with two arguments on line 36, tripping `TS2554`. Runtime was unaffected (tests passed 2852/2852) and no production code was involved. Per the T6 guardrail the verification task did not modify code; the controller applied the one-line fix (added the optional `_filter` param) in commit `dd10151`, after which `tsc --noEmit` is clean. The final gate above reflects the fixed head.

### Total test count

210 suites · 2852 tests · 0 failures (run `npm test` on branch `feat/slice-36-communication-center`).

### All 10 doc sections

All ten required sections are present with real `file:line` citations or explicit test citations. Every claim has been verified against actual code read during this task. No claim was found to be false against the code — the one concern (tsc error) is flagged explicitly above.
