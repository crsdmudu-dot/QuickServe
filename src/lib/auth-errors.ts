export function mapAuthError(error: { message?: string } | null | undefined): string {
  const m = error?.message?.toLowerCase() ?? '';
  if (m.includes('invalid login credentials')) return 'Incorrect email or password.';
  if (m.includes('already registered') || m.includes('already exists')) {
    return 'An account with this email already exists.';
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
