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

describe('mapAuthError — recovery and password-policy messages', () => {
  it('maps expired / invalid link errors to the safe link message', () => {
    expect(mapAuthError({ message: 'Token has expired or is invalid' })).toBe('This link is invalid or has expired.');
    expect(mapAuthError({ message: 'Email link is invalid or has expired' })).toBe('This link is invalid or has expired.');
  });
  it('maps weak and unchanged password errors', () => {
    expect(mapAuthError({ message: 'Password should be at least 8 characters.' })).toBe('Please choose a stronger password (at least 8 characters).');
    expect(mapAuthError({ message: 'New password should be different from the old password.' })).toBe('Your new password must be different from your old password.');
  });
});
