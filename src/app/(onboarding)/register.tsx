import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { validateRegister } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

export default function RegisterScreen() {
  const theme = useTheme();
  const { signUp, authError } = useAuth();
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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="title">Create your account</Text>
        <View style={styles.form}>
          <Input label="Full name" value={name} onChangeText={setName} placeholder="Full name" autoCapitalize="words" error={errors.name} />
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" error={errors.email} />
          <Input label="Phone number" value={phone} onChangeText={setPhone} placeholder="07xx xxx xxx" keyboardType="phone-pad" error={errors.phone} />
          <Input label="Password" value={password} onChangeText={setPassword} placeholder="Create a password" secureTextEntry autoCapitalize="none" error={errors.password} />
          <Input label="Confirm password" value={confirm} onChangeText={setConfirm} placeholder="Confirm password" secureTextEntry autoCapitalize="none" error={errors.confirm} />
          <Button label="Create account" fullWidth onPress={submit} />
          {authError ? <Text variant="caption" color="error">{authError}</Text> : null}
          <View style={styles.linkRow}>
            <Text variant="body" color="textSecondary">Have an account? </Text>
            <Text variant="label" color="primary" onPress={() => router.push('/login')}>
              Login
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: Spacing.four, gap: Spacing.four },
  form: { gap: Spacing.three },
  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
});
