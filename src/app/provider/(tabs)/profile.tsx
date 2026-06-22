/**
 * Provider My Profile screen — lets approved providers view and edit their
 * public profile: bio, skills, years of experience, photo URL, and availability.
 */

import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { getProviderProfile, updateMyProviderProfile, type ProviderProfile } from '@/lib/providers';
import { Avatar } from '@/components/ui/avatar';
import { VerifiedBadge } from '@/components/ui/verified-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';

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

  useEffect(() => {
    // Load profile only when approved and session exists.
    if (approvalStatus === 'approved' && session?.user?.id) {
      getProviderProfile(session.user.id).then((p) => {
        // Single setState keeps all updates in one render, avoiding act() warnings.
        if (p) setState(fromProfile(p));
      });
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
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Avatar + name row */}
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

        {/* Editable fields */}
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

          <Button label="Sign out" variant="ghost" onPress={signOut} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.four, gap: Spacing.three },
  hero: { alignItems: 'center', gap: Spacing.two, paddingBottom: Spacing.three },
  fields: { gap: Spacing.three },
});
