import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export default function WelcomeScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      {/* Hero section */}
      <View style={styles.hero}>
        <LinearGradient
          colors={[theme.primarySurface, theme.background]}
          style={styles.gradient}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
        <View style={styles.markWrap}>
          <Text style={styles.mark}>⚡</Text>
        </View>
        <Text variant="display" style={styles.brand}>QuickServe</Text>
        <Text variant="body" color="textSecondary" style={styles.tagline}>
          Premium services, on demand.
        </Text>
      </View>

      {/* CTA section */}
      <View style={styles.cta}>
        <Button label="Get Started" fullWidth size="lg" onPress={() => router.push('/role-select')} />
        <View style={styles.loginRow}>
          <Text variant="body" color="textSecondary">Already have an account? </Text>
          <Text variant="label" color="primary" onPress={() => router.push('/login')}>Log in</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    overflow: 'hidden',
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  markWrap: {
    width: 80,
    height: 80,
    borderRadius: Radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  mark: {
    fontSize: 48,
  },
  brand: {
    letterSpacing: -1,
  },
  tagline: {
    textAlign: 'center',
    paddingHorizontal: Spacing.five,
  },
  cta: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
