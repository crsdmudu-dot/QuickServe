// provider-quality.ts — Static quality constants for the Provider Experience & Quality Controls slice.
// PURE constants only — no DB calls, no network, no writes.

// ── Quality Action Types ───────────────────────────────────────────────────

/** The 6 admin quality action types. */
export type QualityActionType =
  | 'coaching_needed'
  | 'coaching_completed'
  | 'warning_given'
  | 'improvement_observed'
  | 'temporarily_paused_recommended'
  | 'no_action';

/** Display metadata for each quality action type. */
export const QUALITY_ACTION_TYPES: { id: QualityActionType; label: string; color: string }[] = [
  { id: 'coaching_needed',                label: 'Coaching needed',            color: '#F5A524' }, // warning
  { id: 'coaching_completed',             label: 'Coaching completed',         color: '#00875A' }, // success
  { id: 'warning_given',                  label: 'Warning given',              color: '#E5484D' }, // error
  { id: 'improvement_observed',           label: 'Improvement observed',       color: '#00875A' }, // success
  { id: 'temporarily_paused_recommended', label: 'Temporary pause recommended', color: '#E5484D' }, // error
  { id: 'no_action',                      label: 'No action',                  color: '#6B7280' }, // neutral
];

// ── Review Tag Partitions ──────────────────────────────────────────────────

/** The 5 positive (strength) tags from the 9-tag allowlist. */
export const STRENGTH_TAGS = [
  'on_time',
  'friendly',
  'clean_work',
  'good_communication',
  'fair_price',
] as const;

/** The 4 negative (improvement) tags from the 9-tag allowlist. */
export const IMPROVEMENT_TAGS = [
  'late',
  'messy',
  'poor_communication',
  'overpriced',
] as const;

/**
 * Splits a list of tag keys into strengths vs improvements.
 * Tags not in either list are silently ignored.
 */
export function partitionTags(tags: string[]): { strengths: string[]; improvements: string[] } {
  const strengths: string[] = [];
  const improvements: string[] = [];
  for (const tag of tags) {
    if ((STRENGTH_TAGS as readonly string[]).includes(tag)) {
      strengths.push(tag);
    } else if ((IMPROVEMENT_TAGS as readonly string[]).includes(tag)) {
      improvements.push(tag);
    }
    // unknowns are silently ignored
  }
  return { strengths, improvements };
}

// ── Achievements ──────────────────────────────────────────────────────────

/** The 9 provider achievement keys. */
export type AchievementKey =
  | 'first_job'
  | 'jobs_10'
  | 'jobs_50'
  | 'jobs_100'
  | 'verified_provider'
  | 'rating_4_8'
  | 'profile_complete'
  | 'five_star_streak'
  | 'excellent_feedback';

/** Display metadata for each achievement. */
export const ACHIEVEMENTS: {
  key: AchievementKey;
  label: string;
  icon: string;
  kind: 'jobs' | 'verified' | 'rating' | 'completeness' | 'feedback';
  threshold?: number;
}[] = [
  { key: 'first_job',          label: 'First Job Done',       icon: '🎉', kind: 'jobs',        threshold: 1   },
  { key: 'jobs_10',            label: '10 Jobs Completed',    icon: '🔟', kind: 'jobs',        threshold: 10  },
  { key: 'jobs_50',            label: '50 Jobs Completed',    icon: '🏅', kind: 'jobs',        threshold: 50  },
  { key: 'jobs_100',           label: '100 Jobs Completed',   icon: '💯', kind: 'jobs',        threshold: 100 },
  { key: 'verified_provider',  label: 'Verified Provider',    icon: '✅', kind: 'verified'                    },
  { key: 'rating_4_8',         label: 'Top Rated Provider',   icon: '⭐', kind: 'rating',      threshold: 4.8 },
  { key: 'profile_complete',   label: 'Profile Complete',     icon: '📋', kind: 'completeness'                },
  { key: 'five_star_streak',   label: 'Five-Star Streak',     icon: '🌟', kind: 'feedback'                    },
  { key: 'excellent_feedback', label: 'Excellent Feedback',   icon: '👏', kind: 'feedback'                    },
];

// ── Profile Completeness Items ─────────────────────────────────────────────

/** Keys for each completeness item. */
export type CompletenessItemKey =
  | 'photo'
  | 'bio'
  | 'experience'
  | 'service_categories'
  | 'contact_details'
  | 'availability'
  | 'government_verification'
  | 'payment_details';

/**
 * Ordered list of profile completeness items.
 * Items with `futureReady: true` are shown to the user but
 * EXCLUDED from the completeness percentage calculation.
 */
export const PROFILE_COMPLETENESS_ITEMS: {
  key: CompletenessItemKey;
  label: string;
  futureReady?: boolean;
}[] = [
  // ── Active items (included in the %) ─────────────────────────────────────
  { key: 'photo',                label: 'Profile photo'         },
  { key: 'bio',                  label: 'Bio'                   },
  { key: 'experience',           label: 'Years of experience'   },
  { key: 'service_categories',   label: 'Service categories'    },
  { key: 'contact_details',      label: 'Contact details'       },
  { key: 'availability',         label: 'Availability configured' },
  // ── Future-ready items (shown but excluded from %) ────────────────────────
  { key: 'government_verification', label: 'Government verification', futureReady: true },
  { key: 'payment_details',         label: 'Payment details',         futureReady: true },
];

// ── Code of Conduct ────────────────────────────────────────────────────────

/** The version of the code of conduct accepted by the provider. */
export const CONDUCT_VERSION = 'v1';

/** The 9 sections of the provider code of conduct. Static guidance only. */
export const CODE_OF_CONDUCT: { heading: string; body: string }[] = [
  {
    heading: 'Professional behaviour',
    body: 'Always conduct yourself with professionalism and integrity on every job. Present yourself neatly, arrive prepared, and act courteously toward customers and other stakeholders at all times.',
  },
  {
    heading: 'Communication',
    body: 'Respond to booking requests and customer messages promptly. Keep customers informed of any changes to arrival times or job scope before they become surprises.',
  },
  {
    heading: 'Arrival expectations',
    body: 'Arrive within the agreed time window. If you anticipate a delay, notify the customer as soon as possible with a revised estimated arrival time.',
  },
  {
    heading: 'Work quality',
    body: 'Complete every job to the highest standard of your trade. Do not cut corners, and ensure the work meets or exceeds the scope agreed with the customer.',
  },
  {
    heading: 'Clean-up expectations',
    body: 'Leave the customer\'s space as clean as or cleaner than you found it. Remove all waste and materials generated by your work before leaving the premises.',
  },
  {
    heading: 'Customer respect',
    body: 'Treat every customer with dignity and respect, regardless of circumstances. Do not engage in any form of harassment, discrimination, or inappropriate behaviour.',
  },
  {
    heading: 'Safety',
    body: 'Observe all relevant safety regulations and best practices for your trade. Never knowingly carry out work that puts the customer, their property, or yourself at risk.',
  },
  {
    heading: 'Evidence & photos',
    body: 'Take before-and-after photos of your work where appropriate to document job completion and protect both parties in the event of a dispute.',
  },
  {
    heading: 'Dispute expectations',
    body: 'Handle disagreements calmly and constructively by first attempting to resolve the issue directly with the customer. Escalate through the platform\'s dispute process if a resolution cannot be reached.',
  },
];
