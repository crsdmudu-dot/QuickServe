/**
 * Provider home screen — shows different states based on the provider's
 * approval status: pending, rejected, or approved (shows assigned jobs).
 */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SERVICES } from '@/constants/services';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { getProviderJobs, type Booking } from '@/lib/bookings';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';

export default function ProviderHomeScreen() {
  const theme = useTheme();
  const { approvalStatus, signOut } = useAuth();

  // null = loading; [] = loaded but empty; [...] = loaded with data
  const [jobs, setJobs] = useState<Booking[] | null>(null);

  useEffect(() => {
    // Only load jobs when the provider is approved.
    if (approvalStatus === 'approved') {
      getProviderJobs().then(setJobs);
    }
  }, [approvalStatus]);

  // ── Not yet approved ───────────────────────────────────────────────────────

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

  // ── Approved: show jobs list ───────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      {/* Header row with sign-out */}
      <View style={styles.header}>
        <Text variant="title">My Jobs</Text>
        <Button label="Sign out" variant="ghost" onPress={signOut} />
      </View>

      {/* Loading skeleton — shown until the first fetch resolves */}
      {jobs === null ? (
        <View style={styles.skeletons}>
          <Skeleton height={88} radius={16} />
          <Skeleton height={88} radius={16} />
          <Skeleton height={88} radius={16} />
        </View>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No jobs yet"
          message="Jobs assigned to you will appear here."
        />
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(j) => j.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: j }) => {
            const service = SERVICES.find((s) => s.id === j.service_id);
            return (
              <Card onPress={() => router.push(`/provider/job/${j.id}`)} style={styles.card} elevation="e1">
                <Text variant="heading">{service?.title ?? j.service_id}</Text>
                <View style={styles.row}>
                  <StatusBadge status={j.status} />
                </View>
                <Text variant="caption" color="textSecondary">
                  {new Date(j.scheduled_for).toLocaleString()}
                </Text>
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  list: { padding: Spacing.four, gap: Spacing.three },
  card: { gap: Spacing.two },
  row: { flexDirection: 'row' },
  skeletons: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
});
