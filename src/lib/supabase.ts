import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase env. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env (see .env.example).',
  );
}

// Web: use localStorage when available (browser); otherwise the memory fallback (export/SSR).
const webStorage = {
  getItem: (k: string) =>
    Promise.resolve(typeof window !== 'undefined' ? window.localStorage.getItem(k) : null),
  setItem: (k: string, v: string) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(k, v);
    return Promise.resolve();
  },
  removeItem: (k: string) => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(k);
    return Promise.resolve();
  },
};

const authStorage = Platform.OS === 'web' ? webStorage : AsyncStorage;

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

if (__DEV__) {
  // Helps confirm .env points at the intended Supabase project.
  console.log('[supabase] connecting to', url);
}
