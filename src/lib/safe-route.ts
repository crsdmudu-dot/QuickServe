// safe-route.ts — only in-app paths may be followed from a notification (lead-PM finding S11-1).
//
// A notification's route comes from the database: written by triggers, or chosen by an admin through
// emit_notification / broadcast_announcement. expo-router opens any URL that has a scheme (https:, mailto:, …)
// outside the app, so an unchecked route could send someone to an outside website from a trusted-looking
// notification. Only a plain in-app path is accepted; anything else is treated as "no route".

const MAX_ROUTE_LENGTH = 512;

/**
 * Returns `route` when it is a plain in-app path, otherwise null.
 *
 * Accepted: a string that starts with exactly one "/" (not "//" or "/\"), has no spaces, backslashes or
 * control characters, and is at most 512 characters long — for example "/booking/123".
 * Refused: "https://…", "//host/…", "mailto:…", "javascript:…", "tel:…", relative paths, and anything else.
 */
export function safeInternalRoute(route: unknown): string | null {
  if (typeof route !== 'string') return null;
  if (route.length === 0 || route.length > MAX_ROUTE_LENGTH) return null;
  if (!route.startsWith('/') || route.startsWith('//')) return null;
  if (/[\\\s\u0000-\u001f\u007f]/.test(route)) return null;
  return route;
}
