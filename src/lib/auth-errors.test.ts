import { mapAuthError } from '@/lib/auth-errors';

describe('mapAuthError', () => {
  it('maps invalid credentials', () => {
    expect(mapAuthError({ message: 'Invalid login credentials' })).toBe('Incorrect email or password.');
  });
  it('maps already-registered', () => {
    expect(mapAuthError({ message: 'User already registered' })).toBe('An account with this email already exists.');
  });
  it('maps network errors to connection message', () => {
    expect(mapAuthError({ message: 'network request failed' })).toBe(
      "Can't reach the server. Check your connection and try again.",
    );
  });
  it('falls back for unknown errors', () => {
    expect(mapAuthError(null)).toBe('Something went wrong. Please try again.');
  });
});
