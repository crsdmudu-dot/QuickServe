import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { AuthLinkBridge } from '@/components/auth/auth-link-bridge';
import { Button } from '@/components/ui/button';
import { SupportLink } from '@/components/ui/support-link';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { parseAuthLinkParams } from '@/lib/auth-links';
import { useRootNavigationReady } from '@/hooks/use-root-navigation-ready';

/**
 * `/auth/confirm` — mobile email-confirmation link handler (`type=signup`).
 *
 * Reads the one-time token hash once, strips it from the visible route, and asks the auth
 * context to verify it. A successful verification signs the new user in; the screen then hands
 * off to the root dispatcher ("/"), which routes by the verified profile role. Invalid, expired
 * or reused links show one safe error state.
 * If this phone is already signed in, the link is not used: the screen asks first. "Stay signed in"
 * drops the link and changes nothing; only an explicit "Sign out and continue" signs out on this
 * phone and then uses the link.
 * On web this route is the HTTPS bridge (`AuthLinkBridge`): fragment read once, stripped, app
 * opened only on an explicit action; no auth request is made.
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

export default function ConfirmScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const { verifyAuthLink, signOutAndVerifyAuthLink } = useAuth();
  // Snapshot of the params this screen instance opened with (read once, then stripped).
  const [initialParams] = useState(params);
  const hadLinkParams = initialParams != null && ('token_hash' in initialParams || 'type' in initialParams);
  const parsed = useMemo(() => parseAuthLinkParams(initialParams, 'signup'), [initialParams]);
  // 'choice': this phone is already signed in, so the link was not used and the person is asked first.
  const [result, setResult] = useState<'pending' | 'choice' | 'invalid' | 'confirmed'>('pending');
  // While the choice is shown, the link's code is kept here, in this screen's memory only.
  const pendingLink = useRef<string | null>(null);
  const switchStarted = useRef(false);
  const [switching, setSwitching] = useState(false);
  const handled = useRef(false);
  const alive = useRef(true);
  const isWeb = Platform.OS === 'web';
  const navigationReady = useRootNavigationReady();

  // Unmount-only liveness flag (see the verification callback below). Leaving the screen also
  // drops a link that is still waiting for the person's choice.
  useEffect(
    () => () => {
      alive.current = false;
      pendingLink.current = null;
    },
    [],
  );

  useEffect(() => {
    if (isWeb || handled.current || !hadLinkParams) return;
    // The strip must not run before the root navigator is ready: `router.setParams` asserts
    // readiness and throws on a deep-link cold launch, which took down the whole screen through
    // the global error boundary before any verification could happen. Wait, without marking the
    // attempt handled, so the effect can run again once readiness arrives.
    if (!navigationReady) return;
    handled.current = true;
    // Strip the one-time secret from the route WITHOUT navigating. `router.replace` gives the
    // route a new key, which remounts this screen with its parameters already gone: the fresh
    // instance then derives `invalid` from the absent parameters while the in-flight verification
    // is discarded. `setParams` dispatches SET_PARAMS, which the router applies to the CURRENT
    // route (the vendored react-navigation BaseRouter spreads `{ ...r, params }`, so the key is
    // preserved), and this component instance survives to act on the result.
    try {
      router.setParams({ token_hash: undefined, type: undefined });
    } catch {
      // Fail closed. The token is never submitted while it may still be in router-visible state,
      // so no verification happens here. `router.replace` is queue-safe (it goes through `linkTo`
      // and `routingQueue`, with no readiness assertion), so it removes the parameters without
      // risking a second throw; the remounted screen has none and renders the neutral state.
      router.replace('/auth/confirm');
      return;
    }
    if (!parsed.ok) return;
    const tokenHash = parsed.tokenHash;
    void verifyAuthLink({ tokenHash, type: 'signup' }).then((outcome) => {
      // Guard on real unmount only. An effect-scoped flag cleared by this effect's own cleanup
      // would also fire whenever a dependency changes — `verifyAuthLink` is a fresh closure on
      // every provider render — and would silently discard a completed verification.
      if (!alive.current) return;
      if (outcome === 'signed-in') {
        // Nothing was verified and nothing changed. Wait for the person's choice: no timer, no default.
        pendingLink.current = tokenHash;
        setResult('choice');
        announce(SIGNED_IN_MESSAGE);
        return;
      }
      setResult(outcome ? 'confirmed' : 'invalid');
      if (outcome) router.replace('/');
    });
  }, [isWeb, hadLinkParams, navigationReady, parsed, verifyAuthLink]);

  // "Stay signed in": drop the link and go home. The sign-in on this phone is not touched.
  function staySignedIn() {
    if (switchStarted.current) return;
    pendingLink.current = null;
    router.replace('/');
  }

  // "Sign out and continue": acts only on this explicit tap, and only on the first one.
  function signOutAndContinue() {
    const tokenHash = pendingLink.current;
    if (switchStarted.current || tokenHash == null) return;
    switchStarted.current = true;
    setSwitching(true);
    void signOutAndVerifyAuthLink({ tokenHash, type: 'signup' })
      .catch(() => false)
      .then((ok) => {
        pendingLink.current = null;
        if (!alive.current) return;
        setResult(ok ? 'confirmed' : 'invalid');
        if (ok) router.replace('/');
      });
  }

  const state: 'checking' | 'choice' | 'invalid' | 'confirmed' =
    !parsed.ok || result === 'invalid' ? 'invalid' : result === 'pending' ? 'checking' : result;

  let body: React.ReactNode;
  if (isWeb) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <AuthLinkBridge type="signup" />
        </View>
      </SafeAreaView>
    );
  } else if (state === 'invalid') {
    body = (
      <View style={styles.form}>
        <Text variant="body" color="text" accessibilityRole="alert">
          This link is invalid or has expired.
        </Text>
        <Text variant="caption" color="textSecondary">
          Sign in to request a new confirmation email.
        </Text>
        <Button label="Go to sign in" fullWidth size="lg" onPress={() => router.replace('/signin')} />
        <SupportLink />
      </View>
    );
  } else if (state === 'choice') {
    // Only the heading, the message and the two buttons. "Stay signed in" is first and primary.
    body = (
      <View style={styles.form}>
        <Text variant="body" color="text">
          {SIGNED_IN_MESSAGE}
        </Text>
        <Button label={STAY_SIGNED_IN} fullWidth size="lg" onPress={staySignedIn} disabled={switching} />
        <Button
          label={SIGN_OUT_AND_CONTINUE}
          variant="secondary"
          fullWidth
          size="lg"
          onPress={signOutAndContinue}
          disabled={switching}
        />
      </View>
    );
  } else if (state === 'confirmed') {
    body = (
      <Text variant="body" color="text">
        Email confirmed. Taking you to the app…
      </Text>
    );
  } else {
    body = (
      <Text variant="body" color="textSecondary">
        Confirming your email…
      </Text>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text variant="display" style={styles.heading} accessibilityRole="header">
          Confirm your email
        </Text>
      </View>
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: Spacing.four },
  header: { paddingTop: Spacing.five, paddingBottom: Spacing.four, gap: Spacing.two },
  heading: { letterSpacing: -0.5 },
  form: { gap: Spacing.three },
});
