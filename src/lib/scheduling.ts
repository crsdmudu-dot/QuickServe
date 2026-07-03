/** Pure scheduling helpers — no supabase, no React, no Deno.
 *  All date math lives here so UI layers stay thin.
 *  Mirror shape: see address-format.ts. */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SchedulingType = 'asap' | 'today' | 'tomorrow' | 'date' | 'datetime';
export type TimeWindow     = 'morning' | 'afternoon' | 'evening' | 'specific' | 'flexible';
export type Recurrence     = 'one_time' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

// ─── Constants ────────────────────────────────────────────────────────────────

export const WINDOW_RANGES: Record<'morning' | 'afternoon' | 'evening', { startHour: number; endHour: number }> = {
  morning:   { startHour: 8,  endHour: 12 },
  afternoon: { startHour: 12, endHour: 17 },
  evening:   { startHour: 17, endHour: 21 },
};

export const DEFAULT_FLEX_MINUTES = 60;

// ─── Input / Output types ─────────────────────────────────────────────────────

export type ScheduleInput = {
  type: SchedulingType;
  window?: TimeWindow | null;     // morning/afternoon/evening (or 'specific') for today/tomorrow/date
  baseDate?: Date | null;         // the chosen calendar day (for 'date') or day+time (for 'datetime')
  specificTime?: Date | null;     // exact time when window === 'specific'
  flexible?: boolean;             // ±flex around a specific time
  flexMinutes?: number;           // default DEFAULT_FLEX_MINUTES
  recurrence?: Recurrence;        // default 'one_time'
};

export type ResolvedSchedule = {
  scheduled_for: string;          // ISO — ALWAYS set (canonical)
  scheduling_type: SchedulingType;
  time_window: TimeWindow | null;
  window_start: string | null;    // ISO
  window_end: string | null;      // ISO
  recurrence: Recurrence;
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Copy Y/M/D from `daySource` into a new Date and set the given hour (local). */
function dateAtHour(daySource: Date, hour: number): Date {
  const d = new Date(daySource);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** Advance a date by N days (local calendar). */
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Local midnight (00:00:00.000) of a given date — used for day comparison. */
function localMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Format a Date as a short day label relative to now: 'Today', 'Tomorrow', or 'Fri 4 Jul'. */
function dayLabel(d: Date, now: Date): string {
  if (isToday(d.toISOString(), now))    return 'Today';
  if (isTomorrow(d.toISOString(), now)) return 'Tomorrow';
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
  const day     = d.getDate();
  const month   = d.toLocaleDateString(undefined, { month: 'short' });
  return `${weekday} ${day} ${month}`;
}

/** Format a Date as a locale time string, e.g. '8:00 AM'. */
function timeStr(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// ─── resolveSchedule ──────────────────────────────────────────────────────────

/** Resolve a ScheduleInput into the exact DB-ready fields.
 *  `now` defaults to `new Date()` but can be injected for deterministic tests. */
export function resolveSchedule(input: ScheduleInput, now: Date = new Date()): ResolvedSchedule {
  const recurrence: Recurrence = input.recurrence ?? 'one_time';

  // ── asap ──────────────────────────────────────────────────────────────────
  if (input.type === 'asap') {
    return {
      scheduled_for:   now.toISOString(),
      scheduling_type: 'asap',
      time_window:     null,
      window_start:    null,
      window_end:      null,
      recurrence,
    };
  }

  // ── today / tomorrow / date + window (morning/afternoon/evening) ──────────
  const namedWindow = input.window && input.window !== 'specific' && input.window !== 'flexible'
    ? (input.window as 'morning' | 'afternoon' | 'evening')
    : null;

  if (namedWindow && WINDOW_RANGES[namedWindow]) {
    // Determine the base calendar day
    let baseDay: Date;
    if (input.type === 'today') {
      baseDay = now;
    } else if (input.type === 'tomorrow') {
      baseDay = addDays(now, 1);
    } else {
      // type === 'date' — use baseDate
      baseDay = input.baseDate ?? now;
    }

    const { startHour, endHour } = WINDOW_RANGES[namedWindow];
    const start = dateAtHour(baseDay, startHour);
    const end   = dateAtHour(baseDay, endHour);

    return {
      scheduled_for:   start.toISOString(),
      scheduling_type: input.type,
      time_window:     namedWindow,
      window_start:    start.toISOString(),
      window_end:      end.toISOString(),
      recurrence,
    };
  }

  // ── specific / flexible ───────────────────────────────────────────────────
  // Resolve the instant: for today/tomorrow/date + specific, combine the base day with specificTime's h:m.
  let instant: Date;

  if (input.specificTime) {
    if (input.type === 'today' || input.type === 'tomorrow' || input.type === 'date') {
      // Combine base calendar day with the time from specificTime
      let baseDay: Date;
      if (input.type === 'today') {
        baseDay = now;
      } else if (input.type === 'tomorrow') {
        baseDay = addDays(now, 1);
      } else {
        baseDay = input.baseDate ?? now;
      }
      const combined = new Date(baseDay);
      combined.setHours(
        input.specificTime.getHours(),
        input.specificTime.getMinutes(),
        input.specificTime.getSeconds(),
        input.specificTime.getMilliseconds(),
      );
      instant = combined;
    } else {
      // datetime — use specificTime directly
      instant = input.specificTime;
    }
  } else if (input.baseDate) {
    instant = input.baseDate;
  } else {
    instant = now;
  }

  const flexMinutes = input.flexMinutes ?? DEFAULT_FLEX_MINUTES;

  if (input.flexible) {
    const windowStartMs = instant.getTime() - flexMinutes * 60_000;
    const windowEndMs   = instant.getTime() + flexMinutes * 60_000;
    return {
      scheduled_for:   instant.toISOString(),
      scheduling_type: input.type,
      time_window:     'flexible',
      window_start:    new Date(windowStartMs).toISOString(),
      window_end:      new Date(windowEndMs).toISOString(),
      recurrence,
    };
  }

  return {
    scheduled_for:   instant.toISOString(),
    scheduling_type: input.type,
    time_window:     'specific',
    window_start:    null,
    window_end:      null,
    recurrence,
  };
}

// ─── describeSchedule ─────────────────────────────────────────────────────────

type BookingScheduleShape = {
  scheduled_for: string;
  scheduling_type?: string | null;
  time_window?: string | null;
  window_start?: string | null;
  window_end?: string | null;
};

/** Human-readable description of a resolved booking's schedule. Pure; never throws.
 *  Legacy bookings (no scheduling_type / time_window) fall back to plain date+time. */
export function describeSchedule(b: BookingScheduleShape, now: Date = new Date()): string {
  try {
    // asap
    if (b.scheduling_type === 'asap') return 'ASAP';

    const scheduledFor = new Date(b.scheduled_for);

    // Named window (morning / afternoon / evening)
    if (b.time_window === 'morning' || b.time_window === 'afternoon' || b.time_window === 'evening') {
      const label = dayLabel(scheduledFor, now);
      const window = b.time_window as 'morning' | 'afternoon' | 'evening';
      if (b.window_start && b.window_end) {
        const startD = new Date(b.window_start);
        const endD   = new Date(b.window_end);
        return `${label} ${window} (${timeStr(startD)}–${timeStr(endD)})`;
      }
      // Fallback if window_start/end not stored
      const { startHour, endHour } = WINDOW_RANGES[window];
      const startD = dateAtHour(scheduledFor, startHour);
      const endD   = dateAtHour(scheduledFor, endHour);
      return `${label} ${window} (${timeStr(startD)}–${timeStr(endD)})`;
    }

    // Flexible
    if (b.time_window === 'flexible') {
      const label = dayLabel(scheduledFor, now);
      const time  = timeStr(scheduledFor);
      // Infer ±Nh from window_start/end if available
      if (b.window_start && b.window_end) {
        const halfMs  = (new Date(b.window_end).getTime() - new Date(b.window_start).getTime()) / 2;
        const halfH   = halfMs / 3_600_000;
        const label2  = Number.isInteger(halfH) ? `±${halfH}h` : `±${halfH.toFixed(1)}h`;
        return `${label}, ${time} ${label2}`;
      }
      return `${label}, ${time} ±1h`;
    }

    // Specific / datetime / legacy (no type or window)
    const label = dayLabel(scheduledFor, now);
    const time  = timeStr(scheduledFor);
    return `${label}, ${time}`;
  } catch {
    // absolute last-resort: return the raw ISO string rather than throwing
    return b.scheduled_for ?? '';
  }
}

// ─── recurrenceLabel ──────────────────────────────────────────────────────────

/** Human label for a Recurrence value. Unknown/null/undefined → 'One time'. */
export function recurrenceLabel(r: Recurrence | string | null | undefined): string {
  switch (r) {
    case 'one_time':  return 'One time';
    case 'weekly':    return 'Weekly';
    case 'biweekly':  return 'Every 2 weeks';
    case 'monthly':   return 'Monthly';
    case 'custom':    return 'Custom';
    default:          return 'One time';
  }
}

// ─── QUICK_PRESETS ────────────────────────────────────────────────────────────

export const QUICK_PRESETS: { key: string; label: string; build: (now?: Date) => ScheduleInput }[] = [
  {
    key:   'next_available',
    label: 'Next available',
    build: () => ({ type: 'asap' }),
  },
  {
    key:   'this_evening',
    label: 'This evening',
    build: () => ({ type: 'today', window: 'evening' }),
  },
  {
    key:   'tomorrow_morning',
    label: 'Tomorrow morning',
    build: () => ({ type: 'tomorrow', window: 'morning' }),
  },
  {
    key:   'tomorrow_afternoon',
    label: 'Tomorrow afternoon',
    build: () => ({ type: 'tomorrow', window: 'afternoon' }),
  },
];

// ─── Admin filter predicates ──────────────────────────────────────────────────

/** True if the ISO date falls on the same LOCAL calendar day as `now`. */
export function isToday(iso: string, now: Date = new Date()): boolean {
  const d       = new Date(iso);
  const dMid    = localMidnight(d);
  const nowMid  = localMidnight(now);
  return dMid.getTime() === nowMid.getTime();
}

/** True if the ISO date falls on the LOCAL calendar day after `now`. */
export function isTomorrow(iso: string, now: Date = new Date()): boolean {
  const d       = new Date(iso);
  const dMid    = localMidnight(d);
  const tomMid  = localMidnight(addDays(now, 1));
  return dMid.getTime() === tomMid.getTime();
}

/** True if the ISO date falls on `now`'s local day or any later day. */
export function isUpcoming(iso: string, now: Date = new Date()): boolean {
  const d      = new Date(iso);
  const dMid   = localMidnight(d);
  const nowMid = localMidnight(now);
  return dMid.getTime() >= nowMid.getTime();
}

/** True when the booking is NOT asap (i.e. has an explicitly scheduled time). */
export function isScheduledType(schedulingType?: string | null): boolean {
  return schedulingType !== 'asap';
}
