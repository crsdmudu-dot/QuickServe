/**
 * geo.test.ts — Tests for pure geographic helpers.
 */
import {
  haversineKm,
  formatDistanceKm,
  etaMinutes,
  formatEta,
  type LatLng,
} from '@/lib/geo';

// ─── haversineKm ──────────────────────────────────────────────────────────────

describe('haversineKm', () => {
  // Nairobi CBD (City Hall) ~ Westlands roundabout: roughly 3.7 km.
  const cityHall: LatLng = { latitude: -1.286389, longitude: 36.817223 };
  const westlands: LatLng = { latitude: -1.268280, longitude: 36.810894 };

  it('returns 0 for identical points', () => {
    expect(haversineKm(cityHall, cityHall)).toBe(0);
  });

  it('is symmetric (a→b ≈ b→a)', () => {
    const d1 = haversineKm(cityHall, westlands);
    const d2 = haversineKm(westlands, cityHall);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.001);
  });

  it('gives a plausible distance for Nairobi CBD → Westlands (2–5 km)', () => {
    const d = haversineKm(cityHall, westlands);
    expect(d).toBeGreaterThan(2);
    expect(d).toBeLessThan(5);
  });

  it('two very close Nairobi points within ±5% of expected ~0.82 km', () => {
    // City Hall → nearby Kenyatta Ave intersection: haversine ≈ 0.82 km.
    const kenyattaAve: LatLng = { latitude: -1.292066, longitude: 36.821946 };
    const d = haversineKm(cityHall, kenyattaAve);
    const expected = 0.82;
    expect(d).toBeGreaterThan(expected * 0.95);
    expect(d).toBeLessThan(expected * 1.05);
  });

  it('returns 0 when latitude is NaN', () => {
    expect(haversineKm({ latitude: NaN, longitude: 36.817 }, cityHall)).toBe(0);
  });

  it('returns 0 when longitude is Infinity', () => {
    expect(haversineKm(cityHall, { latitude: -1.29, longitude: Infinity })).toBe(0);
  });
});

// ─── formatDistanceKm ────────────────────────────────────────────────────────

describe('formatDistanceKm', () => {
  it('1.234 km → "1.2 km"', () => {
    expect(formatDistanceKm(1.234)).toBe('1.2 km');
  });

  it('1.0 km → "1.0 km"', () => {
    expect(formatDistanceKm(1.0)).toBe('1.0 km');
  });

  it('0.25 km → "250 m"', () => {
    expect(formatDistanceKm(0.25)).toBe('250 m');
  });

  it('0.001 km → "10 m" (rounds 1 m up to nearest 10)', () => {
    // 0.001 km = 1 m → round(1/10)*10 = 0 m → but let's use 0.005 = 5 m → 10 m
    expect(formatDistanceKm(0.005)).toBe('10 m');
  });

  it('0.0 km → "0 m"', () => {
    expect(formatDistanceKm(0)).toBe('0 m');
  });

  it('5.678 km → "5.7 km"', () => {
    expect(formatDistanceKm(5.678)).toBe('5.7 km');
  });
});

// ─── etaMinutes ──────────────────────────────────────────────────────────────

describe('etaMinutes', () => {
  it('etaMinutes(11, 22) → 30', () => {
    // (11 / 22) * 60 = 30 exactly
    expect(etaMinutes(11, 22)).toBe(30);
  });

  it('etaMinutes(0, 22) → 1 (minimum 1)', () => {
    expect(etaMinutes(0, 22)).toBe(1);
  });

  it('etaMinutes(0) → 1 with default speed', () => {
    expect(etaMinutes(0)).toBe(1);
  });

  it('rounds up fractional minutes', () => {
    // (1 / 22) * 60 = 2.727... → ceil = 3
    expect(etaMinutes(1, 22)).toBe(3);
  });

  it('default speed is 22 km/h', () => {
    expect(etaMinutes(11)).toBe(30);
  });
});

// ─── formatEta ───────────────────────────────────────────────────────────────

describe('formatEta', () => {
  it('8 min → "~8 min"', () => {
    expect(formatEta(8)).toBe('~8 min');
  });

  it('59 min → "~59 min"', () => {
    expect(formatEta(59)).toBe('~59 min');
  });

  it('60 min → "~1 hr"', () => {
    expect(formatEta(60)).toBe('~1 hr');
  });

  it('65 min → contains "hr"', () => {
    expect(formatEta(65)).toContain('hr');
  });

  it('65 min → "~1 hr 5 min"', () => {
    expect(formatEta(65)).toBe('~1 hr 5 min');
  });

  it('120 min → "~2 hr"', () => {
    expect(formatEta(120)).toBe('~2 hr');
  });

  it('90 min → "~1 hr 30 min"', () => {
    expect(formatEta(90)).toBe('~1 hr 30 min');
  });
});
