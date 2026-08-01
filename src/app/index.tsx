import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/auth-context';
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
  if (isLoading) return null; // brief: auth resolving (the animated splash overlay covers this)
  if (signedIn && role) return <Redirect href={roleHref(role)} />;
  return <Redirect href="/welcome" />;
}
