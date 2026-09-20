/**
 * Staff notice screen — the consumer app's destination for an `admin` identity.
 *
 * Administration was separated out of the consumer application (see apps/admin): the mobile
 * bundle contains no administrative routes, screens or navigation targets, so an admin who
 * signs in here has nothing to land on. Rather than dropping them on a customer home they are
 * not entitled to, or leaving them on a blank screen, this route explains where administration
 * lives and offers a working sign-out.
 *
 * Deliberately inert:
 *   - no administrative data is read and no administrative RPC is called;
 *   - the portal URL is NOT rendered or linked. Publishing an internal console address from a
 *     consumer binary is a disclosure decision that needs the Production URL and its security
 *     posture verified first, so the copy names the portal without addressing it.
 *
 * `roleHref('admin')` points here (src/constants/roles.ts), so this is reached by the ordinary
 * role routing path — no special-casing in the root navigator.
 */

import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function StaffNoticeScreen() {
  const theme = useTheme();
  const { signOut } = useAuth();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <Card style={styles.card}>
          <Text variant="title">Administration is on the web portal</Text>
          <Text variant="body" color="textSecondary" style={styles.body}>
            This account is a KwikServe staff account. The mobile app serves customers and service
            providers only — administrative tools are not part of it.
          </Text>
          <Text variant="body" color="textSecondary" style={styles.body}>
            Sign in to the KwikServe admin portal from a web browser to continue. If you do not
            know its address, ask your KwikServe administrator.
          </Text>
          <Button label="Sign out" fullWidth size="lg" onPress={() => void signOut()} />
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  card: { gap: Spacing.three, padding: Spacing.four },
  body: { lineHeight: 22 },
});
