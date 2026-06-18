import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Role } from '@/constants/roles';

const KEY = 'quickserve.auth';

export type StoredAuth = { role: Role | null; signedIn: boolean };
const DEFAULT: StoredAuth = { role: null, signedIn: false };

const VALID_ROLES: Role[] = ['customer', 'provider', 'admin'];

export async function loadAuth(): Promise<StoredAuth> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<StoredAuth>;
    const roleOk = parsed.role === null || (typeof parsed.role === 'string' && VALID_ROLES.includes(parsed.role as Role));
    if (roleOk && typeof parsed.signedIn === 'boolean') {
      return { role: (parsed.role ?? null) as Role | null, signedIn: parsed.signedIn };
    }
    return DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export async function saveAuth(state: StoredAuth): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}

export async function clearAuth(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
