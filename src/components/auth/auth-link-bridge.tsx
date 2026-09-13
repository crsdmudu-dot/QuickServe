import Head from 'expo-router/head';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { buildMobileHandoffUrl, parseAuthBridgeFragment, type BridgeLink } from '@/lib/auth-bridge';
import type { AuthLinkType } from '@/lib/auth-links';

/**
 * AuthLinkBridge — the web page an emailed auth link lands on (`/auth/recovery`, `/auth/confirm`).
 *
 * Lifecycle: read the URL fragment ONCE on first render, validate it (src/lib/auth-bridge.ts),
 * replace the browser history entry with the clean route so the one-time token hash leaves the
 * address bar and history, and keep the validated values in component memory only. Nothing is
 * stored, logged or sent anywhere: this component never imports the Supabase client and makes no
 * network request. The app is opened only when the user presses "Open QuickServe"; the
 * "Continue in browser" path is intentionally absent until the admin-web reset slice exists.
 */

/** Minimal browser surface, injectable for tests; defaults to `window`. */
export type BridgeBrowser = {
  readonly hash: string;
  readonly search: string;
  readonly pathname: string;
  replaceHistory(path: string): void;
  navigate(url: string): void;
};

function defaultBrowser(): BridgeBrowser | null {
  if (typeof window === 'undefined' || !window.location || !window.history) return null;
  return {
    get hash() {
      return window.location.hash;
    },
    get search() {
      return window.location.search;
    },
    get pathname() {
      return window.location.pathname;
    },
    replaceHistory(path: string) {
      // same-origin path only; drops both the fragment and any query string
      window.history.replaceState(null, '', path);
    },
    navigate(url: string) {
      window.location.assign(url);
    },
  };
}

const COPY: Record<AuthLinkType, { title: string; prompt: string }> = {
  recovery: { title: 'Reset your password', prompt: 'Open QuickServe to reset your password' },
  signup: { title: 'Confirm your email', prompt: 'Open QuickServe to confirm your email' },
};

export function AuthLinkBridge({ type, browser }: { type: AuthLinkType; browser?: BridgeBrowser }) {
  // First-render snapshot of the fragment: parsed once, never re-read.
  const [intake] = useState<{ link: BridgeLink; hadFragment: boolean }>(() => {
    const b = browser ?? defaultBrowser();
    const hash = b?.hash ?? '';
    return { link: parseAuthBridgeFragment(hash, type), hadFragment: hash.length > 0 };
  });
  const [handoff, setHandoff] = useState<'idle' | 'attempted'>('idle');
  const stripped = useRef(false);

  // Remove the fragment (and any query string) from the address bar and history promptly.
  useEffect(() => {
    if (stripped.current || !intake.hadFragment) return;
    stripped.current = true;
    const b = browser ?? defaultBrowser();
    if (b) b.replaceHistory(b.pathname);
  }, [browser, intake.hadFragment]);

  function openApp() {
    if (handoff === 'attempted' || !intake.link.ok) return;
    setHandoff('attempted');
    const b = browser ?? defaultBrowser();
    if (b) b.navigate(buildMobileHandoffUrl(intake.link));
  }

  const copy = COPY[type];
  return (
    <View style={styles.wrap}>
      <Head>
        <meta name="referrer" content="no-referrer" />
        <meta name="robots" content="noindex" />
      </Head>
      <Text variant="display" style={styles.heading}>
        {copy.title}
      </Text>
      {intake.link.ok ? (
        <View style={styles.block}>
          <Text variant="body" color="text">
            {copy.prompt}
          </Text>
          <Text variant="caption" color="textSecondary">
            This link works on the phone where the app is installed. It can be used once and expires after a short time.
          </Text>
          <Button label="Open QuickServe" fullWidth size="lg" onPress={openApp} disabled={handoff === 'attempted'} />
          {handoff === 'attempted' ? (
            <Text variant="caption" color="textSecondary" accessibilityRole="alert">
              If the app didn&apos;t open, install the QuickServe app on this phone and open the link from your email
              again, or request a new link from the app&apos;s sign-in screen.
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.block}>
          <Text variant="body" color="text" accessibilityRole="alert">
            This link is invalid or has expired.
          </Text>
          <Text variant="caption" color="textSecondary">
            Request a new link from the app&apos;s sign-in screen. Links can only be used once and expire after a short time.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three, maxWidth: 480, width: '100%', alignSelf: 'center' },
  heading: { letterSpacing: -0.5 },
  block: { gap: Spacing.three },
});
