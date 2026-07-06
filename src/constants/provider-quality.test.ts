// provider-quality.test.ts — Tests for src/constants/provider-quality.ts
// Verifies static constants, tag partition, and all exported unions.

import {
  QUALITY_ACTION_TYPES,
  STRENGTH_TAGS,
  IMPROVEMENT_TAGS,
  partitionTags,
  ACHIEVEMENTS,
  PROFILE_COMPLETENESS_ITEMS,
  CODE_OF_CONDUCT,
  CONDUCT_VERSION,
  type QualityActionType,
  type AchievementKey,
  type CompletenessItemKey,
} from '@/constants/provider-quality';

// ── QUALITY_ACTION_TYPES ───────────────────────────────────────────────────

describe('QUALITY_ACTION_TYPES', () => {
  const EXPECTED_IDS: QualityActionType[] = [
    'coaching_needed',
    'coaching_completed',
    'warning_given',
    'improvement_observed',
    'temporarily_paused_recommended',
    'no_action',
  ];

  it('has exactly 6 entries', () => {
    expect(QUALITY_ACTION_TYPES).toHaveLength(6);
  });

  it('contains all 6 required QualityActionType ids', () => {
    const ids = QUALITY_ACTION_TYPES.map((a) => a.id);
    for (const expected of EXPECTED_IDS) {
      expect(ids).toContain(expected);
    }
  });

  it('each entry has a non-empty label', () => {
    for (const action of QUALITY_ACTION_TYPES) {
      expect(typeof action.label).toBe('string');
      expect(action.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('each entry has a non-empty color', () => {
    for (const action of QUALITY_ACTION_TYPES) {
      expect(typeof action.color).toBe('string');
      expect(action.color.trim().length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate ids', () => {
    const ids = QUALITY_ACTION_TYPES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── Tag partitions ─────────────────────────────────────────────────────────

describe('STRENGTH_TAGS + IMPROVEMENT_TAGS', () => {
  it('STRENGTH_TAGS has 5 entries', () => {
    expect(STRENGTH_TAGS).toHaveLength(5);
  });

  it('IMPROVEMENT_TAGS has 4 entries', () => {
    expect(IMPROVEMENT_TAGS).toHaveLength(4);
  });

  it('together cover the 9-tag allowlist exactly', () => {
    const ALL_9 = [
      'on_time',
      'friendly',
      'clean_work',
      'good_communication',
      'fair_price',
      'late',
      'messy',
      'poor_communication',
      'overpriced',
    ];
    const combined = [...STRENGTH_TAGS, ...IMPROVEMENT_TAGS];
    expect(combined.sort()).toEqual(ALL_9.sort());
  });

  it('STRENGTH_TAGS and IMPROVEMENT_TAGS have no overlap', () => {
    const strengthSet = new Set<string>(STRENGTH_TAGS);
    for (const tag of IMPROVEMENT_TAGS) {
      expect(strengthSet.has(tag)).toBe(false);
    }
  });
});

// ── partitionTags ──────────────────────────────────────────────────────────

describe('partitionTags', () => {
  it('classifies all 5 strength tags correctly', () => {
    const result = partitionTags([...STRENGTH_TAGS]);
    expect(result.strengths).toEqual(expect.arrayContaining([...STRENGTH_TAGS]));
    expect(result.improvements).toHaveLength(0);
  });

  it('classifies all 4 improvement tags correctly', () => {
    const result = partitionTags([...IMPROVEMENT_TAGS]);
    expect(result.improvements).toEqual(expect.arrayContaining([...IMPROVEMENT_TAGS]));
    expect(result.strengths).toHaveLength(0);
  });

  it('classifies a mixed set correctly', () => {
    const result = partitionTags(['on_time', 'late', 'friendly', 'overpriced']);
    expect(result.strengths).toEqual(expect.arrayContaining(['on_time', 'friendly']));
    expect(result.improvements).toEqual(expect.arrayContaining(['late', 'overpriced']));
    expect(result.strengths).toHaveLength(2);
    expect(result.improvements).toHaveLength(2);
  });

  it('silently ignores unknown tags', () => {
    const result = partitionTags(['on_time', 'unknown_tag', 'bogus', 'late']);
    expect(result.strengths).toEqual(['on_time']);
    expect(result.improvements).toEqual(['late']);
  });

  it('returns empty arrays for an empty input', () => {
    const result = partitionTags([]);
    expect(result.strengths).toEqual([]);
    expect(result.improvements).toEqual([]);
  });

  it('returns empty arrays when all tags are unknown', () => {
    const result = partitionTags(['foo', 'bar', 'baz']);
    expect(result.strengths).toEqual([]);
    expect(result.improvements).toEqual([]);
  });
});

// ── ACHIEVEMENTS ───────────────────────────────────────────────────────────

describe('ACHIEVEMENTS', () => {
  const EXPECTED_KEYS: AchievementKey[] = [
    'first_job',
    'jobs_10',
    'jobs_50',
    'jobs_100',
    'verified_provider',
    'rating_4_8',
    'profile_complete',
    'five_star_streak',
    'excellent_feedback',
  ];

  it('has exactly 9 entries', () => {
    expect(ACHIEVEMENTS).toHaveLength(9);
  });

  it('contains all 9 required AchievementKey values', () => {
    const keys = ACHIEVEMENTS.map((a) => a.key);
    for (const expected of EXPECTED_KEYS) {
      expect(keys).toContain(expected);
    }
  });

  it('has no duplicate keys', () => {
    const keys = ACHIEVEMENTS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('each entry has a non-empty label and icon', () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(typeof achievement.label).toBe('string');
      expect(achievement.label.trim().length).toBeGreaterThan(0);
      expect(typeof achievement.icon).toBe('string');
      expect(achievement.icon.trim().length).toBeGreaterThan(0);
    }
  });

  it('job achievements have a threshold', () => {
    const jobAchievements = ACHIEVEMENTS.filter((a) => a.kind === 'jobs');
    for (const a of jobAchievements) {
      expect(typeof a.threshold).toBe('number');
      expect(a.threshold).toBeGreaterThan(0);
    }
  });

  it('first_job has threshold 1, jobs_10 has 10, jobs_50 has 50, jobs_100 has 100', () => {
    const byKey = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.key, a]));
    expect(byKey['first_job'].threshold).toBe(1);
    expect(byKey['jobs_10'].threshold).toBe(10);
    expect(byKey['jobs_50'].threshold).toBe(50);
    expect(byKey['jobs_100'].threshold).toBe(100);
  });

  it('rating_4_8 has threshold 4.8', () => {
    const rating = ACHIEVEMENTS.find((a) => a.key === 'rating_4_8');
    expect(rating?.threshold).toBe(4.8);
  });
});

// ── PROFILE_COMPLETENESS_ITEMS ─────────────────────────────────────────────

describe('PROFILE_COMPLETENESS_ITEMS', () => {
  const EXPECTED_ACTIVE_KEYS: CompletenessItemKey[] = [
    'photo',
    'bio',
    'experience',
    'service_categories',
    'contact_details',
    'availability',
  ];
  const EXPECTED_FUTURE_KEYS: CompletenessItemKey[] = [
    'government_verification',
    'payment_details',
  ];

  it('has exactly 8 entries total (6 active + 2 future-ready)', () => {
    expect(PROFILE_COMPLETENESS_ITEMS).toHaveLength(8);
  });

  it('has exactly 6 active items (futureReady falsy)', () => {
    const active = PROFILE_COMPLETENESS_ITEMS.filter((i) => !i.futureReady);
    expect(active).toHaveLength(6);
  });

  it('has exactly 2 future-ready items', () => {
    const futureReady = PROFILE_COMPLETENESS_ITEMS.filter((i) => i.futureReady === true);
    expect(futureReady).toHaveLength(2);
  });

  it('contains all 6 active keys', () => {
    const activeKeys = PROFILE_COMPLETENESS_ITEMS.filter((i) => !i.futureReady).map((i) => i.key);
    for (const key of EXPECTED_ACTIVE_KEYS) {
      expect(activeKeys).toContain(key);
    }
  });

  it('contains both future-ready keys', () => {
    const futureKeys = PROFILE_COMPLETENESS_ITEMS.filter((i) => i.futureReady).map((i) => i.key);
    for (const key of EXPECTED_FUTURE_KEYS) {
      expect(futureKeys).toContain(key);
    }
  });

  it('each entry has a non-empty label', () => {
    for (const item of PROFILE_COMPLETENESS_ITEMS) {
      expect(typeof item.label).toBe('string');
      expect(item.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate keys', () => {
    const keys = PROFILE_COMPLETENESS_ITEMS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// ── CODE_OF_CONDUCT ────────────────────────────────────────────────────────

describe('CODE_OF_CONDUCT', () => {
  const EXPECTED_HEADINGS = [
    'Professional behaviour',
    'Communication',
    'Arrival expectations',
    'Work quality',
    'Clean-up expectations',
    'Customer respect',
    'Safety',
    'Evidence & photos',
    'Dispute expectations',
  ];

  it('has exactly 9 sections', () => {
    expect(CODE_OF_CONDUCT).toHaveLength(9);
  });

  it('contains all 9 expected headings', () => {
    const headings = CODE_OF_CONDUCT.map((s) => s.heading);
    for (const heading of EXPECTED_HEADINGS) {
      expect(headings).toContain(heading);
    }
  });

  it('each section has a non-empty body', () => {
    for (const section of CODE_OF_CONDUCT) {
      expect(typeof section.body).toBe('string');
      expect(section.body.trim().length).toBeGreaterThan(0);
    }
  });

  it('each section has a non-empty heading', () => {
    for (const section of CODE_OF_CONDUCT) {
      expect(typeof section.heading).toBe('string');
      expect(section.heading.trim().length).toBeGreaterThan(0);
    }
  });
});

// ── CONDUCT_VERSION ────────────────────────────────────────────────────────

describe('CONDUCT_VERSION', () => {
  it('is set to a non-empty string', () => {
    expect(typeof CONDUCT_VERSION).toBe('string');
    expect(CONDUCT_VERSION.trim().length).toBeGreaterThan(0);
  });

  it('equals "v1"', () => {
    expect(CONDUCT_VERSION).toBe('v1');
  });
});
