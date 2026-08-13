// idempotency.ts — pure, dependency-free id generation for submission idempotency.
// Kept separate from bookings.ts (which imports the Supabase client) so the booking draft
// can generate keys WITHOUT pulling the Supabase client into unrelated screens/tests.

/**
 * Crash-safe RFC-4122-shaped id for booking submission idempotency. One key per LOGICAL
 * submission (reused across retries; a genuinely new booking gets a new one). Prefers the
 * platform UUID; falls back to a v4-shaped string so a missing/throwing crypto never breaks
 * booking creation.
 */
export function newIdempotencyKey(): string {
  try {
    const g = globalThis as { crypto?: { randomUUID?: () => string } };
    if (typeof g.crypto?.randomUUID === 'function') {
      const id = g.crypto.randomUUID();
      if (id) return id;
    }
  } catch {
    /* fall through to the manual generator */
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
