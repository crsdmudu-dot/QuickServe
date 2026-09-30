// report-form.tsx — Inline "report this" panel: pick a reason, send, see the 24-hour confirmation.
// Used for chat messages, people (the other side of a booking, or a provider) and reviews.
// The server decides whether the report is allowed and who was reported; this only sends the choice.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import {
  REPORT_CONFIRMATION,
  REPORT_REASONS,
  reportContent,
  type ReportReason,
  type ReportTargetType,
} from '@/lib/moderation';

export type ReportFormProps = {
  /** Heading, e.g. "Report this message". */
  title: string;
  targetType: ReportTargetType;
  targetId: string;
  /** Called by Cancel, and by Done after the report is sent. */
  onClose: () => void;
};

export function ReportForm({ title, targetType, targetId, onClose }: ReportFormProps) {
  const theme = useTheme();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!reason) return;
    setSending(true);
    setError(null);
    const result = await reportContent(targetType, targetId, reason);
    setSending(false);
    if (result.ok) setSent(true);
    else setError(result.error ?? 'Could not send the report. Please try again.');
  }

  if (sent) {
    return (
      <Card elevation="e1" testID="report-form-sent">
        <View style={styles.content}>
          <Text variant="heading">Report sent</Text>
          <Text variant="body" color="textSecondary">
            {REPORT_CONFIRMATION}
          </Text>
          <Button label="Done" variant="secondary" size="sm" onPress={onClose} testID="report-done" />
        </View>
      </Card>
    );
  }

  return (
    <Card elevation="e1" testID="report-form">
      <View style={styles.content}>
        <Text variant="heading">{title}</Text>
        <Text variant="caption" color="textSecondary">
          Why are you reporting this? The other person is not told who reported them.
        </Text>
        <View style={styles.reasons}>
          {REPORT_REASONS.map((r) => {
            const selected = reason === r.key;
            return (
              <Pressable
                key={r.key}
                testID={`report-reason-${r.key}`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setReason(r.key)}
                style={[
                  styles.chip,
                  {
                    borderColor: selected ? theme.primary : theme.border,
                    backgroundColor: selected ? theme.primaryTint : theme.surfaceMuted,
                  },
                ]}>
                <Text variant="caption" color={selected ? 'primary' : 'textSecondary'}>
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {error ? (
          <Text variant="caption" color="error">
            {error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button
            label="Send report"
            size="sm"
            onPress={handleSend}
            disabled={!reason}
            loading={sending}
            testID="report-send"
          />
          <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} testID="report-cancel" />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.two,
  },
  reasons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
});
