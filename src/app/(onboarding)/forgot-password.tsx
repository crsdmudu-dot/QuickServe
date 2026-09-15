import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AUTH_LINK_REQUEST_COPY, authLinkFailureCopy, isNeutralSuccess, type AuthLinkRequestOutcome } from '@/lib/auth-link-request';
import { validateEmail } from '@/lib/validation';

/**
 * Shared customer/provider "forgot password" screen (identity-level: no role branching).
 *
 * The response is deliberately neutral — the same confirmation is shown whether or not an
 * account exists for the address, so the screen never reveals account existence. Only a
 * transport/service failure shows a generic retry message. Nothing is requested on render.
 */
export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<'idle' | 'sending' | AuthLinkRequestOutcome>('idle');

  // The web export is the admin surface; password recovery there is a separate slice.
  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <Text variant="display" style={styles.heading}>
            Forgot your password?
          </Text>
          <Text variant="body" color="textSecondary">
            Password reset is available in the KwikServe mobile app.
          </Text>
        </View>
        <View style={styles.linkRow}>
          <Text variant="label" color="primary" onPress={() => router.replace('/signin')}>
            Back to sign in
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  async function submit() {
    const e = validateEmail(email);
    setError(e ?? undefined);
    if (e) return;
    setStatus('sending');
    const result = await requestPasswordReset(email);
    setStatus(result);
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text variant="display" style={styles.heading}>
          Forgot your password?
        </Text>
        <Text variant="body" color="textSecondary">
          Enter your email and we&apos;ll send you a link to set a new password.
        </Text>
      </View>

      {status !== 'idle' && status !== 'sending' && isNeutralSuccess(status) ? (
        <View style={styles.form}>
          <Text variant="body" color="text" accessibilityRole="alert">
            {AUTH_LINK_REQUEST_COPY.resetSent}
          </Text>
          <Text variant="caption" color="textSecondary">
            Open the link on this phone to continue. It expires after a short time.
          </Text>
          {status === 'sent-rate-limited' ? (
            <Text variant="caption" color="textSecondary">
              {AUTH_LINK_REQUEST_COPY.rateLimitHint}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.form}>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            error={error}
          />
          <View style={styles.actions}>
            <Button label="Send reset link" fullWidth size="lg" onPress={submit} loading={status === 'sending'} />
            {status !== 'idle' && status !== 'sending' ? (
              <Text variant="caption" color="error" style={styles.centered} accessibilityRole="alert">
                {authLinkFailureCopy(status)}
              </Text>
            ) : null}
          </View>
        </View>
      )}

      <View style={styles.linkRow}>
        <Text variant="label" color="primary" onPress={() => router.replace('/signin')}>
          Back to sign in
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: Spacing.four },
  header: { paddingTop: Spacing.five, paddingBottom: Spacing.five, gap: Spacing.two },
  heading: { letterSpacing: -0.5 },
  form: { gap: Spacing.three },
  actions: { gap: Spacing.two, marginTop: Spacing.one },
  centered: { textAlign: 'center' },
  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: Spacing.four },
});
