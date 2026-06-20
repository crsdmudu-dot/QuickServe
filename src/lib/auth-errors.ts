export function mapAuthError(error: { message?: string } | null | undefined): string {
  const m = error?.message?.toLowerCase() ?? '';
  if (m.includes('invalid login credentials')) return 'Incorrect email or password.';
  if (m.includes('already registered') || m.includes('already exists')) {
    return 'An account with this email already exists.';
  }
  return 'Something went wrong. Please try again.';
}
