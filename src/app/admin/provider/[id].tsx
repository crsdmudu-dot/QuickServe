/**
 * Admin provider profile detail screen — view, edit, verify, and manage reviews.
 * Admins can update bio, years_experience, skills, profile_photo_url,
 * toggle availability, grant/revoke the Verified badge, and hide/unhide reviews.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getProviderProfile,
  adminUpdateProviderProfile,
  type ProviderProfile,
} from '@/lib/providers';
import { getProviderReviews, setReviewHidden, type Review } from '@/lib/reviews';
import { Avatar } from '@/components/ui/avatar';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RatingStars } from '@/components/ui/rating-stars';
import { ReviewCard } from '@/components/ui/review-card';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';

export default function AdminProviderDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  // The full provider profile, null while loading
  const [profile, setProfile] = useState<ProviderProfile | null>(null);

  // Editable form fields (initialised once profile loads)
  const [bio, setBio] = useState('');
  const [yearsExp, setYearsExp] = useState('');
  const [skills, setSkills] = useState(''); // comma-separated display string
  const [photoUrl, setPhotoUrl] = useState('');

  // Inline error shown below actions
  const [error, setError] = useState('');

  // Reviews loaded by admin (includes hidden ones)
  const [reviews, setReviews] = useState<Review[]>([]);

  // Load provider profile and reviews on mount (or whenever id changes)
  useEffect(() => {
    if (id) {
      getProviderProfile(id).then((p) => {
        if (p) {
          setProfile(p);
          setBio(p.bio ?? '');
          setYearsExp(p.years_experience != null ? String(p.years_experience) : '');
          setSkills(p.skills ? p.skills.join(', ') : '');
          setPhotoUrl(p.profile_photo_url ?? '');
        }
      });
      getProviderReviews(id).then((list) => setReviews(list));
    }
  }, [id]);

  // Toggle a review's hidden state, then reload the reviews list
  async function handleToggleHidden(review: Review) {
    if (!id) return;
    const result = await setReviewHidden(review.id, !review.is_hidden);
    if (result.ok) {
      getProviderReviews(id).then((list) => setReviews(list));
    } else {
      setError(result.error ?? 'Could not update review.');
    }
  }

  // Toggle availability_status between 'available' and 'unavailable'
  async function handleAvailabilityToggle() {
    if (!profile || !id) return;
    setError('');
    const next = profile.availability_status === 'available' ? 'unavailable' : 'available';
    const result = await adminUpdateProviderProfile(id, { availability_status: next });
    if (result.ok) {
      setProfile((prev) => (prev ? { ...prev, availability_status: next } : prev));
    } else {
      setError(result.error ?? 'Could not update availability.');
    }
  }

  // Toggle is_verified
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

  // Save all editable fields at once
  async function handleSave() {
    if (!profile || !id) return;
    setError('');
    // Convert comma-separated skills string back to array (filter empty)
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

  // Show loading state until profile is fetched
  if (!profile) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <Text variant="body" color="textSecondary">
          Loading…
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="title">Provider Profile</Text>

        {/* Centered profile header card — avatar + name + verified badge + jobs count */}
        <Card style={styles.profileCard} elevation="e1">
          <Avatar name={profile.full_name ?? 'Unknown'} photoUrl={profile.profile_photo_url} />
          <Text variant="heading">{profile.full_name ?? 'Unknown'}</Text>
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

        {/* ── Edit Details ──────────────────────────────────────────────────── */}
        <SectionHeader title="Edit Details" />

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

        {/* ── Availability ──────────────────────────────────────────────────── */}
        <SectionHeader title="Availability" />
        <Button
          label={
            profile.availability_status === 'available'
              ? 'Set Unavailable'
              : 'Set Available'
          }
          variant="secondary"
          onPress={handleAvailabilityToggle}
        />

        {/* ── Verification ──────────────────────────────────────────────────── */}
        <SectionHeader title="Verification" />
        <Button
          label={profile.is_verified ? 'Unverify' : 'Verify'}
          variant={profile.is_verified ? 'ghost' : 'primary'}
          onPress={handleVerifyToggle}
        />

        {/* Save all editable fields */}
        <Button label="Save" onPress={handleSave} />

        {/* ── Reviews ───────────────────────────────────────────────────────── */}
        <SectionHeader title="Reviews" />
        <RatingStars value={profile.average_rating} count={profile.review_count} />
        {reviews.map((r) => (
          <View key={r.id} style={styles.reviewRow}>
            <ReviewCard review={r} />
            <Button
              label={r.is_hidden ? 'Unhide' : 'Hide'}
              variant="secondary"
              onPress={() => handleToggleHidden(r)}
            />
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  profileCard: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  reviewRow: { gap: Spacing.two },
});
