/**
 * AdminLiveLocation — read-only live-location section for admin booking detail screens.
 *
 * Loads the last-known provider location on mount and subscribes to real-time
 * updates via Supabase Realtime.  Admin can ONLY view — no write calls are made.
 *
 * Renders only when `booking.status` is `on_the_way` or `in_progress`.
 * Shows a graceful "No live location yet." empty state when no location is available.
 *
 * Used by both:
 *   - src/app/admin/booking/[id].tsx       (mobile admin)
 *   - src/app/(admin-web)/bookings/[id].tsx (web admin)
 */

import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { type Booking } from '@/lib/bookings';
import {
  getProviderLocationForBooking,
  subscribeToProviderLocation,
  type ProviderLocation,
} from '@/lib/tracking';
import { haversineKm, formatDistanceKm, etaMinutes, formatEta } from '@/lib/geo';
import { TrackingMap } from '@/components/ui/tracking-map';
import { TrackingStatusBadge } from '@/components/ui/tracking-status-badge';
import { Text } from '@/components/ui/text';

// ── Types ──────────────────────────────────────────────────────────────────

export type AdminLiveLocationProps = {
  /** The booking to display location for. */
  booking: Booking;
};

// ── Constants ──────────────────────────────────────────────────────────────

/** Only show the section when the booking is actively moving. */
const ACTIVE_STATUSES = new Set(['on_the_way', 'in_progress'] as const);

// ── Component ──────────────────────────────────────────────────────────────

export function AdminLiveLocation({ booking }: AdminLiveLocationProps) {
  const [location, setLocation] = useState<ProviderLocation | null>(null);

  // ── Load + subscribe on mount (only for active statuses) ──────────────────
  useEffect(() => {
    if (!ACTIVE_STATUSES.has(booking.status as 'on_the_way' | 'in_progress')) return;
    const bookingId = booking.id;

    // 1. Fetch last-known location immediately so the UI isn't blank.
    getProviderLocationForBooking(bookingId).then((loc) => {
      setLocation(loc);
    });

    // 2. Subscribe to live real-time updates.
    const unsub = subscribeToProviderLocation(bookingId, (loc) => {
      setLocation(loc);
    });

    // 3. Cleanup subscription on unmount or when booking changes.
    return () => {
      unsub();
    };
  }, [booking.id, booking.status]);

  // Not an active booking — render nothing.
  if (!ACTIVE_STATUSES.has(booking.status as 'on_the_way' | 'in_progress')) {
    return null;
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const provider =
    location != null
      ? { latitude: location.latitude, longitude: location.longitude }
      : null;

  const customer =
    booking.latitude != null && booking.longitude != null
      ? { latitude: booking.latitude, longitude: booking.longitude }
      : null;

  const dist =
    provider != null && customer != null
      ? haversineKm(provider, customer)
      : undefined;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View testID="admin-live-location">
      {/* Status pill */}
      <TrackingStatusBadge status={booking.status} distanceKm={dist} />

      {/* Map — only when destination (customer) coords are available */}
      {customer != null ? (
        <TrackingMap
          provider={provider}
          customer={customer}
          updatedAt={location?.updated_at ?? null}
          distanceKm={dist ?? null}
        />
      ) : null}

      {/* Distance + ETA when both markers are known */}
      {provider != null && customer != null && dist != null ? (
        <Text variant="body" color="text">
          {formatDistanceKm(dist)} away · ETA {formatEta(etaMinutes(dist))}
        </Text>
      ) : null}

      {/* Last-known coords + time caption */}
      {location != null ? (
        <Text variant="caption" color="textSecondary" testID="admin-last-known">
          {`Last known: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} · ${new Date(location.updated_at).toLocaleTimeString()}`}
        </Text>
      ) : (
        /* Graceful empty state */
        <Text variant="caption" color="textSecondary" testID="admin-no-location">
          No live location yet.
        </Text>
      )}
    </View>
  );
}
