// provider-achievements.test.ts — Tests for src/lib/provider-achievements.ts
// Verifies pure achievement derivation; no DB, no mocks needed.

import { deriveProviderAchievements } from '@/lib/provider-achievements';
import type { ProviderProfile } from '@/lib/providers';
import type { ProviderRatingBreakdown } from '@/lib/reviews';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    id: 'p1',
    full_name: 'Test Provider',
    phone: '+254700000001',
    approval_status: 'approved',
    profile_photo_url: 'https://example.com/photo.jpg',
    bio: 'Bio text',
    years_experience: 5,
    skills: ['plumbing'],
    is_verified: false,
    completed_jobs_count: 0,
    average_rating: null,
    review_count: 0,
    availability_status: 'available',
    ...overrides,
  };
}

function makeBreakdown(overrides: Partial<ProviderRatingBreakdown> = {}): ProviderRatingBreakdown {
  return {
    overall_avg: null,
    review_count: 0,
    recommend_pct: null,
    quality_avg: null,
    punctuality_avg: null,
    communication_avg: null,
    professionalism_avg: null,
    value_avg: null,
    top_tags: [],
    ...overrides,
  };
}

function getAchievement(
  results: ReturnType<typeof deriveProviderAchievements>,
  key: string,
) {
  const a = results.find((r) => r.key === key);
  if (!a) throw new Error(`Achievement "${key}" not found`);
  return a;
}

// ── All 9 achievements returned ────────────────────────────────────────────

describe('deriveProviderAchievements — output shape', () => {
  it('always returns exactly 9 achievements', () => {
    const result = deriveProviderAchievements({ profile: null });
    expect(result).toHaveLength(9);
  });

  it('each achievement has key, label, icon, and earned fields', () => {
    const result = deriveProviderAchievements({ profile: makeProfile() });
    for (const a of result) {
      expect(typeof a.key).toBe('string');
      expect(typeof a.label).toBe('string');
      expect(typeof a.icon).toBe('string');
      expect(typeof a.earned).toBe('boolean');
    }
  });

  it('is deterministic — same input always gives same output', () => {
    const input = { profile: makeProfile({ completed_jobs_count: 12, is_verified: true }) };
    expect(deriveProviderAchievements(input)).toEqual(deriveProviderAchievements(input));
  });
});

// ── Jobs achievements ──────────────────────────────────────────────────────

describe('deriveProviderAchievements — jobs achievements', () => {
  it('first_job: not earned with 0 jobs', () => {
    const result = deriveProviderAchievements({ profile: makeProfile({ completed_jobs_count: 0 }) });
    expect(getAchievement(result, 'first_job').earned).toBe(false);
  });

  it('first_job: earned with 1 job', () => {
    const result = deriveProviderAchievements({ profile: makeProfile({ completed_jobs_count: 1 }) });
    expect(getAchievement(result, 'first_job').earned).toBe(true);
  });

  it('jobs_10: not earned with 9 jobs, but progress is 9/10', () => {
    const result = deriveProviderAchievements({ profile: makeProfile({ completed_jobs_count: 9 }) });
    const a = getAchievement(result, 'jobs_10');
    expect(a.earned).toBe(false);
    expect(a.progress).toEqual({ current: 9, target: 10 });
  });

  it('jobs_10: earned with exactly 10 jobs', () => {
    const result = deriveProviderAchievements({ profile: makeProfile({ completed_jobs_count: 10 }) });
    expect(getAchievement(result, 'jobs_10').earned).toBe(true);
  });

  it('jobs_50: not earned with 49 jobs', () => {
    const result = deriveProviderAchievements({ profile: makeProfile({ completed_jobs_count: 49 }) });
    expect(getAchievement(result, 'jobs_50').earned).toBe(false);
    expect(getAchievement(result, 'jobs_50').progress).toEqual({ current: 49, target: 50 });
  });

  it('jobs_50: earned with exactly 50 jobs', () => {
    const result = deriveProviderAchievements({ profile: makeProfile({ completed_jobs_count: 50 }) });
    expect(getAchievement(result, 'jobs_50').earned).toBe(true);
  });

  it('jobs_100: not earned with 99 jobs', () => {
    const result = deriveProviderAchievements({ profile: makeProfile({ completed_jobs_count: 99 }) });
    expect(getAchievement(result, 'jobs_100').earned).toBe(false);
  });

  it('jobs_100: earned with exactly 100 jobs', () => {
    const result = deriveProviderAchievements({ profile: makeProfile({ completed_jobs_count: 100 }) });
    expect(getAchievement(result, 'jobs_100').earned).toBe(true);
  });

  it('100 jobs earns all 4 job achievements simultaneously', () => {
    const result = deriveProviderAchievements({ profile: makeProfile({ completed_jobs_count: 100 }) });
    expect(getAchievement(result, 'first_job').earned).toBe(true);
    expect(getAchievement(result, 'jobs_10').earned).toBe(true);
    expect(getAchievement(result, 'jobs_50').earned).toBe(true);
    expect(getAchievement(result, 'jobs_100').earned).toBe(true);
  });

  it('jobs achievements include progress { current, target }', () => {
    const result = deriveProviderAchievements({ profile: makeProfile({ completed_jobs_count: 5 }) });
    const a = getAchievement(result, 'jobs_10');
    expect(a.progress).toEqual({ current: 5, target: 10 });
  });

  it('null profile gives 0 jobs and no jobs earned', () => {
    const result = deriveProviderAchievements({ profile: null });
    for (const key of ['first_job', 'jobs_10', 'jobs_50', 'jobs_100']) {
      expect(getAchievement(result, key).earned).toBe(false);
    }
  });
});

// ── verified_provider ──────────────────────────────────────────────────────

describe('deriveProviderAchievements — verified_provider', () => {
  it('not earned when is_verified is false', () => {
    const result = deriveProviderAchievements({ profile: makeProfile({ is_verified: false }) });
    expect(getAchievement(result, 'verified_provider').earned).toBe(false);
  });

  it('earned when is_verified is true', () => {
    const result = deriveProviderAchievements({ profile: makeProfile({ is_verified: true }) });
    expect(getAchievement(result, 'verified_provider').earned).toBe(true);
  });

  it('not earned for null profile', () => {
    const result = deriveProviderAchievements({ profile: null });
    expect(getAchievement(result, 'verified_provider').earned).toBe(false);
  });
});

// ── rating_4_8 ────────────────────────────────────────────────────────────

describe('deriveProviderAchievements — rating_4_8', () => {
  it('not earned when average_rating is null', () => {
    const result = deriveProviderAchievements({
      profile: makeProfile({ average_rating: null, review_count: 10 }),
    });
    expect(getAchievement(result, 'rating_4_8').earned).toBe(false);
  });

  it('not earned when average_rating < 4.8 (even with enough reviews)', () => {
    const result = deriveProviderAchievements({
      profile: makeProfile({ average_rating: 4.7, review_count: 10 }),
    });
    expect(getAchievement(result, 'rating_4_8').earned).toBe(false);
  });

  it('not earned when average_rating >= 4.8 but review_count < 5 (min-reviews guard)', () => {
    const result = deriveProviderAchievements({
      profile: makeProfile({ average_rating: 4.9, review_count: 4 }),
    });
    expect(getAchievement(result, 'rating_4_8').earned).toBe(false);
  });

  it('earned when average_rating >= 4.8 and review_count >= 5', () => {
    const result = deriveProviderAchievements({
      profile: makeProfile({ average_rating: 4.8, review_count: 5 }),
    });
    expect(getAchievement(result, 'rating_4_8').earned).toBe(true);
  });

  it('earned when average_rating is 5.0 with plenty of reviews', () => {
    const result = deriveProviderAchievements({
      profile: makeProfile({ average_rating: 5.0, review_count: 20 }),
    });
    expect(getAchievement(result, 'rating_4_8').earned).toBe(true);
  });

  it('not earned for null profile', () => {
    const result = deriveProviderAchievements({ profile: null });
    expect(getAchievement(result, 'rating_4_8').earned).toBe(false);
  });
});

// ── profile_complete ───────────────────────────────────────────────────────

describe('deriveProviderAchievements — profile_complete', () => {
  it('earned when completenessPercent is exactly 100', () => {
    const result = deriveProviderAchievements({
      profile: makeProfile(),
      completenessPercent: 100,
    });
    expect(getAchievement(result, 'profile_complete').earned).toBe(true);
  });

  it('not earned when completenessPercent is 99', () => {
    const result = deriveProviderAchievements({
      profile: makeProfile(),
      completenessPercent: 99,
    });
    expect(getAchievement(result, 'profile_complete').earned).toBe(false);
  });

  it('computes completeness from profile when completenessPercent is not passed', () => {
    // makeProfile has all active items completed except availability_status which is set
    // Full profile (all 6 done) should resolve to 100
    const fullProfile = makeProfile({
      profile_photo_url: 'https://x.com/p.jpg',
      bio: 'Bio',
      years_experience: 5,
      skills: ['plumbing'],
      phone: '+254700000001',
      availability_status: 'available',
    });
    const result = deriveProviderAchievements({ profile: fullProfile });
    expect(getAchievement(result, 'profile_complete').earned).toBe(true);
  });

  it('not earned when profile is null and completenessPercent not passed', () => {
    const result = deriveProviderAchievements({ profile: null });
    expect(getAchievement(result, 'profile_complete').earned).toBe(false);
  });
});

// ── five_star_streak (future-ready) ────────────────────────────────────────

describe('deriveProviderAchievements — five_star_streak (future-ready)', () => {
  it('not earned (future-ready) when recentReviews is absent', () => {
    const result = deriveProviderAchievements({ profile: makeProfile() });
    expect(getAchievement(result, 'five_star_streak').earned).toBe(false);
  });

  it('not earned (future-ready) when recentReviews is empty', () => {
    const result = deriveProviderAchievements({ profile: makeProfile(), recentReviews: [] });
    expect(getAchievement(result, 'five_star_streak').earned).toBe(false);
  });

  it('not earned when fewer than 3 recent reviews (even all 5-star)', () => {
    const result = deriveProviderAchievements({
      profile: makeProfile(),
      recentReviews: [{ rating: 5 }, { rating: 5 }],
    });
    expect(getAchievement(result, 'five_star_streak').earned).toBe(false);
  });

  it('not earned when 3+ reviews but not all 5-star', () => {
    const result = deriveProviderAchievements({
      profile: makeProfile(),
      recentReviews: [{ rating: 5 }, { rating: 4 }, { rating: 5 }],
    });
    expect(getAchievement(result, 'five_star_streak').earned).toBe(false);
  });

  it('earned when exactly 3 recent reviews all rated 5', () => {
    const result = deriveProviderAchievements({
      profile: makeProfile(),
      recentReviews: [{ rating: 5 }, { rating: 5 }, { rating: 5 }],
    });
    expect(getAchievement(result, 'five_star_streak').earned).toBe(true);
  });

  it('earned when more than 3 recent reviews all rated 5', () => {
    const result = deriveProviderAchievements({
      profile: makeProfile(),
      recentReviews: [
        { rating: 5 },
        { rating: 5 },
        { rating: 5 },
        { rating: 5 },
        { rating: 5 },
      ],
    });
    expect(getAchievement(result, 'five_star_streak').earned).toBe(true);
  });

  it('NEVER fabricates — absent signal gives earned:false', () => {
    // Deliberately pass no recentReviews
    const result = deriveProviderAchievements({ profile: makeProfile({ is_verified: true }) });
    expect(getAchievement(result, 'five_star_streak').earned).toBe(false);
  });
});

// ── excellent_feedback (future-ready) ─────────────────────────────────────

describe('deriveProviderAchievements — excellent_feedback (future-ready)', () => {
  it('not earned (future-ready) when breakdown is absent', () => {
    const result = deriveProviderAchievements({ profile: makeProfile() });
    expect(getAchievement(result, 'excellent_feedback').earned).toBe(false);
  });

  it('not earned (future-ready) when breakdown is null', () => {
    const result = deriveProviderAchievements({ profile: makeProfile(), breakdown: null });
    expect(getAchievement(result, 'excellent_feedback').earned).toBe(false);
  });

  it('not earned when review_count is 0 (no-review guard)', () => {
    const result = deriveProviderAchievements({
      profile: makeProfile(),
      breakdown: makeBreakdown({ recommend_pct: 95, review_count: 0 }),
    });
    expect(getAchievement(result, 'excellent_feedback').earned).toBe(false);
  });

  it('not earned when recommend_pct is null', () => {
    const result = deriveProviderAchievements({
      profile: makeProfile(),
      breakdown: makeBreakdown({ recommend_pct: null, review_count: 10 }),
    });
    expect(getAchievement(result, 'excellent_feedback').earned).toBe(false);
  });

  it('not earned when recommend_pct < 90', () => {
    const result = deriveProviderAchievements({
      profile: makeProfile(),
      breakdown: makeBreakdown({ recommend_pct: 89, review_count: 10 }),
    });
    expect(getAchievement(result, 'excellent_feedback').earned).toBe(false);
  });

  it('earned when recommend_pct is exactly 90 with reviews', () => {
    const result = deriveProviderAchievements({
      profile: makeProfile(),
      breakdown: makeBreakdown({ recommend_pct: 90, review_count: 10 }),
    });
    expect(getAchievement(result, 'excellent_feedback').earned).toBe(true);
  });

  it('earned when recommend_pct > 90 with reviews', () => {
    const result = deriveProviderAchievements({
      profile: makeProfile(),
      breakdown: makeBreakdown({ recommend_pct: 97, review_count: 25 }),
    });
    expect(getAchievement(result, 'excellent_feedback').earned).toBe(true);
  });

  it('NEVER fabricates — absent breakdown gives earned:false', () => {
    const result = deriveProviderAchievements({ profile: makeProfile() });
    expect(getAchievement(result, 'excellent_feedback').earned).toBe(false);
  });
});
