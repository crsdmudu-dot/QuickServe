import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { PageMeta } from '@/components/admin-web/page-meta';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { validateLogin } from '@/lib/validation';

/**
 * Admin-only sign-in screen for the web admin panel.
 * Reuses the shared signIn / authError from auth context.
 * No sign-up link — admin accounts are provisioned manually.
 */
export default function AdminLoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signIn, authError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit() {
    const e = validateLogin({ email, password });
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const ok = await signIn(email, password);
    if (ok) {
      // Guard in _layout will re-evaluate on session change and show the dashboard.
      router.replace('/(admin-web)/dashboard' as Href);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <PageMeta title="Sign in" description="Sign in to the QuickServe admin panel." />
      <View style={styles.outer}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text variant="display" style={styles.heading}>
              Admin Panel
            </Text>
            <Text variant="body" color="textSecondary">
              Sign in with your admin account.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="admin@example.com"
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
              <Button label="Sign in" fullWidth size="lg" onPress={submit} />
              {authError ? (
                <Text variant="caption" color="error" style={styles.authError}>
                  {authError}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  outer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 20,
    borderWidth: 1,
    padding: Spacing.five,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.two,
  },
  heading: {
    letterSpacing: -0.5,
  },
  form: { gap: Spacing.three },
  actions: { gap: Spacing.two, marginTop: Spacing.one },
  authError: { textAlign: 'center' },
});
