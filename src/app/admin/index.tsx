/**
 * Admin screen — lists all bookings and pending providers.
 *
 * A Bookings | Providers toggle switches between the two lists.  Booking rows
 * navigate to the detail screen (Task 4).  Provider rows have Approve/Reject
 * buttons that call setProviderApproval and remove the row on success.
 *
 * Slice 24 (Task 7): added Today/Tomorrow/Upcoming/Scheduled filter row on the
 * Bookings tab.  Each booking card now shows describeSchedule() instead of
 * toLocaleString(), and a recurrence pill when recurrence !== 'one_time'.
 */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SERVICES } from '@/constants/services';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { getAllBookings, type Booking } from '@/lib/bookings';
import { getPendingProviders, setProviderApproval, type ProviderProfile } from '@/lib/providers';
import {
  describeSchedule,
  recurrenceLabel,
  isToday,
  isTomorrow,
  isUpcoming,
  isScheduledType,
} from '@/lib/scheduling';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';

type Tab = 'bookings' | 'providers';

/** Filter options for the Bookings tab. */
type BookingFilter = 'all' | 'today' | 'tomorrow' | 'upcoming' | 'scheduled';

/** Filter labels shown in the filter row. */
const FILTER_LABELS: { key: BookingFilter; label: string }[] = [
  { key: 'all',       label: 'All'       },
  { key: 'today',     label: 'Today'     },
  { key: 'tomorrow',  label: 'Tomorrow'  },
  { key: 'upcoming',  label: 'Upcoming'  },
  { key: 'scheduled', label: 'Scheduled' },
];

/** Returns true when the booking passes the active filter. */
function matchesFilter(b: Booking, filter: BookingFilter): boolean {
  switch (filter) {
    case 'today':     return isToday(b.scheduled_for);
    case 'tomorrow':  return isTomorrow(b.scheduled_for);
    case 'upcoming':  return isUpcoming(b.scheduled_for);
    case 'scheduled': return isScheduledType(b.scheduling_type);
    default:          return true; // 'all' — no filter
  }
}

export default function AdminScreen() {
  const theme = useTheme();
  const { signOut } = useAuth();

  const [tab, setTab] = useState<Tab>('bookings');
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [providers, setProviders] = useState<ProviderProfile[] | null>(null);
  const [bookingFilter, setBookingFilter] = useState<BookingFilter>('all');

  useEffect(() => {
    getAllBookings().then(setBookings);
    getPendingProviders().then(setProviders);
  }, []);

  async function handleApprove(id: string) {
    const result = await setProviderApproval(id, 'approved');
    if (result.ok) {
      setProviders((prev) => (prev ?? []).filter((p) => p.id !== id));
    }
  }

  async function handleReject(id: string) {
    const result = await setProviderApproval(id, 'rejected');
    if (result.ok) {
      setProviders((prev) => (prev ?? []).filter((p) => p.id !== id));
    }
  }

  const isLoading = bookings === null || providers === null;

  /** Bookings after applying the active filter. */
  const shownBookings = (bookings ?? []).filter((b) => matchesFilter(b, bookingFilter));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      {/* Header row — title + Payments nav + sign-out */}
      <View style={styles.header}>
        <Text variant="title">Admin</Text>
        <View style={styles.headerActions}>
          <Button label="Payments" variant="ghost" onPress={() => router.push('/admin/payments')} />
          <Button label="Notifications" variant="ghost" onPress={() => router.push('/notification-settings')} />
          <Button label="Sign out" variant="ghost" onPress={signOut} />
        </View>
      </View>

      {/* Segmented tab toggle */}
      <View style={[styles.segmentTrack, { backgroundColor: theme.backgroundElement }]}>
        <View
          style={[
            styles.segmentThumb,
            {
              backgroundColor: theme.background,
              left: tab === 'bookings' ? 4 : '50%',
            },
          ]}
        />
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

      {/* Loading skeletons */}
      {isLoading ? (
        <View style={styles.skeletons}>
          <Skeleton height={88} radius={16} />
          <Skeleton height={88} radius={16} />
          <Skeleton height={72} radius={16} />
        </View>
      ) : tab === 'bookings' ? (
        /* Bookings list */
        <>
          {/* Filter row — only shown on the Bookings tab */}
          <View style={styles.filterRow}>
            {FILTER_LABELS.map(({ key, label }) => (
              <Button
                key={key}
                label={label}
                variant={bookingFilter === key ? 'secondary' : 'ghost'}
                onPress={() => setBookingFilter(key)}
              />
            ))}
          </View>

          {shownBookings.length === 0 ? (
            <EmptyState
              icon="📋"
              title="No bookings"
              message="No bookings match the selected filter."
            />
          ) : (
            <FlatList
              data={shownBookings}
              keyExtractor={(b) => b.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: b }) => {
                const service = SERVICES.find((s) => s.id === b.service_id);
                const showRecurrence = b.recurrence && b.recurrence !== 'one_time';
                return (
                  <Card onPress={() => router.push(`/admin/booking/${b.id}`)} style={styles.card} elevation="e1">
                    <Text variant="heading">{service?.title ?? b.service_id}</Text>
                    <View style={styles.row}>
                      <StatusBadge status={b.status} />
                      {showRecurrence && (
                        <View style={[styles.pill, { backgroundColor: theme.backgroundElement }]}>
                          <Text variant="caption" color="textSecondary">
                            {recurrenceLabel(b.recurrence)}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text variant="caption" color="textSecondary">
                      {describeSchedule(b)}
                    </Text>
                  </Card>
                );
              }}
            />
          )}
        </>
      ) : (
        /* Providers list */
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
            showsVerticalScrollIndicator={false}
            renderItem={({ item: p }) => (
              <Card onPress={() => router.push(`/admin/provider/${p.id}`)} style={styles.card} elevation="e1">
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
    paddingBottom: Spacing.two,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  segmentTrack: {
    flexDirection: 'row',
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    borderRadius: Radii.pill,
    padding: 4,
    gap: 0,
  },
  /** Decorative thumb — rendered behind the buttons for visual context only. */
  segmentThumb: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: '48%',
    borderRadius: Radii.pill,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.two,
    gap: Spacing.one,
  },
  pill: {
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    marginLeft: Spacing.one,
  },
  skeletons: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  list: { padding: Spacing.four, gap: Spacing.three },
  card: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center' },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
});
