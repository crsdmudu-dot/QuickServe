import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/auth-context';
import { AppLoadingScreen } from '@/components/ui/app-loading-screen';
import { roleHref } from '@/constants/roles';

/**
 * Root "/" entry dispatcher for the consumer app (native and web).
 *
 * Phase 3G gave "/" a single owner after the customer and admin group indexes both resolved
 * to it and Expo Router opened the native app on the admin login non-deterministically. The
 * admin surface has since moved out of this application entirely (apps/admin), so the former
 * web-only override (index.web.tsx → the admin dashboard) was removed: web and native now
 * share this one dispatcher, and the consumer product is the only thing "/" can reach.
 *
 * No auth logic changes: this only chooses a destination from the already-resolved auth
 * state and redirects. It never renders protected content itself.
 */
export default function Index() {
  const { isLoading, signedIn, role } = useAuth();
  // While auth resolves, render a branded green screen — NEVER `null`. A bare `null` here
  // rendered as a BLACK SCREEN on a physical cold relaunch: the timed splash overlay lifts
  // (~1.4s) before the network profile fetch that gates `isLoading` completes, exposing this
  // frame. AppLoadingScreen matches the splash gradient so the handoff is seamless. (Auth
  // logic is unchanged — this only chooses what to render while loading.)
  if (isLoading) return <AppLoadingScreen />;
  if (signedIn && role) return <Redirect href={roleHref(role)} />;
  return <Redirect href="/welcome" />;
}
