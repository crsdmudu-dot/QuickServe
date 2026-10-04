// terms-consent.tsx — the "I agree to the Terms of Service" checkbox on the register screen (F5.4).
// It is a real checkbox for screen readers (role + checked state). The links to the full Terms and to the Privacy
// Policy (D-12) appear only when the website address is configured (see termsUrl), so they are never broken links.
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Radii, Spacing } from '@/constants/theme';
import { termsUrl } from '@/constants/terms';
import { useTheme } from '@/hooks/use-theme';
import { PrivacyLink } from '@/components/ui/privacy-link';
import { Text } from '@/components/ui/text';

export type TermsConsentProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
};

export function TermsConsent({ checked, onChange, error }: TermsConsentProps) {
  const theme = useTheme();
  const url = termsUrl();
  return (
    <View style={styles.wrap}>
      <Pressable
        testID="terms-consent"
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel="I agree to the KwikServe Terms of Service"
        onPress={() => onChange(!checked)}
        style={styles.row}>
        <View
          style={[
            styles.box,
            { borderColor: error ? theme.error : theme.borderStrong, backgroundColor: checked ? theme.primary : 'transparent' },
          ]}>
          {checked ? <Text style={styles.tick}>✓</Text> : null}
        </View>
        <Text variant="body" style={styles.label}>
          I agree to the KwikServe Terms of Service, including the rules for messages, reviews and profiles.
        </Text>
      </Pressable>
      {url ? (
        // D-12: the Privacy Policy link sits beside the Terms link (both come from the same website address).
        <View style={styles.links}>
          <Text
            variant="label"
            color="primary"
            accessibilityRole="link"
            onPress={() => void Linking.openURL(url)}>
            Read the Terms
          </Text>
          <PrivacyLink label="Read the Privacy Policy" testID="terms-consent-privacy-link" />
        </View>
      ) : null}
      {error ? (
        <Text variant="caption" color="error" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  box: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  tick: { color: '#FFFFFF', fontSize: 14, lineHeight: 16 },
  label: { flex: 1 },
  // The two links share one row (wrapping on narrow screens), lined up with the checkbox label.
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.four,
    marginLeft: 22 + Spacing.two,
  },
});
