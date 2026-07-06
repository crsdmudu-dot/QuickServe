// provider-completeness.test.ts — Tests for src/lib/provider-completeness.ts
// Verifies pure completeness derivation; no DB, no mocks needed.

import { calculateProviderCompleteness } from '@/lib/provider-completeness';
import type { ProviderProfile } from '@/lib/providers';

// ── Helpers ────────────────────────────────────────────────────────────────

/** A minimal valid ProviderProfile base — all active items not done. */
function makeProfile(overrides: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    id: 'p1',
    full_name: 'Test Provider',
    phone: null,
    approval_status: 'approved',
    profile_photo_url: null,
    bio: null,
    years_experience: null,
    skills: null,
    is_verified: false,
    completed_jobs_count: 0,
    average_rating: null,
    review_count: 0,
    availability_status: 'available',
    ...overrides,
  };
}

/** A full ProviderProfile with all active items completed. */
function makeFullProfile(): ProviderProfile {
  return makeProfile({
    profile_photo_url: 'https://example.com/photo.jpg',
    bio: 'Experienced plumber with 10 years in the field.',
    years_experience: 10,
    skills: ['plumbing', 'pipe-fitting'],
    phone: '+254700000001',
    availability_status: 'available', // always truthy
  });
}

// ── Null profile ───────────────────────────────────────────────────────────

describe('calculateProviderCompleteness — null profile', () => {
  it('returns percent 0 for a null profile', () => {
    const result = calculateProviderCompleteness(null);
    expect(result.percent).toBe(0);
  });

  it('all active items are marked not done for null profile', () => {
    const result = calculateProviderCompleteness(null);
    const activeItems = result.items.filter((i) => !i.futureReady);
    for (const item of activeItems) {
      expect(item.done).toBe(false);
    }
  });

  it('missing list contains all 6 active item labels for null profile', () => {
    const result = calculateProviderCompleteness(null);
    expect(result.missing).toHaveLength(6);
  });

  it('items array still has 8 entries (6 active + 2 future-ready) for null profile', () => {
    const result = calculateProviderCompleteness(null);
    expect(result.items).toHaveLength(8);
  });
});

// ── Full profile → 100% ────────────────────────────────────────────────────

describe('calculateProviderCompleteness — full profile', () => {
  it('returns percent 100 for a fully complete profile', () => {
    const result = calculateProviderCompleteness(makeFullProfile());
    expect(result.percent).toBe(100);
  });

  it('all active items are done', () => {
    const result = calculateProviderCompleteness(makeFullProfile());
    const activeItems = result.items.filter((i) => !i.futureReady);
    for (const item of activeItems) {
      expect(item.done).toBe(true);
    }
  });

  it('missing list is empty', () => {
    const result = calculateProviderCompleteness(makeFullProfile());
    expect(result.missing).toHaveLength(0);
  });
});

// ── Future-ready items excluded from % ────────────────────────────────────

describe('calculateProviderCompleteness — future-ready items excluded from %', () => {
  it('future-ready items are always done:false', () => {
    const result = calculateProviderCompleteness(makeFullProfile());
    const futureItems = result.items.filter((i) => i.futureReady);
    for (const item of futureItems) {
      expect(item.done).toBe(false);
    }
  });

  it('future-ready items do NOT appear in missing list', () => {
    const result = calculateProviderCompleteness(makeFullProfile());
    const futureLabels = result.items
      .filter((i) => i.futureReady)
      .map((i) => i.label);
    for (const label of futureLabels) {
      expect(result.missing).not.toContain(label);
    }
  });

  it('percent 100 is achievable without completing future-ready items', () => {
    // Full profile has all 6 active items done; no future-ready completed
    const result = calculateProviderCompleteness(makeFullProfile());
    expect(result.percent).toBe(100);
  });

  it('government_verification and payment_details have futureReady:true', () => {
    const result = calculateProviderCompleteness(null);
    const futureKeys = result.items.filter((i) => i.futureReady).map((i) => i.key);
    expect(futureKeys).toContain('government_verification');
    expect(futureKeys).toContain('payment_details');
  });
});

// ── Individual item toggles ────────────────────────────────────────────────

describe('calculateProviderCompleteness — individual item toggles', () => {
  it('photo: done when profile_photo_url is set', () => {
    const r1 = calculateProviderCompleteness(makeProfile({ profile_photo_url: 'https://x.com/p.jpg' }));
    expect(r1.items.find((i) => i.key === 'photo')?.done).toBe(true);

    const r2 = calculateProviderCompleteness(makeProfile({ profile_photo_url: null }));
    expect(r2.items.find((i) => i.key === 'photo')?.done).toBe(false);
  });

  it('bio: done when bio is a non-empty string (trims whitespace)', () => {
    const r1 = calculateProviderCompleteness(makeProfile({ bio: 'Hello' }));
    expect(r1.items.find((i) => i.key === 'bio')?.done).toBe(true);

    const r2 = calculateProviderCompleteness(makeProfile({ bio: '   ' })); // whitespace only
    expect(r2.items.find((i) => i.key === 'bio')?.done).toBe(false);

    const r3 = calculateProviderCompleteness(makeProfile({ bio: null }));
    expect(r3.items.find((i) => i.key === 'bio')?.done).toBe(false);
  });

  it('experience: done when years_experience is a number (including 0)', () => {
    const r1 = calculateProviderCompleteness(makeProfile({ years_experience: 5 }));
    expect(r1.items.find((i) => i.key === 'experience')?.done).toBe(true);

    const r2 = calculateProviderCompleteness(makeProfile({ years_experience: 0 }));
    expect(r2.items.find((i) => i.key === 'experience')?.done).toBe(true);

    const r3 = calculateProviderCompleteness(makeProfile({ years_experience: null }));
    expect(r3.items.find((i) => i.key === 'experience')?.done).toBe(false);
  });

  it('service_categories: done when skills array is non-empty', () => {
    const r1 = calculateProviderCompleteness(makeProfile({ skills: ['plumbing'] }));
    expect(r1.items.find((i) => i.key === 'service_categories')?.done).toBe(true);

    const r2 = calculateProviderCompleteness(makeProfile({ skills: [] }));
    expect(r2.items.find((i) => i.key === 'service_categories')?.done).toBe(false);

    const r3 = calculateProviderCompleteness(makeProfile({ skills: null }));
    expect(r3.items.find((i) => i.key === 'service_categories')?.done).toBe(false);
  });

  it('contact_details: done when phone is set', () => {
    const r1 = calculateProviderCompleteness(makeProfile({ phone: '+254700000001' }));
    expect(r1.items.find((i) => i.key === 'contact_details')?.done).toBe(true);

    const r2 = calculateProviderCompleteness(makeProfile({ phone: null }));
    expect(r2.items.find((i) => i.key === 'contact_details')?.done).toBe(false);
  });

  it('availability: done when availability_status is truthy (always set on a valid row)', () => {
    const r1 = calculateProviderCompleteness(makeProfile({ availability_status: 'available' }));
    expect(r1.items.find((i) => i.key === 'availability')?.done).toBe(true);

    const r2 = calculateProviderCompleteness(makeProfile({ availability_status: 'unavailable' }));
    expect(r2.items.find((i) => i.key === 'availability')?.done).toBe(true);
  });
});

// ── Percentage math ────────────────────────────────────────────────────────

describe('calculateProviderCompleteness — percentage math', () => {
  it('returns 17 when only availability (1 of 6) is done (base profile)', () => {
    const result = calculateProviderCompleteness(makeProfile()); // all null/falsy except availability_status
    // availability_status is always set → 1/6 active items done
    // Math.round(100 * 1/6) = Math.round(16.67) = 17
    expect(result.percent).toBe(17);
  });

  it('returns 50 when exactly 3 of 6 active items are done', () => {
    // Done: photo (1) + bio (2) + availability (3). Not done: experience, skills, phone.
    const result = calculateProviderCompleteness(
      makeProfile({
        profile_photo_url: 'https://x.com/p.jpg',
        bio: 'Some bio',
        years_experience: null,
        skills: null,
        phone: null,
        availability_status: 'available',
      }),
    );
    // Math.round(100 * 3/6) = 50
    expect(result.percent).toBe(50);
  });

  it('returns 100 when all 6 active items are done', () => {
    const result = calculateProviderCompleteness(makeFullProfile());
    expect(result.percent).toBe(100);
  });

  it('missing list matches active items not done', () => {
    const result = calculateProviderCompleteness(makeProfile({ profile_photo_url: 'https://x.com/p.jpg' }));
    // Done: photo, availability. Not done: bio, experience, service_categories, contact_details
    expect(result.missing).toContain('Bio');
    expect(result.missing).toContain('Years of experience');
    expect(result.missing).toContain('Service categories');
    expect(result.missing).toContain('Contact details');
    expect(result.missing).not.toContain('Profile photo');
    expect(result.missing).not.toContain('Availability configured');
  });

  it('is deterministic — same input always gives same output', () => {
    const profile = makeFullProfile();
    const r1 = calculateProviderCompleteness(profile);
    const r2 = calculateProviderCompleteness(profile);
    expect(r1).toEqual(r2);
  });
});

// ── items array structure ──────────────────────────────────────────────────

describe('calculateProviderCompleteness — items array', () => {
  it('always returns 8 items (6 active + 2 future-ready)', () => {
    expect(calculateProviderCompleteness(null).items).toHaveLength(8);
    expect(calculateProviderCompleteness(makeProfile()).items).toHaveLength(8);
    expect(calculateProviderCompleteness(makeFullProfile()).items).toHaveLength(8);
  });

  it('each item has key, label, done, and futureReady fields', () => {
    const result = calculateProviderCompleteness(null);
    for (const item of result.items) {
      expect(typeof item.key).toBe('string');
      expect(typeof item.label).toBe('string');
      expect(typeof item.done).toBe('boolean');
      expect(typeof item.futureReady).toBe('boolean');
    }
  });
});
