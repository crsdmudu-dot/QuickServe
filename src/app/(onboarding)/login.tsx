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
      <Text variant="title">Welcome back</Text>
      <View style={styles.form}>
        <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" error={errors.email} />
        <Input label="Password" value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry autoCapitalize="none" error={errors.password} />
        <Button label="Continue" fullWidth onPress={submit} />
        {authError ? <Text variant="caption" color="error">{authError}</Text> : null}
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
  safe: { flex: 1, padding: Spacing.four, gap: Spacing.four },
  form: { gap: Spacing.three },
  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
});
