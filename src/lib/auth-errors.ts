import { SUPPORT_EMAIL } from '@/lib/support';

/**
 * Shown when an account is blocked from signing in (suspended, F5.6). Deliberately neutral: it does not say why, and
 * deleted accounts are blocked the same way.
 */
export const ACCOUNT_BLOCKED_MESSAGE = `This account can't sign in. If you think this is a mistake, contact ${SUPPORT_EMAIL}.`;

export function mapAuthError(error: { message?: string } | null | undefined): string {
  const m = error?.message?.toLowerCase() ?? '';
  if (m.includes('invalid login credentials')) return 'Incorrect email or password.';
  if (m.includes('user is banned') || m.includes('user_banned')) return ACCOUNT_BLOCKED_MESSAGE;
  if (m.includes('already registered') || m.includes('already exists')) {
    return 'An account with this email already exists.';
  }
  if (m.includes('link is invalid') || m.includes('token has expired') || m.includes('otp expired') || m.includes('otp_expired')) {
    return 'This link is invalid or has expired.';
  }
  if (m.includes('should be different from the old password') || m.includes('same_password')) {
    return 'Your new password must be different from your old password.';
  }
  if (m.includes('password should be at least') || m.includes('weak_password') || m.includes('password is too weak')) {
    return 'Please choose a stronger password (at least 8 characters).';
  }
  if (m.includes('email not confirmed')) {
    return 'Please confirm your email first — check your inbox for the verification link.';
  }
  if (m.includes('database error saving new user')) {
    return "We couldn't finish creating your account. Please try again shortly.";
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (
    m.includes('failed to fetch') ||
    m.includes('network') ||
    m.includes('fetch failed') ||
    m.includes('timeout')
  ) {
    return "Can't reach the server. Check your connection and try again.";
  }
  if (m.includes('invalid api key') || m.includes('project not found')) {
    return "The app can't reach its backend. Please contact support.";
  }
  return 'Something went wrong. Please try again.';
}
