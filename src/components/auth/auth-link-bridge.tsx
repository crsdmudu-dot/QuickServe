import { router } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { buildMobileHandoffUrl } from '@/lib/auth-bridge';
import { captureAuthBridgeIntake, claimFragmentRemoval, type BridgeWindow } from '@/lib/auth-bridge-intake';
import type { AuthLinkType } from '@/lib/auth-links';

/**
 * AuthLinkBridge — the web page an emailed auth link lands on (`/auth/recovery`, `/auth/confirm`).
 *
 * Lifecycle: read the URL fragment ONCE (src/lib/auth-bridge-intake.ts), validate it
 * (src/lib/auth-bridge.ts), take it out of the address bar and out of session history, and keep the
 * validated values in memory only. Nothing is stored, logged or sent anywhere: this component never
 * imports the Supabase client and makes no network request. The app is opened only when the user
 * presses "Open KwikServe"; the "Continue in browser" path is intentionally absent until the
 * admin-web reset slice exists.
 *
 * Removing the fragment goes through Expo Router's own navigation (`router.replace(pathname)`), not
 * through `history.replaceState` alone. A raw history write does not hold: Expo Router rewrites the
 * URL afterwards from the boot URL it remembers as `route.path`, and re-appends `location.hash`
 * while the focused route key is unchanged, so the token hash reappears in the address bar.
 * Replacing the route gives the router a new key and a remembered path with no fragment, so there
 * is nothing left for it to restore. The URL is cleared first so the router cannot re-append a live
 * hash, and checked again afterwards. See src/__tests__/auth-link-bridge-history.test.tsx.
 */

export type { BridgeWindow };

/** Memoised so the intake (a `WeakMap` keyed by this object) survives the remount. */
let sharedWindow: BridgeWindow | null = null;

function defaultBridgeWindow(): BridgeWindow | null {
  if (typeof window === 'undefined' || !window.location || !window.history) return null;
  if (!sharedWindow) {
    sharedWindow = {
      get hash() {
        return window.location.hash;
      },
      get pathname() {
        return window.location.pathname;
      },
      replaceRoute(path: string) {
        // Expo Router owns the URL: replacing the route replaces what it remembers about it.
        router.replace(path as Parameters<typeof router.replace>[0]);
      },
      clearFragment(path: string) {
        // same-origin path only; drops both the fragment and any query string
        window.history.replaceState(null, '', path);
      },
      navigate(url: string) {
        window.location.assign(url);
      },
    };
  }
  return sharedWindow;
}

const COPY: Record<AuthLinkType, { title: string; prompt: string }> = {
  recovery: { title: 'Reset your password', prompt: 'Open KwikServe to reset your password' },
  signup: { title: 'Confirm your email', prompt: 'Open KwikServe to confirm your email' },
};

export function AuthLinkBridge({ type, browser }: { type: AuthLinkType; browser?: BridgeWindow }) {
  // First-render snapshot of the fragment: read once per page load, kept in memory only.
  const [win] = useState<BridgeWindow | null>(() => browser ?? defaultBridgeWindow());
  const [intake] = useState(() => captureAuthBridgeIntake(type, win));
  const [handoff, setHandoff] = useState<'idle' | 'attempted'>('idle');

  useEffect(() => {
    if (!win || !intake.hadFragment) return;
    const assertClean = () => {
      if (win.hash.length > 0) win.clearFragment(win.pathname);
    };
    // 1. Take it out of the live URL, so the router has no `location.hash` left to re-append and
    //    never writes a history entry that carries the token, not even for one frame.
    assertClean();
    // The claim is held in the intake module, so the remount the navigation causes cannot start a
    // second navigation.
    if (claimFragmentRemoval(intake)) {
      // 2. Make the router forget the URL it booted with: a replaced route has a new key and a
      //    remembered path without a fragment, so there is nothing left for it to restore.
      win.replaceRoute(win.pathname);
      // 3. Closing assertion: whatever the router just wrote must not carry the fragment either.
      assertClean();
    }
  }, [intake, win]);

  function openApp() {
    if (handoff === 'attempted' || !intake.link.ok) return;
    setHandoff('attempted');
    if (win) win.navigate(buildMobileHandoffUrl(intake.link));
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
          <Button label="Open KwikServe" fullWidth size="lg" onPress={openApp} disabled={handoff === 'attempted'} />
          {handoff === 'attempted' ? (
            <Text variant="caption" color="textSecondary" accessibilityRole="alert">
              If the app didn&apos;t open, install the KwikServe app on this phone and open the link from your email
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
