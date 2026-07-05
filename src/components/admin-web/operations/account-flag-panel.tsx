/**
 * src/components/admin-web/operations/account-flag-panel.tsx
 *
 * AccountFlagPanel — loads and displays account flags (flags + suspension
 * records) for a given subject account, and provides a form to record new
 * flags or lift existing active ones.
 *
 * IMPORTANT guardrails (always visible in UI):
 *   - RECORD ONLY — does NOT block login, booking, or dispatch.
 *   - Lifting sets a flag inactive; nothing is deleted.
 *   - No direct Supabase calls — uses getAccountFlags / flagAccount /
 *     liftAccountFlag from @/lib/operations.
 *
 * Props:
 *   subjectId   — UUID of the customer or provider.
 *   subjectRole — 'customer' | 'provider'.
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import {
  ACCOUNT_FLAG_KINDS,
  type AccountFlag,
  type AccountFlagKind,
  type SubjectRole,
} from '@/constants/operations';
import { getAccountFlags, flagAccount, liftAccountFlag } from '@/lib/operations';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';

// ── Props ──────────────────────────────────────────────────────────────────

export type AccountFlagPanelProps = {
  subjectId: string;
  subjectRole: SubjectRole;
};

// ── Component ──────────────────────────────────────────────────────────────

export function AccountFlagPanel({ subjectId, subjectRole }: AccountFlagPanelProps) {
  const theme = useTheme();

  // ── Flags list state ─────────────────────────────────────────────────────
  const [flags, setFlags] = useState<AccountFlag[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Record form state ────────────────────────────────────────────────────
  const [kind, setKind] = useState<AccountFlagKind>('flag');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ── Lift state per flag ──────────────────────────────────────────────────
  const [liftingId, setLiftingId] = useState<string | null>(null);
  const [liftError, setLiftError] = useState('');

  // ── Load flags ───────────────────────────────────────────────────────────
  const loadFlags = useCallback(async () => {
    setLoading(true);
    const data = await getAccountFlags(subjectId);
    setFlags(data);
    setLoading(false);
  }, [subjectId]);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  // ── Record flag handler ───────────────────────────────────────────────────
  async function handleRecord() {
    const trimmedReason = reason.trim();
    if (!trimmedReason) return;
    setSubmitting(true);
    setError('');
    const res = await flagAccount(subjectId, subjectRole, kind, trimmedReason);
    if (res.ok) {
      setReason('');
      await loadFlags();
    } else {
      setError(res.error ?? 'Could not record flag. Please try again.');
    }
    setSubmitting(false);
  }

  // ── Lift flag handler ─────────────────────────────────────────────────────
  async function handleLift(flagId: string) {
    setLiftingId(flagId);
    setLiftError('');
    const res = await liftAccountFlag(flagId);
    if (res.ok) {
      await loadFlags();
    } else {
      setLiftError(res.error ?? 'Could not lift flag. Please try again.');
    }
    setLiftingId(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <SectionHeader title="Account flags" />

      {/* Record-only notice — always visible */}
      <Text variant="caption" color="textSecondary" style={styles.noticeLabel}>
        Record only — this does NOT block login, booking, or dispatch. It is an
        operational record and recommendation for follow-up.
      </Text>

      {/* Flags list */}
      {loading && flags.length === 0 ? (
        <Text variant="caption" color="textSecondary">
          Loading…
        </Text>
      ) : flags.length === 0 ? (
        <Text variant="caption" color="textSecondary">
          No flags recorded for this account.
        </Text>
      ) : (
        flags.map((flag) => (
          <Card key={flag.id} style={styles.flagCard}>
            {/* Kind + active/lifted state */}
            <View style={styles.flagHeader}>
              <Text
                variant="label"
                weight="medium"
                color={flag.kind === 'suspension' ? 'error' : 'warning'}>
                {flag.kind === 'suspension' ? 'Suspension record' : 'Flag'}
              </Text>
              <Text
                variant="caption"
                color={flag.active ? 'warning' : 'neutral500'}>
                {flag.active ? 'Active' : 'Lifted'}
              </Text>
            </View>

            {/* Reason */}
            <Text variant="body" color="textSecondary">
              {flag.reason}
            </Text>

            {/* Audit: created_by + time */}
            <Text variant="caption" color="textTertiary">
              {`Recorded by #${flag.created_by.slice(0, 8)} · ${new Date(flag.created_at).toLocaleString()}`}
            </Text>

            {/* Lifted info */}
            {!flag.active && flag.lifted_by ? (
              <Text variant="caption" color="textTertiary">
                {`Lifted by #${flag.lifted_by.slice(0, 8)} · ${flag.lifted_at ? new Date(flag.lifted_at).toLocaleString() : '—'}`}
              </Text>
            ) : null}

            {/* Lift button — only for active flags */}
            {flag.active ? (
              <Button
                label="Lift"
                variant="secondary"
                onPress={() => handleLift(flag.id)}
                loading={liftingId === flag.id}
                disabled={liftingId !== null}
              />
            ) : null}
          </Card>
        ))
      )}

      {/* Lift error */}
      {liftError ? (
        <Text variant="caption" color="error">
          {liftError}
        </Text>
      ) : null}

      {/* Record form */}
      <SectionHeader title="Record flag" />

      {/* Kind selector chips */}
      <View style={styles.chipRow}>
        {ACCOUNT_FLAG_KINDS.map((k) => {
          const selected = k.id === kind;
          return (
            <Pressable
              key={k.id}
              onPress={() => setKind(k.id)}
              accessibilityRole="button"
              accessibilityLabel={k.label}
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
                {k.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Reason input (required) */}
      <Input
        label="Reason (required)"
        value={reason}
        onChangeText={setReason}
        placeholder="Describe the reason for this flag…"
        multiline
      />

      {/* Error */}
      {error ? (
        <Text variant="caption" color="error">
          {error}
        </Text>
      ) : null}

      <Button
        label={kind === 'suspension' ? 'Record suspension' : 'Record flag'}
        onPress={handleRecord}
        disabled={reason.trim() === ''}
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
  noticeLabel: {
    marginTop: -Spacing.two,
  },
  flagCard: {
    gap: Spacing.one,
  },
  flagHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
});
