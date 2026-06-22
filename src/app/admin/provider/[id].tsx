/**
 * Admin provider profile detail screen — view, edit, and verify a provider.
 * Admins can update bio, years_experience, skills, profile_photo_url,
 * toggle availability, and grant/revoke the Verified badge.
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
import { Avatar } from '@/components/ui/avatar';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

  // Load provider on mount (or whenever id changes)
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
    }
  }, [id]);

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
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="title">Provider Profile</Text>

        {/* Avatar + name + verified badge */}
        <Card style={styles.profileCard}>
          <Avatar name={profile.full_name ?? 'Unknown'} photoUrl={profile.profile_photo_url} />
          <Text variant="heading">{profile.full_name ?? 'Unknown'}</Text>
          {profile.is_verified && <VerifiedBadge />}
          {/* Read-only completed jobs count */}
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

        {/* Editable fields */}
        <Text variant="heading">Edit Details</Text>

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

        {/* Availability toggle */}
        <Text variant="heading">Availability</Text>
        <Button
          label={
            profile.availability_status === 'available'
              ? 'Set Unavailable'
              : 'Set Available'
          }
          variant="secondary"
          onPress={handleAvailabilityToggle}
        />

        {/* Verify toggle */}
        <Text variant="heading">Verification</Text>
        <Button
          label={profile.is_verified ? 'Unverify' : 'Verify'}
          variant={profile.is_verified ? 'ghost' : 'primary'}
          onPress={handleVerifyToggle}
        />

        {/* Save all editable fields */}
        <Button label="Save" onPress={handleSave} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  profileCard: { gap: Spacing.two, alignItems: 'flex-start' },
});
