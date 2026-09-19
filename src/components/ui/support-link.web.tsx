import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { SUPPORT_EMAIL, buildSupportMailtoUrl } from '@/lib/support';

/**
 * SupportLink (web) — the same affordance as the native file, but as a real anchor.
 *
 * Why this file exists: react-native-web does NOT map `accessibilityRole="link"` to an anchor. Its
 * `roleComponents` table (modules/AccessibilityUtil/propsToAccessibilityComponent) covers button,
 * list, navigation and so on, but has no `link` entry, so a Pressable with that role renders
 * `<div role="link" tabindex="0">`. That div has no `href`: the browser will not activate it on
 * Enter, will not offer "copy email address", and shows nothing in the status bar. On the deployed
 * QA Auth bridge — a static page where this link is one of only two things a stranded user can do —
 * that is not good enough.
 *
 * So the web build renders a genuine `<a href="mailto:…">`. The href is the constant from
 * src/lib/support.ts, inlined at build time, and carries nothing else: no query, no fragment, no
 * subject or body, and nothing about the route, the token or the user. It also needs no JavaScript,
 * so it still works if the bundle fails to boot.
 *
 * The bridge's enforced CSP is `default-src 'none' … connect-src 'none' … form-action 'none'`. A
 * `mailto:` anchor is a top-level navigation governed by none of those directives, and it issues no
 * request, so nothing here relaxes the policy.
 */
export function SupportLink({ prompt = 'Need help?' }: { prompt?: string }) {
  return (
    <View style={styles.wrap}>
      <Text variant="caption" color="textSecondary">
        {prompt}
      </Text>
      <a
        href={buildSupportMailtoUrl()}
        aria-label={`Email KwikServe support at ${SUPPORT_EMAIL}`}
        style={anchorStyle}
      >
        <Text variant="label" color="primary" selectable style={styles.address}>
          {SUPPORT_EMAIL}
        </Text>
      </a>
    </View>
  );
}

// Plain CSS: this is a DOM element, not a React Native view.
const anchorStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  // 44px is the minimum comfortable touch target, and matches the native file.
  minHeight: 44,
  textDecoration: 'none',
} as const;

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  address: { textDecorationLine: 'underline' },
});
