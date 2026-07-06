/**
 * src/app/(admin-web)/provider-quality/[id].tsx — Admin Provider Quality page
 *
 * Loads the full AdminQualitySummary for the provider via getProviderQualitySummary(id)
 * and renders:
 *   - Provider identity (name / verification / approval_status)
 *   - CompletenessCard + AchievementGrid (via deriveProviderAchievements)
 *   - ProviderQualityBreakdownCard + recent reviews
 *   - Quality action history (ALL rows — admin sees visible + internal)
 *   - Conduct acceptance status
 *   - Flags summary (total / active / byKind — READ-ONLY)
 *   - AdminRecordQualityActionForm (record-only; reloads summary on success)
 *
 * Admin actions remain record-only — no enforcement/suspension/dispatch/payout.
 */

import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getProviderQualitySummary,
  type AdminQualitySummary,
} from '@/lib/provider-quality-admin';
import { deriveProviderAchievements } from '@/lib/provider-achievements';
import { AchievementGrid } from '@/components/provider/achievement-grid';
import { CompletenessCard } from '@/components/provider/completeness-card';
import { ProviderQualityBreakdownCard } from '@/components/provider/provider-quality-breakdown-card';
import { QualityActionBadge } from '@/components/provider/quality-action-badge';
import { AdminRecordQualityActionForm } from '@/components/admin-web/admin-record-quality-action-form';
import { PageMeta } from '@/components/admin-web/page-meta';
import { Card } from '@/components/ui/card';
import { ReviewCard } from '@/components/ui/review-card';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { VerifiedBadge } from '@/components/ui/verified-badge';

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function AdminProviderQualityScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [summary, setSummary] = useState<AdminQualitySummary | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Load / reload ──────────────────────────────────────────────────────────

  const loadSummary = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const result = await getProviderQualitySummary(id);
    setSummary(result);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Derive achievements from the loaded summary (synchronous derivation)
  const achievements = summary
    ? deriveProviderAchievements({
        profile: summary.profile,
        breakdown: summary.breakdown,
        recentReviews: summary.recentReviews,
        completenessPercent: summary.completeness.percent,
      })
    : [];

  // ── Loading / not-found guard ──────────────────────────────────────────────

  if (loading || !summary) {
    return (
      <View style={styles.center}>
        <PageMeta title="Provider quality" />
        <Text variant="body" color="textSecondary">
          {loading ? 'Loading…' : 'Provider not found.'}
        </Text>
      </View>
    );
  }

  const profile = summary.profile;

  const approvalStatusColor =
    profile?.approval_status === 'approved'
      ? ('success' as const)
      : profile?.approval_status === 'rejected'
        ? ('error' as const)
        : ('warning' as const);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <PageMeta title="Provider quality" />

      {/* ── Provider identity ──────────────────────────────────────────────── */}
      <SectionHeader title="Provider" />
      <Card style={styles.identityCard}>
        <Text variant="heading" weight="semibold">
          {profile?.full_name ?? 'Unknown'}
        </Text>
        {profile?.is_verified && <VerifiedBadge />}
        <Text variant="caption" color={approvalStatusColor}>
          {profile?.approval_status
            ? profile.approval_status.charAt(0).toUpperCase() +
              profile.approval_status.slice(1)
            : 'Unknown'}
        </Text>
      </Card>

      {/* ── Completeness ──────────────────────────────────────────────────── */}
      <SectionHeader title="Profile completeness" />
      <CompletenessCard completeness={summary.completeness} />

      {/* ── Achievements ──────────────────────────────────────────────────── */}
      <SectionHeader title="Achievements" />
      <AchievementGrid achievements={achievements} />

      {/* ── Rating breakdown ──────────────────────────────────────────────── */}
      <SectionHeader title="Rating breakdown" />
      <ProviderQualityBreakdownCard breakdown={summary.breakdown} />

      {/* ── Recent reviews ────────────────────────────────────────────────── */}
      <SectionHeader title="Recent reviews" />
      {summary.recentReviews.length === 0 ? (
        <Text variant="caption" color="textSecondary">
          No reviews yet.
        </Text>
      ) : (
        summary.recentReviews.map((r) => (
          <ReviewCard key={r.id} review={r} />
        ))
      )}

      {/* ── Quality action history (ALL — admin sees visible + internal) ──── */}
      <SectionHeader title="Quality action history" />
      {summary.qualityActions.length === 0 ? (
        <Text variant="caption" color="textSecondary">
          No quality actions recorded yet.
        </Text>
      ) : (
        summary.qualityActions.map((action) => (
          <Card key={action.id} style={styles.actionCard}>
            <View style={styles.actionHeader}>
              <QualityActionBadge actionType={action.action_type} />
              <Text variant="caption" color="textTertiary">
                {action.provider_visible ? 'Visible to provider' : 'Internal only'}
              </Text>
            </View>
            {action.note ? (
              <Text variant="caption" color="textSecondary">
                {action.note}
              </Text>
            ) : null}
            <Text variant="caption" color="textTertiary">
              {new Date(action.created_at).toLocaleDateString()}
            </Text>
          </Card>
        ))
      )}

      {/* ── Conduct acceptance ────────────────────────────────────────────── */}
      <SectionHeader title="Code of Conduct" />
      <Card style={styles.conductCard}>
        {summary.conduct.accepted ? (
          <>
            <Text variant="caption" color="success">
              Accepted
            </Text>
            {summary.conduct.accepted_at ? (
              <Text variant="caption" color="textTertiary">
                on {new Date(summary.conduct.accepted_at).toLocaleDateString()}
              </Text>
            ) : null}
          </>
        ) : (
          <Text variant="caption" color="warning">
            Not yet accepted
          </Text>
        )}
      </Card>

      {/* ── Flags summary (READ-ONLY from Operations) ──────────────────────── */}
      <SectionHeader title="Account flags summary" />
      <Card style={styles.flagsCard}>
        <Text variant="label" weight="semibold">
          Flags overview (read-only)
        </Text>
        <Text variant="body">
          Total: {summary.flagsSummary.total}
        </Text>
        <Text variant="body" color={summary.flagsSummary.active > 0 ? 'error' : 'success'}>
          Active: {summary.flagsSummary.active}
        </Text>
        {Object.entries(summary.flagsSummary.byKind).length > 0 ? (
          <View style={styles.byKind}>
            {Object.entries(summary.flagsSummary.byKind).map(([kind, count]) => (
              <Text key={kind} variant="caption" color="textSecondary">
                {kind}: {count}
              </Text>
            ))}
          </View>
        ) : (
          <Text variant="caption" color="textSecondary">
            No flags on record.
          </Text>
        )}
      </Card>

      {/* ── Record quality action (admin, record-only) ────────────────────── */}
      <SectionHeader title="Record quality action" />
      <AdminRecordQualityActionForm
        providerId={id}
        onRecorded={loadSummary}
      />
    </ScrollView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  identityCard: {
    gap: Spacing.two,
  },
  actionCard: {
    gap: Spacing.two,
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  conductCard: {
    gap: Spacing.one,
  },
  flagsCard: {
    gap: Spacing.two,
  },
  byKind: {
    gap: Spacing.one,
  },
});
