/**
 * src/app/(admin-web)/providers/[id].tsx — Web Admin Provider Detail
 *
 * Desktop two-column layout:
 *   Left  — identity, approval, verify toggle, profile edit.
 *   Right — ratings/reviews (hide/unhide), earnings/payouts (mark paid).
 *
 * Reuses all lib helpers and UI components from the mobile admin provider
 * detail screen (src/app/admin/provider/[id].tsx) — only the layout changes.
 *
 * RN/RN-web safe — no DOM-only APIs.
 */

import { useLocalSearchParams, router, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getProviderProfile,
  setProviderApproval,
  adminUpdateProviderProfile,
  type ProviderProfile,
} from '@/lib/providers';
import {
  getProviderReviews,
  getProviderRatingBreakdown,
  setReviewHidden,
  type Review,
  type ProviderRatingBreakdown,
} from '@/lib/reviews';
import {
  adminGetProviderEarnings,
  adminMarkPayoutPaid,
  type ProviderEarning,
} from '@/lib/earnings';
import { formatKes } from '@/lib/currency';
import { PageMeta } from '@/components/admin-web/page-meta';
import { Avatar } from '@/components/ui/avatar';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RatingStars } from '@/components/ui/rating-stars';
import { RatingBreakdown } from '@/components/ui/rating-breakdown';
import { ReviewCard } from '@/components/ui/review-card';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { InternalNotesPanel } from '@/components/admin-web/operations/internal-notes-panel';
import { AccountFlagPanel } from '@/components/admin-web/operations/account-flag-panel';

// ── Layout breakpoint ──────────────────────────────────────────────────────

/** Minimum viewport width to show the two-column desktop layout. */
const WIDE_BREAKPOINT = 900;

// ── Screen ─────────────────────────────────────────────────────────────────

export default function AdminWebProviderDetailScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  const { id } = useLocalSearchParams<{ id: string }>();

  // ── Profile state ──────────────────────────────────────────────────────
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [error, setError] = useState('');

  // ── Editable profile fields ────────────────────────────────────────────
  const [bio, setBio] = useState('');
  const [yearsExp, setYearsExp] = useState('');
  const [skills, setSkills] = useState(''); // comma-separated
  const [photoUrl, setPhotoUrl] = useState('');

  // ── Right column state ─────────────────────────────────────────────────
  const [reviews, setReviews] = useState<Review[]>([]);
  const [earnings, setEarnings] = useState<ProviderEarning[]>([]);
  // Aggregated rating breakdown — display-only; not used for ranking or dispatch.
  const [breakdown, setBreakdown] = useState<ProviderRatingBreakdown | null>(null);

  // ── Reload helpers ─────────────────────────────────────────────────────

  const loadReviews = useCallback(() => {
    if (id) getProviderReviews(id).then(setReviews);
  }, [id]);

  const loadEarnings = useCallback(() => {
    if (id) adminGetProviderEarnings(id).then(setEarnings);
  }, [id]);

  // ── Initial data load ──────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;

    getProviderProfile(id).then((p) => {
      if (p) {
        setProfile(p);
        setBio(p.bio ?? '');
        setYearsExp(p.years_experience != null ? String(p.years_experience) : '');
        setSkills(p.skills ? p.skills.join(', ') : '');
        setPhotoUrl(p.profile_photo_url ?? '');
      }
    });

    loadReviews();
    loadEarnings();
    // Load the aggregated breakdown for display alongside recent reviews.
    getProviderRatingBreakdown(id).then(setBreakdown);
  }, [id, loadReviews, loadEarnings]);

  // ── Action handlers ────────────────────────────────────────────────────

  async function handleApprove() {
    if (!id) return;
    setError('');
    const result = await setProviderApproval(id, 'approved');
    if (result.ok) {
      setProfile((prev) => (prev ? { ...prev, approval_status: 'approved' } : prev));
    } else {
      setError(result.error ?? 'Could not approve provider.');
    }
  }

  async function handleReject() {
    if (!id) return;
    setError('');
    const result = await setProviderApproval(id, 'rejected');
    if (result.ok) {
      setProfile((prev) => (prev ? { ...prev, approval_status: 'rejected' } : prev));
    } else {
      setError(result.error ?? 'Could not reject provider.');
    }
  }

  async function handleVerifyToggle() {
    if (!profile || !id) return;
    setError('');
    const next = !profile.is_verified;
    const result = await adminUpdateProviderProfile(id, { is_verified: next });
    if (result.ok) {
      setProfile((prev) => (prev ? { ...prev, is_verified: next } : prev));
    } else {
      setError(result.error ?? 'Could not update verification status.');
    }
  }

  async function handleAvailabilityToggle() {
    if (!profile || !id) return;
    setError('');
    const next: 'available' | 'unavailable' =
      profile.availability_status === 'available' ? 'unavailable' : 'available';
    const result = await adminUpdateProviderProfile(id, { availability_status: next });
    if (result.ok) {
      setProfile((prev) => (prev ? { ...prev, availability_status: next } : prev));
    } else {
      setError(result.error ?? 'Could not update availability.');
    }
  }

  async function handleSaveProfile() {
    if (!profile || !id) return;
    setError('');
    const skillsArray = skills
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const result = await adminUpdateProviderProfile(id, {
      bio,
      years_experience: yearsExp !== '' ? Number(yearsExp) || null : null,
      skills: skillsArray.length > 0 ? skillsArray : null,
      profile_photo_url: photoUrl || null,
      availability_status: profile.availability_status,
    });
    if (!result.ok) {
      setError(result.error ?? 'Could not save profile.');
    }
  }

  async function handleToggleReviewHidden(review: Review) {
    setError('');
    const result = await setReviewHidden(review.id, !review.is_hidden);
    if (result.ok) {
      loadReviews();
    } else {
      setError(result.error ?? 'Could not update review.');
    }
  }

  async function handleMarkPayoutPaid(earningId: string) {
    setError('');
    const result = await adminMarkPayoutPaid(earningId);
    if (result.ok) {
      loadEarnings();
    } else {
      setError(result.error ?? 'Could not update payout.');
    }
  }

  // ── Loading / not-found guard ──────────────────────────────────────────

  if (!profile) {
    return (
      <View style={styles.center}>
        <Text variant="body" color="textSecondary">
          Loading…
        </Text>
      </View>
    );
  }

  // ── Left column content ────────────────────────────────────────────────

  const leftColumn = (
    <View style={styles.column}>
      {/* Identity header */}
      <Card style={styles.profileCard} elevation="e1">
        <Avatar name={profile.full_name ?? 'Unknown'} photoUrl={profile.profile_photo_url} />
        <Text variant="heading" weight="semibold">
          {profile.full_name ?? 'Unknown'}
        </Text>
        {profile.is_verified && <VerifiedBadge />}
        <Text variant="caption" color="textSecondary">
          Completed jobs: {profile.completed_jobs_count}
        </Text>
      </Card>

      {/* Inline error */}
      {error ? (
        <Text variant="caption" color="error">
          {error}
        </Text>
      ) : null}

      {/* Approval */}
      <SectionHeader title="Approval" />
      <Text variant="caption" color="textSecondary">
        Current status:{' '}
        <Text variant="caption" color={profile.approval_status === 'approved' ? 'primary' : 'error'}>
          {profile.approval_status.charAt(0).toUpperCase() + profile.approval_status.slice(1)}
        </Text>
      </Text>
      <View style={styles.actionRow}>
        <Button
          label="Approve"
          variant={profile.approval_status === 'approved' ? 'secondary' : 'primary'}
          onPress={handleApprove}
        />
        <Button
          label="Reject"
          variant={profile.approval_status === 'rejected' ? 'secondary' : 'ghost'}
          onPress={handleReject}
        />
      </View>

      {/* Verify toggle */}
      <SectionHeader title="Verification" />
      <Button
        label={profile.is_verified ? 'Unverify' : 'Verify'}
        variant={profile.is_verified ? 'ghost' : 'primary'}
        onPress={handleVerifyToggle}
      />

      {/* Availability toggle */}
      <SectionHeader title="Availability" />
      <Button
        label={profile.availability_status === 'available' ? 'Set Unavailable' : 'Set Available'}
        variant="secondary"
        onPress={handleAvailabilityToggle}
      />

      {/* Profile edit */}
      <SectionHeader title="Edit Profile" />
      <Input
        label="Bio"
        value={bio}
        onChangeText={setBio}
        placeholder="Short bio…"
        multiline
      />
      <Input
        label="Years of experience"
        value={yearsExp}
        onChangeText={setYearsExp}
        placeholder="e.g. 5"
        keyboardType="phone-pad"
      />
      <Input
        label="Skills (comma-separated)"
        value={skills}
        onChangeText={setSkills}
        placeholder="e.g. Plumbing, Electrical"
      />
      <Input
        label="Profile photo URL"
        value={photoUrl}
        onChangeText={setPhotoUrl}
        placeholder="https://…"
      />
      <Button label="Save profile" onPress={handleSaveProfile} />

      {/* Operations — internal notes for this provider (admin-only, additive) */}
      <InternalNotesPanel subjectType="provider" subjectId={id} />

      {/* Operations — account flags / suspension records (record-only) */}
      <AccountFlagPanel subjectId={id} subjectRole="provider" />

      {/* Operations — create a support case linked to this provider */}
      <SectionHeader title="Support case" />
      <Button
        label="Create support case"
        variant="secondary"
        onPress={() =>
          router.push(
            `/(admin-web)/operations/new?provider_id=${id}` as Href,
          )
        }
      />
    </View>
  );

  // ── Right column content ───────────────────────────────────────────────

  const rightColumn = (
    <View style={styles.column}>
      {/* Ratings summary */}
      <SectionHeader title="Ratings" />
      <RatingStars value={profile.average_rating} count={profile.review_count} />
      {/* Rating breakdown — aggregated stats, display-only */}
      {breakdown !== null && (
        <>
          <SectionHeader title="Rating breakdown" />
          <RatingBreakdown breakdown={breakdown} />
        </>
      )}

      {/* Reviews list */}
      <SectionHeader title="Reviews" />
      {reviews.length === 0 ? (
        <Text variant="caption" color="textSecondary">
          No reviews yet.
        </Text>
      ) : (
        reviews.map((r) => (
          <View key={r.id} style={styles.reviewRow}>
            <ReviewCard review={r} />
            {r.is_hidden ? (
              <Text variant="caption" color="textTertiary">
                Hidden
              </Text>
            ) : null}
            <Button
              label={r.is_hidden ? 'Unhide' : 'Hide'}
              variant="secondary"
              onPress={() => handleToggleReviewHidden(r)}
            />
          </View>
        ))
      )}

      {/* Earnings / Payouts */}
      <SectionHeader title="Earnings & Payouts" />
      {earnings.length === 0 ? (
        <Text variant="caption" color="textSecondary">
          No earnings recorded yet.
        </Text>
      ) : (
        earnings.map((e) => (
          <Card key={e.id} style={styles.earningRow}>
            <View style={styles.earningInfo}>
              <Text variant="label" weight="semibold">
                {formatKes(e.amount)}
              </Text>
              <Text
                variant="caption"
                color={e.payout_status === 'paid' ? 'primary' : 'textSecondary'}>
                {e.payout_status === 'paid' ? 'Paid' : 'Pending'}
              </Text>
              <Text variant="caption" color="textTertiary">
                {new Date(e.created_at).toLocaleDateString()}
              </Text>
            </View>
            {e.payout_status === 'pending' && (
              <Button
                label="Mark payout paid"
                variant="primary"
                onPress={() => handleMarkPayoutPaid(e.id)}
              />
            )}
          </Card>
        ))
      )}
    </View>
  );

  // ── Render ─────────────────────────────────────────────────────────────

  if (isWide) {
    // Desktop: two-column side-by-side layout
    return (
      <View style={styles.twoCol}>
        <PageMeta title="Provider detail" />
        <ScrollView
          style={styles.colScroll}
          contentContainerStyle={styles.colContent}
          showsVerticalScrollIndicator={false}>
          {leftColumn}
        </ScrollView>
        <View style={[styles.colDivider, { backgroundColor: theme.border }]} />
        <ScrollView
          style={styles.colScroll}
          contentContainerStyle={styles.colContent}
          showsVerticalScrollIndicator={false}>
          {rightColumn}
        </ScrollView>
      </View>
    );
  }

  // Narrow: single-column stacked layout
  return (
    <View style={styles.singleCol}>
      <PageMeta title="Provider detail" />
      {leftColumn}
      {rightColumn}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  twoCol: {
    flex: 1,
    flexDirection: 'row',
  },
  colScroll: {
    flex: 1,
  },
  colContent: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  colDivider: {
    width: StyleSheet.hairlineWidth,
  },
  singleCol: {
    gap: Spacing.three,
    padding: Spacing.three,
  },
  column: {
    gap: Spacing.three,
  },
  profileCard: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  reviewRow: {
    gap: Spacing.two,
  },
  earningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  earningInfo: {
    gap: Spacing.one,
    flex: 1,
  },
});
