import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/** True when an error looks transient (network/timeout/5xx-ish) and is safe to retry. */
export function isTransient(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  if (/network|timeout|timed out|fetch failed|failed to fetch|connection|econn|socket|offline/.test(msg)) return true;
  const code = (error as { status?: number; code?: string | number })?.status
            ?? Number((error as { code?: string | number })?.code);
  return typeof code === 'number' && code >= 500 && code < 600;
}

/** Retry an IDEMPOTENT READ with exponential backoff + jitter. READS ONLY — never wrap a mutation
 *  (payments/wallet/promo/booking writes). Non-transient errors rethrow immediately; throws the last
 *  error after `retries` exhausted. `baseMs: 0` in tests to avoid real delays. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const baseMs = opts.baseMs ?? 300;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === retries) throw err;
      const delay = baseMs * 2 ** attempt + Math.floor(Math.random() * baseMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/** Map any error to a short user-facing message. */
export function friendlyError(error: unknown): string {
  if (isTransient(error)) return 'You appear to be offline. Check your connection and try again.';
  return 'Something went wrong. Please try again.';
}

/** True while the device appears online (defaults true until NetInfo reports otherwise). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    NetInfo.fetch().then((s) => setOnline(s.isConnected !== false));
    const unsub = NetInfo.addEventListener((s) => setOnline(s.isConnected !== false));
    return unsub;
  }, []);
  return online;
}
