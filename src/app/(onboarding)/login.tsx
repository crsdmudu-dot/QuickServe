import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { validateLogin } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

export default function LoginScreen() {
  const theme = useTheme();
  const { signIn, authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const e = validateLogin({ email, password });
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    await signIn(email, password); // gating routes on success
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="display" style={styles.heading}>Welcome back</Text>
        <Text variant="body" color="textSecondary">
          Sign in to continue.
        </Text>
      </View>

      {/* Form */}
      <View style={styles.form}>
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
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          secureTextEntry
          autoCapitalize="none"
          error={errors.password}
        />

        <View style={styles.actions}>
          <Button label="Continue" fullWidth size="lg" onPress={submit} />
          {authError ? (
            <Text variant="caption" color="error" style={styles.authError}>
              {authError}
            </Text>
          ) : null}
        </View>

        <View style={styles.linkRow}>
          <Text variant="body" color="textSecondary">New here? </Text>
          <Text variant="label" color="primary" onPress={() => router.push('/register')}>
            Register
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: Spacing.four },
  header: {
    paddingTop: Spacing.five,
    paddingBottom: Spacing.five,
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
