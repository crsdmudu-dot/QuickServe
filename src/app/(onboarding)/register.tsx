import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { AUTH_LINK_REQUEST_COPY, authLinkFailureCopy, isNeutralSuccess, type AuthLinkRequestOutcome } from '@/lib/auth-link-request';
import { validateRegister } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

export default function RegisterScreen() {
  const theme = useTheme();
  const { signUp, authError, profileError, pendingConfirmationEmail, resendConfirmation, clearPendingConfirmation } =
    useAuth();
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | AuthLinkRequestOutcome>('idle');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const e = validateRegister({ name, email, phone, password, confirm });
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    await signUp({ fullName: name, email, phone, password }); // gating routes on success
  }

  async function resend() {
    if (!pendingConfirmationEmail) return;
    setResendStatus('sending');
    setResendStatus(await resendConfirmation(pendingConfirmationEmail));
  }

  function backToSignIn() {
    clearPendingConfirmation();
    router.replace('/signin');
  }

  // Sign-up succeeded but the project requires email confirmation: no session yet.
  if (pendingConfirmationEmail) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text variant="display" style={styles.heading}>
              Check your email
            </Text>
            <Text variant="body" color="textSecondary">
              We sent a confirmation link to {pendingConfirmationEmail}. Open it on this phone to finish creating
              your account.
            </Text>
          </View>
          <View style={styles.form}>
            <Button label="Resend email" fullWidth size="lg" variant="secondary" onPress={resend} loading={resendStatus === 'sending'} />
            {resendStatus !== 'idle' && resendStatus !== 'sending' && isNeutralSuccess(resendStatus) ? (
              <Text variant="caption" color="textSecondary" style={styles.authError} accessibilityRole="alert">
                {AUTH_LINK_REQUEST_COPY.confirmationSent}
                {resendStatus === 'sent-rate-limited' ? ` ${AUTH_LINK_REQUEST_COPY.rateLimitHint}` : ''}
              </Text>
            ) : null}
            {resendStatus !== 'idle' && resendStatus !== 'sending' && !isNeutralSuccess(resendStatus) ? (
              <Text variant="caption" color="error" style={styles.authError} accessibilityRole="alert">
                {authLinkFailureCopy(resendStatus)}
              </Text>
            ) : null}
            <View style={styles.linkRow}>
              <Text variant="label" color="primary" onPress={backToSignIn}>
                Back to sign in
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text variant="display" style={styles.heading}>Create your account</Text>
          <Text variant="body" color="textSecondary">
            Join KwikServe today.
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Input
            label="Full name"
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            autoCapitalize="words"
            error={errors.name}
          />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
          />
          <Input
            label="Phone number"
            value={phone}
            onChangeText={setPhone}
            placeholder="07xx xxx xxx"
            keyboardType="phone-pad"
            error={errors.phone}
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Create a password"
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
            <Button label="Create account" fullWidth size="lg" onPress={submit} />
            {authError ? (
              <Text variant="caption" color="error" style={styles.authError}>
                {authError}
              </Text>
            ) : null}
            {profileError ? (
              <Text variant="caption" color="error" style={styles.authError}>
                {profileError}
              </Text>
            ) : null}
          </View>

          <View style={styles.linkRow}>
            <Text variant="body" color="textSecondary">Have an account? </Text>
            <Text variant="label" color="primary" onPress={() => router.push('/signin')}>
              Login
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five },
  header: {
    paddingTop: Spacing.five,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  heading: {
    letterSpacing: -0.5,
  },
  form: { gap: Spacing.three },
  actions: { gap: Spacing.two, marginTop: Spacing.one },
  authError: { textAlign: 'center' },
  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: Spacing.two },
});
