/**
 * password-policy.test.ts — one shared password validator for registration and recovery.
 *
 * Policy: at least MIN_PASSWORD_LENGTH (8) characters; must not equal the normalised email;
 * confirmation must match. No composition rules (none are required elsewhere in the repo).
 */
import {
  MIN_PASSWORD_LENGTH,
  validatePassword,
  validateRegister,
  validateSetPassword,
} from '@/lib/validation';

describe('validatePassword', () => {
  it('requires at least eight characters', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(validatePassword('')).toBe('Password is required');
    expect(validatePassword('pw')).toBe(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    expect(validatePassword('1234567')).toBe(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    expect(validatePassword('12345678')).toBeNull();
  });

  it('rejects a password equal to the normalised email', () => {
    expect(validatePassword('Person@Example.com', ' person@example.com ')).toBe('Password must not be your email');
    expect(validatePassword('person@example.com', 'person@example.com')).toBe('Password must not be your email');
    expect(validatePassword('person@example.com1', 'person@example.com')).toBeNull();
  });

  it('does not impose composition rules', () => {
    expect(validatePassword('abcdefgh')).toBeNull();
    expect(validatePassword('        ')).toBe('Password is required'); // whitespace-only is not a password
  });
});

describe('validateSetPassword (recovery)', () => {
  it('reports policy and confirmation errors', () => {
    expect(validateSetPassword({ password: 'pw', confirm: 'pw', email: 'a@b.c' })).toEqual({
      password: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    });
    expect(validateSetPassword({ password: 'longenough', confirm: '', email: 'a@b.c' })).toEqual({
      confirm: 'Please confirm your password',
    });
    expect(validateSetPassword({ password: 'longenough', confirm: 'different', email: 'a@b.c' })).toEqual({
      confirm: 'Passwords do not match',
    });
    expect(validateSetPassword({ password: 'longenough', confirm: 'longenough', email: 'a@b.c' })).toEqual({});
  });
});

describe('validateRegister uses the shared validator', () => {
  const base = { name: 'A', email: 'a@b', phone: '0700', password: 'longenough', confirm: 'longenough' };

  it('accepts a valid registration', () => {
    expect(validateRegister(base)).toEqual({});
  });

  it('rejects a short password with the shared message', () => {
    expect(validateRegister({ ...base, password: 'pw', confirm: 'pw' })).toEqual({
      password: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    });
  });

  it('rejects a password equal to the email', () => {
    expect(validateRegister({ ...base, email: 'longenough', password: 'longenough', confirm: 'longenough' })).toMatchObject({
      password: 'Password must not be your email',
    });
  });
});
