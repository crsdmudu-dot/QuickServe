/**
 * TrackingMap — displays a static map image with the provider and customer
 * markers, throttled so we don't hammer the Edge Function on every position
 * update. Falls back to a placeholder card when the provider location is
 * unavailable or the map URL couldn't be fetched.
 *
 * Presentation only — no permissions, no GPS, no network calls except
 * getTrackingMapUrl. Data is supplied by the parent via props.
 */

import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text as RNText, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getTrackingMapUrl, type LatLng } from '@/lib/tracking';
import { etaMinutes, formatDistanceKm, formatEta, haversineKm } from '@/lib/geo';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

// ── Props ──────────────────────────────────────────────────────────────────

export type TrackingMapProps = {
  /** Live provider location. null until the first GPS update arrives. */
  provider: LatLng | null;
  /** Booking destination (customer location). Always required. */
  customer: LatLng;
  /** ISO timestamp of the last provider location update. */
  updatedAt?: string | null;
  /**
   * Optional precomputed distance in km between provider and customer.
   * When omitted the component computes it via haversineKm.
   */
  distanceKm?: number | null;
  /**
   * Minimum milliseconds between static-map fetch calls.
   * Default: 10 000 ms (10 seconds).
   */
  refreshMs?: number;
};

// ── Component ──────────────────────────────────────────────────────────────

const DEFAULT_REFRESH_MS = 10_000;
const MAP_HEIGHT = 200;

export function TrackingMap({
  provider,
  customer,
  updatedAt,
  distanceKm,
  refreshMs = DEFAULT_REFRESH_MS,
}: TrackingMapProps) {
  const theme = useTheme();

  // The fetched map image URL (null = not yet fetched or failed).
  const [mapUrl, setMapUrl] = useState<string | null>(null);

  // Timestamp of the last successful fetch call (not the last success).
  const lastFetchAt = useRef<number>(0);
  // Pending setTimeout id for the throttle timer.
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Throttled fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    // Clear any pending timer from a previous render cycle.
    if (throttleTimer.current !== null) {
      clearTimeout(throttleTimer.current);
      throttleTimer.current = null;
    }

    // Nothing to fetch without a provider location.
    if (!provider) {
      setMapUrl(null);
      return;
    }

    const now = Date.now();
    const msSinceLast = now - lastFetchAt.current;
    const delay = Math.max(0, refreshMs - msSinceLast);

    function doFetch() {
      if (!provider) return; // guard against race — provider could be cleared
      lastFetchAt.current = Date.now();
      getTrackingMapUrl(provider, customer).then((url) => {
        setMapUrl(url);
      });
    }

    if (delay === 0) {
      // Enough time has passed — fetch immediately.
      doFetch();
    } else {
      // Schedule the fetch for when the throttle window expires.
      throttleTimer.current = setTimeout(doFetch, delay);
    }

    return () => {
      if (throttleTimer.current !== null) {
        clearTimeout(throttleTimer.current);
        throttleTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, customer, refreshMs]);

  // ── Distance & ETA ────────────────────────────────────────────────────────
  const effectiveDistanceKm: number | null = (() => {
    if (!provider) return null;
    if (distanceKm != null) return distanceKm;
    return haversineKm(provider, customer);
  })();

  const distanceLabel =
    effectiveDistanceKm != null ? formatDistanceKm(effectiveDistanceKm) : null;
  const etaLabel =
    effectiveDistanceKm != null ? formatEta(etaMinutes(effectiveDistanceKm)) : null;

  const updatedAtLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString()
    : null;

  // ── Render: placeholder ───────────────────────────────────────────────────
  if (!provider || !mapUrl) {
    const placeholderText = !provider
      ? 'Waiting for provider location…'
      : 'Live map unavailable';

    return (
      <Card style={[styles.card, { borderColor: theme.border }]}>
        <View
          style={[styles.mapPlaceholder, { backgroundColor: theme.neutral100 }]}>
          <RNText style={styles.mapIcon}>🗺️</RNText>
          <Text variant="label" color="textSecondary" style={styles.center}>
            {placeholderText}
          </Text>
        </View>
        {/* No distance/ETA when provider is unknown */}
      </Card>
    );
  }

  // ── Render: map ───────────────────────────────────────────────────────────
  return (
    <Card style={[styles.card, { borderColor: theme.border }]}>
      {/* Static map image */}
      <Image
        testID="tracking-map-image"
        source={{ uri: mapUrl }}
        style={styles.map}
        resizeMode="cover"
      />

      {/* Caption row: distance + ETA */}
      {distanceLabel && etaLabel ? (
        <View style={styles.captionRow}>
          <Text variant="caption" color="textSecondary">
            {distanceLabel} · {etaLabel}
          </Text>
          {updatedAtLabel ? (
            <Text variant="caption" color="textTertiary">
              Updated {updatedAtLabel}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Legend */}
      <Text variant="caption" color="textTertiary" style={styles.legend}>
        Provider (P) · You (C)
      </Text>
    </Card>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    padding: 0,
    overflow: 'hidden',
  },
  map: {
    width: '100%',
    height: MAP_HEIGHT,
  },
  mapPlaceholder: {
    height: MAP_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  mapIcon: {
    fontSize: 36,
  },
  captionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  legend: {
    textAlign: 'center',
    paddingBottom: Spacing.two,
  },
  center: {
    textAlign: 'center',
  },
});
