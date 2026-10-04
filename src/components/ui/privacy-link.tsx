// privacy-link.tsx — the link to the KwikServe Privacy Policy on the website (D-12; App Store 5.1.1(i), Google Play
// User Data policy: the privacy policy must be reachable inside the app).
//
// It follows the Terms link: the address comes from privacyUrl() (EXPO_PUBLIC_WEBSITE_URL, https only), and while the
// website address is not configured the link is not shown at all, so it is never a broken link.
import { Linking, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { privacyUrl } from '@/constants/terms';
import { Text } from '@/components/ui/text';

export type PrivacyLinkProps = {
  /** The visible words. "Privacy Policy" on the Profile screens, "Read the Privacy Policy" beside the Terms link. */
  label?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function PrivacyLink({ label = 'Privacy Policy', style, testID = 'privacy-link' }: PrivacyLinkProps) {
  const url = privacyUrl();
  if (!url) return null;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityHint="Opens the KwikServe website"
      // Fail quietly, like the support link: a device with no browser must not break the screen.
      onPress={() => void Linking.openURL(url).catch(() => {})}
      style={[styles.link, style]}>
      <Text variant="label" color="primary">
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 44pt is the minimum comfortable touch target on both platforms.
  link: { minHeight: 44, justifyContent: 'center' },
});
