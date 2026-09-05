/**
 * Provider My Profile screen — lets approved providers view and edit their
 * public profile: bio, skills, years of experience, photo URL, and availability.
 * Also shows the provider's rating summary, received reviews (read-only), and
 * a read-only Earnings section summarising pending and paid earnings.
 */

import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { getProviderProfile, updateMyProviderProfile, type ProviderProfile } from '@/lib/providers';
import {
  getProviderReviews,
  getProviderRatingBreakdown,
  type Review,
  type ProviderRatingBreakdown,
} from '@/lib/reviews';
import {
  getMyPayoutLedger,
  getProviderEarningsSummary,
  type EarningsSummary,
  type ProviderPayoutLedgerRow,
} from '@/lib/earnings';

/** Provider view is READ-ONLY: there is no payout action anywhere on this screen. */
const PROVIDER_PAYOUT_LABELS: Record<string, string> = {
  pending: 'Pending payout',
  partially_paid: 'Partially paid out',
  paid: 'Paid out',
};
import { formatKes } from '@/lib/currency';
import { Avatar } from '@/components/ui/avatar';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';
import { RatingStars } from '@/components/ui/rating-stars';
import { ReviewCard } from '@/components/ui/review-card';
import { RatingBreakdown } from '@/components/ui/rating-breakdown';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';

// Combined state: read-only profile metadata + editable form fields in one object.
// A single setState call avoids multiple act() warnings in tests.
type ScreenState = {
  profile: ProviderProfile | null;
  bio: string;
  yearsExp: string;
  skillsText: string;
  photoUrl: string;
  availability: 'available' | 'unavailable';
};

const initial: ScreenState = {
  profile: null,
  bio: '',
  yearsExp: '',
  skillsText: '',
  photoUrl: '',
  availability: 'available',
};

function fromProfile(p: ProviderProfile): ScreenState {
  return {
    profile: p,
    bio: p.bio ?? '',
    yearsExp: p.years_experience != null ? String(p.years_experience) : '',
    skillsText: p.skills ? p.skills.join(', ') : '',
    photoUrl: p.profile_photo_url ?? '',
    availability: p.availability_status ?? 'available',
  };
}

export default function ProviderProfileScreen() {
  const theme = useTheme();
  const { approvalStatus, session, signOut } = useAuth();

  const [state, setState] = useState<ScreenState>(initial);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Reviews are loaded separately and are read-only — providers cannot edit or hide them.
  const [reviews, setReviews] = useState<Review[]>([]);
  // Aggregated rating breakdown — display-only; not used for ranking or dispatch.
  const [breakdown, setBreakdown] = useState<ProviderRatingBreakdown | null>(null);
  // Earnings are read-only — providers view only; no payout actions here.
  const [ledger, setLedger] = useState<ProviderPayoutLedgerRow[]>([]);
  const [earningsSummary, setEarningsSummary] = useState<EarningsSummary>({
    entitlement: 0,
    deductions: 0,
    net_payable: 0,
    disbursed: 0,
    outstanding: 0,
  });

  useEffect(() => {
    // Load profile and reviews only when approved and session exists.
    if (approvalStatus === 'approved' && session?.user?.id) {
      const userId = session.user.id;
      getProviderProfile(userId).then((p) => {
        // Single setState keeps all updates in one render, avoiding act() warnings.
        if (p) setState(fromProfile(p));
      });
      // RLS ensures only non-hidden reviews are returned for the provider.
      getProviderReviews(userId).then((r) => setReviews(r));
      // Load the aggregated breakdown for display alongside recent reviews.
      getProviderRatingBreakdown(userId).then(setBreakdown);
      // Earnings are self-scoped via RLS — no provider ID argument needed.
      getProviderEarningsSummary().then(setEarningsSummary);
      getMyPayoutLedger().then(setLedger);
    }
  }, [approvalStatus, session]);

  // ── Gate screens ──────────────────────────────────────────────────────────

  if (approvalStatus === 'pending') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <EmptyState
          icon="⏳"
          title="Awaiting approval"
          message="Your application is under review. We'll notify you once it's approved."
          actionLabel="Sign out"
          onAction={signOut}
        />
      </SafeAreaView>
    );
  }

  if (approvalStatus === 'rejected') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <EmptyState
          icon="🚫"
          title="Application declined"
          message="Unfortunately your provider application was not approved."
          actionLabel="Sign out"
          onAction={signOut}
        />
      </SafeAreaView>
    );
  }

  // ── Approved: show profile editor ─────────────────────────────────────────

  function patch<K extends keyof ScreenState>(key: K, value: ScreenState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function handleToggleAvailability() {
    const next: 'available' | 'unavailable' =
      state.availability === 'available' ? 'unavailable' : 'available';
    const result = await updateMyProviderProfile({ availability_status: next });
    if (result.ok) patch('availability', next);
  }

  async function handleSave() {
    setSaveError(null);
    // Split skill string by comma, trim each, drop empty entries.
    const skillsArray = state.skillsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const result = await updateMyProviderProfile({
      bio: state.bio,
      years_experience: Number(state.yearsExp) || undefined,
      skills: skillsArray.length > 0 ? skillsArray : undefined,
      profile_photo_url: state.photoUrl || undefined,
      availability_status: state.availability,
    });
    if (!result.ok) {
      setSaveError(result.error ?? 'Could not save profile.');
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero: avatar, name, verified, job count ─────────────────── */}
        <View style={styles.hero}>
          <Avatar
            name={state.profile?.full_name ?? ''}
            photoUrl={state.profile?.profile_photo_url ?? null}
            size={80}
          />
          <Text variant="title">{state.profile?.full_name ?? ''}</Text>
          {state.profile?.is_verified && <VerifiedBadge />}
          <Text variant="caption" color="textSecondary">
            {state.profile?.completed_jobs_count ?? 0} jobs completed
          </Text>
        </View>

        {/* ── Ratings section — read-only ──────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader title="Ratings" />
          <RatingStars
            value={state.profile?.average_rating ?? null}
            count={state.profile?.review_count}
          />
          {/* Rating breakdown — aggregated stats, display-only */}
          {breakdown !== null && (
            <>
              <SectionHeader title="Rating breakdown" />
              <RatingBreakdown breakdown={breakdown} />
            </>
          )}
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </View>

        {/* ── Earnings section — read-only ─────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader title="Earnings" />
          <Card style={styles.summaryCard}>
            <Text variant="body">Entitlement: {formatKes(earningsSummary.entitlement)}</Text>
            <Text variant="body">Deductions: {formatKes(earningsSummary.deductions)}</Text>
            <Text variant="body">Net payable: {formatKes(earningsSummary.net_payable)}</Text>
            <Text variant="body">Paid out: {formatKes(earningsSummary.disbursed)}</Text>
            <Text variant="body">Outstanding: {formatKes(earningsSummary.outstanding)}</Text>
          </Card>
          {ledger.length === 0 ? (
            <Text variant="caption" color="textSecondary">No earnings yet.</Text>
          ) : (
            ledger.map((e) => (
              <Card key={e.earning_id} style={styles.earningCard}>
                <Text variant="heading">{formatKes(e.net_provider_payable)}</Text>
                <Text variant="caption" color="textSecondary">
                  {`Entitlement ${formatKes(e.provider_entitlement)} · Deductions ${formatKes(
                    e.deductions_total,
                  )}`}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {`Paid out ${formatKes(e.amount_disbursed)} · Outstanding ${formatKes(
                    e.outstanding_provider_liability,
                  )}`}
                </Text>
                <Text
                  variant="caption"
                  color={e.stored_payout_status === 'paid' ? 'success' : 'warning'}>
                  {PROVIDER_PAYOUT_LABELS[e.stored_payout_status]}
                </Text>
              </Card>
            ))
          )}
        </View>

        {/* ── Editable fields ──────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader title="Edit Profile" />
          <View style={styles.fields}>
            <Input
              label="Bio"
              value={state.bio}
              onChangeText={(v) => patch('bio', v)}
              placeholder="Tell customers about yourself…"
              multiline
            />
            <Input
              label="Years of experience"
              value={state.yearsExp}
              onChangeText={(v) => patch('yearsExp', v)}
              placeholder="e.g. 5"
              keyboardType="phone-pad"
            />
            <Input
              label="Skills (comma-separated)"
              value={state.skillsText}
              onChangeText={(v) => patch('skillsText', v)}
              placeholder="e.g. Plumbing, Tiling"
            />
            <Input
              label="Profile photo URL"
              value={state.photoUrl}
              onChangeText={(v) => patch('photoUrl', v)}
              placeholder="https://…"
              autoCapitalize="none"
            />

            {/* Availability toggle — immediately saves to the server */}
            <Button
              label={state.availability === 'available' ? 'Available' : 'Unavailable'}
              variant={state.availability === 'available' ? 'primary' : 'ghost'}
              onPress={handleToggleAvailability}
            />

            {/* Inline save error */}
            {saveError ? (
              <Text variant="caption" color="error">
                {saveError}
              </Text>
            ) : null}

            <Button label="Save" onPress={handleSave} />

            <Button
              label="Quality Dashboard"
              variant="secondary"
              onPress={() => router.push('/provider/quality' as Href)}
            />

            <Button
              label="Code of Conduct"
              variant="secondary"
              onPress={() => router.push('/provider/code-of-conduct' as Href)}
            />

            <Button
              label="Notification settings"
              variant="secondary"
              onPress={() => router.push('/notification-settings')}
            />

            <Button label="Sign out" variant="ghost" onPress={signOut} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.five,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  section: { gap: Spacing.three },
  summaryCard: { gap: Spacing.two },
  earningCard: { gap: Spacing.one },
  fields: { gap: Spacing.three },
});
