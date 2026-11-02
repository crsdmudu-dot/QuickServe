import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { AuthLinkBridge } from '@/components/auth/auth-link-bridge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SupportLink } from '@/components/ui/support-link';
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
 *      A replayed link during an active recovery is ignored. If this phone is already signed in,
 *      the link is not used: the screen asks first. "Stay signed in" drops the link and changes
 *      nothing; only an explicit "Sign out and continue" signs out on this phone and then uses the
 *      link. Invalid, expired or reused links show one safe error state.
 *   4. The set-password form is shown only in the `ready` stage; on success the screen hands off
 *      to the root dispatcher ("/"), which routes by the verified profile role. The destination
 *      is never taken from the link. Cancel abandons the recovery explicitly.
 *
 * On web this route is the HTTPS bridge (`AuthLinkBridge`): it reads the emailed link's URL
 * fragment once, strips it, and opens the app only on an explicit action. It performs no auth
 * request; the admin web has no browser reset surface in this slice.
 */

// Approved wording (AL-WORDING). Any change, even punctuation, needs a new wording approval.
const SIGNED_IN_MESSAGE = "You're already signed in on this phone. To use this link, sign out first.";
const STAY_SIGNED_IN = 'Stay signed in';
const SIGN_OUT_AND_CONTINUE = 'Sign out and continue';

function announce(text: string) {
  try {
    AccessibilityInfo.announceForAccessibility(text);
  } catch {
    /* announcements are best-effort */
  }
}

export default function RecoveryScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const { recovery, authError, session, verifyAuthLink, signOutAndVerifyAuthLink, completePasswordReset, abandonRecovery } =
    useAuth();
  // Snapshot of the params this screen instance opened with: read once, never re-read after the
  // one-time secret has been stripped from the route.
  const [initialParams] = useState(params);
  const hadLinkParams = initialParams != null && ('token_hash' in initialParams || 'type' in initialParams);
  const parsed = useMemo(() => parseAuthLinkParams(initialParams, 'recovery'), [initialParams]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  // The signed-in choice: 'asking' while it is shown, 'switching' from the "Sign out and continue"
  // tap until the result. While it is shown, the link's code is kept in this screen's memory only.
  const [choice, setChoice] = useState<'none' | 'asking' | 'switching'>('none');
  const [switchFailed, setSwitchFailed] = useState(false);
  const pendingLink = useRef<string | null>(null);
  const switchStarted = useRef(false);
  const alive = useRef(true);
  const handled = useRef(false);
  const isWeb = Platform.OS === 'web';
  const navigationReady = useRootNavigationReady();
  const stage = recovery.stage;

  // Unmount-only: leaving the screen drops a link that is still waiting for the person's choice.
  useEffect(
    () => () => {
      alive.current = false;
      pendingLink.current = null;
    },
    [],
  );

  // Link intake — runs once per screen instance. Its only state write is the signed-in choice,
  // made after the auth context answers.
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
    const tokenHash = parsed.tokenHash;
    void verifyAuthLink({ tokenHash, type: 'recovery' }).then((outcome) => {
      // This phone is already signed in, so nothing was verified and nothing changed. Wait for the
      // person's choice: no timer, no default.
      if (outcome !== 'signed-in' || !alive.current) return;
      pendingLink.current = tokenHash;
      setChoice('asking');
      announce(SIGNED_IN_MESSAGE);
    });
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

  // "Stay signed in": drop the link and go home. The sign-in on this phone is not touched.
  function staySignedIn() {
    if (switchStarted.current) return;
    pendingLink.current = null;
    router.replace('/');
  }

  // "Sign out and continue": acts only on this explicit tap, and only on the first one. On success
  // the recovery stage becomes 'ready' and today's set-password form follows.
  function signOutAndContinue() {
    const tokenHash = pendingLink.current;
    if (switchStarted.current || tokenHash == null) return;
    switchStarted.current = true;
    setChoice('switching');
    void signOutAndVerifyAuthLink({ tokenHash, type: 'recovery' })
      .catch(() => false)
      .then((ok) => {
        pendingLink.current = null;
        if (!alive.current) return;
        setChoice('none');
        if (!ok) setSwitchFailed(true);
      });
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
  } else if (choice !== 'none') {
    // Only the heading, the message and the two buttons: the set-password form is not rendered at
    // all. "Stay signed in" is first and primary.
    body = (
      <View style={styles.form}>
        <Text variant="body" color="text">
          {SIGNED_IN_MESSAGE}
        </Text>
        <Button label={STAY_SIGNED_IN} fullWidth size="lg" onPress={staySignedIn} disabled={choice === 'switching'} />
        <Button
          label={SIGN_OUT_AND_CONTINUE}
          variant="secondary"
          fullWidth
          size="lg"
          onPress={signOutAndContinue}
          disabled={choice === 'switching'}
        />
      </View>
    );
  } else if (linkInvalid || stage === 'invalid' || switchFailed) {
    body = (
      <View style={styles.form}>
        <Text variant="body" color="text" accessibilityRole="alert">
          This link is invalid or has expired.
        </Text>
        <Text variant="caption" color="textSecondary">
          Reset links can only be used once and expire after a short time.
        </Text>
        <Button label="Request a new link" fullWidth size="lg" onPress={requestNewLink} />
        <SupportLink />
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
      {/* Keeps the new-password field being typed in visible above the keyboard on both Android
          and iOS; the button can be scrolled to (see src/app/_layout.tsx). The previous React
          Native KeyboardAvoidingView did nothing on Android. */}
      <KeyboardAwareScrollView
        bottomOffset={Spacing.five}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text variant="display" style={styles.heading} accessibilityRole="header">
            Reset your password
          </Text>
        </View>
        {body}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five },
  header: { paddingTop: Spacing.five, paddingBottom: Spacing.four, gap: Spacing.two },
  heading: { letterSpacing: -0.5 },
  form: { gap: Spacing.three },
  actions: { gap: Spacing.two, marginTop: Spacing.one },
  centered: { textAlign: 'center' },
  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: Spacing.two },
});
