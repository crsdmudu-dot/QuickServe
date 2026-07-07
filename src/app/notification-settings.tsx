/**
 * notification-settings.tsx — Manage notification preferences.
 *
 * A pushable Stack screen (URL /notification-settings) reachable from the
 * customer, provider, and admin profile screens.
 *
 * Groups:
 *   Updates:   Booking updates, Payments, Quality, System (functional toggles)
 *   Channels:  Push notifications (functional), Email (future-ready/disabled),
 *              SMS (future-ready/disabled)
 *
 * Email and SMS are shown as DISABLED "coming soon" placeholders — they do
 * NOT trigger any delivery and do NOT write to the DB.
 *
 * IMPORTANT: These preferences do NOT suppress in-app notification history.
 * Every notification is always saved to the durable in-app inbox regardless
 * of these settings. Toggles only affect push, email, and SMS delivery.
 *
 * Changes applied optimistically; on failure the switch reverts and an error
 * message is shown.
 */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { NOTIFICATION_HISTORY_NOTE } from '@/constants/notifications';
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

/**
 * Functional toggles — read/write via updateNotificationPreferences.
 * Grouped by category.
 */
const FUNCTIONAL_ROWS: { label: string; key: PrefKey; description?: string }[] = [
  { label: 'Booking updates',    key: 'booking_enabled',  description: 'Status changes, assignments, and reminders.' },
  { label: 'Payments',           key: 'payment_enabled',  description: 'Payment confirmations, wallet credits, refunds.' },
  { label: 'Quality',            key: 'quality_enabled',  description: 'Quality actions and conduct reminders.'  },
  { label: 'System',             key: 'system_enabled',   description: 'System alerts and announcements.'        },
  { label: 'Chat messages',      key: 'chat_enabled',     description: 'In-app chat and new message alerts.'     },
  { label: 'Marketing',          key: 'marketing_enabled', description: 'Special offers, promotions, and discounts.' },
  { label: 'Push notifications', key: 'push_enabled',     description: 'Receive push notifications on this device.' },
];

/**
 * Future-ready (coming soon) channel rows — shown DISABLED; do NOT write to DB,
 * do NOT trigger any delivery. They are read-only placeholders.
 */
const FUTURE_ROWS: { label: string; key: PrefKey; description: string }[] = [
  {
    key: 'email_enabled',
    label: 'Email notifications',
    description: 'Coming soon — email delivery is not yet available.',
  },
  {
    key: 'sms_enabled',
    label: 'SMS notifications',
    description: 'Coming soon — SMS delivery is not yet available.',
  },
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

  // ── Toggle handler (optimistic) — functional keys only ───────────────────────

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

        {/* ── Durable-history note (always shown) ──────────────────────── */}
        <View
          style={[
            styles.historyNote,
            { backgroundColor: theme.primaryTint, borderColor: theme.primarySurface },
          ]}
          testID="history-note"
        >
          <Text variant="caption" color="primary">
            {NOTIFICATION_HISTORY_NOTE}
          </Text>
        </View>

        {/* ── Loading skeleton ──────────────────────────────────────────── */}
        {loading && (
          <View style={styles.skeletons}>
            <Skeleton height={52} />
            <Skeleton height={52} />
            <Skeleton height={52} />
          </View>
        )}

        {/* ── Functional toggle rows ────────────────────────────────────── */}
        {!loading && (
          <>
            <Text variant="label" color="textSecondary" style={styles.groupHeader}>
              Updates &amp; channels
            </Text>
            <View style={styles.rows}>
              {FUNCTIONAL_ROWS.map(({ label, key, description }) => (
                <View
                  key={key}
                  style={[styles.row, { borderBottomColor: theme.border }]}
                >
                  <View style={styles.rowText}>
                    <Text variant="body">{label}</Text>
                    {description ? (
                      <Text variant="caption" color="textTertiary">
                        {description}
                      </Text>
                    ) : null}
                  </View>
                  <Switch
                    testID={'switch-' + key}
                    value={prefs[key]}
                    onValueChange={(value) => void onToggle(key, value)}
                    thumbColor={prefs[key] ? theme.primary : theme.neutral400}
                    trackColor={{ false: theme.backgroundElement, true: theme.primaryTint }}
                  />
                </View>
              ))}
            </View>

            {/* ── Future-ready (coming soon) rows — disabled, no write ── */}
            <Text variant="label" color="textSecondary" style={styles.groupHeader}>
              Coming soon
            </Text>
            <View style={styles.rows}>
              {FUTURE_ROWS.map(({ label, key, description }) => (
                <View
                  key={key}
                  style={[styles.row, styles.rowDisabled, { borderBottomColor: theme.border }]}
                >
                  <View style={styles.rowText}>
                    <Text variant="body" color="textTertiary">{label}</Text>
                    <Text variant="caption" color="textTertiary">
                      {description}
                    </Text>
                  </View>
                  {/* Disabled Switch — read-only, does NOT write to DB */}
                  <Switch
                    testID={'switch-' + key}
                    value={false}
                    disabled
                    onValueChange={() => { /* future-ready: no-op */ }}
                    thumbColor={theme.neutral400}
                    trackColor={{ false: theme.backgroundElement, true: theme.primaryTint }}
                  />
                </View>
              ))}
            </View>
          </>
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
  historyNote: {
    borderRadius: 10,
    borderWidth: 1,
    padding: Spacing.three,
  },
  groupHeader: {
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    gap: Spacing.two,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
});
