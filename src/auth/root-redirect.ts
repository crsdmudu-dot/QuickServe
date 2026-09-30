import { roleHref, type Role } from '@/constants/roles';

export type RootRedirectInput = {
  isLoading: boolean;
  signedIn: boolean;
  role: Role | null;
  /** Current Expo Router segments (first segment is the top-level group or route). */
  segments: readonly string[];
  /** True while a password recovery is in progress (link verified, password not yet set). */
  recoveryActive: boolean;
  /** True when the signed-in customer or provider has not accepted the current Terms (F5.4). */
  termsRequired?: boolean;
};

export type RootRedirectTarget = '/welcome' | '/accept-terms' | ReturnType<typeof roleHref>;

/**
 * The root navigator's redirect decision (pure, so it can be tested without rendering).
 *
 *  - `auth/*` link routes (recovery, confirmation) manage their own lifecycle: they must be
 *    reachable while signed out and must not be left when the link creates a session.
 *  - While a recovery is active, ordinary role routing is held so the user reaches the
 *    set-password step before landing on a role home.
 *  - Otherwise: signed out outside onboarding → welcome.
 *  - Signed in without the current Terms accepted (F5.4) → the Terms screen, wherever they are,
 *    except account deletion: someone who declines the Terms must still be able to delete their
 *    account (store rule; the Terms screen links to it).
 *  - Signed in with a role inside onboarding, or on the Terms screen once accepted → role home.
 */
export function resolveRootRedirect(input: RootRedirectInput): RootRedirectTarget | null {
  const { isLoading, signedIn, role, segments, recoveryActive, termsRequired = false } = input;
  if (isLoading) return null;
  const first = segments[0];
  // The former `(admin-web)` group moved to the separated admin application (apps/admin), which
  // owns its own guard layout; this app has no administrative segment to exempt any more.
  if (first === 'auth') return null;
  if (recoveryActive) return null;
  const inOnboarding = first === '(onboarding)';
  const onTermsScreen = first === 'accept-terms';
  const onAccountDeletion = first === 'account' && segments[1] === 'delete';
  if (!signedIn && !inOnboarding) return '/welcome';
  if (signedIn && termsRequired && !onTermsScreen && !onAccountDeletion) return '/accept-terms';
  if (signedIn && role && (inOnboarding || (onTermsScreen && !termsRequired))) return roleHref(role);
  return null;
}
