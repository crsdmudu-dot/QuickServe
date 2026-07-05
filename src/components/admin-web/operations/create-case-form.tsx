/**
 * src/components/admin-web/operations/create-case-form.tsx
 *
 * CreateCaseForm — admin form to open a new support or dispute case.
 *
 * Fields:
 *   - case type selector (CASE_TYPES: support | dispute)
 *   - priority selector (CASE_PRIORITIES)
 *   - subject (required, text input)
 *   - description (optional, multiline)
 *   - dispute kind selector (DISPUTE_KINDS) — visible only when type = 'dispute'
 *   - read-only display of any prefilled context ids from `initial`
 *     (booking_id / customer_id / provider_id / payment_id / review_id)
 *
 * Submit calls createSupportCase({ ...initial, ...form }).
 * Button is disabled while subject is empty or while submitting.
 *
 * Props:
 *   initial   — optional partial CreateCaseInput pre-fills form + context ids.
 *   onCreated — callback fired with the new case id on success.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import {
  CASE_TYPES,
  CASE_PRIORITIES,
  DISPUTE_KINDS,
  type CaseType,
  type CasePriority,
  type DisputeKind,
} from '@/constants/operations';
import { createSupportCase } from '@/lib/operations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';

// ── Input type (mirrors createSupportCase's parameter) ─────────────────────

export type CreateCaseInput = {
  caseType?: CaseType;
  priority?: CasePriority;
  subject: string;
  description?: string;
  bookingId?: string;
  customerId?: string;
  providerId?: string;
  paymentId?: string;
  reviewId?: string;
  disputeKind?: DisputeKind;
};

// ── Props ──────────────────────────────────────────────────────────────────

export type CreateCaseFormProps = {
  initial?: Partial<CreateCaseInput>;
  onCreated?: (id: string) => void;
};

// ── Component ──────────────────────────────────────────────────────────────

export function CreateCaseForm({ initial, onCreated }: CreateCaseFormProps) {
  const theme = useTheme();

  // ── Form state ───────────────────────────────────────────────────────────
  const [caseType, setCaseType] = useState<CaseType>(initial?.caseType ?? 'support');
  const [priority, setPriority] = useState<CasePriority>(initial?.priority ?? 'medium');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [disputeKind, setDisputeKind] = useState<DisputeKind>(
    initial?.disputeKind ?? 'booking_dispute',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = subject.trim() !== '' && !submitting;

  // ── Submit handler ────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    const res = await createSupportCase({
      ...initial,
      caseType,
      priority,
      subject: subject.trim(),
      description: description.trim() || undefined,
      disputeKind: caseType === 'dispute' ? disputeKind : undefined,
    });
    if (res.ok && res.id) {
      onCreated?.(res.id);
    } else {
      setError(res.error ?? 'Could not create case. Please try again.');
    }
    setSubmitting(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <SectionHeader title="Open new case" />

      {/* Case type chips */}
      <Text variant="label" color="textSecondary">
        Case type
      </Text>
      <View style={styles.chipRow}>
        {CASE_TYPES.map((t) => {
          const selected = t.id === caseType;
          return (
            <Pressable
              key={t.id}
              onPress={() => setCaseType(t.id)}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? theme.primary : theme.surface,
                  borderColor: selected ? theme.primary : theme.border,
                },
              ]}>
              <Text
                variant="caption"
                color={selected ? 'background' : 'textSecondary'}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Priority chips */}
      <Text variant="label" color="textSecondary">
        Priority
      </Text>
      <View style={styles.chipRow}>
        {CASE_PRIORITIES.map((p) => {
          const selected = p.id === priority;
          return (
            <Pressable
              key={p.id}
              onPress={() => setPriority(p.id)}
              accessibilityRole="button"
              accessibilityLabel={p.label}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? theme.primary : theme.surface,
                  borderColor: selected ? theme.primary : theme.border,
                },
              ]}>
              <Text
                variant="caption"
                color={selected ? 'background' : 'textSecondary'}>
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Dispute kind — only when type = 'dispute' */}
      {caseType === 'dispute' ? (
        <>
          <Text variant="label" color="textSecondary">
            Dispute kind
          </Text>
          <View style={styles.chipRow}>
            {DISPUTE_KINDS.map((d) => {
              const selected = d.id === disputeKind;
              return (
                <Pressable
                  key={d.id}
                  onPress={() => setDisputeKind(d.id)}
                  accessibilityRole="button"
                  accessibilityLabel={d.label}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? theme.primary : theme.surface,
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}>
                  <Text
                    variant="caption"
                    color={selected ? 'background' : 'textSecondary'}>
                    {d.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {/* Subject (required) */}
      <Input
        label="Subject (required)"
        value={subject}
        onChangeText={setSubject}
        placeholder="Brief summary of the case…"
      />

      {/* Description (optional) */}
      <Input
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        placeholder="Detailed description…"
        multiline
      />

      {/* Read-only context id display */}
      {(initial?.bookingId ||
        initial?.customerId ||
        initial?.providerId ||
        initial?.paymentId ||
        initial?.reviewId) ? (
        <View style={styles.contextBox}>
          <Text variant="caption" color="textSecondary">
            Linked context
          </Text>
          {initial.bookingId ? (
            <Text variant="caption" color="textTertiary">
              {`Booking: #${initial.bookingId.slice(0, 8)}`}
            </Text>
          ) : null}
          {initial.customerId ? (
            <Text variant="caption" color="textTertiary">
              {`Customer: #${initial.customerId.slice(0, 8)}`}
            </Text>
          ) : null}
          {initial.providerId ? (
            <Text variant="caption" color="textTertiary">
              {`Provider: #${initial.providerId.slice(0, 8)}`}
            </Text>
          ) : null}
          {initial.paymentId ? (
            <Text variant="caption" color="textTertiary">
              {`Payment: #${initial.paymentId.slice(0, 8)}`}
            </Text>
          ) : null}
          {initial.reviewId ? (
            <Text variant="caption" color="textTertiary">
              {`Review: #${initial.reviewId.slice(0, 8)}`}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Error */}
      {error ? (
        <Text variant="caption" color="error">
          {error}
        </Text>
      ) : null}

      <Button
        label="Open case"
        onPress={handleSubmit}
        disabled={!canSubmit}
        loading={submitting}
      />
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  contextBox: {
    gap: Spacing.one,
  },
});
