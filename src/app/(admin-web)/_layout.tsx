import { Redirect, Slot, useSegments, type Href } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { AdminShell } from '@/components/admin-web/admin-shell';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAdminGuard } from '@/hooks/use-admin-guard';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

/**
 * Guard layout for the (admin-web) route group.
 *
 * Native-navigator invariant (Phase 3D):
 *   Once the (admin-web) navigator (<Slot/>) is mounted for a protected route, it stays
 *   mounted. Authorization state is expressed by OPAQUE OVERLAYS rendered on top of the
 *   navigator — never by swapping the navigator subtree for a non-navigator element.
 *   Replacing <Slot/> with a bare view during the transient "session set, role not yet
 *   resolved" window caused the React-Navigation native stack to churn and overflow
 *   ("Maximum update depth exceeded") on native; keeping <Slot/> mounted removes that
 *   churn. See docs/qa/PHASE-3D-NATIVE-NAVIGATOR-STABILIZATION.md.
 *
 * Behaviour:
 *   - login route            → renders normally (public).
 *   - anonymous (resolved)   → redirect to the admin login.
 *   - session, role resolving→ navigator mounted; opaque Loading overlay hides all UI.
 *   - session, not an admin  → navigator mounted; opaque "Not authorized" overlay.
 *   - session, admin         → dashboard (AdminShell + Slot), no overlay.
 *
 * The overlays are opaque and cover the entire layout, so protected admin UI is never
 * visible to a loading or non-admin user. RLS/backend authorization is unchanged.
 */
export default function AdminWebLayout() {
  const { loading, session, isAdmin } = useAdminGuard();
  const { signOut } = useAuth();
  const segments = useSegments();
  const theme = useTheme();

  // The login screen renders on its own (public) — no session required.
  const onLogin = segments[segments.length - 1] === 'login';
  if (onLogin) return <Slot />;

  // Anonymous on a protected route, once auth has RESOLVED (not still loading) → login.
  // While auth is still resolving we fall through and keep the navigator mounted below,
  // so the navigator subtree is never destroyed by a transient unresolved-auth state.
  if (!loading && !session) {
    return <Redirect href={'/(admin-web)/login' as Href} />;
  }

  // Session present or still resolving. The navigator (<Slot/>) stays mounted at a stable
  // position INSIDE AdminShell across every auth-state (loading / not-admin / admin) so an
  // auth transition never destroys/recreates the native navigator subtree. AdminShell only
  // renders its chrome (sidebar/top bar) for an authorized admin; loading and non-admin
  // users get an opaque overlay and no admin navigation.
  const isAuthorizedAdmin = !loading && !!session && isAdmin;
  const showLoading = loading || !session;
  const showNotAuthorized = !loading && !!session && !isAdmin;

  return (
    <View style={styles.root}>
      <AdminShell title="Admin" showChrome={isAuthorizedAdmin}>
        <Slot />
      </AdminShell>

      {showLoading && (
        <SafeAreaView style={[styles.overlay, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text variant="body" color="textSecondary" style={styles.loadingText}>
            Loading…
          </Text>
        </SafeAreaView>
      )}

      {showNotAuthorized && (
        <SafeAreaView style={[styles.overlay, { backgroundColor: theme.background }]}>
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  // Opaque full-screen overlay — obscures the mounted navigator entirely so protected
  // UI is never visible during loading / for non-admins.
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
