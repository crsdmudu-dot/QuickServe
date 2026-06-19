import { isEmail, isRequired, matches, validateLogin, validateRegister } from '@/lib/validation';

describe('validation primitives', () => {
  it('isRequired trims', () => {
    expect(isRequired('  ')).toBe(false);
    expect(isRequired(' a ')).toBe(true);
  });
  it('isEmail checks for @', () => {
    expect(isEmail('foo')).toBe(false);
    expect(isEmail('a@b')).toBe(true);
  });
  it('matches compares equality', () => {
    expect(matches('x', 'x')).toBe(true);
    expect(matches('x', 'y')).toBe(false);
  });
});

describe('validateLogin', () => {
  it('flags required + email format', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'Email is required',
      password: 'Password is required',
    });
    expect(validateLogin({ email: 'nope', password: 'x' })).toEqual({ email: 'Enter a valid email' });
  });
  it('passes for valid input', () => {
    expect(validateLogin({ email: 'a@b', password: 'pw' })).toEqual({});
  });
});

describe('validateRegister', () => {
  it('requires all fields, valid email, matching confirm', () => {
    expect(validateRegister({ name: '', email: '', phone: '', password: '', confirm: '' })).toEqual({
      name: 'Full name is required',
      email: 'Email is required',
      phone: 'Phone number is required',
      password: 'Password is required',
      confirm: 'Please confirm your password',
    });
  });
  it('flags mismatch + bad email', () => {
    expect(
      validateRegister({ name: 'A', email: 'bad', phone: '0700', password: 'a', confirm: 'b' }),
    ).toEqual({ email: 'Enter a valid email', confirm: 'Passwords do not match' });
  });
  it('passes for valid input', () => {
    expect(
      validateRegister({ name: 'A', email: 'a@b', phone: '0700', password: 'pw', confirm: 'pw' }),
    ).toEqual({});
  });
});
