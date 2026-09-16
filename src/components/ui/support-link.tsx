import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { SUPPORT_EMAIL, buildSupportMailtoUrl } from '@/lib/support';

/**
 * SupportLink — offers the support mailbox wherever a user may need help.
 *
 * Opens the address with `Linking.openURL`. It deliberately does NOT call `Linking.canOpenURL`
 * first: that goes through `queryIntentActivities` on Android and `LSApplicationQueriesSchemes` on
 * iOS, which would make this component require a native declaration and a new binary to change.
 * `openURL` needs neither. When it rejects — no mail app configured — the address stays on screen
 * as selectable text, so the user can still copy it.
 *
 * The URL comes from `buildSupportMailtoUrl()` and carries nothing else. See src/lib/support.ts for
 * why that matters on the Auth surfaces.
 */
export function SupportLink({ prompt = 'Need help?' }: { prompt?: string }) {
  return (
    <View style={styles.wrap}>
      <Text variant="caption" color="textSecondary">
        {prompt}
      </Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Email KwikServe support at ${SUPPORT_EMAIL}`}
        onPress={() => {
          // Fail quietly: a missing mail client must not take down the screen this sits on, which
          // is often already an error state.
          void Linking.openURL(buildSupportMailtoUrl()).catch(() => {});
        }}
        style={styles.link}
      >
        <Text variant="label" color="primary" selectable style={styles.address}>
          {SUPPORT_EMAIL}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  // 44pt is the minimum comfortable touch target on both platforms.
  link: { minHeight: 44, justifyContent: 'center' },
  address: { textDecorationLine: 'underline' },
});
