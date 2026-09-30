/**
 * src/components/operations/account-suspension-panel.tsx
 *
 * AccountSuspensionPanel — suspend or lift a customer or provider (store-compliance F5.6b).
 *
 * Unlike the account flags below it, this ENFORCES: once suspended, the person is refused everything in the
 * database at once and can no longer sign in. Lifting gives everything back. Every suspend and lift is audited on
 * the server as the signed-in admin.
 *
 * The sign-in block is a second step (the Auth ban). If it could not be applied, the panel says so and offers
 * Retry; the account stays suspended in the database either way.
 *
 * Props:
 *   userId    — the customer or provider.
 *   reportId  — optional: the report this action answers (moderation queue).
 */

import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import {
  getLatestSuspension,
  liftSuspension,
  retrySignInBlock,
  suspendAccount,
  type SuspensionOutcome,
  type SuspensionRecord,
} from '@/lib/suspension';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';

export type AccountSuspensionPanelProps = {
  userId: string;
  reportId?: string | null;
};

type Loaded = { state: 'loading' } | { state: 'error' } | { state: 'ready'; suspension: SuspensionRecord | null };

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

/** What happened, in plain words, after an action. */
function outcomeMessage(action: 'suspend' | 'lift' | 'retry', out: Extract<SuspensionOutcome, { ok: true }>): string {
  const base = action === 'suspend' ? 'Account suspended.' : action === 'lift' ? 'Suspension lifted.' : 'Tried again.';
  if (out.signInBlock === 'banned') return `${base} Sign-in is blocked.`;
  if (out.signInBlock === 'unbanned') return `${base} Sign-in works again.`;
  return action === 'lift'
    ? `${base} Sign-in could not be unblocked yet. Use Retry.`
    : `${base} Sign-in could not be blocked yet, but the account is refused everything in KwikServe. Use Retry.`;
}

export function AccountSuspensionPanel({ userId, reportId = null }: AccountSuspensionPanelProps) {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await getLatestSuspension(userId);
    setLoaded(res.ok ? { state: 'ready', suspension: res.suspension } : { state: 'error' });
  }, [userId]);

  useEffect(() => {
    let current = true;
    getLatestSuspension(userId).then((res) => {
      if (current) setLoaded(res.ok ? { state: 'ready', suspension: res.suspension } : { state: 'error' });
    });
    return () => {
      current = false;
    };
  }, [userId]);

  async function run(action: 'suspend' | 'lift' | 'retry', call: () => Promise<SuspensionOutcome>) {
    setBusy(true);
    setError('');
    setMessage('');
    const out = await call();
    setBusy(false);
    setConfirming(false);
    if (out.ok) {
      setMessage(outcomeMessage(action, out));
      if (action === 'suspend') setReason('');
      if (action === 'lift') setNote('');
    } else {
      setError(out.error);
    }
    await load();
  }

  const suspension = loaded.state === 'ready' ? loaded.suspension : null;
  const active = !!suspension && suspension.lifted_at === null;
  const blockNeedsRetry =
    !!suspension &&
    (suspension.auth_ban_state === 'failed' ||
      suspension.auth_ban_state === 'pending' ||
      (active && suspension.auth_ban_state === 'unbanned') ||
      (!active && suspension.auth_ban_state === 'banned'));
  const trimmedReason = reason.trim();

  return (
    <View style={styles.container} testID="suspension-panel">
      <SectionHeader title="Account suspension" />
      <Text variant="caption" color="textSecondary">
        Suspending stops this person using KwikServe at once and blocks sign-in. Use it for serious or repeated abuse.
      </Text>

      {loaded.state === 'loading' ? (
        <Text variant="caption" color="textSecondary">
          Loading…
        </Text>
      ) : loaded.state === 'error' ? (
        <View style={styles.row}>
          <Text variant="caption" color="error">
            Could not load the suspension status.
          </Text>
          <Button label="Retry" variant="ghost" size="sm" onPress={() => void load()} />
        </View>
      ) : (
        <>
          <Text variant="label" color={active ? 'error' : 'text'} testID="suspension-status">
            {active ? `Suspended since ${when(suspension.suspended_at)}` : 'Not suspended'}
          </Text>
          {active ? (
            <Text variant="body" color="textSecondary">
              {suspension.reason}
            </Text>
          ) : suspension ? (
            <Text variant="caption" color="textTertiary">
              {`Last suspension lifted ${when(suspension.lifted_at)}`}
            </Text>
          ) : null}

          {suspension ? (
            <View style={styles.row}>
              <Text
                variant="caption"
                color={blockNeedsRetry ? 'warning' : 'textSecondary'}
                testID="suspension-sign-in">
                {active
                  ? suspension.auth_ban_state === 'banned'
                    ? 'Sign-in is blocked.'
                    : suspension.auth_ban_state === 'failed'
                      ? 'Sign-in could not be blocked. The account is still refused everything in KwikServe.'
                      : 'Sign-in block not confirmed yet.'
                  : suspension.auth_ban_state === 'unbanned'
                    ? 'Sign-in works again.'
                    : 'Sign-in could not be unblocked yet.'}
              </Text>
              {blockNeedsRetry ? (
                <Button
                  label="Retry"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  testID="suspension-retry"
                  onPress={() => run('retry', () => retrySignInBlock(userId))}
                />
              ) : null}
            </View>
          ) : null}

          {active ? (
            <>
              <Input
                label="Note (optional)"
                value={note}
                onChangeText={setNote}
                placeholder="Why the suspension is lifted"
                testID="suspension-lift-note"
              />
              <Button
                label="Lift suspension"
                variant="secondary"
                disabled={busy}
                loading={busy}
                testID="suspension-lift"
                onPress={() => run('lift', () => liftSuspension({ userId, note }))}
              />
            </>
          ) : (
            <>
              <Input
                label="Reason (required)"
                value={reason}
                onChangeText={(v) => {
                  setReason(v);
                  setConfirming(false);
                }}
                placeholder="What this person did (kept in the audit log)"
                multiline
                testID="suspension-reason"
              />
              {confirming ? (
                <View style={styles.row}>
                  <Button
                    label="Confirm suspension"
                    disabled={busy || trimmedReason === ''}
                    loading={busy}
                    testID="suspension-confirm"
                    onPress={() => run('suspend', () => suspendAccount({ userId, reason: trimmedReason, reportId }))}
                  />
                  <Button
                    label="Cancel"
                    variant="ghost"
                    disabled={busy}
                    testID="suspension-cancel"
                    onPress={() => setConfirming(false)}
                  />
                </View>
              ) : (
                <Button
                  label="Suspend account"
                  variant="secondary"
                  disabled={busy || trimmedReason === '' || trimmedReason.length > 500}
                  testID="suspension-suspend"
                  onPress={() => setConfirming(true)}
                />
              )}
            </>
          )}
        </>
      )}

      {message ? (
        <Text variant="caption" color="textSecondary" testID="suspension-message" accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}
      {error ? (
        <Text variant="caption" color="error" testID="suspension-error" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
