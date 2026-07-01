import { Redirect, Slot, useSegments, type Href } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAdminGuard } from '@/hooks/use-admin-guard';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

/**
 * Guard layout for the (admin-web) route group.
 * - The login route always renders so we avoid an infinite redirect loop.
 * - All other routes require an authenticated admin session.
 * - Non-admin authenticated users see a "Not authorized" screen with a sign-out option.
 */
export default function AdminWebLayout() {
  const { loading, session, isAdmin } = useAdminGuard();
  const { signOut } = useAuth();
  const segments = useSegments();
  const theme = useTheme();

  // Allow the login screen to render regardless of auth state.
  const onLogin = segments[segments.length - 1] === 'login';
  if (onLogin) return <Slot />;

  // Still resolving session / role from the auth context.
  if (loading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text variant="body" color="textSecondary" style={styles.loadingText}>
          Loading…
        </Text>
      </SafeAreaView>
    );
  }

  // No session — redirect to the admin login screen.
  if (!session) {
    return <Redirect href={'/(admin-web)/login' as Href} />;
  }

  // Session exists but the user is not an admin.
  if (!isAdmin) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.background }]}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text variant="heading" color="text" style={styles.cardTitle}>
            Not authorized
          </Text>
          <Text variant="body" color="textSecondary" style={styles.cardBody}>
            Your account does not have admin access.
          </Text>
          <Button label="Sign out" size="md" onPress={signOut} />
        </View>
      </SafeAreaView>
    );
  }

  // Authenticated admin — render the route. T3 will wrap this in <AdminShell>.
  return <Slot />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  loadingText: {
    marginTop: Spacing.two,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
  },
  cardTitle: {
    textAlign: 'center',
  },
  cardBody: {
    textAlign: 'center',
  },
});
