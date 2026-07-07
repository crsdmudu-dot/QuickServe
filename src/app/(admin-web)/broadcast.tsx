/**
 * src/app/(admin-web)/broadcast.tsx — Admin Broadcast Announcement Composer
 *
 * Allows admins to compose and send a broadcast announcement to:
 *   - Customers only
 *   - Providers only
 *   - Everyone (customers + providers — calls broadcastAnnouncement TWICE,
 *     once for 'customer' and once for 'provider', then sums the counts)
 *
 * Send uses broadcastAnnouncement() RPC ONLY — NO client push, NO email/SMS send,
 * NO second pipeline. Announcements insert durable in-app rows for every matching user.
 *
 * Features:
 *   - Audience selector (Customers / Providers / Everyone)
 *   - Title + message inputs
 *   - Priority selector (PRIORITY_LEVELS)
 *   - Preview panel (renders NotificationCard-style preview)
 *   - Confirmation dialog before sending
 *   - Success state showing total recipient count + form reset
 *   - Friendly error on failure
 *
 * Wrapped by AdminShell via the (admin-web)/_layout.tsx.
 * Admin-only screen under (admin-web) — no booking/payment/auth/push change.
 */

import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { PageMeta } from '@/components/admin-web/page-meta';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Spacing, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  PRIORITY_LEVELS,
  type NotificationPriority,
} from '@/constants/notifications';
import { broadcastAnnouncement } from '@/lib/notifications';

// ── Types ────────────────────────────────────────────────────────────────────

type AudienceType = 'customer' | 'provider' | 'everyone';

const AUDIENCE_OPTIONS: { id: AudienceType; label: string }[] = [
  { id: 'customer',  label: 'Customers' },
  { id: 'provider',  label: 'Providers' },
  { id: 'everyone',  label: 'Everyone'  },
];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminBroadcastScreen() {
  const theme = useTheme();

  // ── Form state ───────────────────────────────────────────────────────────
  const [audience, setAudience] = useState<AudienceType>('customer');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<NotificationPriority>('normal');

  // ── UI state ─────────────────────────────────────────────────────────────
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [error, setError] = useState('');

  // ── Derived ───────────────────────────────────────────────────────────────
  const canSend = title.trim().length > 0 && message.trim().length > 0 && !sending;
  const audienceLabel = AUDIENCE_OPTIONS.find((a) => a.id === audience)?.label ?? audience;
  const priorityMeta = PRIORITY_LEVELS.find((p) => p.id === priority);

  // ── Send handler ──────────────────────────────────────────────────────────
  /**
   * Broadcast via broadcastAnnouncement() RPC ONLY.
   * Everyone = call for 'customer' THEN 'provider' and sum the counts.
   * NO push, NO email/sms, NO second pipeline.
   */
  async function handleSend() {
    setShowConfirm(false);
    setSending(true);
    setError('');
    setSuccessCount(null);

    try {
      if (audience === 'everyone') {
        // Call RPC twice — 'customer' then 'provider' — and sum counts.
        const [custResult, provResult] = await Promise.all([
          broadcastAnnouncement({
            audienceType: 'customer',
            title: title.trim(),
            body: message.trim(),
            priority,
          }),
          broadcastAnnouncement({
            audienceType: 'provider',
            title: title.trim(),
            body: message.trim(),
            priority,
          }),
        ]);

        if (!custResult.ok || !provResult.ok) {
          setError(
            custResult.error ?? provResult.error ?? 'Could not broadcast announcement.',
          );
          return;
        }
        const total = (custResult.count ?? 0) + (provResult.count ?? 0);
        setSuccessCount(total);
      } else {
        const result = await broadcastAnnouncement({
          audienceType: audience,
          title: title.trim(),
          body: message.trim(),
          priority,
        });
        if (!result.ok) {
          setError(result.error ?? 'Could not broadcast announcement.');
          return;
        }
        setSuccessCount(result.count ?? 0);
      }

      // Reset form on success
      setTitle('');
      setMessage('');
      setAudience('customer');
      setPriority('normal');
    } finally {
      setSending(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <PageMeta
        title="Broadcast announcement"
        description="Send an announcement to customers, providers, or everyone."
      />

      {/* ── Success banner ───────────────────────────────────────────────── */}
      {successCount !== null && (
        <Card
          elevation="e1"
          style={[styles.successBanner, { backgroundColor: theme.primaryTint }]}
        >
          <Text variant="label" color="primary" weight="semibold">
            Announcement sent to {successCount} recipient{successCount !== 1 ? 's' : ''}.
          </Text>
          <Button
            label="Dismiss"
            variant="ghost"
            size="md"
            onPress={() => setSuccessCount(null)}
          />
        </Card>
      )}

      {/* ── Compose form ─────────────────────────────────────────────────── */}
      <Text variant="heading" color="text" weight="semibold" style={styles.sectionTitle}>
        Compose announcement
      </Text>

      {/* Audience selector */}
      <View style={styles.field}>
        <Text variant="label" color="textSecondary">
          Audience
        </Text>
        <View style={styles.chips}>
          {AUDIENCE_OPTIONS.map((opt) => (
            <TouchableChip
              key={opt.id}
              label={opt.label}
              active={audience === opt.id}
              onPress={() => setAudience(opt.id)}
              testID={`audience-chip-${opt.id}`}
            />
          ))}
        </View>
      </View>

      {/* Title */}
      <Input
        label="Title"
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Scheduled maintenance notice"
      />

      {/* Message */}
      <Input
        label="Message"
        value={message}
        onChangeText={setMessage}
        placeholder="Write your announcement here…"
        multiline
      />

      {/* Priority selector */}
      <View style={styles.field}>
        <Text variant="label" color="textSecondary">
          Priority
        </Text>
        <View style={styles.chips}>
          {PRIORITY_LEVELS.map((p) => (
            <TouchableChip
              key={p.id}
              label={p.label}
              active={priority === p.id}
              onPress={() => setPriority(p.id)}
              activeColor={p.color}
              testID={`priority-chip-${p.id}`}
            />
          ))}
        </View>
      </View>

      {/* ── Preview panel ─────────────────────────────────────────────────── */}
      {(title.trim() || message.trim()) && (
        <View style={styles.previewSection} testID="broadcast-preview">
          <Text variant="label" color="textSecondary" style={styles.previewLabel}>
            Preview
          </Text>
          <Card elevation="e1" style={styles.previewCard}>
            <View style={styles.previewRow}>
              {/* Icon placeholder */}
              <Text style={styles.previewIcon}>📢</Text>
              <View style={styles.previewContent}>
                <View style={styles.previewHeader}>
                  <Text variant="label" weight="semibold" style={styles.previewTitle}>
                    {title.trim() || 'Announcement title'}
                  </Text>
                  {priorityMeta && (
                    <Text
                      variant="caption"
                      style={[styles.priorityTag, { color: priorityMeta.color }]}
                    >
                      {priorityMeta.label}
                    </Text>
                  )}
                </View>
                <Text variant="body" color="textSecondary" numberOfLines={3}>
                  {message.trim() || 'Your message will appear here.'}
                </Text>
                <Text variant="caption" color="textTertiary" style={styles.previewAudience}>
                  To: {audienceLabel}
                </Text>
              </View>
            </View>
          </Card>
        </View>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error ? (
        <Text variant="caption" color="error">
          {error}
        </Text>
      ) : null}

      {/* ── Send button ───────────────────────────────────────────────────── */}
      <View testID="send-button">
        <Button
          label={sending ? 'Sending…' : `Send to ${audienceLabel}`}
          variant="primary"
          size="md"
          onPress={() => setShowConfirm(true)}
          disabled={!canSend}
        />
      </View>

      {/* ── Confirmation modal ────────────────────────────────────────────── */}
      <Modal
        visible={showConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text variant="heading" color="text" weight="semibold" style={styles.modalTitle}>
              Confirm broadcast
            </Text>
            <Text variant="body" color="textSecondary">
              Send &quot;{title.trim()}&quot; to{' '}
              <Text variant="body" weight="semibold">{audienceLabel}</Text>?
              This will insert a durable in-app notification for every matching user.
            </Text>
            <View style={styles.modalButtons}>
              <View testID="confirm-cancel">
                <Button
                  label="Cancel"
                  variant="secondary"
                  size="md"
                  onPress={() => setShowConfirm(false)}
                />
              </View>
              <View testID="confirm-send">
                <Button
                  label="Send"
                  variant="primary"
                  size="md"
                  onPress={() => void handleSend()}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ── TouchableChip sub-component ──────────────────────────────────────────────

import { TouchableOpacity } from 'react-native';

type TouchableChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
  activeColor?: string;
  testID?: string;
};

function TouchableChip({ label, active, onPress, activeColor, testID }: TouchableChipProps) {
  const theme = useTheme();
  const activeBackground = activeColor ?? theme.primary;

  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        chipStyles.chip,
        {
          backgroundColor: active ? activeBackground : theme.surface,
          borderColor: active ? activeBackground : theme.border,
        },
      ]}
    >
      <Text
        variant="caption"
        style={{ color: active ? '#FFFFFF' : theme.textSecondary }}
        weight={active ? 'semibold' : 'regular'}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: 20,
    borderWidth: 1,
  },
});

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sectionTitle: {
    marginBottom: Spacing.two,
  },
  field: {
    gap: Spacing.one,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  previewSection: {
    gap: Spacing.one,
  },
  previewLabel: {
    marginBottom: Spacing.one,
  },
  previewCard: {
    gap: Spacing.two,
  },
  previewRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  previewIcon: {
    fontSize: 24,
    lineHeight: 28,
    marginTop: 2,
  },
  previewContent: {
    flex: 1,
    gap: Spacing.one,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  previewTitle: {
    flex: 1,
  },
  priorityTag: {
    flexShrink: 0,
    fontWeight: '600',
  },
  previewAudience: {
    marginTop: Spacing.one,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    marginBottom: Spacing.three,
    borderRadius: Radii.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: Radii.lg,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  modalTitle: {
    marginBottom: Spacing.one,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'flex-end',
  },
});
