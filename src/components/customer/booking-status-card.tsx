// booking-status-card.tsx — Pressable card showing booking status, service title, and date.
// Reuses Card + StatusBadge for consistent visual language.
// Status-variant accenting: completed (success), cancelled (error), pending (warning),
// all others use the standard card style.

import { StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type BookingStatus } from '@/constants/booking-status';
import { SERVICES } from '@/constants/services';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { StatusBadge } from '@/components/ui/status-badge';

// ── Props ──────────────────────────────────────────────────────────────────────

export type BookingStatusCardProps = {
  booking: {
    id: string;
    service_id?: string;
    status: string;
    created_at?: string;
    scheduled_for?: string;
  };
  onPress?: () => void;
};

// ── Component ──────────────────────────────────────────────────────────────────

export function BookingStatusCard({ booking, onPress }: BookingStatusCardProps) {
  const theme = useTheme();

  // Resolve a human-readable service title (fall back to service_id or "Booking")
  const service = booking.service_id
    ? SERVICES.find((s) => s.id === booking.service_id)
    : undefined;
  const serviceTitle = service?.title ?? booking.service_id ?? 'Booking';
  const serviceIcon  = service?.icon ?? '📋';

  // Format date — prefer scheduled_for, fallback to created_at
  const rawDate = booking.scheduled_for ?? booking.created_at;
  const dateLabel = rawDate
    ? new Date(rawDate).toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : null;

  // Status-variant accent colour on the left edge
  const accentColor =
    booking.status === 'completed'
      ? theme.success
      : booking.status === 'cancelled'
        ? theme.error
        : booking.status === 'pending'
          ? theme.warning
          : theme.primary;

  return (
    <Card elevation="e1" onPress={onPress}>
      <View style={styles.content}>
        {/* Left accent stripe */}
        <View style={[styles.accent, { backgroundColor: accentColor }]} />

        {/* Main content */}
        <View style={styles.body}>
          {/* Service title row */}
          <View style={styles.titleRow}>
            <Text style={styles.serviceIcon}>{serviceIcon}</Text>
            <Text variant="label" weight="semibold" style={styles.serviceTitle}>
              {serviceTitle}
            </Text>
          </View>

          {/* Status badge */}
          <StatusBadge status={booking.status as BookingStatus} />

          {/* Date */}
          {dateLabel && (
            <Text variant="caption" color="textSecondary">
              {dateLabel}
            </Text>
          )}
        </View>
      </View>
    </Card>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  accent: {
    width: 4,
    borderRadius: Radii.pill,
    minHeight: 40,
  },
  body: {
    flex: 1,
    gap: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  serviceIcon: {
    fontSize: 18,
    lineHeight: 22,
  },
  serviceTitle: {
    flex: 1,
  },
});
