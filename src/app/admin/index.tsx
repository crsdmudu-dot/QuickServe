/**
 * Admin screen — lists all bookings and pending providers.
 *
 * A Bookings | Providers toggle switches between the two lists.  Booking rows
 * navigate to the detail screen (Task 4).  Provider rows have Approve/Reject
 * buttons that call setProviderApproval and remove the row on success.
 */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SERVICES } from '@/constants/services';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { getAllBookings, type Booking } from '@/lib/bookings';
import { getPendingProviders, setProviderApproval, type ProviderProfile } from '@/lib/providers';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/text';

type Tab = 'bookings' | 'providers';

export default function AdminScreen() {
  const theme = useTheme();
  const { signOut } = useAuth();

  const [tab, setTab] = useState<Tab>('bookings');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [providers, setProviders] = useState<ProviderProfile[]>([]);

  useEffect(() => {
    getAllBookings().then(setBookings);
    getPendingProviders().then(setProviders);
  }, []);

  async function handleApprove(id: string) {
    const result = await setProviderApproval(id, 'approved');
    if (result.ok) {
      setProviders((prev) => prev.filter((p) => p.id !== id));
    }
  }

  async function handleReject(id: string) {
    const result = await setProviderApproval(id, 'rejected');
    if (result.ok) {
      setProviders((prev) => prev.filter((p) => p.id !== id));
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      {/* Header row with sign-out */}
      <View style={styles.header}>
        <Text variant="title">Admin</Text>
        <Button label="Payments" variant="ghost" onPress={() => router.push('/admin/payments')} />
        <Button label="Sign out" variant="ghost" onPress={signOut} />
      </View>

      {/* Tab toggle */}
      <View style={styles.tabs}>
        <Button
          label="Bookings"
          variant={tab === 'bookings' ? 'secondary' : 'ghost'}
          onPress={() => setTab('bookings')}
        />
        <Button
          label="Providers"
          variant={tab === 'providers' ? 'secondary' : 'ghost'}
          onPress={() => setTab('providers')}
        />
      </View>

      {/* Bookings list */}
      {tab === 'bookings' && (
        bookings.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No bookings yet"
            message="Bookings will appear here once customers place them."
          />
        ) : (
          <FlatList
            data={bookings}
            keyExtractor={(b) => b.id}
            contentContainerStyle={styles.list}
            renderItem={({ item: b }) => {
              const service = SERVICES.find((s) => s.id === b.service_id);
              return (
                <Card onPress={() => router.push(`/admin/booking/${b.id}`)} style={styles.card}>
                  <Text variant="heading">{service?.title ?? b.service_id}</Text>
                  <StatusBadge status={b.status} />
                  <Text variant="caption" color="textSecondary">
                    {new Date(b.scheduled_for).toLocaleString()}
                  </Text>
                </Card>
              );
            }}
          />
        )
      )}

      {/* Providers list */}
      {tab === 'providers' && (
        providers.length === 0 ? (
          <EmptyState
            icon="✅"
            title="No pending providers"
            message="All provider applications have been reviewed."
          />
        ) : (
          <FlatList
            data={providers}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.list}
            renderItem={({ item: p }) => (
              <Card onPress={() => router.push(`/admin/provider/${p.id}`)} style={styles.card}>
                <Text variant="heading">{p.full_name ?? 'Unknown'}</Text>
                <Text variant="caption" color="textSecondary">{p.phone ?? '—'}</Text>
                <View style={styles.actions}>
                  <Button label="Approve" onPress={() => handleApprove(p.id)} />
                  <Button label="Reject" variant="ghost" onPress={() => handleReject(p.id)} />
                </View>
              </Card>
            )}
          />
        )
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
  },
  tabs: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  list: { padding: Spacing.four, gap: Spacing.three },
  card: { gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
});
