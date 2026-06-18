export function isRequired(v: string): boolean {
  return v.trim().length > 0;
}
export function isEmail(v: string): boolean {
  return v.includes('@');
}
export function matches(a: string, b: string): boolean {
  return a === b;
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
  if (!isRequired(v.password)) e.password = 'Password is required';
  if (!isRequired(v.confirm)) e.confirm = 'Please confirm your password';
  else if (!matches(v.password, v.confirm)) e.confirm = 'Passwords do not match';
  return e;
}
