import { getGreeting } from '@/lib/greeting';

// Helper: build a Date at a specific hour on 2026-01-01.
function d(hour: number): Date {
  return new Date(2026, 0, 1, hour, 0, 0);
}

describe('getGreeting', () => {
  it('returns Good Morning at 5 (lower boundary)', () => {
    expect(getGreeting(d(5))).toBe('Good Morning ☀️');
  });

  it('returns Good Morning at 11 (upper boundary of morning)', () => {
    expect(getGreeting(d(11))).toBe('Good Morning ☀️');
  });

  it('returns Good Afternoon at 12 (lower boundary)', () => {
    expect(getGreeting(d(12))).toBe('Good Afternoon 🌤️');
  });

  it('returns Good Afternoon at 16 (upper boundary of afternoon)', () => {
    expect(getGreeting(d(16))).toBe('Good Afternoon 🌤️');
  });

  it('returns Good Evening at 17 (transition to evening)', () => {
    expect(getGreeting(d(17))).toBe('Good Evening 🌙');
  });

  it('returns Good Evening at 23', () => {
    expect(getGreeting(d(23))).toBe('Good Evening 🌙');
  });

  it('returns Good Evening at 0 (midnight)', () => {
    expect(getGreeting(d(0))).toBe('Good Evening 🌙');
  });

  it('returns Good Evening at 4 (pre-dawn)', () => {
    expect(getGreeting(d(4))).toBe('Good Evening 🌙');
  });
});
