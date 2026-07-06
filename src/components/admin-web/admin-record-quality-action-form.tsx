// admin-record-quality-action-form.tsx — Admin form to record a provider quality action.
// RECORD-ONLY: calls recordProviderQualityAction — does NOT suspend, pause,
// or change dispatch/payouts. Informational coaching record only.
//
// Props:
//   providerId — the provider to record the action for.
//   onRecorded — optional callback fired with the new action id on success.

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { QUALITY_ACTION_TYPES, type QualityActionType } from '@/constants/provider-quality';
import { recordProviderQualityAction } from '@/lib/provider-quality-admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

export type AdminRecordQualityActionFormProps = {
  /** The provider to record the action for. */
  providerId: string;
  /** Fired with the new quality action id after a successful record. */
  onRecorded?: (id: string) => void;
};

export function AdminRecordQualityActionForm({
  providerId,
  onRecorded,
}: AdminRecordQualityActionFormProps) {
  const theme = useTheme();

  // ── Form state ─────────────────────────────────────────────────────────────
  const [actionType, setActionType] = useState<QualityActionType | null>(null);
  const [note, setNote] = useState('');
  const [providerVisible, setProviderVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ── Derived ────────────────────────────────────────────────────────────────
  const canSubmit = actionType !== null && !submitting;

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!canSubmit || actionType === null) return;
    setSubmitting(true);
    setError('');

    const res = await recordProviderQualityAction({
      providerId,
      actionType,
      note: note.trim() || undefined,
      providerVisible,
    });

    if (res.ok && res.id) {
      // Clear form
      setActionType(null);
      setNote('');
      setProviderVisible(false);
      onRecorded?.(res.id);
    } else {
      setError(res.error ?? 'Could not record quality action. Please try again.');
    }

    setSubmitting(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* ── Record-only disclaimer ── */}
      <View style={[styles.disclaimer, { backgroundColor: theme.infoSurface, borderColor: theme.info }]}>
        <Text variant="caption" color="textSecondary">
          Record-only — this does not suspend, pause, or change dispatch/payouts.
          Informational coaching record.
        </Text>
      </View>

      {/* ── Action type selector ── */}
      <Text variant="label" weight="medium" color="textSecondary">
        Action type
      </Text>
      <View style={styles.chipRow}>
        {QUALITY_ACTION_TYPES.map((qt) => {
          const selected = qt.id === actionType;
          return (
            <Pressable
              key={qt.id}
              onPress={() => setActionType(qt.id)}
              accessibilityRole="button"
              accessibilityLabel={qt.label}
              accessibilityState={{ selected }}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? qt.color : theme.surface,
                  borderColor: selected ? qt.color : theme.border,
                },
              ]}>
              <Text
                variant="caption"
                style={{ color: selected ? '#FFFFFF' : theme.textSecondary }}>
                {qt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Provider visible toggle ── */}
      <Text variant="label" weight="medium" color="textSecondary">
        Visibility
      </Text>
      <View style={styles.toggleRow}>
        <Pressable
          onPress={() => setProviderVisible(false)}
          accessibilityRole="button"
          accessibilityLabel="Not visible to provider"
          accessibilityState={{ selected: !providerVisible }}
          style={[
            styles.toggleChip,
            {
              backgroundColor: !providerVisible ? theme.primary : theme.surface,
              borderColor: !providerVisible ? theme.primary : theme.border,
            },
          ]}>
          <Text
            variant="caption"
            style={{ color: !providerVisible ? '#FFFFFF' : theme.textSecondary }}>
            Internal only
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setProviderVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Visible to provider"
          accessibilityState={{ selected: providerVisible }}
          style={[
            styles.toggleChip,
            {
              backgroundColor: providerVisible ? theme.primary : theme.surface,
              borderColor: providerVisible ? theme.primary : theme.border,
            },
          ]}>
          <Text
            variant="caption"
            style={{ color: providerVisible ? '#FFFFFF' : theme.textSecondary }}>
            Visible to provider
          </Text>
        </Pressable>
      </View>

      {/* ── Note / provider message ── */}
      <Input
        label="Note / provider message"
        value={note}
        onChangeText={setNote}
        placeholder="Optional coaching note or message for the provider…"
        multiline
      />

      {/* ── Error ── */}
      {error ? (
        <Text variant="caption" color="error">
          {error}
        </Text>
      ) : null}

      {/* ── Submit ── */}
      <Button
        label="Record action"
        onPress={handleSubmit}
        disabled={!canSubmit}
        loading={submitting}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  disclaimer: {
    borderRadius: Radii.md,
    borderWidth: 1,
    padding: Spacing.two,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: Radii.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  toggleChip: {
    borderRadius: Radii.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});
