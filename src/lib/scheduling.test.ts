import {
  resolveSchedule,
  describeSchedule,
  recurrenceLabel,
  QUICK_PRESETS,
  isToday,
  isTomorrow,
  isUpcoming,
  isScheduledType,
  WINDOW_RANGES,
  DEFAULT_FLEX_MINUTES,
} from '@/lib/scheduling';

// Fixed reference: local July 3 2026, 09:00 — TZ-independent because we use local helpers
const NOW = new Date(2026, 6, 3, 9, 0, 0); // month is 0-indexed: 6 = July

// ─── resolveSchedule ─────────────────────────────────────────────────────────

describe('resolveSchedule', () => {
  it('asap → scheduling_type=asap, time_window=null, scheduled_for≈NOW', () => {
    const r = resolveSchedule({ type: 'asap' }, NOW);
    expect(r.scheduling_type).toBe('asap');
    expect(r.time_window).toBeNull();
    expect(r.window_start).toBeNull();
    expect(r.window_end).toBeNull();
    expect(r.scheduled_for).toBe(NOW.toISOString());
  });

  it('today + morning → getHours()===8, getDate()===3, window_end hour===12, time_window=morning', () => {
    const r = resolveSchedule({ type: 'today', window: 'morning' }, NOW);
    expect(r.scheduling_type).toBe('today');
    expect(r.time_window).toBe('morning');
    expect(new Date(r.scheduled_for).getHours()).toBe(8);
    expect(new Date(r.scheduled_for).getDate()).toBe(3);
    expect(new Date(r.window_start!).getHours()).toBe(8);
    expect(new Date(r.window_end!).getHours()).toBe(12);
  });

  it('tomorrow + afternoon → getDate()===4, start hour===12, end hour===17', () => {
    const r = resolveSchedule({ type: 'tomorrow', window: 'afternoon' }, NOW);
    expect(r.scheduling_type).toBe('tomorrow');
    expect(r.time_window).toBe('afternoon');
    expect(new Date(r.scheduled_for).getDate()).toBe(4);
    expect(new Date(r.window_start!).getHours()).toBe(12);
    expect(new Date(r.window_end!).getHours()).toBe(17);
  });

  it('date + evening (baseDate July 10) → getDate()===10, start hour===17', () => {
    const baseDate = new Date(2026, 6, 10); // July 10
    const r = resolveSchedule({ type: 'date', window: 'evening', baseDate }, NOW);
    expect(r.scheduling_type).toBe('date');
    expect(r.time_window).toBe('evening');
    expect(new Date(r.scheduled_for).getDate()).toBe(10);
    expect(new Date(r.window_start!).getHours()).toBe(17);
    expect(new Date(r.window_end!).getHours()).toBe(21);
  });

  it('datetime specific (specificTime July 5 14:30) → hour===14, min===30, time_window=specific, windows null', () => {
    const specificTime = new Date(2026, 6, 5, 14, 30, 0);
    const r = resolveSchedule({ type: 'datetime', specificTime }, NOW);
    expect(r.scheduling_type).toBe('datetime');
    expect(r.time_window).toBe('specific');
    expect(new Date(r.scheduled_for).getHours()).toBe(14);
    expect(new Date(r.scheduled_for).getMinutes()).toBe(30);
    expect(r.window_start).toBeNull();
    expect(r.window_end).toBeNull();
  });

  it('flexible (specificTime 14:00, flexible=true) → time_window=flexible, window_start 13:00, window_end 15:00', () => {
    const specificTime = new Date(2026, 6, 5, 14, 0, 0);
    const r = resolveSchedule({ type: 'datetime', specificTime, flexible: true }, NOW);
    expect(r.time_window).toBe('flexible');
    expect(new Date(r.window_start!).getHours()).toBe(13);
    expect(new Date(r.window_end!).getHours()).toBe(15);
  });

  it('custom flexMinutes=30 → window spans ±30 min', () => {
    const specificTime = new Date(2026, 6, 5, 10, 0, 0);
    const r = resolveSchedule({ type: 'datetime', specificTime, flexible: true, flexMinutes: 30 }, NOW);
    expect(r.time_window).toBe('flexible');
    const startH = new Date(r.window_start!).getHours();
    const startM = new Date(r.window_start!).getMinutes();
    const endH   = new Date(r.window_end!).getHours();
    const endM   = new Date(r.window_end!).getMinutes();
    expect(startH).toBe(9);
    expect(startM).toBe(30);
    expect(endH).toBe(10);
    expect(endM).toBe(30);
  });

  it('recurrence is carried through (weekly)', () => {
    const r = resolveSchedule({ type: 'asap', recurrence: 'weekly' }, NOW);
    expect(r.recurrence).toBe('weekly');
  });

  it('recurrence defaults to one_time when omitted', () => {
    const r = resolveSchedule({ type: 'asap' }, NOW);
    expect(r.recurrence).toBe('one_time');
  });

  it('today + specific time combines base day with specificTime h:m', () => {
    const specificTime = new Date(2026, 6, 10, 15, 45, 0); // random date, only h:m matter
    const r = resolveSchedule({ type: 'today', window: 'specific', specificTime }, NOW);
    expect(new Date(r.scheduled_for).getDate()).toBe(3);  // today = July 3
    expect(new Date(r.scheduled_for).getHours()).toBe(15);
    expect(new Date(r.scheduled_for).getMinutes()).toBe(45);
  });

  it('asap uses NOW exactly (no drift)', () => {
    const r = resolveSchedule({ type: 'asap' }, NOW);
    expect(new Date(r.scheduled_for).getTime()).toBe(NOW.getTime());
  });
});

// ─── describeSchedule ─────────────────────────────────────────────────────────

describe('describeSchedule', () => {
  it('asap → contains "ASAP"', () => {
    const r = resolveSchedule({ type: 'asap' }, NOW);
    expect(describeSchedule(r, NOW)).toContain('ASAP');
  });

  it('today+morning → contains "morning" and day label (Today)', () => {
    const r = resolveSchedule({ type: 'today', window: 'morning' }, NOW);
    const s = describeSchedule(r, NOW);
    expect(s).toContain('morning');
    expect(s).toContain('Today');
  });

  it('tomorrow+afternoon → contains "afternoon" and "Tomorrow"', () => {
    const r = resolveSchedule({ type: 'tomorrow', window: 'afternoon' }, NOW);
    const s = describeSchedule(r, NOW);
    expect(s).toContain('afternoon');
    expect(s).toContain('Tomorrow');
  });

  it('flexible → contains "±1h"', () => {
    const specificTime = new Date(2026, 6, 5, 14, 0, 0);
    const r = resolveSchedule({ type: 'datetime', specificTime, flexible: true }, NOW);
    const s = describeSchedule(r, NOW);
    expect(s).toContain('±1h');
  });

  it('flexible with custom flexMinutes=30 → contains "±0.5h"', () => {
    const specificTime = new Date(2026, 6, 5, 14, 0, 0);
    const r = resolveSchedule({ type: 'datetime', specificTime, flexible: true, flexMinutes: 30 }, NOW);
    const s = describeSchedule(r, NOW);
    expect(s).toContain('±0.5h');
  });

  it('specific datetime → contains the time (non-empty, no throw)', () => {
    const specificTime = new Date(2026, 6, 5, 14, 30, 0);
    const r = resolveSchedule({ type: 'datetime', specificTime }, NOW);
    const s = describeSchedule(r, NOW);
    expect(s.length).toBeGreaterThan(0);
    // Should contain day context (not Today/Tomorrow) for July 5 relative to July 3
    expect(s).not.toContain('ASAP');
  });

  it('legacy (only scheduled_for, no type/window) → returns non-empty string, never throws', () => {
    const legacy = { scheduled_for: new Date(2026, 6, 3, 10, 0, 0).toISOString() };
    const s = describeSchedule(legacy, NOW);
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(0);
  });

  it('legacy with null scheduling_type and no time_window → plain date+time, never throws', () => {
    const legacy = {
      scheduled_for:   new Date(2026, 6, 7, 8, 0, 0).toISOString(),
      scheduling_type: null,
      time_window:     null,
    };
    const s = describeSchedule(legacy, NOW);
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(0);
  });

  it('far future date → shows short date (not Today/Tomorrow)', () => {
    const r = resolveSchedule({ type: 'date', window: 'evening', baseDate: new Date(2026, 6, 10) }, NOW);
    const s = describeSchedule(r, NOW);
    expect(s).not.toContain('Today');
    expect(s).not.toContain('Tomorrow');
    expect(s).toContain('evening');
  });

  it('window label includes range in parens', () => {
    const r = resolveSchedule({ type: 'today', window: 'morning' }, NOW);
    const s = describeSchedule(r, NOW);
    expect(s).toMatch(/\(.+–.+\)/);
  });
});

// ─── recurrenceLabel ──────────────────────────────────────────────────────────

describe('recurrenceLabel', () => {
  it('one_time → "One time"',     () => expect(recurrenceLabel('one_time')).toBe('One time'));
  it('weekly → "Weekly"',         () => expect(recurrenceLabel('weekly')).toBe('Weekly'));
  it('biweekly → "Every 2 weeks"',() => expect(recurrenceLabel('biweekly')).toBe('Every 2 weeks'));
  it('monthly → "Monthly"',       () => expect(recurrenceLabel('monthly')).toBe('Monthly'));
  it('custom → "Custom"',         () => expect(recurrenceLabel('custom')).toBe('Custom'));
  it('unknown → "One time"',      () => expect(recurrenceLabel('unknown')).toBe('One time'));
  it('null → "One time"',         () => expect(recurrenceLabel(null)).toBe('One time'));
  it('undefined → "One time"',    () => expect(recurrenceLabel(undefined)).toBe('One time'));
});

// ─── QUICK_PRESETS ────────────────────────────────────────────────────────────

describe('QUICK_PRESETS', () => {
  it('has exactly 4 presets', () => {
    expect(QUICK_PRESETS).toHaveLength(4);
  });

  it('next_available.build() → { type: "asap" }', () => {
    const p = QUICK_PRESETS.find(p => p.key === 'next_available')!;
    expect(p).toBeDefined();
    expect(p.build()).toEqual({ type: 'asap' });
  });

  it('this_evening.build() → { type: "today", window: "evening" }', () => {
    const p = QUICK_PRESETS.find(p => p.key === 'this_evening')!;
    expect(p).toBeDefined();
    expect(p.build()).toEqual({ type: 'today', window: 'evening' });
  });

  it('tomorrow_morning.build() → { type: "tomorrow", window: "morning" }', () => {
    const p = QUICK_PRESETS.find(p => p.key === 'tomorrow_morning')!;
    expect(p).toBeDefined();
    expect(p.build()).toEqual({ type: 'tomorrow', window: 'morning' });
  });

  it('tomorrow_afternoon.build() → { type: "tomorrow", window: "afternoon" }', () => {
    const p = QUICK_PRESETS.find(p => p.key === 'tomorrow_afternoon')!;
    expect(p).toBeDefined();
    expect(p.build()).toEqual({ type: 'tomorrow', window: 'afternoon' });
  });

  it('all presets have key, label, and build function', () => {
    for (const p of QUICK_PRESETS) {
      expect(typeof p.key).toBe('string');
      expect(typeof p.label).toBe('string');
      expect(typeof p.build).toBe('function');
    }
  });
});

// ─── Predicates ───────────────────────────────────────────────────────────────

describe('predicates', () => {
  // July 3 = same day as NOW
  const july3  = new Date(2026, 6, 3, 12, 0, 0).toISOString();
  // July 4 = tomorrow relative to NOW
  const july4  = new Date(2026, 6, 4, 12, 0, 0).toISOString();
  // July 2 = yesterday relative to NOW
  const july2  = new Date(2026, 6, 2, 12, 0, 0).toISOString();

  describe('isToday', () => {
    it('July 3 → true',  () => expect(isToday(july3, NOW)).toBe(true));
    it('July 4 → false', () => expect(isToday(july4, NOW)).toBe(false));
    it('July 2 → false', () => expect(isToday(july2, NOW)).toBe(false));
  });

  describe('isTomorrow', () => {
    it('July 4 → true',  () => expect(isTomorrow(july4, NOW)).toBe(true));
    it('July 3 → false', () => expect(isTomorrow(july3, NOW)).toBe(false));
    it('July 2 → false', () => expect(isTomorrow(july2, NOW)).toBe(false));
  });

  describe('isUpcoming', () => {
    it('July 3 (today) → true',           () => expect(isUpcoming(july3, NOW)).toBe(true));
    it('July 4 (tomorrow) → true',        () => expect(isUpcoming(july4, NOW)).toBe(true));
    it('July 2 (yesterday) → false',      () => expect(isUpcoming(july2, NOW)).toBe(false));
  });

  describe('isScheduledType', () => {
    it('"asap" → false',           () => expect(isScheduledType('asap')).toBe(false));
    it('"datetime" → true',        () => expect(isScheduledType('datetime')).toBe(true));
    it('"today" → true',           () => expect(isScheduledType('today')).toBe(true));
    it('"tomorrow" → true',        () => expect(isScheduledType('tomorrow')).toBe(true));
    it('null → true',              () => expect(isScheduledType(null)).toBe(true));
    it('undefined → true',        () => expect(isScheduledType(undefined)).toBe(true));
  });
});

// ─── WINDOW_RANGES + DEFAULT_FLEX_MINUTES sanity ─────────────────────────────

describe('constants', () => {
  it('WINDOW_RANGES.morning = 8–12',    () => expect(WINDOW_RANGES.morning).toEqual({ startHour: 8, endHour: 12 }));
  it('WINDOW_RANGES.afternoon = 12–17', () => expect(WINDOW_RANGES.afternoon).toEqual({ startHour: 12, endHour: 17 }));
  it('WINDOW_RANGES.evening = 17–21',   () => expect(WINDOW_RANGES.evening).toEqual({ startHour: 17, endHour: 21 }));
  it('DEFAULT_FLEX_MINUTES = 60',       () => expect(DEFAULT_FLEX_MINUTES).toBe(60));
});
