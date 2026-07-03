# Slice 23 — Notifications 2.0 (Design Spec)

**Date:** 2026-07-03
**Status:** Approved design → (implementation plan pending approval)
**Builds on:** Slice 9 (in-app `notifications` + `booking_activity` + status triggers), Slice 15 (`device_tokens`, `private.push_config` + `notify_send_push` pg_net webhook, `send-push` Edge Function + `_shared/notifications.ts` pure helpers, `push.ts` client deep-link).

---

## 1. Goal & Non-Goals

Turn QuickServe notifications into one complete **operational** system for customers, providers, and admins — covering the full booking/quote/payment/chat/review/registration event matrix — by **unifying** the two current partial paths (in-app bell + push) onto a single pipeline, adding per-user preferences and de-duplication, while reusing all existing push infrastructure.

**Non-goals / out of scope:** email, SMS, marketing campaigns, scheduled marketing, automated provider dispatch. **No** payment/auth/chat/tracking **business-logic** change (we only add/re-point *notification triggers* that read those tables). Backward-compatible: existing bell reads, `device_tokens`, `send-push` secret, kill-switch, and deep-linking all keep working.

---

## 2. Architecture — one unified pipeline

**Decision (approved):** the existing `public.notifications` table becomes the **single source of truth**. Every operational event inserts one `notifications` row (enriched with `type`/`category`/`route`/`dedup_key`); a single `AFTER INSERT` trigger on that table fans out push through the **existing** `notify_send_push` → `send-push`. In-app bell and push are therefore always consistent.

```
DB event (bookings / payments / payment_attempts / booking_messages / reviews / profiles)
  → event trigger inserts notifications row(s)  [type, category, route, dedup_key]
       → AFTER INSERT trg_push_notification → notify_send_push (pg_net, kill-switch)
            → send-push Edge Fn: read prefs → gate by category → device_tokens → Expo push → prune dead
       → row shows in the in-app bell immediately (always, regardless of push)
```

- The old **direct** push triggers (`trg_push_bookings`, `trg_push_payments`, `trg_push_booking_messages`) are **dropped** — their job moves to the notifications fan-out (prevents double-push). The pure helpers in `_shared/notifications.ts` and their tests are **kept** (still valid, now superseded) for backward compatibility.
- `booking_activity` (timeline) writes are **unchanged**.

**Preferences gating (approved):** the in-app row is **always** written (bell = full operational history). Only **push delivery** respects preferences (`push_enabled` + per-category toggle; marketing default OFF). Gating happens in `send-push`, which stamps the row's `push_status` (`sent`/`skipped`/`no_token`/`failed`).

**Retry (approved):** durable in-app row is the fallback; `send-push` records `push_status`/`push_attempts` and prunes dead tokens (existing). No new retry queue — transient-retry is future-ready. Missing tokens → `no_token`, never an error.

---

## 3. Database — migration `0020_notification_system.sql`

### 3a. Extend `public.notifications` (additive; defaults preserve old inserts)
```sql
alter table public.notifications
  add column if not exists type       text not null default 'generic',
  add column if not exists category   text not null default 'booking'
    check (category in ('booking','chat','payment','marketing','system')),
  add column if not exists route       text,
  add column if not exists dedup_key   text,
  add column if not exists push_status text not null default 'pending'
    check (push_status in ('pending','sent','skipped','no_token','failed')),
  add column if not exists push_attempts int not null default 0;

create unique index if not exists notifications_dedup_key
  on public.notifications (dedup_key) where dedup_key is not null;
```
- `dedup_key` encodes recipient + event so a repeat is a no-op: `'<recipient_id>:<booking_id>:<type>'`. **Chat = NULL** (every message notifies). Inserts use `on conflict (dedup_key) do nothing`.
- Existing `notifications_select` (own-only) unchanged. Extend `notifications_update` `with check` to also pin the new immutable columns (`type`/`category`/`route`/`dedup_key`) so users may still only flip `is_read`. `push_status`/`push_attempts` are written by `send-push` via **service role** (bypasses RLS).

### 3b. New `public.notification_preferences` (owner-only)
```sql
create table if not exists public.notification_preferences (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  push_enabled     boolean not null default true,
  chat_enabled     boolean not null default true,
  booking_enabled  boolean not null default true,
  payment_enabled  boolean not null default true,
  marketing_enabled boolean not null default false,   -- default OFF
  updated_at       timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
-- owner-only select/insert/update (user_id = auth.uid()); NO admin/provider policy.
```
A **missing row = all defaults** (no backfill needed). `send-push` treats absent prefs as defaults. Category→toggle map: `chat→chat_enabled`, `booking→booking_enabled`, `payment→payment_enabled`, `marketing→marketing_enabled`, `system→` (gated only by `push_enabled`).

### 3c. Fan-out helpers (SECURITY DEFINER, `set search_path=public`)
- `notify_user(p_user_id, p_booking_id, p_title, p_body, p_type, p_category, p_route, p_dedup_key)` → `insert … on conflict (dedup_key) do nothing`. Skips when `p_user_id` is null.
- `notify_admins(p_booking_id, p_title, p_body, p_type, p_route, p_dedup_base)` → loops `profiles where role='admin' and approval_status='approved'`, calling `notify_user` per admin with `dedup_key = p_dedup_base||':'||admin_id`, `category='system'`.

### 3d. Push fan-out trigger
`tg_push_notification()` `AFTER INSERT ON public.notifications` → `notify_send_push(jsonb_build_object('table','notifications','op','INSERT','record',to_jsonb(new)))`. Reuses `private.push_config` + kill-switch verbatim.

### 3e. Event triggers (insert `notifications` rows) — the matrix
Re-point / extend existing triggers and add new ones. All read-only against their source tables (no business-logic change).

| Source (trigger) | Event | Recipient(s) → type / category / route |
|---|---|---|
| `bookings` INSERT | booking created | customer → `booking_received`/booking/`/booking/{id}`; **admins** → `admin_new_booking`/system/`/admin/booking/{id}` |
| `bookings` UPDATE status | `provider_assigned` | customer → `provider_assigned`/booking; provider → `booking_assigned`/booking/`/provider/job/{id}` |
| " | `on_the_way` | customer → `heading_to_you`/booking/`/booking/track/{id}` |
| " | `in_progress` | customer → `work_started`/booking |
| " | `completed` | customer → `work_completed`/booking **+** `review_reminder`/booking/`/booking/{id}` (immediate) |
| " | `cancelled` | assigned provider → `booking_cancelled`/booking; **admins** (if was assigned) → `admin_cancelled_after_assign`/system |
| `bookings` UPDATE assign cleared (old.assigned_provider_id≠null → new null) | provider unassigned/rejected | **admins** → `admin_provider_rejected`/system/`/admin/booking/{id}` |
| `bookings` UPDATE quote_status | `sent` | customer → `quote_received`/booking |
| " | `accepted` / `declined` | provider → `quote_accepted` / `quote_rejected` /booking/`/provider/job/{id}` |
| `payments` UPDATE → `paid` | payment confirmed | customer → `payment_confirmed`/payment; provider → `payment_received`/payment |
| `payment_attempts` INSERT/UPDATE → `failed` | failed attempt | **admins** → `admin_payment_failed`/system/`/admin/booking/{bookingId}` |
| `booking_messages` INSERT | new chat message | non-sender participant → `chat_message`/chat/(customer `/booking/chat/{id}` · provider `/provider/job/chat/{id}`), **dedup_key NULL** |
| `reviews` INSERT | review received | provider → `review_received`/booking/`/provider/...` |
| `profiles` INSERT (role=provider, approval_status=pending) | registration awaiting approval | **admins** → `admin_provider_pending`/system/`/admin/...` |

**Future-ready (types + routes defined; NOT triggered this slice):** `provider_nearby`, `provider_arrived` (needs tracking-distance trigger — excluded to honor "no tracking changes"); scheduled `booking_reminder` (needs a scheduler); `admin_review_flagged` (needs a report/flag mechanism). Documented, not wired.

---

## 4. Edge Function — `send-push` (additive branch)

Add a `table === 'notifications'` branch (keep the old branches so existing tests pass; they're now dead once old triggers are dropped):
1. Build a spec from the row: `recipientUserId = record.user_id`, `title`, `body`, `data:{ type, route }`.
2. Read `notification_preferences` for the recipient (service role; absent = defaults).
3. **Gate:** if `!push_enabled` or the row's `category` maps to a disabled toggle → set `push_status='skipped'`, stop.
4. Look up `device_tokens`; none → `push_status='no_token'`. Else `buildExpoMessages` → `sendExpoPush` → `push_status='sent'` (or `'failed'`), `push_attempts = push_attempts+1`, prune `DeviceNotRegistered` tokens (existing).
5. Update the `notifications` row's `push_status`/`push_attempts` via service role. Always return 200 (no retry storm).

New **pure** helpers in `_shared/notifications.ts` (unit-tested, Deno-free): `specFromNotificationRow(record)` and `isPushAllowed(prefs, category)` (defaults applied, marketing off). Existing helpers/tests untouched.

---

## 5. Client & Admin Web

- `src/lib/notifications.ts`: extend `AppNotification` with optional `type`/`category`/`route`/`push_status`. Add `getNotificationPreferences()` and `updateNotificationPreferences(patch)` (owner-only table; absent → defaults). Backward-compatible.
- `src/components/ui/notification-row.tsx`: when a row has `route`, tapping it navigates via `router.push(route)` (additive; existing rendering unchanged) — mirrors the push deep-link.
- **Notification Settings screen** (`src/app/notification-settings.tsx`, root pushable — same pattern as Slice-22 `saved-addresses.tsx`): toggles for push / chat / booking / payment / marketing(off), linked from the customer, provider, and admin profile screens. Owner-only.
- **Admin web:** surface operational notifications where useful — an admin operational feed reusing `notification-list`/`getMyNotifications` (admin's own `system`-category rows: new bookings, provider-pending, failed payments, cancellations, rejections). Read-only; no new write path.

---

## 6. De-duplication, anti-spam, roles, deep-links, graceful degradation

- **Dedup:** partial-unique `dedup_key` + `on conflict do nothing` → idempotent events never double-fire (trigger re-runs, retries); chat exempt (NULL key).
- **Anti-spam:** one row per logical event; status/quote notifications only on real transitions (`is distinct from`); no per-location spam (nearby/arrived deferred).
- **Roles:** recipients are computed server-side from the row (customer/provider/admin); RLS keeps each user's bell own-only; admin fan-out only to approved admins.
- **Deep-links:** every row carries `route`; push tap (existing `routeForNotificationData`) and in-app tap both navigate there.
- **Graceful:** missing tokens → `no_token` (not an error); kill-switch (`send_push_url` NULL) → in-app still works, push silent; `send-push` always 200.

---

## 7. Backward Compatibility & Privacy

- Existing bell (`getMyNotifications`, mark-read) works unchanged; new columns are additive with defaults. Old direct-push triggers removed with no user-visible loss (events now flow through the richer notifications path). `device_tokens`, `push_config`, secret, deep-linking all reused as-is.
- `notification_preferences` is owner-only (no admin/provider read). Admins receive operational alerts as their own notifications, not by reading others' data.
- No `bookings`/payments/chat/tracking schema or business-logic change; triggers only **read** those tables to route notifications.

---

## 8. Testing

- **DB (pilot SQL, `docs/pilot/notifications.md`):** each matrix row inserts exactly one bell notification for the right recipient(s); dedup prevents duplicates; chat is not deduped; admin fan-out hits only approved admins; prefs gate push not bell; kill-switch safe.
- **Edge pure helpers (Jest):** `specFromNotificationRow`, `isPushAllowed` (each category on/off, missing prefs = defaults, marketing off, `push_enabled` master switch).
- **Client (Jest/RNTL):** `getNotificationPreferences`/`updateNotificationPreferences`; notification-row route tap; Notification Settings screen toggles persist; existing notification-list/bell tests stay green.
- **Gate:** `npm test`, `npx tsc --noEmit`, `expo export --platform web` + `--platform android`.

---

## 9. Deliverables

1. `supabase/migrations/0020_notification_system.sql` — notifications columns + dedup index, `notification_preferences` + RLS, `notify_user`/`notify_admins`, fan-out trigger, event triggers (drop old direct-push triggers), future-ready types documented.
2. `supabase/functions/send-push/index.ts` + `_shared/notifications.ts` — `notifications` branch + prefs gating + `push_status`; new pure helpers (+ tests).
3. `src/lib/notifications.ts` — extended type + preferences helpers (+ tests).
4. `notification-row` route tap + **Notification Settings** screen + profile entries (customer/provider/admin) (+ tests).
5. Admin-web operational notifications feed (+ tests).
6. `docs/pilot/notifications.md` — matrix/dedup/prefs/kill-switch verification + backward-compat + isolation; green gate.
