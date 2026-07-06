// provider-quality-admin.ts — Admin-only quality record and read helpers.
//
// All functions are admin-only; access is enforced by DB RLS policies and
// SECURITY DEFINER RPCs that check is_admin().
//
// recordProviderQualityAction — RECORD-ONLY via is_admin-guarded RPC.
//   Does NOT enforce, suspend, or change any account state.
// getProviderFlagsSummary — READ-ONLY summary from account_flags via Operations.
//   No Operations workflow change — read only.
//
// Read helpers return [] / null-safe on error — never throw.
// Mutation helpers return { ok: boolean; error?: string }.

import { supabase } from '@/lib/supabase';
import { getProviderProfile } from '@/lib/providers';
import { getProviderRatingBreakdown, getProviderReviews } from '@/lib/reviews';
import { getAccountFlags } from '@/lib/operations';
import { CONDUCT_VERSION, type QualityActionType } from '@/constants/provider-quality';
import { calculateProviderCompleteness } from '@/lib/provider-completeness';
import type { ProviderProfile } from '@/lib/providers';
import type { ProviderRatingBreakdown } from '@/lib/reviews';
import type { CompletenessResult } from '@/lib/provider-completeness';
import type { QualityAction } from '@/lib/provider-quality';

// ── Types ──────────────────────────────────────────────────────────────────

/** Admin view of a provider's full quality picture. */
export type AdminQualitySummary = {
  /** Provider profile, or null if not found. */
  profile: ProviderProfile | null;
  /** Aggregated rating breakdown. */
  breakdown: ProviderRatingBreakdown;
  /** Newest reviews for the provider. */
  recentReviews: Awaited<ReturnType<typeof getProviderReviews>>;
  /** Profile completeness result. */
  completeness: CompletenessResult;
  /** All quality actions for this provider (admin RLS = all rows). */
  qualityActions: QualityAction[];
  /** Conduct acceptance state for the current version. */
  conduct: { accepted: boolean; accepted_at: string | null };
  /** READ-ONLY summary of account flags — no Operations workflow change. */
  flagsSummary: { total: number; active: number; byKind: Record<string, number> };
};

// ── Mutations ──────────────────────────────────────────────────────────────

/**
 * Admin-only: records a quality action for a provider.
 * RECORD-ONLY — calls the is_admin-guarded RPC; does NOT enforce suspension,
 * change approval_status, dispatch, or any other account state.
 * Returns { ok: true, id } on success; { ok: false, error } on failure.
 */
export async function recordProviderQualityAction(input: {
  providerId: string;
  actionType: QualityActionType;
  note?: string;
  providerVisible: boolean;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('record_provider_quality_action', {
    p_provider_id:      input.providerId,
    p_action_type:      input.actionType,
    p_note:             input.note ?? null,
    p_provider_visible: input.providerVisible,
  });
  if (error) return { ok: false, error: 'Could not record quality action. Please try again.' };
  return { ok: true, id: data as string };
}

// ── Read helpers ───────────────────────────────────────────────────────────

/**
 * Admin-only: returns ALL quality actions for a provider (admin RLS bypasses
 * the provider_visible filter, so all rows are returned).
 * Returns [] on error.
 */
export async function getProviderQualityActions(
  providerId: string,
): Promise<QualityAction[]> {
  const { data, error } = await supabase
    .from('provider_quality_actions')
    .select('*')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as QualityAction[] | null) ?? [];
}

/**
 * Admin-only: returns whether a provider has accepted the given conduct version.
 * Returns { accepted: false, accepted_at: null } on error or no row.
 */
export async function getProviderConductAcceptance(
  providerId: string,
  version = CONDUCT_VERSION,
): Promise<{ accepted: boolean; accepted_at: string | null }> {
  const { data, error } = await supabase
    .from('provider_conduct_acceptances')
    .select('accepted_at')
    .eq('provider_id', providerId)
    .eq('version', version)
    .maybeSingle();
  if (error || !data) return { accepted: false, accepted_at: null };
  return {
    accepted: true,
    accepted_at: (data as { accepted_at: string }).accepted_at,
  };
}

/**
 * Admin-only: READ-ONLY summary of account flags for a provider.
 * Summarises getAccountFlags output into { total, active, byKind }.
 * NO Operations workflow change — this is a read-only aggregation.
 * Returns { total: 0, active: 0, byKind: {} } on error.
 */
export async function getProviderFlagsSummary(
  providerId: string,
): Promise<{ total: number; active: number; byKind: Record<string, number> }> {
  try {
    const flags = await getAccountFlags(providerId);
    const total = flags.length;
    const active = flags.filter((f) => f.active).length;
    const byKind: Record<string, number> = {};
    for (const flag of flags) {
      byKind[flag.kind] = (byKind[flag.kind] ?? 0) + 1;
    }
    return { total, active, byKind };
  } catch {
    return { total: 0, active: 0, byKind: {} };
  }
}

/**
 * Admin-only: composes a full quality summary for a provider.
 * Reads are run in parallel. Never throws.
 */
export async function getProviderQualitySummary(
  providerId: string,
): Promise<AdminQualitySummary> {
  const [
    profile,
    breakdown,
    allReviews,
    qualityActions,
    conduct,
    flagsSummary,
  ] = await Promise.all([
    getProviderProfile(providerId),
    getProviderRatingBreakdown(providerId),
    getProviderReviews(providerId),
    getProviderQualityActions(providerId),
    getProviderConductAcceptance(providerId),
    getProviderFlagsSummary(providerId),
  ]);

  const recentReviews = allReviews.slice(0, 10);
  const completeness = calculateProviderCompleteness(profile);

  return {
    profile,
    breakdown,
    recentReviews,
    completeness,
    qualityActions,
    conduct,
    flagsSummary,
  };
}
