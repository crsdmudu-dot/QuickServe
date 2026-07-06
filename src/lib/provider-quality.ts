// provider-quality.ts — Provider SELF quality reads and conduct acceptance.
//
// PRIVACY GUARDRAIL: This file is for the provider's own data ONLY.
// It has no operations-lib import and touches no private admin tables.
// Account status shown = approval_status only.
// Provider-visible quality actions are enforced by DB RLS (provider_visible=true rows).

import { supabase } from '@/lib/supabase';
import { getProviderProfile } from '@/lib/providers';
import { getProviderRatingBreakdown, getProviderReviews } from '@/lib/reviews';
import { getProviderJobs } from '@/lib/bookings';
import {
  partitionTags,
  CONDUCT_VERSION,
  type QualityActionType,
} from '@/constants/provider-quality';
import { calculateProviderCompleteness } from '@/lib/provider-completeness';
import { deriveProviderAchievements } from '@/lib/provider-achievements';
import type { ProviderProfile } from '@/lib/providers';
import type { ProviderRatingBreakdown } from '@/lib/reviews';
import type { Booking } from '@/lib/bookings';
import type { CompletenessResult } from '@/lib/provider-completeness';
import type { ProviderAchievement } from '@/lib/provider-achievements';

// ── Types ──────────────────────────────────────────────────────────────────

/** A row from the provider_quality_actions table. */
export type QualityAction = {
  id: string;
  provider_id: string;
  action_type: QualityActionType;
  note: string | null;
  provider_visible: boolean;
  created_by: string;
  created_at: string;
};

/** The full provider quality dashboard — composed from multiple reads. */
export type QualityDashboard = {
  /** The provider's own profile. Null when the user is not found. */
  profile: ProviderProfile | null;
  /** Aggregated rating breakdown. */
  breakdown: ProviderRatingBreakdown;
  /** Newest 5 reviews for display. */
  recentReviews: ReturnType<typeof getProviderReviews> extends Promise<infer R> ? R : never;
  /** Newest 5 completed jobs. */
  recentCompletedJobs: Booking[];
  /** Profile completeness result. */
  completeness: CompletenessResult;
  /** Derived achievements list. */
  achievements: ProviderAchievement[];
  /** Tag partition — strengths vs improvements. */
  tags: { strengths: string[]; improvements: string[] };
  /** Quality actions visible to this provider (RLS-scoped). */
  visibleActions: QualityAction[];
  /** Conduct acceptance state for the current version. */
  conduct: { accepted: boolean; accepted_at: string | null };
  /**
   * Provider's approval_status ONLY — never flags or Operations data.
   * Null when profile not found.
   */
  accountStatus: 'pending' | 'approved' | 'rejected' | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns the signed-in user's auth uid, or null if unauthenticated.
 */
export async function getMyProviderId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

/**
 * Returns quality actions visible to the current provider.
 * RLS on provider_quality_actions restricts rows to:
 *   - the caller's own rows where provider_visible = true
 * No manual filter is needed — RLS enforces it.
 * Returns [] on error.
 */
export async function getMyVisibleQualityActions(): Promise<QualityAction[]> {
  const { data, error } = await supabase
    .from('provider_quality_actions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as QualityAction[] | null) ?? [];
}

/**
 * Returns whether the current provider has accepted the given conduct version.
 * Row presence = accepted. Returns { accepted: false, accepted_at: null } on error.
 */
export async function getMyConductAcceptance(
  version = CONDUCT_VERSION,
): Promise<{ accepted: boolean; accepted_at: string | null }> {
  const { data, error } = await supabase
    .from('provider_conduct_acceptances')
    .select('accepted_at')
    .eq('version', version)
    .maybeSingle();
  if (error || !data) return { accepted: false, accepted_at: null };
  return { accepted: true, accepted_at: (data as { accepted_at: string }).accepted_at };
}

/**
 * Records the current provider's acceptance of the conduct policy.
 * Calls the accept_provider_conduct RPC (RLS-guarded, owner-scoped).
 */
export async function acceptConduct(
  version = CONDUCT_VERSION,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('accept_provider_conduct', {
    p_version: version,
  });
  if (error) return { ok: false, error: 'Could not record conduct acceptance. Please try again.' };
  return { ok: true };
}

/**
 * Returns the current provider's most recent completed jobs (newest first, capped at `limit`).
 * Fetches via getProviderJobs (RLS-scoped to the caller) then filters for completed status.
 * Returns [] on error.
 */
export async function getMyRecentCompletedJobs(limit = 5): Promise<Booking[]> {
  try {
    const jobs = await getProviderJobs();
    return jobs
      .filter((job) => job.status === 'completed')
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Composes the full provider quality dashboard for the signed-in provider.
 * Reads are run in parallel where safe.
 * Returns null when the caller is not authenticated.
 * Never throws.
 */
export async function getMyQualityDashboard(): Promise<QualityDashboard | null> {
  try {
    const uid = await getMyProviderId();
    if (!uid) return null;

    // Phase 1: profile + jobs + visible-actions + conduct in parallel
    const [profile, breakdown, allReviews, recentCompletedJobs, visibleActions, conduct] =
      await Promise.all([
        getProviderProfile(uid),
        getProviderRatingBreakdown(uid),
        getProviderReviews(uid),
        getMyRecentCompletedJobs(),
        getMyVisibleQualityActions(),
        getMyConductAcceptance(),
      ]);

    // Phase 2: pure derivations (synchronous — no additional network calls)
    const recentReviews = allReviews.slice(0, 5);
    const completeness = calculateProviderCompleteness(profile);
    const achievements = deriveProviderAchievements({
      profile,
      breakdown,
      recentReviews: allReviews, // full set for five_star_streak streak check
      completenessPercent: completeness.percent,
    });
    const tags = partitionTags(breakdown.top_tags);

    // Account status: ONLY approval_status — never flags or Operations data
    const accountStatus = profile?.approval_status ?? null;

    return {
      profile,
      breakdown,
      recentReviews,
      recentCompletedJobs,
      completeness,
      achievements,
      tags,
      visibleActions,
      conduct,
      accountStatus,
    };
  } catch {
    return null;
  }
}
