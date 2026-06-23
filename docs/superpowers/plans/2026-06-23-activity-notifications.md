# Slice 9 — Activity Feed + In-App Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Each booking shows an activity timeline, and customers/providers receive in-app notifications for assignment + status changes.

**Architecture:** Migration `0007` adds `booking_activity` + `notifications` tables (RLS: activity follows booking access, notifications are own-only) and security-definer triggers (like `bump_completed_jobs`) that write activity on booking insert/status-change and photo insert/verify, plus notifications to customer (and assigned provider on assignment). `src/lib/activity.ts` + `src/lib/notifications.ts` wrap reads/mark-read. An `ActivityTimeline` component + `NotificationList`/`NotificationRow` are reused across customer/provider/admin screens; customer and provider each gain a Notifications tab.

**Tech Stack:** Expo Router, TypeScript, Supabase (Postgres triggers + RLS), jest-expo + @testing-library/react-native.

## Global Constraints
- Activity/notification rows are created ONLY by security-definer triggers (no user INSERT policy). Users see only their own notifications; activity follows booking access (customer-own / provider-assigned / admin-all). No admin notifications in Slice 9.
- Reuse Slice 1 tokens. Route groups strip from URL — keep literal admin/provider paths (Slice 5/6 lesson).
- Supabase mocked in tests; no network. Screen/route tests in `src/__tests__/`, NEVER `src/app/`. Component tests co-located in `src/components/ui/`.
- PLAIN `router.push/replace` (no casts). One commit per task; after each: `npm test` + `npx tsc --noEmit`.
- OUT: push/email/SMS, realtime, payments, ratings, reviews, chat, maps, tracking.

## File Structure
- `supabase/migrations/0007_activity_notifications.sql` — tables + RLS + triggers (T1).
- `src/lib/activity.ts`, `src/lib/notifications.ts` (T1).
- `src/components/ui/{activity-timeline,notification-row,notification-list}.tsx` (T2).
- `src/components/app-tabs.tsx`, `src/app/(customer)/notifications.tsx`, `src/app/booking/[id].tsx` (T3).
- `src/app/provider/(tabs)/_layout.tsx`, `src/app/provider/(tabs)/notifications.tsx`, `src/app/provider/job/[id].tsx` (T4).
- `src/app/admin/booking/[id].tsx` (T5).
- Tests in `src/__tests__/`, `src/lib/*.test.ts`, `src/components/ui/*.test.tsx`.

---

## Task 1 — Tables + RLS + triggers + data layer

**Files:**
- Create: `supabase/migrations/0007_activity_notifications.sql`, `src/lib/activity.ts`, `src/lib/activity.test.ts`, `src/lib/notifications.ts`, `src/lib/notifications.test.ts`

**Interfaces — Produces:**
- `BookingActivity = { id; booking_id; actor_id: string|null; event_type: string; message: string; metadata: unknown|null; created_at: string }`
- `getBookingActivity(bookingId: string): Promise<BookingActivity[]>` (oldest-first)
- `AppNotification = { id; user_id; booking_id: string|null; title: string; body: string; is_read: boolean; created_at: string }`
- `getMyNotifications(): Promise<AppNotification[]>` (newest-first), `markNotificationRead(id: string): Promise<{ok;error?}>`, `markAllNotificationsRead(): Promise<{ok;error?}>`

- [ ] **1. SQL `supabase/migrations/0007_activity_notifications.sql`**
```sql
-- Activity timeline (read-only to users; written by triggers)
create table if not exists public.booking_activity (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  event_type text not null,
  message text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
alter table public.booking_activity enable row level security;
create policy "booking_activity_select" on public.booking_activity
  for select using (
    exists (select 1 from public.bookings b where b.id = booking_id
      and (b.customer_id = auth.uid() or b.assigned_provider_id = auth.uid() or public.is_admin()))
  );

-- In-app notifications (own-only; written by triggers)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  booking_id uuid references public.bookings(id) on delete cascade,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
create policy "notifications_select" on public.notifications
  for select using (user_id = auth.uid());
-- Users may only flip is_read on their own rows (other columns pinned).
create policy "notifications_update" on public.notifications
  for update using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and booking_id is not distinct from (select n.booking_id from public.notifications n where n.id = notifications.id)
    and title = (select n.title from public.notifications n where n.id = notifications.id)
    and body  = (select n.body  from public.notifications n where n.id = notifications.id)
  );

-- booking_created -> activity
create or replace function public.log_booking_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.booking_activity (booking_id, actor_id, event_type, message)
    values (new.id, new.customer_id, 'booking_created', 'Booking created.');
  return new;
end; $$;
drop trigger if exists trg_log_booking_created on public.bookings;
create trigger trg_log_booking_created after insert on public.bookings
  for each row execute function public.log_booking_created();

-- status change -> activity + notify customer (+ provider on assignment)
create or replace function public.log_booking_status_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_msg text;
begin
  if new.status is distinct from old.status then
    v_msg := case new.status
      when 'accepted' then 'Your booking was accepted.'
      when 'provider_assigned' then 'A professional has been assigned to your booking.'
      when 'on_the_way' then 'Your professional is on the way.'
      when 'in_progress' then 'Work has started on your booking.'
      when 'completed' then 'Your job is complete.'
      when 'cancelled' then 'Your booking was cancelled.'
      else 'Your booking was updated.' end;
    insert into public.booking_activity (booking_id, actor_id, event_type, message)
      values (new.id, auth.uid(), new.status, v_msg);
    insert into public.notifications (user_id, booking_id, title, body)
      values (new.customer_id, new.id, 'Booking update', v_msg);
    if new.status = 'provider_assigned' and new.assigned_provider_id is not null then
      insert into public.notifications (user_id, booking_id, title, body)
        values (new.assigned_provider_id, new.id, 'New job assigned', 'You have been assigned a new job.');
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_log_booking_status on public.bookings;
create trigger trg_log_booking_status after update on public.bookings
  for each row execute function public.log_booking_status_activity();

-- photo added -> activity
create or replace function public.log_photo_added()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_msg text;
begin
  v_msg := case new.photo_type
    when 'issue' then 'Issue photos uploaded.'
    when 'before' then 'Before photos uploaded.'
    when 'after' then 'After photos uploaded.'
    when 'completion' then 'Completion photos uploaded.'
    else 'Photos uploaded.' end;
  insert into public.booking_activity (booking_id, actor_id, event_type, message)
    values (new.booking_id, new.uploaded_by, new.photo_type || '_photo_added', v_msg);
  return new;
end; $$;
drop trigger if exists trg_log_photo_added on public.booking_photos;
create trigger trg_log_photo_added after insert on public.booking_photos
  for each row execute function public.log_photo_added();

-- photo verified (false->true) -> activity
create or replace function public.log_photo_verified()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_verified = true and old.is_verified = false then
    insert into public.booking_activity (booking_id, actor_id, event_type, message)
      values (new.booking_id, auth.uid(), 'photos_verified', 'A photo was verified by QuickServe.');
  end if;
  return new;
end; $$;
drop trigger if exists trg_log_photo_verified on public.booking_photos;
create trigger trg_log_photo_verified after update on public.booking_photos
  for each row execute function public.log_photo_verified();
```
- [ ] **2. Failing tests `src/lib/activity.test.ts`** (mock `@/lib/supabase` `from().select().eq().order()`):
```ts
it('getBookingActivity returns rows oldest-first', async () => {
  order.mockResolvedValue({ data: [{ id: 'a1', event_type: 'booking_created' }], error: null });
  expect(await getBookingActivity('bk1')).toEqual([{ id: 'a1', event_type: 'booking_created' }]);
  expect(eq).toHaveBeenCalledWith('booking_id', 'bk1');
  expect(order).toHaveBeenCalledWith('created_at', { ascending: true });
});
it('returns [] when none', async () => {
  order.mockResolvedValue({ data: null, error: null });
  expect(await getBookingActivity('bk1')).toEqual([]);
});
```
- [ ] **3. Failing tests `src/lib/notifications.test.ts`** (mock `auth.getUser`, `from().select().order()`, `update().eq()`, `update().eq().eq()`):
```ts
it('getMyNotifications returns rows newest-first', async () => {
  order.mockResolvedValue({ data: [{ id: 'n1', is_read: false }], error: null });
  expect(await getMyNotifications()).toEqual([{ id: 'n1', is_read: false }]);
  expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
});
it('markNotificationRead updates is_read by id', async () => {
  update.mockReturnValue({ eq: (...a:unknown[]) => updateEq(...a) });
  updateEq.mockResolvedValue({ error: null });
  expect(await markNotificationRead('n1')).toEqual({ ok: true });
  expect(update).toHaveBeenCalledWith({ is_read: true });
  expect(updateEq).toHaveBeenCalledWith('id', 'n1');
});
it('markAllNotificationsRead updates own unread rows', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  update.mockReturnValue({ eq: () => ({ eq: (...a:unknown[]) => updateEqEq(...a) }) });
  updateEqEq.mockResolvedValue({ error: null });
  expect(await markAllNotificationsRead()).toEqual({ ok: true });
  expect(update).toHaveBeenCalledWith({ is_read: true });
});
```
- [ ] **4. Run → FAIL** `npm test -- activity.test notifications.test`
- [ ] **5. Implement:**
  - `activity.ts`: `getBookingActivity` = `from('booking_activity').select('*').eq('booking_id', id).order('created_at',{ascending:true})`; return `data ?? []`.
  - `notifications.ts`: `getMyNotifications` = `from('notifications').select('*').order('created_at',{ascending:false})` (RLS scopes to own); `markNotificationRead(id)` = `update({is_read:true}).eq('id', id)`; `markAllNotificationsRead()` = get user; `update({is_read:true}).eq('user_id', user.id).eq('is_read', false)`. Mutations return `{ok}`/`{ok:false,error}` (friendly).
- [ ] **6. Run → PASS**; `npm test`; `npx tsc --noEmit`
- [ ] **7. Commit** `git add supabase/migrations/0007_activity_notifications.sql src/lib/activity.ts src/lib/activity.test.ts src/lib/notifications.ts src/lib/notifications.test.ts && git commit -m "feat: slice9 activity + notifications tables/triggers + data layer"`

---

## Task 2 — ActivityTimeline + Notification components

**Files:**
- Create: `src/components/ui/activity-timeline.tsx`, `src/components/ui/notification-row.tsx`, `src/components/ui/notification-list.tsx`
- Test: co-located `*.test.tsx`

**Interfaces:**
- Consumes: `BookingActivity` (`@/lib/activity`), `AppNotification` (`@/lib/notifications`); `Card`/`Text`/`Button`/`EmptyState`.
- Produces:
  - `<ActivityTimeline events={BookingActivity[]} />`
  - `<NotificationRow notification={AppNotification} onPress={() => void} />`
  - `<NotificationList notifications={AppNotification[]} onPressItem={(n) => void} onMarkAllRead?={() => void} />`

- [ ] **1. Failing component tests:**
  - `activity-timeline.test.tsx`: `<ActivityTimeline events={[{id:'a1',event_type:'booking_created',message:'Booking created.',created_at:'2026-07-01T10:00:00Z',actor_id:null,metadata:null}]} />` → "Booking created." shown; empty array → "No activity yet".
  - `notification-row.test.tsx`: unread (`is_read:false`) → an unread dot (testID `unread-dot`) present + title/body shown; `is_read:true` → no `unread-dot`; pressing calls `onPress`.
  - `notification-list.test.tsx`: empty → `EmptyState` "No notifications"; with rows → titles shown; pressing a row calls `onPressItem` with that notification; "Mark all read" present when `onMarkAllRead` given and calls it.
- [ ] **2. Run → FAIL** `npm test -- activity-timeline notification-row notification-list`
- [ ] **3. Implement** (reuse tokens/`useTheme`):
  - `activity-timeline.tsx`: empty → muted "No activity yet" `Text`. Else map events to rows: an icon from `EVENT_ICON` (`{ booking_created:'📝', accepted:'✅', provider_assigned:'👷', on_the_way:'🚗', in_progress:'🔧', completed:'🎉', cancelled:'❌', issue_photo_added:'📷', before_photo_added:'📷', after_photo_added:'📷', completion_photo_added:'📷', photos_verified:'✔️' }` with `?? '•'` fallback) + `message` (`body`) + `new Date(created_at).toLocaleString()` (`caption`, textSecondary).
  - `notification-row.tsx`: `Card onPress`; row with optional `<View testID="unread-dot">` when `!is_read`; `Text variant="heading"` title + `Text variant="body" color="textSecondary"` body + caption time.
  - `notification-list.tsx`: empty → `EmptyState` (icon '🔔', title "No notifications"); else optional "Mark all read" `Button variant="ghost"` (when `onMarkAllRead`) + a `FlatList`/map of `NotificationRow` calling `onPressItem(n)`.
- [ ] **4. Run → PASS**; `npx tsc --noEmit`
- [ ] **5. Commit** `git add src/components/ui/activity-timeline.tsx src/components/ui/activity-timeline.test.tsx src/components/ui/notification-row.tsx src/components/ui/notification-row.test.tsx src/components/ui/notification-list.tsx src/components/ui/notification-list.test.tsx && git commit -m "feat: slice9 activity timeline + notification components"`

---

## Task 3 — Customer Notifications tab + booking-detail timeline

**Files:**
- Modify: `src/components/app-tabs.tsx`, `src/app/booking/[id].tsx`
- Create: `src/app/(customer)/notifications.tsx`
- Test: `src/__tests__/customer-notifications.test.tsx` (create), `src/__tests__/booking-detail.test.tsx` (extend)

**Interfaces:** Consumes `getMyNotifications`, `markNotificationRead`, `markAllNotificationsRead`, `getBookingActivity`; `NotificationList`, `ActivityTimeline`; `router`.

- [ ] **1. Add Notifications tab** — in `src/components/app-tabs.tsx` insert a `NativeTabs.Trigger name="notifications"` BETWEEN `bookings` and `profile`: label "Notifications", icon `@/assets/images/tabIcons/explore.png`, `renderingMode="template"`. Home/My Bookings/Profile triggers otherwise unchanged.
- [ ] **2. `(customer)/notifications.tsx`** — `useEffect` load `getMyNotifications()` into state + `reload`; `<NotificationList notifications onPressItem={handlePress} onMarkAllRead={handleMarkAll} />`. `handlePress(n)` → `await markNotificationRead(n.id)`; if `n.booking_id` `router.push('/booking/' + n.booking_id)`; `handleMarkAll` → `markAllNotificationsRead()` then `reload`. SafeAreaView + tokens (mirror `(customer)/bookings.tsx`).
- [ ] **3. Booking detail timeline** — in `src/app/booking/[id].tsx` add an "Activity" section: load `getBookingActivity(id)` into state + `<ActivityTimeline events={activity} />` (below the Photos section). Keep summary + professional card + photos intact.
- [ ] **4. Tests** (`src/__tests__/`): mock `expo-router`, `@/lib/notifications`, `@/lib/activity` (+ existing booking/photos mocks for detail).
  - customer-notifications: `getMyNotifications`→`[{id:'n1',booking_id:'bk1',title:'Booking update',body:'...',is_read:false,...}]`; tapping the row calls `markNotificationRead('n1')` and `router.push('/booking/bk1')`; "Mark all read" calls `markAllNotificationsRead`.
  - booking-detail: `getBookingActivity`→`[{...message:'Booking created.'}]` → "Booking created." shown. Keep existing cases passing.
- [ ] **5. Run → FAIL** then implement → **PASS** `npm test`; `npx tsc --noEmit` (regenerate route types via bundle smoke if tsc complains about `/notifications`).
- [ ] **6. Commit** `git add src/components/app-tabs.tsx "src/app/(customer)/notifications.tsx" src/app/booking/[id].tsx src/__tests__/customer-notifications.test.tsx src/__tests__/booking-detail.test.tsx && git commit -m "feat: slice9 customer notifications tab + booking timeline"`

---

## Task 4 — Provider Notifications tab + job-detail timeline

**Files:**
- Modify: `src/app/provider/(tabs)/_layout.tsx`, `src/app/provider/job/[id].tsx`
- Create: `src/app/provider/(tabs)/notifications.tsx`
- Test: `src/__tests__/provider-notifications.test.tsx` (create), `src/__tests__/provider-job-detail.test.tsx` (extend)

**Interfaces:** Consumes `getMyNotifications`, `markNotificationRead`, `markAllNotificationsRead`, `getBookingActivity`; `NotificationList`, `ActivityTimeline`; `router`.

- [ ] **1. Add Notifications tab** — in `src/app/provider/(tabs)/_layout.tsx` insert a `NativeTabs.Trigger name="notifications"` BETWEEN `index` and `profile`: label "Notifications", icon `@/assets/images/tabIcons/explore.png`, `renderingMode="template"`. Keep My Jobs (index) + My Profile triggers unchanged.
- [ ] **2. `provider/(tabs)/notifications.tsx`** — mirror the customer screen, but `handlePress(n)` navigates `router.push('/provider/job/' + n.booking_id)` (after `markNotificationRead`). `getMyNotifications` is RLS-scoped to the signed-in provider.
- [ ] **3. Job detail timeline** — in `src/app/provider/job/[id].tsx` add an "Activity" section: `getBookingActivity(id)` + `<ActivityTimeline events={activity} />` (below the Photos section). Keep forward-only status + photos intact.
- [ ] **4. Tests** (`src/__tests__/`): mock `expo-router`, `@/lib/notifications`, `@/lib/activity` (+ existing job mocks).
  - provider-notifications: row tap calls `markNotificationRead('n1')` + `router.push('/provider/job/bk1')`; mark-all works.
  - provider-job-detail: `getBookingActivity`→one event → message shown. Keep forward-only + photo tests passing.
- [ ] **5. Run → FAIL** then implement → **PASS** `npm test`; `npx tsc --noEmit` (regenerate route types via bundle smoke if tsc complains about `/provider/notifications`).
- [ ] **6. Commit** `git add "src/app/provider/(tabs)/_layout.tsx" "src/app/provider/(tabs)/notifications.tsx" "src/app/provider/job/[id].tsx" src/__tests__/provider-notifications.test.tsx src/__tests__/provider-job-detail.test.tsx && git commit -m "feat: slice9 provider notifications tab + job timeline"`

---

## Task 5 — Admin booking-detail timeline

**Files:**
- Modify: `src/app/admin/booking/[id].tsx`
- Test: `src/__tests__/admin-booking-detail.test.tsx` (extend)

**Interfaces:** Consumes `getBookingActivity`, `ActivityTimeline`.

- [ ] **1. Add an "Activity" section** to `src/app/admin/booking/[id].tsx`: load `getBookingActivity(id)` into state (in the existing booking-load effect) + `<ActivityTimeline events={activity} />` (below the Photos section). Keep status picker / assign / notes / photos intact. No admin notifications.
- [ ] **2. Failing test** — extend `admin-booking-detail.test.tsx`: mock `@/lib/activity` (`getBookingActivity`→`[{...message:'Provider assigned activity'}]` or "Booking created."). Assert the activity message renders. Keep all existing tests passing.
- [ ] **3. Run → FAIL** then implement → **PASS** `npm test -- admin-booking-detail`; `npm test`; `npx tsc --noEmit`
- [ ] **4. Commit** `git add "src/app/admin/booking/[id].tsx" src/__tests__/admin-booking-detail.test.tsx && git commit -m "feat: slice9 admin booking activity timeline"`

---

## Verification (controller, after Task 5)
- `npm test` all pass; `npx tsc --noEmit` clean.
- Android bundle smoke: `npx expo start -c`, wait for Metro, fetch the manifest's `launchAsset.url` → HTTP 200, no errors. (Regenerates route types; run before trusting tsc on `/notifications` + `/provider/notifications`.)
- Routes present: `/notifications`, `/provider/notifications`.

### SQL + trigger verification (DB, before Expo Go)
1. Apply `supabase/migrations/0007_activity_notifications.sql`. Confirm both tables + their RLS policies exist and the 4 trigger functions + triggers (`trg_log_booking_created`, `trg_log_booking_status`, `trg_log_photo_added`, `trg_log_photo_verified`) exist.
2. Create a booking → a `booking_activity` row `booking_created` appears; no notification.
3. As admin assign an in-app provider → activity `provider_assigned`; the customer AND the assigned provider each get a `notifications` row.
4. Advance status (on_the_way → in_progress → completed) → an activity row + a customer notification per change.
5. Upload a photo → activity `*_photo_added`, no notification. Admin verify a photo → activity `photos_verified`.
6. As a non-owner user, `select * from booking_activity where booking_id = '<id>'` returns 0 rows; `select * from notifications` returns only your own; attempt to `update notifications set title='x'` on your row → rejected (only `is_read` mutable).

### Expo Go end-to-end
1. **Customer**: place a booking → Notifications tab empty initially; booking detail shows "Booking created." in the Activity timeline.
2. **Admin**: assign a provider + advance status → activity grows on the booking detail.
3. **Customer**: Notifications tab shows "A professional has been assigned…" and status updates (unread dots); tapping one opens the booking detail and clears the dot; "Mark all read" clears all.
4. **Provider** (assigned): Notifications tab shows "You have been assigned a new job."; tapping opens the job detail; job detail Activity timeline reflects photos/status.

## Rollback
Branch `feat/slice-9-activity-notifications`; one commit per task → `git revert <sha>`. Additive: two new tables + triggers + RLS, new lib + components, two notification tabs + timeline sections. Migration `0007` forward-only; to undo in DB drop triggers `trg_log_*` + their functions and the `notifications` and `booking_activity` tables.

## Self-review
- Tables + RLS (activity select-by-booking-access; notifications own + is_read-only update) → T1 ✓. Triggers (created/status+notify/photo-added/photo-verified) → T1 ✓. Data layer → T1 ✓. Components → T2 ✓. Customer tab + booking timeline → T3 ✓. Provider tab + job timeline → T4 ✓. Admin timeline → T5 ✓. No admin notifications ✓. Tests mock Supabase, in `src/__tests__/`/`src/lib/`/`src/components/ui/` ✓.
- Signatures consistent across tasks (`getBookingActivity`, `getMyNotifications`, `markNotificationRead`, `markAllNotificationsRead`, `BookingActivity`, `AppNotification`). Notification fan-out matches the approved recipients (customer + assigned provider on assignment; customer on status change).
