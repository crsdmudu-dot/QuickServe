// customer-profile.test.ts — Tests for src/constants/customer-profile.ts
// Pure constants + pure derivation — no mocks needed.

import {
  PROFILE_COMPLETION_ITEMS,
  FUTURE_READY_PREFERENCES,
  computeCustomerProfileCompletion,
} from '@/constants/customer-profile';

// ── PROFILE_COMPLETION_ITEMS ───────────────────────────────────────────────

describe('PROFILE_COMPLETION_ITEMS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(PROFILE_COMPLETION_ITEMS)).toBe(true);
    expect(PROFILE_COMPLETION_ITEMS.length).toBeGreaterThan(0);
  });

  it('includes the 3 active items (full_name, phone, default_address)', () => {
    const keys = PROFILE_COMPLETION_ITEMS.filter((i) => !i.futureReady).map((i) => i.key);
    expect(keys).toContain('full_name');
    expect(keys).toContain('phone');
    expect(keys).toContain('default_address');
  });

  it('includes the 3 future-ready items', () => {
    const frKeys = PROFILE_COMPLETION_ITEMS.filter((i) => i.futureReady).map((i) => i.key);
    expect(frKeys).toContain('language');
    expect(frKeys).toContain('communication_preferences');
    expect(frKeys).toContain('notification_preferences');
  });

  it('has exactly 3 active and 3 future-ready items', () => {
    const active     = PROFILE_COMPLETION_ITEMS.filter((i) => !i.futureReady);
    const futureReady = PROFILE_COMPLETION_ITEMS.filter((i) => i.futureReady);
    expect(active.length).toBe(3);
    expect(futureReady.length).toBe(3);
  });
});

// ── FUTURE_READY_PREFERENCES ───────────────────────────────────────────────

describe('FUTURE_READY_PREFERENCES', () => {
  it('is a non-empty array of { key, label } objects', () => {
    expect(Array.isArray(FUTURE_READY_PREFERENCES)).toBe(true);
    expect(FUTURE_READY_PREFERENCES.length).toBeGreaterThan(0);
    for (const p of FUTURE_READY_PREFERENCES) {
      expect(typeof p.key).toBe('string');
      expect(typeof p.label).toBe('string');
    }
  });

  it('contains language, communication_preferences, notification_preferences', () => {
    const keys = FUTURE_READY_PREFERENCES.map((p) => p.key);
    expect(keys).toContain('language');
    expect(keys).toContain('communication_preferences');
    expect(keys).toContain('notification_preferences');
  });
});

// ── computeCustomerProfileCompletion ──────────────────────────────────────

describe('computeCustomerProfileCompletion', () => {
  // ── All items missing ────────────────────────────────────────────────────

  it('returns 0% when profile is null and no default address', () => {
    const result = computeCustomerProfileCompletion({
      profile: null,
      hasDefaultAddress: false,
    });
    expect(result.percent).toBe(0);
  });

  it('returns all active items as done:false when nothing is set', () => {
    const result = computeCustomerProfileCompletion({
      profile: null,
      hasDefaultAddress: false,
    });
    const active = result.items.filter((i) => !i.futureReady);
    expect(active.every((i) => !i.done)).toBe(true);
  });

  it('missing array contains labels for all incomplete active items', () => {
    const result = computeCustomerProfileCompletion({
      profile: null,
      hasDefaultAddress: false,
    });
    expect(result.missing.length).toBe(3);
    // All three active items are missing
    expect(result.missing.some((m) => m.toLowerCase().includes('name'))).toBe(true);
    expect(result.missing.some((m) => m.toLowerCase().includes('phone'))).toBe(true);
    expect(result.missing.some((m) => m.toLowerCase().includes('address'))).toBe(true);
  });

  // ── full_name ────────────────────────────────────────────────────────────

  it('full_name item is done when non-empty string', () => {
    const result = computeCustomerProfileCompletion({
      profile: { full_name: 'Alice', phone: null },
      hasDefaultAddress: false,
    });
    const nameItem = result.items.find((i) => i.key === 'full_name')!;
    expect(nameItem.done).toBe(true);
  });

  it('full_name item is NOT done when null', () => {
    const result = computeCustomerProfileCompletion({
      profile: { full_name: null, phone: '+254700000001' },
      hasDefaultAddress: false,
    });
    expect(result.items.find((i) => i.key === 'full_name')!.done).toBe(false);
  });

  it('full_name item is NOT done when empty string (whitespace-only)', () => {
    const result = computeCustomerProfileCompletion({
      profile: { full_name: '   ', phone: null },
      hasDefaultAddress: false,
    });
    expect(result.items.find((i) => i.key === 'full_name')!.done).toBe(false);
  });

  // ── phone ────────────────────────────────────────────────────────────────

  it('phone item is done when present', () => {
    const result = computeCustomerProfileCompletion({
      profile: { full_name: null, phone: '+254700000001' },
      hasDefaultAddress: false,
    });
    expect(result.items.find((i) => i.key === 'phone')!.done).toBe(true);
  });

  it('phone item is NOT done when null', () => {
    const result = computeCustomerProfileCompletion({
      profile: { full_name: null, phone: null },
      hasDefaultAddress: false,
    });
    expect(result.items.find((i) => i.key === 'phone')!.done).toBe(false);
  });

  // ── default_address ───────────────────────────────────────────────────────

  it('default_address item is done when hasDefaultAddress = true', () => {
    const result = computeCustomerProfileCompletion({
      profile: null,
      hasDefaultAddress: true,
    });
    expect(result.items.find((i) => i.key === 'default_address')!.done).toBe(true);
  });

  it('default_address item is NOT done when hasDefaultAddress = false', () => {
    const result = computeCustomerProfileCompletion({
      profile: null,
      hasDefaultAddress: false,
    });
    expect(result.items.find((i) => i.key === 'default_address')!.done).toBe(false);
  });

  // ── future-ready items excluded from % ───────────────────────────────────

  it('future-ready items are always done:false', () => {
    const result = computeCustomerProfileCompletion({
      profile: { full_name: 'Bob', phone: '+254700000002' },
      hasDefaultAddress: true,
    });
    const futureItems = result.items.filter((i) => i.futureReady);
    expect(futureItems.every((i) => !i.done)).toBe(true);
  });

  it('future-ready items are NOT in the missing array', () => {
    const result = computeCustomerProfileCompletion({
      profile: null,
      hasDefaultAddress: false,
    });
    // missing only contains active items
    const futureLabels = PROFILE_COMPLETION_ITEMS
      .filter((i) => i.futureReady)
      .map((i) => i.label);
    for (const fl of futureLabels) {
      expect(result.missing).not.toContain(fl);
    }
  });

  // ── percent calculation ───────────────────────────────────────────────────

  it('percent = 33 when 1 of 3 active items is done', () => {
    const result = computeCustomerProfileCompletion({
      profile: { full_name: 'Alice', phone: null },
      hasDefaultAddress: false,
    });
    expect(result.percent).toBe(33);
  });

  it('percent = 67 when 2 of 3 active items are done', () => {
    const result = computeCustomerProfileCompletion({
      profile: { full_name: 'Alice', phone: '+254700000001' },
      hasDefaultAddress: false,
    });
    expect(result.percent).toBe(67);
  });

  it('percent = 100 when all 3 active items are done', () => {
    const result = computeCustomerProfileCompletion({
      profile: { full_name: 'Alice', phone: '+254700000001' },
      hasDefaultAddress: true,
    });
    expect(result.percent).toBe(100);
    expect(result.missing).toEqual([]);
  });

  it('future-ready items being all done:false do NOT lower the percent from 100', () => {
    const result = computeCustomerProfileCompletion({
      profile: { full_name: 'Alice', phone: '+254700000001' },
      hasDefaultAddress: true,
    });
    // Even though future-ready items are done:false, percent is still 100
    expect(result.percent).toBe(100);
  });

  // ── output shape ─────────────────────────────────────────────────────────

  it('items array includes all PROFILE_COMPLETION_ITEMS (active + future-ready)', () => {
    const result = computeCustomerProfileCompletion({
      profile: null,
      hasDefaultAddress: false,
    });
    expect(result.items.length).toBe(PROFILE_COMPLETION_ITEMS.length);
  });

  it('is pure — never throws for any input combination', () => {
    expect(() => computeCustomerProfileCompletion({ profile: null, hasDefaultAddress: false })).not.toThrow();
    expect(() => computeCustomerProfileCompletion({ profile: { full_name: '', phone: '' }, hasDefaultAddress: false })).not.toThrow();
    expect(() => computeCustomerProfileCompletion({ profile: { full_name: 'X', phone: '+1' }, hasDefaultAddress: true })).not.toThrow();
  });
});
