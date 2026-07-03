# Slice 24 — Scheduling Intelligence (Design Spec)

**Date:** 2026-07-03
**Status:** Approved design → (implementation plan pending approval)
**Builds on:** the existing single-timestamp booking flow — `bookings.scheduled_for timestamptz`, `BookingDraft.scheduledFor`/`setScheduledFor`, `booking/schedule.tsx` (one date+time picker), `createBooking`, and the admin/provider/customer displays that sort & show `scheduled_for`.

---

## 1. Goal & Non-Goals

Make booking date/time far smarter — ASAP / Today / Tomorrow / choose date / choose date & time, time-of-day windows, flexible windows, quick presets, and a future-ready recurrence selector — while **admin remains the scheduling/dispatch authority** and every booking keeps a canonical `scheduled_for`.

**Non-goals / out of scope (rules):** NO provider availability, NO auto-assign, NO recurring **execution** (store + badge only), NO payments/tracking/chat change. Admin stays responsible for dispatch. Reuse the existing booking flow; preserve manual date/time behavior. Backward-compatible: old bookings keep working unchanged.

**Future-ready (documented, NOT built):** recurring execution engine, provider scheduling, smart dispatch, calendar sync, custom recurrence interval.

---

## 2. Architecture — augment, never replace

`scheduled_for` stays the **canonical, always-set** sort/display timestamp. New columns *augment* it; nothing that reads `scheduled_for` today needs to change.

- **ASAP** → `scheduled_for = now()` at creation, `scheduling_type='asap'`; lists sort it soonest; UI shows an **ASAP badge** instead of the raw time.
- **Time window** (`morning`/`afternoon`/`evening`) → `scheduled_for = the window START` (morning 08:00, afternoon 12:00, evening 17:00); `window_start`/`window_end` hold the full range; `time_window` names it.
- **Specific time** → `scheduled_for` = exact, `time_window='specific'`.
- **Flexible** (±1h) → `time_window='flexible'`, `window_start = scheduled_for − Δ`, `window_end = scheduled_for + Δ` (Δ default 1h).
- **Recurrence** stored on the booking (`one_time` default) — **not executed** this slice; shown as a future-ready badge.

All date math lives in a **pure, unit-tested** `src/lib/scheduling.ts`; UI/admin/provider layers stay thin.

---

## 3. Database — migration `0021_scheduling.sql` (additive, backward-compatible)

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
- **Old bookings** default to `scheduling_type='datetime'`, `recurrence='one_time'`, `time_window`/`window_*` NULL — `scheduled_for` untouched → they display and sort exactly as before.
- No RLS change (existing `bookings` policies apply). No new table. `recurrence` is **stored, never acted on**; `custom` is accepted but has no interval column (future-ready). Index added for admin date filters.

---

## 4. Client data layer — `src/lib/scheduling.ts` (pure + tested)

```ts
export type SchedulingType = 'asap'|'today'|'tomorrow'|'date'|'datetime';
export type TimeWindow     = 'morning'|'afternoon'|'evening'|'specific'|'flexible';
export type Recurrence     = 'one_time'|'weekly'|'biweekly'|'monthly'|'custom';

export const WINDOW_RANGES = {                    // canonical local-hour ranges
  morning:   { startHour: 8,  endHour: 12 },
  afternoon: { startHour: 12, endHour: 17 },
  evening:   { startHour: 17, endHour: 21 },
};

export type ScheduleInput = {
  type: SchedulingType;
  window?: TimeWindow | null;      // for today/tomorrow/date
  baseDate?: Date | null;          // for date / datetime
  specificTime?: Date | null;      // for 'specific'
  flexible?: boolean;              // ±1h around a specific time
  flexMinutes?: number;            // default 60
  recurrence?: Recurrence;         // default 'one_time'
};

export type ResolvedSchedule = {
  scheduled_for: string;                 // ISO — ALWAYS set (canonical)
  scheduling_type: SchedulingType;
  time_window: TimeWindow | null;
  window_start: string | null;           // ISO
  window_end: string | null;             // ISO
  recurrence: Recurrence;
};

// Pure; `now` injected for testability. Resolves the chosen options into the stored shape.
export function resolveSchedule(input: ScheduleInput, now?: Date): ResolvedSchedule;

// Human display for summary/admin/provider, e.g. "ASAP", "Tomorrow morning (8:00–12:00 AM)",
// "Fri 4 Jul, 2:00 PM", "Fri 4 Jul, 2:00 PM ±1h".
export function describeSchedule(b: {
  scheduled_for: string; scheduling_type?: string | null; time_window?: string | null;
  window_start?: string | null; window_end?: string | null;
}, now?: Date): string;

export function recurrenceLabel(r: Recurrence | string | null): string;  // 'One time' | 'Weekly' | 'Every 2 weeks' | 'Monthly' | 'Custom'

// Quick-selection presets → ScheduleInput: nextAvailable()(=asap), thisEvening(), tomorrowMorning(), tomorrowAfternoon().
export const QUICK_PRESETS: { key: string; label: string; build: (now?: Date) => ScheduleInput }[];

// Admin filter predicates (local-day comparison against `now`):
export function isToday(iso: string, now?: Date): boolean;
export function isTomorrow(iso: string, now?: Date): boolean;
export function isUpcoming(iso: string, now?: Date): boolean;      // today or later
export function isScheduledType(schedulingType?: string | null): boolean;  // != 'asap'
```

- Extend **`BookingDraft`** with `scheduling_type`, `time_window`, `window_start`, `window_end`, `recurrence` + a single `setSchedule(resolved: ResolvedSchedule)` setter (keeps `scheduledFor` in sync). Existing `setScheduledFor` retained.
- Extend **`NewBooking`** + `createBooking` to persist the 5 new fields (all optional → default when omitted, preserving old callers). Extend the **`Booking`** type with the 5 columns (nullable/defaulted).

---

## 5. UI

### 5a. Schedule step — `src/app/booking/schedule.tsx` (rework; reuse + manual preserved)
- **Booking options** (chips, ASAP default): ASAP · Today · Tomorrow · Choose date · Choose date & time.
- **Time of day** (when not ASAP): Morning · Afternoon · Evening · Specific time (reveals the existing date/time picker).
- **Flexible window** toggle (±1h) for a specific time.
- **Quick selections** row: Next available · This evening · Tomorrow morning · Tomorrow afternoon (each → a `QUICK_PRESET`).
- **Recurring** selector: One time (default) · Weekly · Every 2 weeks · Monthly · Custom — with a caption "Recurring bookings are saved but not auto-scheduled yet." (`custom` selectable, future-ready).
- **Continue** → `resolveSchedule(...)` → `setSchedule(...)`; gating unchanged (a valid `scheduled_for` always results — ASAP included). The current **"Choose date & time"** path reuses the existing `DateTimePicker`/`DateTimePickerAndroid` flow verbatim (manual behavior preserved).

### 5b. Booking summary — `src/components/ui/booking-summary-card.tsx`
Show **Date · Time · Scheduling type · Time window · Recurring status** via `describeSchedule` + `recurrenceLabel` (ASAP badge when `scheduling_type='asap'`; recurrence line only when `!= one_time`).

### 5c. Admin (mobile `src/app/admin/index.tsx` + web `src/app/(admin-web)/bookings/index.tsx`)
- **Filter tabs**: Today · Tomorrow · Upcoming · Scheduled — using the pure predicates (`isToday`/`isTomorrow`/`isUpcoming`/`isScheduledType`). Independent quick filters (overlap is fine).
- Each row shows the **scheduled date/time clearly** (`describeSchedule`) + a **recurring badge** (future-ready) when `recurrence != one_time`. Admin dispatch flow unchanged (still the dispatch authority).

### 5d. Provider job — `src/app/provider/job/[id].tsx` (or provider job screen)
Show **scheduled date · time · time window** (`describeSchedule`) + an **ASAP badge** when `scheduling_type='asap'`. Display-only; no availability, no scheduling actions.

---

## 6. Backward Compatibility & Guardrails

- Old bookings (defaults `datetime`/`one_time`, NULL windows) render and sort via `scheduled_for` exactly as today; `describeSchedule` falls back to the plain date/time when no window/type is present.
- `createBooking` new fields are optional — existing callers/tests unaffected. Admin/provider `select *` queries need no change.
- **Rules honored:** admin remains dispatch authority; NO provider availability, NO auto-assign, NO recurring execution (store + badge only), NO payments/tracking/chat change. Manual date/time flow preserved (reuses the current pickers).

---

## 7. Testing

- **`scheduling.test.ts`** (pure, injected `now`): `resolveSchedule` for each type (asap→now; today/tomorrow+window→window-start + range; date+window; specific; flexible±1h); `describeSchedule` (ASAP, window, specific, flexible, legacy fallback); `recurrenceLabel`; `QUICK_PRESETS` build the right inputs; filter predicates (today/tomorrow/upcoming boundaries, scheduled=non-asap).
- **Draft/lib:** `setSchedule` syncs fields; `createBooking` persists the 5 fields (mocked supabase).
- **UI (RNTL):** schedule step (ASAP default; picking a window/quick-preset/recurrence resolves the draft; manual "Choose date & time" still works); summary card shows the scheduling line + ASAP/recurring badges; admin filter tabs partition rows via the predicates; provider job shows the schedule + ASAP badge. Keep existing booking-flow/admin/provider tests green (additive; never weaken).
- **Gate:** `npm test`, `npx tsc --noEmit`, `expo export --platform web` + `--platform android`.

---

## 8. Deliverables

1. `supabase/migrations/0021_scheduling.sql` (5 bookings columns + `scheduled_for` index; backward-compatible).
2. `src/lib/scheduling.ts` (+ tests) — pure resolve/describe/labels/presets/predicates.
3. `BookingDraft` + `NewBooking`/`createBooking` + `Booking` type extensions (+ tests).
4. Schedule step rework — options/windows/quick-selects/recurring (reuse pickers; manual preserved).
5. Booking summary scheduling display (date/time/type/window/recurring).
6. Admin Today/Tomorrow/Upcoming/Scheduled filters + clear scheduled display + recurring badge (mobile + web).
7. Provider job scheduling display + ASAP badge.
8. `docs/pilot/scheduling.md` — verification, backward-compat, isolation; green gate.
