import { mapAuthError } from '@/lib/auth-errors';

describe('mapAuthError', () => {
  it('maps invalid login credentials', () => {
    expect(mapAuthError({ message: 'Invalid login credentials' })).toBe('Incorrect email or password.');
  });

  it('maps already registered', () => {
    expect(mapAuthError({ message: 'User already registered' })).toBe(
      'An account with this email already exists.',
    );
  });

  it('maps already exists', () => {
    expect(mapAuthError({ message: 'Email already exists' })).toBe(
      'An account with this email already exists.',
    );
  });

  it('maps email not confirmed', () => {
    expect(mapAuthError({ message: 'Email not confirmed' })).toBe(
      'Please confirm your email first — check your inbox for the verification link.',
    );
  });

  it('maps database error saving new user', () => {
    expect(mapAuthError({ message: 'Database error saving new user' })).toBe(
      "We couldn't finish creating your account. Please try again shortly.",
    );
  });

  it('maps rate limit', () => {
    expect(mapAuthError({ message: 'Rate limit exceeded' })).toBe(
      'Too many attempts. Please wait a moment and try again.',
    );
  });

  it('maps too many requests', () => {
    expect(mapAuthError({ message: 'Too many requests' })).toBe(
      'Too many attempts. Please wait a moment and try again.',
    );
  });

  it('maps failed to fetch', () => {
    expect(mapAuthError({ message: 'Failed to fetch' })).toBe(
      "Can't reach the server. Check your connection and try again.",
    );
  });

  it('maps fetch failed', () => {
    expect(mapAuthError({ message: 'fetch failed' })).toBe(
      "Can't reach the server. Check your connection and try again.",
    );
  });

  it('maps network error', () => {
    expect(mapAuthError({ message: 'Network error occurred' })).toBe(
      "Can't reach the server. Check your connection and try again.",
    );
  });

  it('maps timeout', () => {
    expect(mapAuthError({ message: 'Request timeout' })).toBe(
      "Can't reach the server. Check your connection and try again.",
    );
  });

  it('maps invalid api key', () => {
    expect(mapAuthError({ message: 'Invalid API key' })).toBe(
      "The app can't reach its backend. Please contact support.",
    );
  });

  it('maps project not found', () => {
    expect(mapAuthError({ message: 'Project not found' })).toBe(
      "The app can't reach its backend. Please contact support.",
    );
  });

  it('returns generic fallback for unknown errors', () => {
    expect(mapAuthError({ message: 'some unexpected error' })).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('returns generic fallback for null', () => {
    expect(mapAuthError(null)).toBe('Something went wrong. Please try again.');
  });

  it('returns generic fallback for undefined', () => {
    expect(mapAuthError(undefined)).toBe('Something went wrong. Please try again.');
  });
});
