import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { AuthLinkBridge } from '@/components/auth/auth-link-bridge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { parseAuthLinkParams } from '@/lib/auth-links';
import { useRootNavigationReady } from '@/hooks/use-root-navigation-ready';
import { validateSetPassword } from '@/lib/validation';

/**
 * `/auth/recovery` — mobile password-recovery link handler.
 *
 * Lifecycle:
 *   1. The route opens with `?token_hash=…&type=recovery` (cold start or warm app).
 *   2. The parameters are read ONCE, validated, and immediately stripped from the visible route
 *      (`router.setParams`, which keeps the route key) so the one-time secret does not linger in history.
 *   3. The auth context verifies the hash (`verifyOtp`), which creates the recovery session.
 *      A replayed link during an active recovery is ignored. Invalid, expired or reused links
 *      leave any existing session untouched and show one safe error state.
 *   4. The set-password form is shown only in the `ready` stage; on success the screen hands off
 *      to the root dispatcher ("/"), which routes by the verified profile role. The destination
 *      is never taken from the link. Cancel abandons the recovery explicitly.
 *
 * On web this route is the HTTPS bridge (`AuthLinkBridge`): it reads the emailed link's URL
 * fragment once, strips it, and opens the app only on an explicit action. It performs no auth
 * request; the admin web has no browser reset surface in this slice.
 */
export default function RecoveryScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const { recovery, authError, session, verifyAuthLink, completePasswordReset, abandonRecovery } = useAuth();
  // Snapshot of the params this screen instance opened with: read once, never re-read after the
  // one-time secret has been stripped from the route.
  const [initialParams] = useState(params);
  const hadLinkParams = initialParams != null && ('token_hash' in initialParams || 'type' in initialParams);
  const parsed = useMemo(() => parseAuthLinkParams(initialParams, 'recovery'), [initialParams]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const handled = useRef(false);
  const isWeb = Platform.OS === 'web';
  const navigationReady = useRootNavigationReady();
  const stage = recovery.stage;

  // Link intake — runs once per screen instance; side effects only (no state writes here).
  useEffect(() => {
    if (isWeb || handled.current || !hadLinkParams) return;
    // Wait for the root navigator before touching the route. `router.setParams` asserts readiness
    // and throws on a deep-link cold launch; doing that here would take the screen down through
    // the global error boundary before anything could be verified. The attempt is deliberately not
    // marked handled yet, so this effect runs again when readiness arrives.
    if (!navigationReady) return;
    handled.current = true;
    // Strip the one-time secret from the route WITHOUT navigating, for the reason recorded in
    // `auth/confirm.tsx`: `router.replace` gives the route a new key and remounts the screen.
    // `setParams` keeps the current route key, so no remount occurs.
    try {
      router.setParams({ token_hash: undefined, type: undefined });
    } catch {
      // Fail closed: never verify while the token may still be in router-visible state.
      // `router.replace` is queue-safe, so it removes the parameters without a second throw and
      // the remounted screen shows the neutral state.
      router.replace('/auth/recovery');
      return;
    }
    if (!parsed.ok) return;
    if (stage === 'verifying' || stage === 'ready' || stage === 'updating') return; // replayed delivery
    void verifyAuthLink({ tokenHash: parsed.tokenHash, type: 'recovery' });
  }, [isWeb, hadLinkParams, navigationReady, parsed, stage, verifyAuthLink]);

  // Arrived with a bad link, or with no link while nothing is in progress → nothing to verify.
  const linkInvalid = hadLinkParams ? !parsed.ok : stage === 'idle';

  // Completion — hand off to the root dispatcher, which routes by the verified role.
  useEffect(() => {
    if (!isWeb && stage === 'done') router.replace('/');
  }, [isWeb, stage]);

  async function submit() {
    const e = validateSetPassword({ password, confirm, email: session?.user?.email });
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSubmitting(true);
    try {
      await completePasswordReset(password);
    } finally {
      setSubmitting(false);
    }
  }

  async function requestNewLink() {
    await abandonRecovery();
    router.replace('/forgot-password');
  }

  async function cancel() {
    await abandonRecovery();
    router.replace('/signin');
  }

  let body: React.ReactNode;
  if (isWeb) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <AuthLinkBridge type="recovery" />
        </ScrollView>
      </SafeAreaView>
    );
  } else if (linkInvalid || stage === 'invalid') {
    body = (
      <View style={styles.form}>
        <Text variant="body" color="text" accessibilityRole="alert">
          This link is invalid or has expired.
        </Text>
        <Text variant="caption" color="textSecondary">
          Reset links can only be used once and expire after a short time.
        </Text>
        <Button label="Request a new link" fullWidth size="lg" onPress={requestNewLink} />
      </View>
    );
  } else if (stage === 'ready' || stage === 'updating') {
    body = (
      <View style={styles.form}>
        <Input
          label="New password"
          value={password}
          onChangeText={setPassword}
          placeholder="New password"
          secureTextEntry
          autoCapitalize="none"
          error={errors.password}
        />
        <Input
          label="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Confirm password"
          secureTextEntry
          autoCapitalize="none"
          error={errors.confirm}
        />
        <View style={styles.actions}>
          <Button label="Set new password" fullWidth size="lg" onPress={submit} loading={submitting || stage === 'updating'} />
          {authError ? (
            <Text variant="caption" color="error" style={styles.centered} accessibilityRole="alert">
              {authError}
            </Text>
          ) : null}
        </View>
        <View style={styles.linkRow}>
          <Text variant="label" color="primary" onPress={cancel}>
            Cancel
          </Text>
        </View>
      </View>
    );
  } else if (stage === 'done') {
    body = (
      <Text variant="body" color="text">
        Your password has been updated.
      </Text>
    );
  } else {
    body = (
      <Text variant="body" color="textSecondary">
        Checking your link…
      </Text>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text variant="display" style={styles.heading}>
              Reset your password
            </Text>
          </View>
          {body}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five },
  header: { paddingTop: Spacing.five, paddingBottom: Spacing.four, gap: Spacing.two },
  heading: { letterSpacing: -0.5 },
  form: { gap: Spacing.three },
  actions: { gap: Spacing.two, marginTop: Spacing.one },
  centered: { textAlign: 'center' },
  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: Spacing.two },
});
