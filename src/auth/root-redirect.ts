import { roleHref, type Role } from '@/constants/roles';

export type RootRedirectInput = {
  isLoading: boolean;
  signedIn: boolean;
  role: Role | null;
  /** Current Expo Router segments (first segment is the top-level group or route). */
  segments: readonly string[];
  /** True while a password recovery is in progress (link verified, password not yet set). */
  recoveryActive: boolean;
};

export type RootRedirectTarget = '/welcome' | ReturnType<typeof roleHref>;

/**
 * The root navigator's redirect decision (pure, so it can be tested without rendering).
 *
 *  - `auth/*` link routes (recovery, confirmation) manage their own lifecycle: they must be
 *    reachable while signed out and must not be left when the link creates a session.
 *  - While a recovery is active, ordinary role routing is held so the user reaches the
 *    set-password step before landing on a role home.
 *  - Otherwise: signed out outside onboarding → welcome; signed in with a role inside
 *    onboarding → role home.
 */
export function resolveRootRedirect(input: RootRedirectInput): RootRedirectTarget | null {
  const { isLoading, signedIn, role, segments, recoveryActive } = input;
  if (isLoading) return null;
  const first = segments[0];
  // The former `(admin-web)` group moved to the separated admin application (apps/admin), which
  // owns its own guard layout; this app has no administrative segment to exempt any more.
  if (first === 'auth') return null;
  if (recoveryActive) return null;
  const inOnboarding = first === '(onboarding)';
  if (!signedIn && !inOnboarding) return '/welcome';
  if (signedIn && role && inOnboarding) return roleHref(role);
  return null;
}
