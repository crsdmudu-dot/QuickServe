import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/auth-context';
import { AppLoadingScreen } from '@/components/ui/app-loading-screen';
import { roleHref } from '@/constants/roles';

/**
 * Root "/" entry dispatcher — NATIVE (customer/provider app).
 *
 * Phase 3G: previously both `(admin-web)/index` and `(customer)/index` resolved to "/",
 * so Expo Router non-deterministically opened the native app on the admin login. Now "/"
 * is owned solely by this dispatcher (the group homes moved to explicit paths:
 * customer → `/home`, admin dashboard → `/(admin-web)/dashboard`). On native the app is the
 * customer/provider product, so "/" routes into the onboarding flow (or the signed-in
 * user's home). The web override lives in `index.web.tsx` (→ the admin dashboard).
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
