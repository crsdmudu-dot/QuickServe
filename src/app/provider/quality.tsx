/**
 * src/app/provider/quality.tsx — Provider Quality Dashboard (pushed route)
 *
 * Shows the signed-in provider's quality picture across three sections:
 *   1. Profile Health   — completeness card, verification status, achievements.
 *   2. Service Quality  — rating breakdown, job count, tag strengths/improvements,
 *                         recent reviews, recent completed jobs.
 *   3. Account Status   — approval_status ONLY (never flags / Operations data);
 *                         coaching recommendations via visibleActions (provider_visible = true);
 *                         conduct status + link to Code of Conduct.
 *
 * PRIVACY GUARDRAIL: reads ONLY from getMyQualityDashboard() — which is already
 * privacy-clean.  This file does NOT import @/lib/operations and does NOT
 * reference support_cases, internal_notes, review_private_feedback, or
 * account_flags.
 */

import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getMyQualityDashboard,
  type QualityDashboard,
} from '@/lib/provider-quality';
import { AchievementGrid } from '@/components/provider/achievement-grid';
import { CompletenessCard } from '@/components/provider/completeness-card';
import { ProviderQualityBreakdownCard } from '@/components/provider/provider-quality-breakdown-card';
import { QualityActionBadge } from '@/components/provider/quality-action-badge';
import { StrengthImprovementTags } from '@/components/provider/strength-improvement-tags';
import { Button } from '@/components/ui/button';
import { ReviewCard } from '@/components/ui/review-card';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { VerifiedBadge } from '@/components/ui/verified-badge';

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function ProviderQualityDashboardScreen() {
  const theme = useTheme();

  const [dashboard, setDashboard] = useState<QualityDashboard | null | undefined>(
    undefined, // undefined = loading; null = failed / not authenticated
  );

  useEffect(() => {
    getMyQualityDashboard().then(setDashboard);
  }, []);

  // ── Loading state ────────────────────────────────────────────────────────────

  if (dashboard === undefined) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} testID="quality-loading" />
        </View>
      </SafeAreaView>
    );
  }

  // ── Empty / error state ──────────────────────────────────────────────────────

  if (dashboard === null) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.center}>
          <Text variant="heading" color="textSecondary">
            Could not load quality dashboard.
          </Text>
          <Text variant="caption" color="textTertiary">
            Please try again later.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const accountStatusLabel =
    dashboard.accountStatus === 'approved'
      ? 'Approved'
      : dashboard.accountStatus === 'pending'
        ? 'Pending'
        : dashboard.accountStatus === 'rejected'
          ? 'Rejected'
          : 'Unknown';

  const accountStatusColor =
    dashboard.accountStatus === 'approved'
      ? ('success' as const)
      : dashboard.accountStatus === 'rejected'
        ? ('error' as const)
        : ('warning' as const);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Section 1: Profile Health ──────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader title="Profile Health" />

          {/* Completeness card */}
          <CompletenessCard completeness={dashboard.completeness} />

          {/* Verification status */}
          <Card style={styles.verificationCard}>
            <Text variant="label" weight="semibold">
              Verification
            </Text>
            {dashboard.profile?.is_verified ? (
              <VerifiedBadge />
            ) : (
              <Text variant="caption" color="textSecondary">
                Not yet verified
              </Text>
            )}
          </Card>

          {/* Achievements grid */}
          <SectionHeader title="Achievements" />
          <AchievementGrid achievements={dashboard.achievements} />
        </View>

        {/* ── Section 2: Service Quality ─────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader title="Service Quality" />

          {/* Rating breakdown card */}
          <ProviderQualityBreakdownCard breakdown={dashboard.breakdown} />

          {/* Total completed jobs */}
          <Card style={styles.jobsCard}>
            <Text variant="label" weight="semibold">
              Total completed jobs
            </Text>
            <Text variant="heading" color="primary">
              {dashboard.profile?.completed_jobs_count ?? 0}
            </Text>
          </Card>

          {/* Strengths & improvement tags */}
          <SectionHeader title="Feedback tags" />
          <StrengthImprovementTags
            strengths={dashboard.tags.strengths}
            improvements={dashboard.tags.improvements}
          />

          {/* Recent customer reviews */}
          <SectionHeader title="Recent reviews" />
          {dashboard.recentReviews.length === 0 ? (
            <Text variant="caption" color="textSecondary">
              No reviews yet.
            </Text>
          ) : (
            dashboard.recentReviews.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))
          )}

          {/* Recent completed jobs */}
          <SectionHeader title="Recent completed jobs" />
          {dashboard.recentCompletedJobs.length === 0 ? (
            <Text variant="caption" color="textSecondary">
              No completed jobs yet.
            </Text>
          ) : (
            dashboard.recentCompletedJobs.map((job) => (
              <Card key={job.id} style={styles.jobCard}>
                <Text variant="body" weight="medium">
                  {job.service_id}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {new Date(job.scheduled_for).toLocaleDateString()}
                </Text>
              </Card>
            ))
          )}
        </View>

        {/* ── Section 3: Account Status ──────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader title="Account Status" />

          {/* Approval status — approval_status ONLY, never flags/Operations */}
          <Card style={styles.statusCard}>
            <Text variant="label" weight="semibold">
              Account status
            </Text>
            <Text variant="body" color={accountStatusColor}>
              {accountStatusLabel}
            </Text>
          </Card>

          {/* Coaching recommendations — visibleActions (provider_visible = true, enforced by RLS) */}
          {dashboard.visibleActions.length > 0 && (
            <>
              <SectionHeader title="Coaching & recommendations" />
              {dashboard.visibleActions.map((action) => (
                <Card key={action.id} style={styles.actionCard}>
                  <QualityActionBadge actionType={action.action_type} />
                  {action.note ? (
                    <Text variant="caption" color="textSecondary">
                      {action.note}
                    </Text>
                  ) : null}
                  <Text variant="caption" color="textTertiary">
                    {new Date(action.created_at).toLocaleDateString()}
                  </Text>
                </Card>
              ))}
            </>
          )}

          {/* Conduct status */}
          <SectionHeader title="Code of Conduct" />
          <Card style={styles.conductCard}>
            {dashboard.conduct.accepted ? (
              <>
                <Text variant="caption" color="success">
                  Accepted
                </Text>
                {dashboard.conduct.accepted_at ? (
                  <Text variant="caption" color="textTertiary">
                    on {new Date(dashboard.conduct.accepted_at).toLocaleDateString()}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text variant="caption" color="warning">
                Not yet accepted
              </Text>
            )}
            <Button
              label="View Code of Conduct"
              variant="secondary"
              onPress={() => router.push('/provider/code-of-conduct' as Href)}
            />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.five,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  section: { gap: Spacing.three },
  verificationCard: { gap: Spacing.two },
  jobsCard: { gap: Spacing.two },
  jobCard: { gap: Spacing.one },
  statusCard: { gap: Spacing.two },
  actionCard: { gap: Spacing.two },
  conductCard: { gap: Spacing.two },
});
