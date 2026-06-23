# QuickServe Slice 9 — Activity Feed + In-App Notifications (Design)

**Goal:** Make QuickServe feel alive — each booking shows a timeline of what happened, and customers/providers get in-app notifications for the moments that matter.

**Invariants:** Admin stays in control; providers work under QuickServe; customers feel informed. Activity/notification rows are created ONLY by security-definer triggers (never client-forged). Users see only their own notifications; activity follows booking access (customer-own / provider-assigned / admin-all).

**Out of scope:** push notifications, email, SMS, realtime/subscriptions, payments, ratings, reviews, chat, maps, tracking. **No admin notifications in Slice 9** (booking_created → admin notification is a deliberate future addition; admins only see the activity timeline here).

---

## Database (migration `0007`)

`public.booking_activity`:
- `id uuid primary key default gen_random_uuid()`
- `booking_id uuid not null references public.bookings(id) on delete cascade`
- `actor_id uuid references public.profiles(id)` (nullable — system events)
- `event_type text not null` (e.g. `booking_created`, `accepted`, `provider_assigned`, `on_the_way`, `in_progress`, `completed`, `cancelled`, `issue_photo_added`, `before_photo_added`, `after_photo_added`, `completion_photo_added`, `photos_verified`)
- `message text not null`
- `metadata jsonb`
- `created_at timestamptz not null default now()`
- RLS **SELECT** only: `exists (bookings b where b.id = booking_id and (b.customer_id = auth.uid() or b.assigned_provider_id = auth.uid() or public.is_admin()))`. No user INSERT/UPDATE/DELETE policies (rows come only from triggers).

`public.notifications`:
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references public.profiles(id)`
- `booking_id uuid references public.bookings(id) on delete cascade`
- `title text not null`, `body text not null`
- `is_read boolean not null default false`
- `created_at timestamptz not null default now()`
- RLS **SELECT**: `user_id = auth.uid()`. **UPDATE**: `using (user_id = auth.uid())` with check pinning `user_id`, `booking_id`, `title`, `body` to stored values (only `is_read` may change). No user INSERT/DELETE.

## Triggers (all `security definer`, `set search_path = public` — same pattern as `bump_completed_jobs`)

Helper inserts go to `booking_activity` (actor = `auth.uid()` where applicable) and `notifications`.
- `bookings AFTER INSERT` → activity `booking_created` (actor = `new.customer_id`). No notification.
- `bookings AFTER UPDATE` (separate trigger from `bump_completed_jobs`) — when `new.status <> old.status`, map status → event and write activity + notify the **customer** (`new.customer_id`); when the new status is `provider_assigned`, ALSO notify the **assigned provider** (`new.assigned_provider_id`). Event/message map:
  - `accepted` → "Your booking was accepted."
  - `provider_assigned` → customer: "A professional has been assigned to your booking." / provider: "You've been assigned a new job."
  - `on_the_way` → "Your professional is on the way."
  - `in_progress` → "Work has started on your booking."
  - `completed` → "Your job is complete."
  - `cancelled` → "Your booking was cancelled."
- `booking_photos AFTER INSERT` → activity by `photo_type` (`issue_photo_added` / `before_photo_added` / `after_photo_added` / `completion_photo_added`, actor = `new.uploaded_by`). No notification.
- `booking_photos AFTER UPDATE` when `is_verified` goes false→true → activity `photos_verified` (actor = `auth.uid()`). No notification.

## Data layer

- `src/lib/activity.ts`: `BookingActivity` type; `getBookingActivity(bookingId): Promise<BookingActivity[]>` — `select('*').eq('booking_id', id).order('created_at', { ascending: true })` (oldest-first timeline). RLS-scoped.
- `src/lib/notifications.ts`: `AppNotification` type (`id; user_id; booking_id: string|null; title; body; is_read; created_at`); `getMyNotifications(): Promise<AppNotification[]>` (own, newest first), `markNotificationRead(id): Promise<{ ok; error? }>`, `markAllNotificationsRead(): Promise<{ ok; error? }>` (update own unread rows).

## UI

**Components (`src/components/ui/`):**
- `ActivityTimeline` — props `{ events: BookingActivity[] }`; vertical list, each row an event icon (by `event_type`) + `message` + relative/formatted `created_at`; muted "No activity yet" when empty.
- `NotificationRow` — title, body, an unread dot when `!is_read`, `onPress`.
- `NotificationList` — list of `NotificationRow` + `EmptyState` when none; "Mark all read" action.

**Customer:** add a **Notifications** tab to `app-tabs.tsx` (`Home | My Bookings | Notifications | Profile`); `(customer)/notifications.tsx` loads `getMyNotifications`, renders `NotificationList`; tapping a row → `markNotificationRead` + `router.push('/booking/' + booking_id)`. `booking/[id].tsx` gains an `ActivityTimeline` section via `getBookingActivity(id)`.

**Provider:** add a **Notifications** tab to `provider/(tabs)/_layout.tsx` (`My Jobs | Notifications | My Profile`); `provider/(tabs)/notifications.tsx` mirrors the customer screen but taps → `router.push('/provider/job/' + booking_id)`. `provider/job/[id].tsx` gains an `ActivityTimeline` section.

**Admin:** `admin/booking/[id].tsx` gains an `ActivityTimeline` section. No admin notifications.

No tab unread-badge this slice (NativeTabs badge support uncertain) — unread is shown via the row's unread dot.

## Testing

Mock Supabase; no network. Screen/route tests in `src/__tests__/`, never `src/app/`.
- lib: `getBookingActivity` (order asc, RLS-scoped call shape); `getMyNotifications`, `markNotificationRead`, `markAllNotificationsRead` (payloads).
- components: `ActivityTimeline` (events vs empty), `NotificationRow` (unread dot toggles), `NotificationList` (list vs empty + mark-all).
- customer: notifications screen renders + tap marks read & navigates to `/booking/[id]`; booking detail shows timeline.
- provider: notifications screen tap → `/provider/job/[id]`; job detail shows timeline.
- admin: booking detail shows timeline.

## Tasks (for the implementation plan)

1. **T1** — migration `0007` (both tables + RLS + triggers) + data layer (`activity.ts`, `notifications.ts`) (+tests).
2. **T2** — components `ActivityTimeline`, `NotificationRow`, `NotificationList` (+tests).
3. **T3** — customer Notifications tab + booking-detail timeline (+tests).
4. **T4** — provider Notifications tab + job-detail timeline (+tests).
5. **T5** — admin booking-detail timeline (+tests).
6. **Verify + merge** — `npm test`, `npx tsc --noEmit`, Android bundle smoke; merge to `main`.

## Constraints

- Reuse Slice 1 tokens; preserve premium feel. Route groups strip from URL — keep literal admin/provider paths (Slice 5/6 lesson).
- Supabase mocked in tests; PLAIN `router.push/replace` (no casts). One commit per task; after each: `npm test` + `npx tsc --noEmit`.

## Rollback

Branch `feat/slice-9-activity-notifications`; one commit per task; `git revert <sha>`. Additive: two new tables + triggers + RLS, new lib + components, additive screen sections + two notification tabs. Migration `0007` forward-only; to undo in DB drop the triggers + functions, the `notifications` and `booking_activity` tables.
