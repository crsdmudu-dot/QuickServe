/**
 * Admin booking detail screen — lets an admin view a booking's summary,
 * change its status, assign a provider, and add internal notes.
 */

import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SERVICES } from '@/constants/services';
import { ALL_STATUSES, STATUS_LABELS, type BookingStatus } from '@/constants/booking-status';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getBookingById,
  updateBookingStatus,
  assignProvider,
  updateAdminNotes,
  type Booking,
} from '@/lib/bookings';
import { getApprovedProviders, type ProviderProfile } from '@/lib/providers';
import { BookingSummaryCard } from '@/components/ui/booking-summary-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

export default function AdminBookingDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState('');

  // Assign-provider form state
  const [providerName, setProviderName] = useState('');
  const [providerPhone, setProviderPhone] = useState('');

  // Assign-provider mode toggle: 'manual' = type name/phone; 'inApp' = pick from approved providers
  const [assignMode, setAssignMode] = useState<'manual' | 'inApp'>('manual');

  // Approved providers loaded for in-app assignment mode
  const [approvedProviders, setApprovedProviders] = useState<ProviderProfile[]>([]);

  // Admin notes form state
  const [adminNotes, setAdminNotes] = useState('');

  useEffect(() => {
    if (id) {
      getBookingById(id).then((b) => {
        if (b) {
          setBooking(b);
          setAdminNotes(b.admin_notes ?? '');
        }
      });
    }
    // Load approved providers on mount so the in-app list is ready immediately
    getApprovedProviders().then(setApprovedProviders);
  }, [id]);

  async function handleStatusPress(status: BookingStatus) {
    if (!id) return;
    setError('');
    const result = await updateBookingStatus(id, status);
    if (result.ok) {
      setBooking((prev) => (prev ? { ...prev, status } : prev));
    } else {
      setError(result.error ?? 'Could not update status.');
    }
  }

  async function handleAssign() {
    if (!id) return;
    setError('');
    const result = await assignProvider(id, { name: providerName, phone: providerPhone });
    if (result.ok) {
      setBooking((prev) =>
        prev
          ? {
              ...prev,
              status: 'provider_assigned',
              assigned_provider_name: providerName,
              assigned_provider_phone: providerPhone,
            }
          : prev,
      );
    } else {
      setError(result.error ?? 'Could not assign provider.');
    }
  }

  // In-app mode: called when admin taps a provider card to assign them
  async function handleAssignInApp(p: ProviderProfile) {
    if (!id) return;
    setError('');
    const result = await assignProvider(id, {
      providerId: p.id,
      name: p.full_name ?? '',
      phone: p.phone ?? '',
    });
    if (result.ok) {
      setBooking((prev) =>
        prev
          ? {
              ...prev,
              status: 'provider_assigned',
              assigned_provider_id: p.id,
              assigned_provider_name: p.full_name ?? '',
              assigned_provider_phone: p.phone ?? '',
            }
          : prev,
      );
    } else {
      setError(result.error ?? 'Could not assign provider.');
    }
  }

  async function handleSaveNotes() {
    if (!id) return;
    setError('');
    const result = await updateAdminNotes(id, adminNotes);
    if (!result.ok) {
      setError(result.error ?? 'Could not save notes.');
    }
  }

  if (!booking) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <Text variant="body" color="textSecondary">
          Loading…
        </Text>
      </SafeAreaView>
    );
  }

  const service = SERVICES.find((s) => s.id === booking.service_id);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="title">Booking Detail</Text>

        {/* Summary */}
        <BookingSummaryCard
          serviceTitle={service?.title ?? booking.service_id}
          address={booking.address}
          scheduledFor={booking.scheduled_for}
          notes={booking.notes ?? ''}
        />

        {/* Current status badge */}
        <StatusBadge status={booking.status} />

        {error ? (
          <Text variant="caption" color="error">
            {error}
          </Text>
        ) : null}

        {/* Status picker */}
        <Text variant="heading">Update Status</Text>
        <View style={styles.statusRow}>
          {ALL_STATUSES.map((s) => (
            <Button
              key={s}
              label={STATUS_LABELS[s]}
              variant={booking.status === s ? 'secondary' : 'ghost'}
              onPress={() => handleStatusPress(s)}
            />
          ))}
        </View>

        {/* Assign provider */}
        <Text variant="heading">Assign Provider</Text>

        {/* Mode toggle: Manual | In-app */}
        <View style={styles.toggleRow}>
          <Button
            label="Manual"
            variant={assignMode === 'manual' ? 'secondary' : 'ghost'}
            onPress={() => setAssignMode('manual')}
          />
          <Button
            label="In-app"
            variant={assignMode === 'inApp' ? 'secondary' : 'ghost'}
            onPress={() => setAssignMode('inApp')}
          />
        </View>

        {/* Manual mode: type name + phone */}
        {assignMode === 'manual' && (
          <>
            <Input
              label="Provider name"
              value={providerName}
              onChangeText={setProviderName}
              placeholder="Full name"
            />
            <Input
              label="Provider phone"
              value={providerPhone}
              onChangeText={setProviderPhone}
              placeholder="Phone number"
              keyboardType="phone-pad"
            />
            <Button label="Assign" onPress={handleAssign} />
          </>
        )}

        {/* In-app mode: pick from approved providers */}
        {assignMode === 'inApp' && (
          <>
            {approvedProviders.length === 0 && (
              <Text variant="caption" color="textSecondary">
                No approved providers available.
              </Text>
            )}
            {approvedProviders.map((p) => (
              <Card key={p.id} onPress={() => handleAssignInApp(p)} style={styles.providerCard}>
                <Text variant="heading">{p.full_name ?? 'Unknown'}</Text>
                <Text variant="caption" color="textSecondary">{p.phone ?? '—'}</Text>
              </Card>
            ))}
          </>
        )}

        {/* Admin notes */}
        <Text variant="heading">Admin Notes</Text>
        <Input
          label="Notes"
          value={adminNotes}
          onChangeText={setAdminNotes}
          placeholder="Internal notes…"
          multiline
        />
        <Button label="Save notes" onPress={handleSaveNotes} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  toggleRow: { flexDirection: 'row', gap: Spacing.two },
  providerCard: { gap: Spacing.one },
});
