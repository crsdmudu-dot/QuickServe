# Slice 24 — Scheduling Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Smarter booking date/time — ASAP/Today/Tomorrow/date/datetime, time windows, flexible ±1h, quick presets, and a future-ready recurrence selector — while `scheduled_for` stays canonical and admin stays the dispatch authority.

**Architecture:** Five additive `bookings` columns augment (never replace) `scheduled_for`. All date math lives in a pure, unit-tested `src/lib/scheduling.ts` (`resolveSchedule`/`describeSchedule`/presets/predicates); the schedule step, summary, detail, provider, and admin layers stay thin and reuse the existing pickers.

**Tech Stack:** Supabase (Postgres, additive migration), Expo RN + TS, Expo Router, `@react-native-community/datetimepicker`, Jest + RNTL.

## Global Constraints

- **`scheduled_for` remains canonical and ALWAYS set** — every path (ASAP included) resolves a valid ISO timestamp; nothing that reads `scheduled_for` today changes. New columns only augment it.
- **ASAP** → `scheduled_for = now()` at creation, `scheduling_type='asap'`, UI shows an **ASAP badge** (not the raw time).
- **Time window** → `scheduled_for` = window START (morning 08:00 / afternoon 12:00 / evening 17:00); `window_start`/`window_end` hold the range; `time_window` names it. **Flexible** → `time_window='flexible'`, `window_start/end = scheduled_for ∓ 60min`.
- **Admin filters** are date-based independent quick filters (overlap fine): Today = date today, Tomorrow = date tomorrow, Upcoming = date ≥ today, **Scheduled = `scheduling_type != 'asap'`**.
- **Recurrence stored, NEVER executed** this slice (`one_time` default; `custom` accepted, no interval field) — future-ready badge only.
- **Admin remains the dispatch authority.** NO provider availability, NO auto-assign, NO recurring execution, NO payment/tracking/chat change. Reuse the existing booking flow; **manual "Choose date & time" preserved** (reuses current pickers).
- **Backward-compatible:** old bookings default `scheduling_type='datetime'`, `recurrence='one_time'`, NULL windows → render/sort unchanged; `createBooking` new fields optional; `select *` queries unchanged.
- Gate every task: `npm test` green, `npx tsc --noEmit` clean, `expo export --platform web` AND `--platform android` succeed.

---

## File Structure

**Create**
- `supabase/migrations/0021_scheduling.sql` — 5 columns + `scheduled_for` index.
- `src/lib/scheduling.ts` (+ `scheduling.test.ts`) — pure helpers.
- `docs/pilot/scheduling.md` — verification doc.

**Modify**
- `src/booking/booking-draft.tsx` — scheduling fields + `setSchedule`.
- `src/lib/bookings.ts` — `NewBooking`/`createBooking` + `Booking` type (5 fields).
- `src/app/booking/schedule.tsx` — reworked picker (options/windows/quick/recurring; reuse manual).
- `src/components/ui/booking-summary-card.tsx` — scheduling display.
- `src/app/booking/[id].tsx` — customer detail scheduling display.
- `src/app/provider/job/[id].tsx` — provider job scheduling display + ASAP badge.
- `src/app/admin/index.tsx` — admin mobile filters + scheduled display + recurring badge.
- `src/app/(admin-web)/bookings/index.tsx` — web admin filters + scheduled display + recurring badge.

**Reuse (do not modify):** `@react-native-community/datetimepicker`, existing `bookings` RLS, dispatch/assign flow, StatusBadge.

---

## Task Order (dependency-ordered)

1. **T1** — Migration `0021` (5 columns + index).
2. **T2** — `src/lib/scheduling.ts` pure helpers (+ tests).
3. **T3** — `BookingDraft` + `bookings.ts` (`NewBooking`/`createBooking`/`Booking`) extensions (+ tests).
4. **T4** — Schedule step rework (options/windows/flexible/quick presets/recurring) (+ tests).
5. **T5** — Booking summary + customer detail scheduling display (+ tests).
6. **T6** — Provider job scheduling display + ASAP badge (+ tests).
7. **T7** — Admin mobile + web filters/display + recurring badge (+ tests).
8. **T8** — Verification `docs/pilot/scheduling.md` + backward-compat + isolation + final gate.

Each task ends green (tests / tsc / both exports).

---

### Task 1: Migration `0021_scheduling.sql`

**Files:** Create `supabase/migrations/0021_scheduling.sql`

**Build (mirror `0017`/`0019` additive-column style):**
```sql
alter table public.bookings
  add column if not exists scheduling_type text not null default 'datetime'
    check (scheduling_type in ('asap','today','tomorrow','date','datetime')),
  add column if not exists time_window text
    check (time_window in ('morning','afternoon','evening','specific','flexible')),
  add column if not exists window_start timestamptz,
  add column if not exists window_end   timestamptz,
  add column if not exists recurrence   text not null default 'one_time'
    check (recurrence in ('one_time','weekly','biweekly','monthly','custom'));

create index if not exists bookings_scheduled_for_idx on public.bookings (scheduled_for);
```
- Defaults keep old rows valid (`datetime`/`one_time`, NULL windows). No RLS change, no new table, no trigger. `recurrence` stored not executed; `custom` accepted with no interval column (future-ready).

**Checks:** migration well-formed; `npm test` (unchanged ~840), `tsc` clean, both exports. Commit `feat: slice24 booking scheduling columns (0021)`.
> DB not applied locally — behavioral verify in T8.

---

### Task 2: `src/lib/scheduling.ts` pure helpers

**Files:** Create `src/lib/scheduling.ts` (+ `scheduling.test.ts`)

**Build (pure; inject `now` for testability):**
- Types `SchedulingType`/`TimeWindow`/`Recurrence`; `WINDOW_RANGES` (morning 8–12, afternoon 12–17, evening 17–21); `ScheduleInput`, `ResolvedSchedule` (per spec §4).
- `resolveSchedule(input, now = new Date()): ResolvedSchedule`:
  - `asap` → `scheduled_for = now`, `scheduling_type='asap'`, `time_window=null`, windows null.
  - `today`/`tomorrow`/`date` + `window` (morning/afternoon/evening) → base day (today/tomorrow/`baseDate`) at the window **start hour**; `window_start`=that, `window_end`=end hour; `time_window`=the window.
  - `datetime` (or window `specific`) → `scheduled_for = specificTime ?? baseDate`, `time_window='specific'`, windows null.
  - `flexible` (with a specific time) → `time_window='flexible'`, `window_start = scheduled_for − flexMinutes(60)`, `window_end = scheduled_for + flexMinutes`.
  - Always emit an ISO `scheduled_for`; carry `recurrence` (default `one_time`).
- `describeSchedule(b, now?)` → e.g. `'ASAP'`, `'Tomorrow morning (8:00 AM – 12:00 PM)'`, `'Fri 4 Jul, 2:00 PM'`, `'Fri 4 Jul, 2:00 PM ±1h'`; **legacy fallback**: no `scheduling_type`/window → plain `new Date(scheduled_for).toLocaleString()`-style date/time.
- `recurrenceLabel(r)` → `'One time'|'Weekly'|'Every 2 weeks'|'Monthly'|'Custom'`.
- `QUICK_PRESETS`: `nextAvailable`(=asap), `thisEvening`(today+evening), `tomorrowMorning`, `tomorrowAfternoon` — each `build(now?) → ScheduleInput`.
- Predicates: `isToday`/`isTomorrow`/`isUpcoming(iso, now?)` (local-day compare), `isScheduledType(type)` = `type !== 'asap'`.

**Tests:** each `resolveSchedule` branch (asap/today+window/tomorrow+window/date/specific/flexible) asserting `scheduled_for` + windows + type; `describeSchedule` (asap, window, specific, flexible, legacy fallback); `recurrenceLabel`; each `QUICK_PRESET.build`; predicate boundaries (today vs tomorrow vs upcoming; scheduled=non-asap). Inject a fixed `now`.

**Steps:** TDD → `tsc` → commit `feat: slice24 scheduling pure helpers`.

---

### Task 3: Draft + bookings lib extensions

**Files:** Modify `src/booking/booking-draft.tsx`, `src/lib/bookings.ts`; Test `src/lib/bookings.test.ts` (or existing), draft usage covered via T4

**Build:**
- `BookingDraft`: add `scheduling_type: SchedulingType`, `time_window: TimeWindow | null`, `window_start: string | null`, `window_end: string | null`, `recurrence: Recurrence` to `Draft` + `EMPTY` (defaults `scheduling_type='asap'` OR keep `'datetime'`? → default the DRAFT to `'asap'` so ASAP is the default booking option, but `scheduledFor` still empty until resolved). Add `setSchedule(r: ResolvedSchedule)` that sets `scheduledFor=r.scheduled_for` + the 5 fields together. Keep `setScheduledFor` (used by the manual path; it sets `scheduling_type='datetime'`, `time_window='specific'`).
- `bookings.ts`: extend `NewBooking` with optional `scheduling_type?`, `time_window?`, `window_start?`, `window_end?`, `recurrence?`; `createBooking` inserts them (`?? null` / `?? 'datetime'` / `?? 'one_time'` — preserving old callers). Extend `Booking` type with the 5 columns (`scheduling_type: string`, `time_window: string | null`, `window_start: string | null`, `window_end: string | null`, `recurrence: string`).

**Tests:** `createBooking` persists the 5 fields when provided and defaults them when omitted (mocked supabase, mirror existing bookings test); `setSchedule` sets all fields + `scheduledFor` (light draft test or via T4).

**Steps:** TDD → `tsc` → commit `feat: slice24 booking draft + createBooking scheduling fields`.

---

### Task 4: Schedule step rework

**Files:** Modify `src/app/booking/schedule.tsx`; Test `src/__tests__/booking-schedule.test.tsx` (new/updated)

**Build (reuse the existing pickers; preserve manual):**
- **Booking-option chips** (ASAP default): ASAP · Today · Tomorrow · Choose date · Choose date & time (Buttons; selected = primary).
- **Time of day** (shown when type ∈ today/tomorrow/date): Morning · Afternoon · Evening · Specific time. "Specific time" (and "Choose date & time") reveal the existing `DateTimePicker`/`DateTimePickerAndroid` flow verbatim.
- **Flexible window** toggle (±1h) shown for a specific time.
- **Quick selections** row: map `QUICK_PRESETS` → Buttons (Next available · This evening · Tomorrow morning · Tomorrow afternoon); tap applies the preset.
- **Recurring** selector: One time (default) · Weekly · Every 2 weeks · Monthly · Custom + caption "Recurring bookings are saved but not auto-scheduled yet."
- **Continue** → build a `ScheduleInput` from the chosen chips → `resolveSchedule(...)` → `setSchedule(...)` → keep existing gating (a valid `scheduled_for` always results; ASAP passes) → `router.push('/booking/notes')`.
- Preserve the current manual path exactly (the datetime pickers, Android two-step, iOS inline).

**Tests:** ASAP is the default and Continue proceeds (resolves now); selecting Tomorrow + Morning resolves the draft (`setSchedule` called with window-start + range); a quick preset applies; choosing a recurrence sets it; manual "Choose date & time" still opens the picker and sets a specific time. Never weaken existing schedule assertions.

**Steps:** `expo export --platform android` (route types unaffected but keep green) → `tsc` → `npm test` → `expo export --platform web` → commit `feat: slice24 schedule step (options/windows/quick/recurring)`.

---

### Task 5: Booking summary + customer detail display

**Files:** Modify `src/components/ui/booking-summary-card.tsx`, `src/app/booking/[id].tsx`; Test their existing tests

**Build:**
- `booking-summary-card.tsx`: render **Date · Time · Scheduling type · Time window · Recurring status** via `describeSchedule(booking)` + an **ASAP badge** when `scheduling_type='asap'` + a recurring line via `recurrenceLabel` only when `recurrence != 'one_time'`. Keep existing summary fields.
- `booking/[id].tsx` (customer detail): show the same `describeSchedule` line (+ ASAP/recurring badges) in the schedule area, replacing/augmenting the raw `scheduled_for` display. Legacy bookings fall back to the plain date/time (helper handles it).

**Tests:** summary/detail render the scheduling line; ASAP booking shows the ASAP badge; a weekly booking shows the recurring label; a legacy booking (no new fields) shows the plain date/time. Keep existing summary/detail tests green.

**Steps:** `tsc` → `npm test` → both exports → commit `feat: slice24 booking summary + detail scheduling display`.

---

### Task 6: Provider job scheduling display

**Files:** Modify `src/app/provider/job/[id].tsx`; Test `src/__tests__/provider-job*.test.tsx`

**Build:** In the provider job screen, show **scheduled date · time · time window** via `describeSchedule(booking)` + an **ASAP badge** when `scheduling_type='asap'`. Display-only — no availability, no scheduling actions; existing job actions/status/photos/chat untouched.

**Tests:** provider job renders the schedule line; ASAP job shows the ASAP badge; a windowed job shows the window text. Keep existing provider-job tests green.

**Steps:** `tsc` → `npm test` → both exports → commit `feat: slice24 provider job scheduling display`.

---

### Task 7: Admin mobile + web filters/display + recurring badge

**Files:** Modify `src/app/admin/index.tsx`, `src/app/(admin-web)/bookings/index.tsx`; Test `src/__tests__/admin.test.tsx`, `src/__tests__/admin-web-bookings.test.tsx`

**Build:**
- **Admin mobile** (`admin/index.tsx`): on the Bookings tab, add a filter row **Today · Tomorrow · Upcoming · Scheduled · All** (default All) using `isToday`/`isTomorrow`/`isUpcoming`/`isScheduledType`; show each row's `describeSchedule` + a **recurring badge** (future-ready) when `recurrence != 'one_time'`. Dispatch/approve flow unchanged.
- **Web admin** (`(admin-web)/bookings/index.tsx`): add the same Today/Tomorrow/Upcoming/Scheduled filter control + a scheduled-time column via `describeSchedule` + recurring badge. DataTable/existing columns preserved.

**Tests:** given a mixed booking set + a fixed `now` (mock `Date`/inject), each filter partitions rows correctly (today-only under Today, non-asap under Scheduled, etc.); a recurring booking shows the badge; the scheduled display renders. Keep existing admin/admin-web tests green.

**Steps:** `tsc` → `npm test` → both exports → commit `feat: slice24 admin + web-admin schedule filters/display`.

---

### Task 8: Verification, backward-compat, isolation, final gate

**Files:** Create `docs/pilot/scheduling.md`

- **Verification (documented SQL + manual):** the 5 columns exist with defaults; an old row (pre-migration) reads `scheduling_type='datetime'`/`recurrence='one_time'`/NULL windows and displays via the legacy fallback; ASAP → `scheduled_for≈now`, badge shown; window booking → `scheduled_for`=window start, `window_start/end` set; flexible → ±60min range; admin filters partition by the predicates; recurrence stored but **no** generated future bookings (no execution).
- **Backward-compat:** existing booking flow completes with defaults; `createBooking` old-shape call still works; admin/provider/customer displays unchanged for legacy rows.
- **Isolation:** `git diff <base>..HEAD --stat` — only scheduling files changed; NO payments/tracking/chat file, NO `src/auth/**`, NO dispatch/assign logic change, NO provider-availability/auto-assign code, NO recurring-execution code; only migration `0021`.
- **Future-ready audit:** recurrence execution / provider scheduling / smart dispatch / calendar sync / custom interval documented, NOT built.
- **Final gate:** `expo export` web + android, `tsc` clean, `npm test` green, `git status` clean.
- Commit `test: slice24 scheduling verification`; then finishing-a-development-branch.

---

## Rollback Plan

- **Pre-merge:** all work on `feat/slice-24-scheduling`. Abandon = `git checkout main` + delete branch.
- **Per-task revert:** independent commits — `git revert <commit>` rolls back one. Reverting T4 restores the current single-picker schedule step (the columns simply go unused); reverting T5–T7 restores the prior displays; `scheduled_for` is untouched throughout so bookings keep working.
- **Disable without schema revert:** revert the T4 UI commit → the booking flow uses the plain picker again; the augment columns stay dormant (defaults), harming nothing.
- **Schema rollback:** forward-only `0022_rollback_scheduling.sql` — `drop index bookings_scheduled_for_idx; alter table bookings drop column scheduling_type, time_window, window_start, window_end, recurrence;`. `scheduled_for` and all bookings preserved.
- **No payment/tracking/chat/dispatch involvement** — rollback confined to scheduling fields + display.

---

## Self-Review

- **Spec coverage:** migration+index (T1), pure helpers (T2), draft+createBooking+Booking (T3), schedule rework incl. ASAP-default/windows/flexible/quick-presets/recurring (T4), summary+customer detail (T5), provider job (T6), admin mobile+web filters/display/recurring-badge (T7), verification+backward-compat+isolation+future-ready (T8). `scheduled_for` canonical (T2 always emits it, T3 always stores it). Admin dispatch authority + no availability/auto-assign/recurring-execution/payments/tracking/chat (T4/T7 display-only; T8 isolation). Manual flow preserved (T4 reuses pickers).
- **Placeholder scan:** none; concrete SQL/signatures/tests per task.
- **Name consistency:** `resolveSchedule`/`describeSchedule`/`recurrenceLabel`/`QUICK_PRESETS`/`isToday`/`isTomorrow`/`isUpcoming`/`isScheduledType` (T2) consumed by T4–T7; `ResolvedSchedule`/`ScheduleInput`/`SchedulingType`/`TimeWindow`/`Recurrence` consistent T2↔T3↔T4; `setSchedule` (T3) called by T4; the 5 column names (`scheduling_type`/`time_window`/`window_start`/`window_end`/`recurrence`) identical T1↔T3↔T5↔T6↔T7↔T8; `scheduled_for` reused everywhere.
