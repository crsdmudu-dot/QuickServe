// accept-terms.tsx — the one-time Terms prompt (F5.4).
// The root navigator sends a signed-in customer or provider here when they have not accepted the current Terms, and
// back to their home once they have. Accepting is recorded on the server (accept_terms); until then the database
// refuses their chat messages, reviews and bio changes.
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';

import { Spacing } from '@/constants/theme';
import { TERMS_KEY_POINTS, termsUrl } from '@/constants/terms';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/auth/auth-context';
import { useTermsGate } from '@/auth/terms-gate';
import { Button } from '@/components/ui/button';
import { PrivacyLink } from '@/components/ui/privacy-link';
import { SupportLink } from '@/components/ui/support-link';
import { Text } from '@/components/ui/text';

export default function AcceptTermsScreen() {
  const theme = useTheme();
  const { signOut } = useAuth();
  const { accept } = useTermsGate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = termsUrl();

  async function agree() {
    setBusy(true);
    setError(null);
    const result = await accept();
    setBusy(false);
    if (!result.ok) setError(result.error ?? 'Could not record your acceptance. Please try again.');
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text variant="display" style={styles.heading}>
            Before you continue
          </Text>
          <Text variant="body" color="textSecondary">
            To keep KwikServe safe for everyone, please agree to our Terms of Service.
          </Text>
        </View>

        <View style={styles.points} testID="terms-key-points">
          {TERMS_KEY_POINTS.map((point) => (
            <View key={point} style={styles.pointRow}>
              <Text variant="body">•</Text>
              <Text variant="body" style={styles.pointText}>
                {point}
              </Text>
            </View>
          ))}
        </View>

        {url ? (
          // D-12: the Privacy Policy link sits beside the Terms link (both come from the same website address).
          <View style={styles.links}>
            <Text
              variant="label"
              color="primary"
              accessibilityRole="link"
              onPress={() => void Linking.openURL(url)}>
              Read the full Terms
            </Text>
            <PrivacyLink label="Read the Privacy Policy" testID="accept-terms-privacy-link" />
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button testID="accept-terms-agree" label="I agree" fullWidth size="lg" onPress={agree} loading={busy} />
          {error ? (
            <Text variant="caption" color="error" style={styles.center} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button testID="accept-terms-sign-out" label="Sign out" variant="ghost" fullWidth onPress={() => void signOut()} />
        </View>

        {/* Declining the Terms must never trap anyone: deletion and support stay reachable (store rule). */}
        <View style={styles.footer}>
          <Text
            testID="accept-terms-delete-account"
            variant="label"
            color="textSecondary"
            accessibilityRole="link"
            onPress={() => router.push('/account/delete' as Href)}
            style={styles.center}>
            Delete my account
          </Text>
          <SupportLink prompt="Questions about the Terms?" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five },
  header: { paddingTop: Spacing.five, paddingBottom: Spacing.four, gap: Spacing.two },
  heading: { letterSpacing: -0.5 },
  points: { gap: Spacing.two },
  pointRow: { flexDirection: 'row', gap: Spacing.two },
  pointText: { flex: 1 },
  // The two links share one row (wrapping on narrow screens).
  links: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: Spacing.four, marginTop: Spacing.three },
  actions: { gap: Spacing.two, marginTop: Spacing.four },
  footer: { gap: Spacing.three, marginTop: Spacing.five, alignItems: 'center' },
  center: { textAlign: 'center' },
});
