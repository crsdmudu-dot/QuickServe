// provider-achievements.ts — Pure derivation of provider achievements.
// PURE logic only — no DB calls, no network, no writes, no ranking, no rewards.
// Achievements are DISPLAY-ONLY. Future-ready achievements (five_star_streak,
// excellent_feedback) are NEVER fabricated — absent signal → earned: false.

import type { ProviderProfile } from '@/lib/providers';
import type { ProviderRatingBreakdown } from '@/lib/reviews';
import { ACHIEVEMENTS, type AchievementKey } from '@/constants/provider-quality';
import { calculateProviderCompleteness } from '@/lib/provider-completeness';

// ── Types ──────────────────────────────────────────────────────────────────

export type ProviderAchievement = {
  key: AchievementKey;
  label: string;
  icon: string;
  earned: boolean;
  /** Optional progress indicator (current / target). Not present for all kinds. */
  progress?: { current: number; target: number };
};

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Derives the full list of provider achievements from pure inputs.
 *
 * - Display-only: no writes, no rewards, no ranking.
 * - `five_star_streak` and `excellent_feedback` are FUTURE-READY:
 *   when the required signal is absent they are `earned: false`, never fabricated.
 * - Pure, deterministic, never throws.
 */
export function deriveProviderAchievements(input: {
  profile: ProviderProfile | null;
  breakdown?: ProviderRatingBreakdown | null;
  recentReviews?: { rating: number }[];
  completenessPercent?: number;
}): ProviderAchievement[] {
  const { profile, breakdown, recentReviews, completenessPercent } = input;

  // Resolve completeness % — use passed value if present, otherwise compute it
  const resolvedCompleteness =
    completenessPercent != null
      ? completenessPercent
      : calculateProviderCompleteness(profile).percent;

  return ACHIEVEMENTS.map((achievement) => {
    switch (achievement.kind) {
      case 'jobs': {
        const target = achievement.threshold ?? 0;
        const current = profile?.completed_jobs_count ?? 0;
        const earned = current >= target;
        return {
          key: achievement.key,
          label: achievement.label,
          icon: achievement.icon,
          earned,
          progress: { current, target },
        };
      }

      case 'verified': {
        return {
          key: achievement.key,
          label: achievement.label,
          icon: achievement.icon,
          earned: profile?.is_verified === true,
        };
      }

      case 'rating': {
        const target = achievement.threshold ?? 4.8;
        const avgRating = profile?.average_rating ?? null;
        const reviewCount = profile?.review_count ?? 0;
        const earned = avgRating != null && avgRating >= target && reviewCount >= 5;
        return {
          key: achievement.key,
          label: achievement.label,
          icon: achievement.icon,
          earned,
          progress: avgRating != null
            ? { current: avgRating, target }
            : undefined,
        };
      }

      case 'completeness': {
        return {
          key: achievement.key,
          label: achievement.label,
          icon: achievement.icon,
          earned: resolvedCompleteness === 100,
        };
      }

      case 'feedback': {
        if (achievement.key === 'five_star_streak') {
          // Future-ready: requires recentReviews with ≥3 all-5-star reviews
          if (!recentReviews || recentReviews.length === 0) {
            return {
              key: achievement.key,
              label: achievement.label,
              icon: achievement.icon,
              earned: false,
            };
          }
          const earned =
            recentReviews.length >= 3 &&
            recentReviews.every((r) => r.rating === 5);
          return {
            key: achievement.key,
            label: achievement.label,
            icon: achievement.icon,
            earned,
          };
        }

        if (achievement.key === 'excellent_feedback') {
          // Future-ready: requires breakdown with recommend_pct >= 90 and review_count guard
          if (!breakdown || breakdown.review_count === 0 || breakdown.recommend_pct == null) {
            return {
              key: achievement.key,
              label: achievement.label,
              icon: achievement.icon,
              earned: false,
            };
          }
          const earned = breakdown.recommend_pct >= 90;
          return {
            key: achievement.key,
            label: achievement.label,
            icon: achievement.icon,
            earned,
          };
        }

        // Fallback for any unhandled feedback achievement
        return {
          key: achievement.key,
          label: achievement.label,
          icon: achievement.icon,
          earned: false,
        };
      }

      default: {
        return {
          key: achievement.key,
          label: achievement.label,
          icon: achievement.icon,
          earned: false,
        };
      }
    }
  });
}
