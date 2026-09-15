export function isRequired(v: string): boolean {
  return v.trim().length > 0;
}
export function isEmail(v: string): boolean {
  return v.includes('@');
}
export function matches(a: string, b: string): boolean {
  return a === b;
}

/** Shared password policy for registration and recovery: length only, never the user's email. */
export const MIN_PASSWORD_LENGTH = 8;

export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

/** Returns the policy violation message, or null when the password is acceptable. */
export function validatePassword(password: string, email?: string): string | null {
  if (!isRequired(password)) return 'Password is required';
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (email && normalizeEmail(password) === normalizeEmail(email)) return 'Password must not be your email';
  return null;
}

/** Email-only validation (forgot-password request). Returns the message or null. */
export function validateEmail(email: string): string | null {
  if (!isRequired(email)) return 'Email is required';
  if (!isEmail(email)) return 'Enter a valid email';
  return null;
}

export type SetPasswordValues = { password: string; confirm: string; email?: string };

/** New-password form validation (password recovery). */
export function validateSetPassword(v: SetPasswordValues): Record<string, string> {
  const e: Record<string, string> = {};
  const pw = validatePassword(v.password, v.email);
  if (pw) e.password = pw;
  if (!isRequired(v.confirm)) e.confirm = 'Please confirm your password';
  else if (!matches(v.password, v.confirm)) e.confirm = 'Passwords do not match';
  return e;
}

export type LoginValues = { email: string; password: string };
export function validateLogin(v: LoginValues): Record<string, string> {
  const e: Record<string, string> = {};
  if (!isRequired(v.email)) e.email = 'Email is required';
  else if (!isEmail(v.email)) e.email = 'Enter a valid email';
  if (!isRequired(v.password)) e.password = 'Password is required';
  return e;
}

export type RegisterValues = {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirm: string;
};
export function validateRegister(v: RegisterValues): Record<string, string> {
  const e: Record<string, string> = {};
  if (!isRequired(v.name)) e.name = 'Full name is required';
  if (!isRequired(v.email)) e.email = 'Email is required';
  else if (!isEmail(v.email)) e.email = 'Enter a valid email';
  if (!isRequired(v.phone)) e.phone = 'Phone number is required';
  const pw = validatePassword(v.password, v.email);
  if (pw) e.password = pw;
  if (!isRequired(v.confirm)) e.confirm = 'Please confirm your password';
  else if (!matches(v.password, v.confirm)) e.confirm = 'Passwords do not match';
  return e;
}
