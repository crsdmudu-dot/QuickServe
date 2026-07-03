# Slice 24 — Scheduling Intelligence: Operator & Verification Guide

Accurate as of migration `0021_scheduling.sql` and commit range `6a93a5a..HEAD`.

---

## 1. Overview

`scheduled_for` on `public.bookings` is the **canonical scheduling field** and is **always set** — every booking path (ASAP, window, specific time, manual datetime) resolves a valid ISO timestamp into `scheduled_for` before inserting. Nothing that reads `scheduled_for` for sort or display changed.

Five additive columns **augment** `scheduled_for` — they are never a replacement:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `scheduling_type` | `text NOT NULL` | `'datetime'` | Intent label: `asap / today / tomorrow / date / datetime` |
| `time_window` | `text NULL` | `NULL` | Named window: `morning / afternoon / evening / specific / flexible` |
| `window_start` | `timestamptz NULL` | `NULL` | Window range start (ISO) |
| `window_end` | `timestamptz NULL` | `NULL` | Window range end (ISO) |
| `recurrence` | `text NOT NULL` | `'one_time'` | Cadence label: `one_time / weekly / biweekly / monthly / custom` |

Plus one index: `bookings_scheduled_for_idx` on `(scheduled_for)` for fast sort/filter.

**Recurrence is stored and displayed — never executed.** The `recurrence` column persists the customer's cadence preference and shows a badge when `!= 'one_time'`, but no future bookings are generated. `custom` is accepted with no interval (future-ready). There is no execution engine wired to `recurrence`.

**Admin remains dispatch authority.** The approve / assign flow is untouched. All scheduling additions are display- and filter-only.

---

## 2. Schema Check

Run in the Supabase SQL Editor or psql:

```sql
-- Verify the 5 additive columns exist with the correct defaults/nullability
select column_name, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bookings'
  and column_name in (
    'scheduling_type', 'time_window',
    'window_start', 'window_end', 'recurrence'
  )
order by column_name;
-- Expected (5 rows):
--   recurrence      | 'one_time'::text | NO   (NOT NULL, default 'one_time')
--   scheduling_type | 'datetime'::text | NO   (NOT NULL, default 'datetime')
--   time_window     | NULL             | YES  (nullable, no default)
--   window_end      | NULL             | YES  (nullable, no default)
--   window_start    | NULL             | YES  (nullable, no default)
```

```sql
-- Verify the scheduled_for index was created
select indexname, indexdef
from pg_indexes
where tablename = 'bookings'
  and indexname = 'bookings_scheduled_for_idx';
-- Expected: 1 row
--   bookings_scheduled_for_idx | CREATE INDEX bookings_scheduled_for_idx
--                                ON public.bookings USING btree (scheduled_for)
```

```sql
-- Verify column check constraints exist
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.bookings'::regclass
  and conname in (
    'bookings_scheduling_type_check',
    'bookings_time_window_check',
    'bookings_recurrence_check'
  )
order by conname;
-- Expected: 3 rows with the allowed enum values for each column.
```

---

## 3. Backward-Compat — Old Bookings Are Unaffected

All five columns are **additive with SQL defaults**. A row inserted before migration `0021` reads back with `scheduling_type = 'datetime'`, `recurrence = 'one_time'`, and all three window columns as `NULL`.

### How `describeSchedule` handles legacy rows

`describeSchedule` in `src/lib/scheduling.ts` is pure and never throws (wrapped in `try/catch`). When `scheduling_type` is absent or `'datetime'` and `time_window` is `NULL`, it falls through to the **legacy branch** — `'specific / datetime / legacy'` — and returns `'<Day>, <time>'` (the plain date and time, exactly as before Slice 24).

```sql
-- A pre-Slice-24 booking row (scheduling_type and window columns absent or defaulted):
select id, scheduled_for, scheduling_type, time_window, window_start, window_end, recurrence
from bookings
where id = '<pre-slice-24-booking-uuid>';
-- Expected:
--   scheduled_for   | <original ISO>
--   scheduling_type | datetime
--   time_window     | NULL
--   window_start    | NULL
--   window_end      | NULL
--   recurrence      | one_time
```

The `describeSchedule` call for this row returns `'Today, 3:00 PM'` (or equivalent) — identical to the pre-Slice-24 `toLocaleString` output.

### `createBooking` old-shape call still works

Old callers omit the 5 scheduling fields. `createBooking` in `src/lib/bookings.ts` applies `?? 'datetime'`, `?? null`, `?? 'one_time'` defaults before the Supabase insert. The insert succeeds with defaults exactly as if the SQL defaults fired.

```sql
-- Simulate: insert a booking omitting all 5 scheduling fields (SQL defaults apply)
insert into public.bookings (customer_id, service_id, address, scheduled_for, notes)
values (auth.uid(), '<service-uuid>', '1 Main St', now(), null)
returning scheduling_type, time_window, window_start, window_end, recurrence;
-- Expected:
--   scheduling_type | datetime
--   time_window     | NULL
--   window_start    | NULL
--   window_end      | NULL
--   recurrence      | one_time
```

The `select *` queries (`getCustomerBookings`, `getAllBookings`, `getProviderJobs`, `getBookingById`) are **unchanged** — the 5 columns are returned as extras and typed as optional on the `Booking` type.

---

## 4. ASAP

When the customer selects "Next available" (or any ASAP preset):

- `resolveSchedule({ type: 'asap' })` sets `scheduled_for = now()` at creation time.
- `scheduling_type = 'asap'`, all window columns `NULL`.
- Booking sorts **soonest** by `scheduled_for` (index used).
- `describeSchedule` returns `'ASAP'` (matched first before any date parsing).
- `BookingSummaryCard` renders the **ASAP badge** (testID `asap-badge`, `primarySurface` style).
- `isScheduledType('asap')` returns `false` — ASAP bookings are excluded from the admin "Scheduled" filter.

```sql
-- Verify an ASAP booking
select id, scheduled_for, scheduling_type, time_window, window_start, window_end
from bookings
where id = '<asap-booking-uuid>';
-- Expected:
--   scheduled_for   | <creation timestamp — matches ~now()>
--   scheduling_type | asap
--   time_window     | NULL
--   window_start    | NULL
--   window_end      | NULL
```

---

## 5. Time Windows (Morning / Afternoon / Evening)

When the customer selects a named window for today, tomorrow, or a chosen date:

- `scheduled_for` = **window start** hour (morning → 08:00, afternoon → 12:00, evening → 17:00) in local time.
- `window_start` = window start ISO, `window_end` = window end ISO (morning → 12:00, afternoon → 17:00, evening → 21:00).
- `time_window` = `'morning'` | `'afternoon'` | `'evening'`.
- `describeSchedule` returns `'<Day> <window> (<start>–<end>)'` — e.g. `'Today morning (8:00 AM–12:00 PM)'`.

```sql
-- Verify a morning window booking
select id, scheduled_for, scheduling_type, time_window, window_start, window_end
from bookings
where id = '<window-booking-uuid>';
-- Expected (morning window, 4 Jul 2026):
--   scheduled_for   | 2026-07-04T08:00:00+<offset>   (window start)
--   scheduling_type | today | tomorrow | date
--   time_window     | morning
--   window_start    | 2026-07-04T08:00:00+<offset>
--   window_end      | 2026-07-04T12:00:00+<offset>
```

### Window ranges reference

| `time_window` | `scheduled_for` anchor | `window_start` | `window_end` |
|---|---|---|---|
| `morning` | 08:00 local | 08:00 | 12:00 |
| `afternoon` | 12:00 local | 12:00 | 17:00 |
| `evening` | 17:00 local | 17:00 | 21:00 |

---

## 6. Flexible ±1h

When the customer selects a specific time and enables the "Flexible ±1h" toggle:

- `time_window = 'flexible'`.
- `scheduled_for` = the chosen instant (canonical).
- `window_start` = `scheduled_for − 60 min`, `window_end` = `scheduled_for + 60 min`.
- `describeSchedule` with `window_start/end` present computes half-width: `'<Day>, <time> ±1h'`.
  If `window_start/end` are absent (legacy), falls back to `'<Day>, <time> ±1h'` (literal).

```sql
-- Verify a flexible booking
select id, scheduled_for, time_window, window_start, window_end
from bookings
where id = '<flexible-booking-uuid>';
-- Expected (specific time 14:00):
--   scheduled_for | 2026-07-04T14:00:00+<offset>
--   time_window   | flexible
--   window_start  | 2026-07-04T13:00:00+<offset>   (−60 min)
--   window_end    | 2026-07-04T15:00:00+<offset>   (+60 min)
```

---

## 7. Admin Filters

The admin mobile (`src/app/admin/index.tsx`) and admin-web (`src/app/(admin-web)/bookings/index.tsx`) both add a filter row with five independent quick filters. All filters run **client-side** on the already-fetched booking list.

| Filter label | Predicate | Notes |
|---|---|---|
| All | `true` (no filter) | Default — shows everything |
| Today | `isToday(b.scheduled_for)` | Local calendar day = today |
| Tomorrow | `isTomorrow(b.scheduled_for)` | Local calendar day = tomorrow |
| Upcoming | `isUpcoming(b.scheduled_for)` | `scheduled_for` date ≥ today's date |
| Scheduled | `isScheduledType(b.scheduling_type)` | `scheduling_type !== 'asap'` |

**Filters are independent, not mutually exclusive** — Upcoming includes today, today + tomorrow are also Upcoming, ASAP bookings appear under All/Today/Tomorrow/Upcoming but NOT under Scheduled.

The approve/assign/dispatch flow, provider tab, quote flows, and all other admin logic are **untouched**.

```sql
-- Count bookings by scheduling_type to validate filter distribution
select scheduling_type, count(*) as n
from bookings
group by scheduling_type
order by n desc;
-- "Scheduled" filter count = total - count where scheduling_type = 'asap'
-- isToday / isTomorrow / isUpcoming operate on the scheduled_for column
-- (bookings_scheduled_for_idx serves these range queries efficiently)
```

---

## 8. Recurrence — Stored and Displayed, NOT Executed

`recurrence` persists the customer's cadence preference. The application:

- Stores the value: `one_time / weekly / biweekly / monthly / custom`.
- Displays a recurring badge via `recurrenceLabel` when `recurrence !== 'one_time'`.
- Accepts `custom` with **no interval field** (future-ready — the column exists, no execution engine reads it).
- Does **not** auto-generate future bookings. There is no cron, Edge Function, or DB trigger that reads `recurrence` to create additional bookings.

```sql
-- Verify recurrence is stored (no execution side-effect possible without a trigger)
select tgname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where tgname ilike '%recur%'
  or tgname ilike '%schedule%';
-- Expected: 0 rows (no recurrence-execution trigger exists)

-- Confirm no function references recurrence for execution
select proname, prosrc
from pg_proc
where pronamespace = 'public'::regnamespace
  and prosrc ilike '%recurrence%';
-- Expected: 0 rows (recurrence column is not referenced by any DB function)
```

### Display proof

```sql
-- Fetch a weekly booking; confirm badge would show
select id, recurrence, scheduling_type, scheduled_for
from bookings
where recurrence = 'weekly'
limit 5;
-- recurrenceLabel('weekly') → 'Weekly' (rendered as recurring badge in BookingSummaryCard)
-- No additional bookings appear in the table for this recurrence value.
```

---

## 9. Admin Dispatch Authority — Unchanged

All admin approve / assign / quote / dispatch flows are **untouched** by Slice 24. Scheduling is display- and filter-only from the admin perspective.

```sql
-- Confirm no change to the booking status update path
-- (assignProvider / approve / status transitions still work the same way)
select status, count(*) from bookings group by status order by status;
-- Statuses: pending / confirmed / provider_assigned / on_the_way / in_progress /
--           completed / cancelled — same as pre-Slice-24.

-- Confirm assignProvider-related columns are unchanged
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bookings'
  and column_name in ('assigned_provider_id', 'assigned_provider_name', 'status', 'admin_notes')
order by column_name;
-- Expected: all 4 present with same types as before Slice 24.
```

---

## 10. Rollback Plan

### Option A — Per-task git revert (preserve schema, hide UI)

Revert commits from T7 → T1 (newest to oldest). The 5 columns remain in the DB but are unused by application code. All existing bookings (with their scheduling data) are preserved. Old admin/provider/customer screens fall back to the pre-Slice-24 display automatically (`scheduling_type` defaults to `'datetime'`; `describeSchedule` legacy path returns plain date/time).

Order to revert (newest first):

1. `19484bc` — admin + web-admin schedule filters/display (T7)
2. `14a3892` — provider job scheduling display (T6)
3. `0ab97fd` — booking summary + detail scheduling display (T5)
4. `73e2218` — schedule step UI (T4)
5. `a0c3ab9` — booking draft + createBooking scheduling fields (T3)
6. `c8a97a0` — scheduling pure helpers (T2)
7. `7d56e1a` — booking scheduling columns 0021 (T1)

Reverting T3–T7 (UI tasks) while leaving T1 (schema) applied is safe — the columns sit dormant with defaults.

### Option B — Forward rollback migration `0022_rollback_scheduling.sql`

Full schema rollback (run after reverting application code):

```sql
-- Drop the index first
drop index if exists public.bookings_scheduled_for_idx;

-- Drop the 5 additive columns (scheduled_for and all existing bookings are preserved)
alter table public.bookings
  drop column if exists scheduling_type,
  drop column if exists time_window,
  drop column if exists window_start,
  drop column if exists window_end,
  drop column if exists recurrence;
```

This migration is safe at any time because:

- `scheduled_for` is **not dropped** — all booking sort/display/history is intact.
- No foreign key, trigger, or function in the DB reads these 5 columns.
- Existing booking rows retain all other data (service, address, status, quotes, etc.).

---

## 11. Isolation Diff

`git diff 6a93a5a..HEAD --stat` output (run 2026-07-03):

```
 src/__tests__/admin-web-bookings.test.tsx       | 155 +++++++++
 src/__tests__/admin.test.tsx                    | 211 ++++++++++++
 src/__tests__/booking-detail.test.tsx           |  17 +
 src/__tests__/booking-review.test.tsx           |  14 +-
 src/__tests__/booking-schedule.test.tsx         | 171 ++++++++--
 src/__tests__/provider-job-detail.test.tsx      | 104 ++++++
 src/app/(admin-web)/bookings/index.tsx          |  94 ++++-
 src/app/admin/index.tsx                         | 132 +++++--
 src/app/booking/[id].tsx                        |   5 +
 src/app/booking/review.tsx                      |  17 +
 src/app/booking/schedule.tsx                    | 437 +++++++++++++++++++++---
 src/app/provider/job/[id].tsx                   |   5 +
 src/booking/booking-draft.test.tsx              |  59 ++++
 src/booking/booking-draft.tsx                   |  26 +-
 src/components/ui/admin-live-location.test.tsx  |   6 +
 src/components/ui/booking-summary-card.test.tsx | 109 +++++-
 src/components/ui/booking-summary-card.tsx      |  82 ++++-
 src/lib/bookings.test.ts                        |  19 ++
 src/lib/bookings.ts                             |  19 ++
 src/lib/scheduling.test.ts                      | 291 ++++++++++++++++
 src/lib/scheduling.ts                           | 313 +++++++++++++++++
 supabase/migrations/0021_scheduling.sql         |  12 +
 22 files changed, 2169 insertions(+), 129 deletions(-) (plus this doc)
```

### Files changed — all in scope

| File | Task | Purpose |
|---|---|---|
| `supabase/migrations/0021_scheduling.sql` | T1 | 5 additive columns + index on `bookings` |
| `src/lib/scheduling.ts` | T2 | Pure scheduling helpers (resolve/describe/predicates) |
| `src/lib/scheduling.test.ts` | T2 | 291-line test suite for scheduling helpers |
| `src/lib/bookings.ts` | T3 | `NewBooking` / `Booking` types + `createBooking` with 5 new fields |
| `src/lib/bookings.test.ts` | T3 | Tests for scheduling field insert + defaults |
| `src/booking/booking-draft.tsx` | T3 | Draft state + `setSchedule` wiring |
| `src/booking/booking-draft.test.tsx` | T3 | Draft scheduling tests |
| `src/components/ui/admin-live-location.test.tsx` | T3 | Fixture-only: added 5 fields to `Booking` fixture for tsc |
| `src/app/booking/schedule.tsx` | T4 | Schedule step UI (ASAP/windows/flexible/recurrence) |
| `src/__tests__/booking-schedule.test.tsx` | T4 | 11 schedule step tests |
| `src/components/ui/booking-summary-card.tsx` | T5 | Shared card: `describeSchedule` + ASAP/recurring badges |
| `src/components/ui/booking-summary-card.test.tsx` | T5 | Card tests (badge + legacy fallback) |
| `src/app/booking/review.tsx` | T5 | Passes 5 fields from draft to `createBooking` |
| `src/app/booking/[id].tsx` | T5 | Passes 5 fields from `booking` to `BookingSummaryCard` |
| `src/__tests__/booking-review.test.tsx` | T5 | Updated for extended `createBooking` exact-match |
| `src/__tests__/booking-detail.test.tsx` | T5 | Updated with `Booking` fixture 5 fields |
| `src/app/provider/job/[id].tsx` | T6 | Provider job detail: passes 5 fields to shared card |
| `src/__tests__/provider-job-detail.test.tsx` | T6 | 4 new provider scheduling display tests |
| `src/app/admin/index.tsx` | T7 | Mobile admin: filter row + `describeSchedule` + recurring pill |
| `src/app/(admin-web)/bookings/index.tsx` | T7 | Web admin: filter row + `describeSchedule` + recurring text |
| `src/__tests__/admin.test.tsx` | T7 | 5 mobile admin scheduling filter tests |
| `src/__tests__/admin-web-bookings.test.tsx` | T7 | 6 web admin scheduling filter tests |

### Out-of-scope files — confirmed absent

- `src/lib/{payments,earnings,attempts,tracking,messages,push,notifications}.ts` — NOT in diff.
- `src/auth/**` — NOT in diff.
- Any chat / ChatThread file — NOT in diff.
- The `assignProvider` / dispatch logic — NOT in diff.
- Any provider-availability or auto-assign code — NOT in diff.
- Any recurring-execution code — NOT in diff.
- Any migration other than `0021` — NOT in diff.

Isolation: **CLEAN**.

---

## 12. Final Gate Results (2026-07-03)

| Check | Result |
|---|---|
| `npm test` | PASS — 113 suites, 925 tests, 0 failures |
| `npx tsc --noEmit` | PASS — no errors |
| `npx expo export --platform web` | PASS — exported to `dist/` |
| `npx expo export --platform android` | PASS — exported to `dist/` |
| `git status` (after doc commit) | CLEAN — only `supabase/.temp/` untracked |

---

## 13. Operator Checklist — Deploying Slice 24

### Pre-deploy

- [ ] Apply migration `0021_scheduling.sql` via Supabase SQL Editor or `supabase db push`.

### Post-deploy verification

```sql
-- 1. Confirm the 5 columns exist with correct defaults
select column_name, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bookings'
  and column_name in (
    'scheduling_type', 'time_window',
    'window_start', 'window_end', 'recurrence'
  )
order by column_name;
-- Expected: 5 rows; scheduling_type default 'datetime', recurrence default 'one_time',
-- time_window/window_start/window_end all nullable with no default.

-- 2. Confirm the index exists
select indexname from pg_indexes
where tablename = 'bookings'
  and indexname = 'bookings_scheduled_for_idx';
-- Expected: 1 row.

-- 3. Confirm no recurrence-execution trigger exists
select tgname from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where tgname ilike '%recur%' or tgname ilike '%schedule%';
-- Expected: 0 rows.

-- 4. Smoke-test: create a booking and confirm scheduling fields populated
select id, scheduled_for, scheduling_type, time_window, window_start, window_end, recurrence
from bookings
order by created_at desc
limit 5;

-- 5. Confirm existing bookings defaulted correctly
select count(*) as legacy_bookings
from bookings
where scheduling_type = 'datetime'
  and recurrence = 'one_time'
  and time_window is null;
-- Expected: all pre-Slice-24 bookings appear here.
```
