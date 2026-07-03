/**
 * Customer live tracking screen — read-only view.
 *
 * Loads the booking and subscribes to real-time provider location updates
 * via Supabase Realtime.  No mutations: the customer cannot change anything
 * from this screen.  Cleanup (unsubscribe) happens on unmount.
 *
 * Shows:
 *  - TrackingStatusBadge (status-derived pill + optional distance context)
 *  - TrackingMap (static-map image with provider + customer markers)
 *  - Distance + ETA text when both markers are known
 *  - Stale location warning when last update is > 30 s old
 *  - "Waiting…" placeholder when no provider location is available yet
 *  - "Chat with provider" shortcut to the chat screen
 */

import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getBookingById, type Booking } from '@/lib/bookings';
import {
  getProviderLocationForBooking,
  subscribeToProviderLocation,
  type ProviderLocation,
} from '@/lib/tracking';
import { haversineKm, formatDistanceKm, etaMinutes, formatEta } from '@/lib/geo';
import { TrackingMap } from '@/components/ui/tracking-map';
import { TrackingStatusBadge } from '@/components/ui/tracking-status-badge';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';

// ── Stale-location threshold ───────────────────────────────────────────────
const STALE_THRESHOLD_MS = 30_000; // 30 seconds

export default function CustomerTrackScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [location, setLocation] = useState<ProviderLocation | null>(null);

  // Drives the stale-label re-render every second when a location is present.
  const [tick, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load booking ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (id) {
      getBookingById(id).then((b) => {
        if (b) setBooking(b);
      });
    }
  }, [id]);

  // ── Subscribe to live provider location ───────────────────────────────────
  useEffect(() => {
    if (!id || !booking) return;

    // 1. Fetch last-known location immediately so the map isn't blank.
    getProviderLocationForBooking(id).then((loc) => {
      if (loc) setLocation(loc);
    });

    // 2. Subscribe to live updates.
    const unsub = subscribeToProviderLocation(id, (loc) => {
      setLocation(loc);
    });

    return () => {
      unsub();
    };
    // We only want this to run once when booking + id are both ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, booking?.id]);

  // ── Stale-label ticker ────────────────────────────────────────────────────
  // Re-render every second so the "last seen" caption stays fresh.
  useEffect(() => {
    if (location) {
      tickRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    } else {
      if (tickRef.current !== null) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    }
    return () => {
      if (tickRef.current !== null) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [location]);

  // ── Derived values ────────────────────────────────────────────────────────
  // Suppress the unused-variable lint warning for `tick` — it drives re-renders.
  void tick;

  const provider =
    location != null
      ? { latitude: location.latitude, longitude: location.longitude }
      : null;

  const customer =
    booking != null && booking.latitude != null && booking.longitude != null
      ? { latitude: booking.latitude, longitude: booking.longitude }
      : null;

  const dist =
    provider != null && customer != null
      ? haversineKm(provider, customer)
      : undefined;

  // ── Stale detection ───────────────────────────────────────────────────────
  const isStale =
    location != null &&
    Date.now() - new Date(location.updated_at).getTime() > STALE_THRESHOLD_MS;

  const lastSeenLabel = location
    ? new Date(location.updated_at).toLocaleTimeString()
    : null;

  // ── Loading guard ─────────────────────────────────────────────────────────
  if (!booking) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.center}>
          <Text variant="body" color="textSecondary">
            Loading…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Page title */}
        <Text variant="title" style={styles.pageTitle}>
          Track your provider
        </Text>

        {/* Status badge */}
        <View style={styles.badgeRow}>
          <TrackingStatusBadge status={booking.status} distanceKm={dist} />
        </View>

        {/* Map or "destination unavailable" message */}
        {customer ? (
          <TrackingMap
            provider={provider}
            customer={customer}
            updatedAt={location?.updated_at ?? null}
            distanceKm={dist ?? null}
          />
        ) : (
          <Text variant="body" color="textSecondary">
            Destination location unavailable.
          </Text>
        )}

        {/* Distance + ETA — only when both markers are known */}
        {provider != null && customer != null && dist != null ? (
          <View style={styles.etaRow}>
            <Text variant="body" color="text">
              {formatDistanceKm(dist)} away · ETA {formatEta(etaMinutes(dist))}
            </Text>
          </View>
        ) : null}

        {/* No location yet */}
        {location == null ? (
          <Text variant="body" color="textSecondary" style={styles.waiting}>
            Waiting for your provider&apos;s location…
          </Text>
        ) : null}

        {/* Stale warning */}
        {isStale && lastSeenLabel ? (
          <Text variant="caption" color="textSecondary" style={styles.stale}>
            Reconnecting… last seen {lastSeenLabel}.
          </Text>
        ) : null}

        {/* Chat shortcut */}
        <Button
          label="Chat with provider"
          variant="ghost"
          onPress={() => router.push(`/booking/chat/${id}`)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  pageTitle: {
    marginBottom: Spacing.one,
  },
  badgeRow: {
    flexDirection: 'row',
  },
  etaRow: {
    alignItems: 'center',
  },
  waiting: {
    textAlign: 'center',
  },
  stale: {
    textAlign: 'center',
  },
});
