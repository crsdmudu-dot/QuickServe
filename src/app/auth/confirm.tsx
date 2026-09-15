import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { AuthLinkBridge } from '@/components/auth/auth-link-bridge';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { parseAuthLinkParams } from '@/lib/auth-links';

/**
 * `/auth/confirm` — mobile email-confirmation link handler (`type=signup`).
 *
 * Reads the one-time token hash once, strips it from the visible route, and asks the auth
 * context to verify it. A successful verification signs the new user in; the screen then hands
 * off to the root dispatcher ("/"), which routes by the verified profile role. Invalid, expired
 * or reused links show one safe error state and never affect an existing session.
 * On web this route is the HTTPS bridge (`AuthLinkBridge`): fragment read once, stripped, app
 * opened only on an explicit action; no auth request is made.
 */
export default function ConfirmScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const { verifyAuthLink } = useAuth();
  // Snapshot of the params this screen instance opened with (read once, then stripped).
  const [initialParams] = useState(params);
  const hadLinkParams = initialParams != null && ('token_hash' in initialParams || 'type' in initialParams);
  const parsed = useMemo(() => parseAuthLinkParams(initialParams, 'signup'), [initialParams]);
  const [result, setResult] = useState<'pending' | 'invalid' | 'confirmed'>('pending');
  const handled = useRef(false);
  const alive = useRef(true);
  const isWeb = Platform.OS === 'web';

  // Unmount-only liveness flag (see the verification callback below).
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  useEffect(() => {
    if (isWeb || handled.current) return;
    handled.current = true;
    // Strip the one-time secret from the route WITHOUT navigating. `router.replace` gives the
    // route a new key, which remounts this screen with its parameters already gone: the fresh
    // instance then derives `invalid` from the absent parameters while the in-flight verification
    // is discarded by the `active` guard below. That is exactly how a server-side success
    // (POST /auth/v1/verify -> 200) surfaced as "This link is invalid or has expired." on a
    // physical iPhone. `setParams` dispatches SET_PARAMS, which the router applies to the CURRENT
    // route (see the vendored react-navigation BaseRouter: it spreads `{ ...r, params }`, so the
    // key is preserved), so this component instance survives to act on the result.
    if (hadLinkParams) router.setParams({ token_hash: undefined, type: undefined });
    if (!parsed.ok) return;
    void verifyAuthLink({ tokenHash: parsed.tokenHash, type: 'signup' }).then((ok) => {
      // Guard on real unmount only. An effect-scoped flag cleared by this effect's own cleanup
      // would also fire whenever a dependency changes — `verifyAuthLink` is a fresh closure on
      // every provider render — and would silently discard a completed verification.
      if (!alive.current) return;
      setResult(ok ? 'confirmed' : 'invalid');
      if (ok) router.replace('/');
    });
  }, [isWeb, hadLinkParams, parsed, verifyAuthLink]);

  const state: 'checking' | 'invalid' | 'confirmed' = !parsed.ok || result === 'invalid' ? 'invalid' : result === 'confirmed' ? 'confirmed' : 'checking';

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
        <Text variant="display" style={styles.heading}>
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
