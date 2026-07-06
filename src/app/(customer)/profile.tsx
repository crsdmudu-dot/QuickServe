/**
 * Customer Profile screen.
 *
 * Existing entries preserved:
 *   Wallet / Saved addresses / Notification settings / Sign out
 *
 * New additions (Slice 34 Task 5):
 *   - ProfileCompletionCard at the top (name/phone from profiles row; hasDefaultAddress from saved-addresses)
 *   - "Preferences" link → /(customer)/preferences
 *   - "Trust & Safety" link → /(customer)/trust
 */

import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { supabase } from '@/lib/supabase';
import { getMySavedAddresses } from '@/lib/saved-addresses';
import { computeCustomerProfileCompletion } from '@/constants/customer-profile';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import { ProfileCompletionCard } from '@/components/customer/profile-completion-card';

// ── Types ──────────────────────────────────────────────────────────────────────

type ProfileData = {
  full_name: string | null;
  phone: string | null;
} | null;

// ── Component ──────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const theme = useTheme();
  const { signOut, session } = useAuth();

  // Profile data for completion card — display-only, no mutation.
  const [profile, setProfile] = useState<ProfileData>(null);
  const [hasDefaultAddress, setHasDefaultAddress] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadProfileData() {
      try {
        const [profileResult, addresses] = await Promise.all([
          supabase
            .from('profiles')
            .select('full_name, phone')
            .eq('id', session!.user!.id)
            .maybeSingle(),
          getMySavedAddresses(),
        ]);

        if (cancelled) return;

        if (profileResult.data) {
          setProfile(profileResult.data as ProfileData);
        }
        setHasDefaultAddress(addresses.some((a) => a.is_default));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfileData();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const completion = computeCustomerProfileCompletion({
    profile,
    hasDefaultAddress,
  });

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SafeAreaView style={[styles.safe, { maxWidth: MaxContentWidth }]}>
        {/* ── Header ──────────────────────────────────────────────────── */}
        <Text variant="title">Profile</Text>
        <Text variant="body" color="textSecondary">
          You&apos;re signed in as a Customer.
        </Text>

        {/* ── Profile Completion Card ──────────────────────────────────── */}
        {loading ? (
          <View style={styles.skeletonGroup}>
            <Skeleton height={16} width="40%" />
            <Skeleton height={80} />
          </View>
        ) : (
          <ProfileCompletionCard completion={completion} />
        )}

        {/* ── Navigation entries ───────────────────────────────────────── */}
        <View style={styles.entryGroup}>
          <Button
            label="Wallet"
            variant="secondary"
            onPress={() => router.push('/wallet')}
          />
          <Button
            label="Saved addresses"
            variant="secondary"
            onPress={() => router.push('/saved-addresses')}
          />
          <Button
            label="Notification settings"
            variant="secondary"
            onPress={() => router.push('/notification-settings')}
          />
          <Button
            label="Preferences"
            variant="secondary"
            onPress={() => router.push('/(customer)/preferences')}
          />
          <Button
            label="Trust & Safety"
            variant="secondary"
            onPress={() => router.push('/(customer)/trust')}
          />
          <Button label="Sign out / Switch role" onPress={signOut} />
        </View>
      </SafeAreaView>
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    paddingBottom: BottomTabInset + Spacing.five,
  },
  safe: {
    width: '100%',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.four,
  },
  skeletonGroup: {
    gap: Spacing.two,
  },
  entryGroup: {
    gap: Spacing.three,
  },
});
