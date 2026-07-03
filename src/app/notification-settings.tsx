/**
 * notification-settings.tsx — Manage push notification preferences.
 *
 * A pushable Stack screen (URL /notification-settings) reachable from the
 * customer, provider, and admin profile screens. Each preference key maps to
 * one RN Switch row. Changes are applied optimistically; on failure the switch
 * reverts and an error message is shown.
 *
 * These settings control PUSH notifications only — the in-app inbox always
 * records every update regardless of these toggles.
 */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/notifications';

// ── Toggle row definitions ─────────────────────────────────────────────────────

type PrefKey = keyof NotificationPreferences;

const ROWS: { label: string; key: PrefKey }[] = [
  { label: 'Push notifications', key: 'push_enabled' },
  { label: 'Chat messages', key: 'chat_enabled' },
  { label: 'Booking updates', key: 'booking_enabled' },
  { label: 'Payments', key: 'payment_enabled' },
  { label: 'Marketing', key: 'marketing_enabled' },
];

// ── Component ──────────────────────────────────────────────────────────────────

export default function NotificationSettingsScreen() {
  const theme = useTheme();

  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── Load preferences on mount ────────────────────────────────────────────────

  useEffect(() => {
    getNotificationPreferences()
      .then(setPrefs)
      .catch(() => setError('Could not load preferences.'))
      .finally(() => setLoading(false));
  }, []);

  // ── Toggle handler (optimistic) ──────────────────────────────────────────────

  async function onToggle(key: PrefKey, value: boolean) {
    // Optimistically apply the new value.
    setPrefs((p) => ({ ...p, [key]: value }));
    setError('');
    const res = await updateNotificationPreferences({ [key]: value });
    if (!res.ok) {
      // Revert on failure.
      setPrefs((p) => ({ ...p, [key]: !value }));
      setError('Could not update preferences.');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Back button ──────────────────────────────────────────────── */}
        <Button label="← Back" variant="ghost" onPress={() => router.back()} />

        {/* ── Title ────────────────────────────────────────────────────── */}
        <Text variant="title" style={styles.title}>
          Notification settings
        </Text>

        {/* ── Caption ──────────────────────────────────────────────────── */}
        <Text variant="caption" color="textSecondary">
          These settings control push notifications only. Your in-app inbox always records every
          update.
        </Text>

        {/* ── Loading skeleton ──────────────────────────────────────────── */}
        {loading && (
          <View style={styles.skeletons}>
            <Skeleton height={52} />
            <Skeleton height={52} />
            <Skeleton height={52} />
          </View>
        )}

        {/* ── Toggle rows ───────────────────────────────────────────────── */}
        {!loading && (
          <View style={styles.rows}>
            {ROWS.map(({ label, key }) => (
              <View
                key={key}
                style={[styles.row, { borderBottomColor: theme.border }]}
              >
                <Text variant="body">{label}</Text>
                <Switch
                  testID={'switch-' + key}
                  value={prefs[key]}
                  onValueChange={(value) => onToggle(key, value)}
                  thumbColor={prefs[key] ? theme.primary : theme.neutral400}
                  trackColor={{ false: theme.backgroundElement, true: theme.primaryTint }}
                />
              </View>
            ))}
          </View>
        )}

        {/* ── Error message ─────────────────────────────────────────────── */}
        {error ? (
          <Text variant="caption" color="error">
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    marginBottom: Spacing.one,
  },
  skeletons: {
    gap: Spacing.three,
  },
  rows: {
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
