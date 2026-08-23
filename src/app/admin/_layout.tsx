import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/auth/auth-context';
import { useAdminGuard } from '@/hooks/use-admin-guard';
import { roleHref } from '@/constants/roles';

/**
 * Role guard for the NATIVE `/admin/**` route group.
 *
 * Why this exists: the root navigator (`src/app/_layout.tsx`) guards authentication only — it
 * redirects signed-out users to `/welcome` and never checks role for this group. `(admin-web)`
 * has always guarded itself (its layout comment says so explicitly), but the native group never
 * received an equivalent. S24 physical certification proved the gap: a customer-authenticated
 * session deep-linked to `quickserve://admin/booking/<id>` and received Admin chrome.
 *
 * Data was never exposed beyond that customer's own booking — RLS held, and a customer-context
 * read was verified returning only their own rows. This guard is therefore DEFENCE IN DEPTH and
 * correct UX, not a replacement for RLS, which remains the authoritative data-layer control.
 *
 * Redirects reuse `roleHref`, the project's single role→destination mapping, rather than
 * introducing a second one:
 *   - signed out            → root layout already redirects to `/welcome`; render nothing here.
 *   - role still resolving  → render nothing, so admin chrome never flashes before the decision.
 *   - customer / provider   → redirect to their own home via `roleHref`.
 *   - admin                 → render the admin stack.
 *
 * Rendering `null` (rather than the Stack) while unauthorized is safe here because, unlike
 * `(admin-web)`, this group is a plain Stack that is not already mounted for a protected route —
 * the Phase 3D navigator-churn constraint does not apply.
 */
export default function AdminLayout() {
  const { loading, isAdmin } = useAdminGuard();
  const { signedIn, role } = useAuth();

  // Never render admin chrome before the role is known.
  if (loading) return null;

  // Unauthenticated: the root navigator owns this redirect. Render nothing meanwhile.
  if (!signedIn) return null;

  // Authenticated but not an admin — send them to their own area.
  if (!isAdmin) return <Redirect href={role ? roleHref(role) : '/welcome'} />;

  return <Stack screenOptions={{ headerShown: true, title: 'Admin' }} />;
}
