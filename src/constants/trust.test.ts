// trust.test.ts — Tests for src/constants/trust.ts
// Pure constants + pure derive — no mocks needed.

import {
  SERVICE_GUARANTEES,
  SAFETY_REMINDERS,
  CUSTOMER_TIPS,
  TRUST_MESSAGES,
  deriveCustomerTrustSignals,
} from '@/constants/trust';

// ── Static arrays non-empty ────────────────────────────────────────────────

describe('SERVICE_GUARANTEES', () => {
  it('is a non-empty array of { title, body } objects', () => {
    expect(Array.isArray(SERVICE_GUARANTEES)).toBe(true);
    expect(SERVICE_GUARANTEES.length).toBeGreaterThan(0);
    for (const g of SERVICE_GUARANTEES) {
      expect(typeof g.title).toBe('string');
      expect(g.title.length).toBeGreaterThan(0);
      expect(typeof g.body).toBe('string');
      expect(g.body.length).toBeGreaterThan(0);
    }
  });
});

describe('SAFETY_REMINDERS', () => {
  it('is a non-empty array of { title, body } objects', () => {
    expect(Array.isArray(SAFETY_REMINDERS)).toBe(true);
    expect(SAFETY_REMINDERS.length).toBeGreaterThan(0);
    for (const r of SAFETY_REMINDERS) {
      expect(typeof r.title).toBe('string');
      expect(typeof r.body).toBe('string');
    }
  });
});

describe('CUSTOMER_TIPS', () => {
  it('is a non-empty array of { title, body } objects', () => {
    expect(Array.isArray(CUSTOMER_TIPS)).toBe(true);
    expect(CUSTOMER_TIPS.length).toBeGreaterThan(0);
    for (const t of CUSTOMER_TIPS) {
      expect(typeof t.title).toBe('string');
      expect(typeof t.body).toBe('string');
    }
  });
});

describe('TRUST_MESSAGES', () => {
  it('is a non-empty array of strings', () => {
    expect(Array.isArray(TRUST_MESSAGES)).toBe(true);
    expect(TRUST_MESSAGES.length).toBeGreaterThan(0);
    for (const m of TRUST_MESSAGES) {
      expect(typeof m).toBe('string');
      expect(m.length).toBeGreaterThan(0);
    }
  });
});

// ── deriveCustomerTrustSignals ─────────────────────────────────────────────

describe('deriveCustomerTrustSignals', () => {
  it('returns empty array when no signals present', () => {
    const signals = deriveCustomerTrustSignals({});
    expect(signals).toEqual([]);
  });

  it('returns empty array for unverified provider with 0 jobs and null rating', () => {
    const signals = deriveCustomerTrustSignals({
      is_verified: false,
      completed_jobs_count: 0,
      average_rating: null,
    });
    expect(signals).toEqual([]);
  });

  it('includes "Verified provider" when is_verified = true', () => {
    const signals = deriveCustomerTrustSignals({ is_verified: true });
    const v = signals.find((s) => s.key === 'verified');
    expect(v).toBeDefined();
    expect(v!.label).toBe('Verified provider');
    expect(v!.icon).toBe('✅');
  });

  it('does NOT include "Verified provider" when is_verified = false', () => {
    const signals = deriveCustomerTrustSignals({ is_verified: false });
    expect(signals.find((s) => s.key === 'verified')).toBeUndefined();
  });

  it('shows jobs_100 signal for 100+ completed jobs', () => {
    const signals = deriveCustomerTrustSignals({ completed_jobs_count: 100 });
    const j = signals.find((s) => s.key === 'jobs_100');
    expect(j).toBeDefined();
    expect(j!.label).toBe('100+ jobs completed');
  });

  it('shows jobs_100 for 200 jobs (above threshold)', () => {
    const signals = deriveCustomerTrustSignals({ completed_jobs_count: 200 });
    expect(signals.find((s) => s.key === 'jobs_100')).toBeDefined();
    expect(signals.find((s) => s.key === 'jobs_50')).toBeUndefined();
  });

  it('shows jobs_50 signal for 50-99 completed jobs', () => {
    const s50 = deriveCustomerTrustSignals({ completed_jobs_count: 50 });
    expect(s50.find((s) => s.key === 'jobs_50')).toBeDefined();
    expect(s50.find((s) => s.key === 'jobs_100')).toBeUndefined();

    const s99 = deriveCustomerTrustSignals({ completed_jobs_count: 99 });
    expect(s99.find((s) => s.key === 'jobs_50')).toBeDefined();
  });

  it('shows jobs_10 signal for 10-49 completed jobs', () => {
    const s10 = deriveCustomerTrustSignals({ completed_jobs_count: 10 });
    expect(s10.find((s) => s.key === 'jobs_10')).toBeDefined();
    expect(s10.find((s) => s.key === 'jobs_50')).toBeUndefined();
  });

  it('shows first_job signal for 1-9 completed jobs', () => {
    const s1 = deriveCustomerTrustSignals({ completed_jobs_count: 1 });
    expect(s1.find((s) => s.key === 'first_job')).toBeDefined();
    expect(s1.find((s) => s.key === 'jobs_10')).toBeUndefined();
  });

  it('shows top_rated signal for average_rating >= 4.8', () => {
    const s = deriveCustomerTrustSignals({ average_rating: 4.8 });
    const t = s.find((sig) => sig.key === 'top_rated');
    expect(t).toBeDefined();
    expect(t!.label).toBe('Top rated 4.8★');
    expect(t!.icon).toBe('⭐');
  });

  it('shows top_rated for 5.0 rating', () => {
    const s = deriveCustomerTrustSignals({ average_rating: 5.0 });
    expect(s.find((sig) => sig.key === 'top_rated')).toBeDefined();
  });

  it('does NOT show top_rated for average_rating < 4.8', () => {
    const s = deriveCustomerTrustSignals({ average_rating: 4.7 });
    expect(s.find((sig) => sig.key === 'top_rated')).toBeUndefined();
  });

  it('does NOT show top_rated for null rating', () => {
    const s = deriveCustomerTrustSignals({ average_rating: null });
    expect(s.find((sig) => sig.key === 'top_rated')).toBeUndefined();
  });

  it('returns all three signals for a verified top-rated 100+ jobs provider', () => {
    const signals = deriveCustomerTrustSignals({
      is_verified:          true,
      completed_jobs_count: 150,
      average_rating:       4.9,
    });
    const keys = signals.map((s) => s.key);
    expect(keys).toContain('verified');
    expect(keys).toContain('jobs_100');
    expect(keys).toContain('top_rated');
  });

  it('is pure — no Supabase calls needed (runs without mocks)', () => {
    // If this test runs, the function is pure (would throw without mock if it had I/O)
    expect(() => deriveCustomerTrustSignals({ is_verified: true })).not.toThrow();
  });
});
