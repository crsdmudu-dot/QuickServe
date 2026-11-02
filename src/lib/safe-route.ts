// safe-route.ts — only in-app paths may be followed from a notification (lead-PM finding S11-1).
//
// A notification's route comes from the database: written by triggers, or chosen by an admin through
// emit_notification / broadcast_announcement. expo-router opens any URL that has a scheme (https:, mailto:, …)
// outside the app, so an unchecked route could send someone to an outside website from a trusted-looking
// notification. Only a plain in-app path is accepted; anything else is treated as "no route".
// The emailed-link screens under /auth are never opened from a notification either: no notification
// uses them, and a tap must never be able to use a sign-in link.

const MAX_ROUTE_LENGTH = 512;
// Up to this many layers of percent-encoding are undone and checked (for example "%2561" → "%61" → "a");
// a path with more layers counts as unreadable and is refused.
const MAX_DECODE_PASSES = 3;
const SPACE_OR_CONTROL = /[\\\s\u0000-\u001f\u007f]/;
// A "." or ".." path segment, also when a dot is written "%2e" (a URL parser counts both as dots).
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;

/**
 * Returns `route` when it is a plain in-app path, otherwise null.
 *
 * Accepted: a string that starts with exactly one "/" (not "//" or "/\"), has no spaces, backslashes or
 * control characters, and is at most 512 characters long — for example "/booking/123".
 * Refused: "https://…", "//host/…", "mailto:…", "javascript:…", "tel:…", relative paths, any path whose
 * first segment is "auth" (for example "/auth/confirm", with or without a query string), and anything else.
 */
export function safeInternalRoute(route: unknown): string | null {
  if (typeof route !== 'string') return null;
  if (route.length === 0 || route.length > MAX_ROUTE_LENGTH) return null;
  if (!route.startsWith('/') || route.startsWith('//')) return null;
  if (SPACE_OR_CONTROL.test(route)) return null;
  if (firstSegmentIsAuth(route)) return null;
  return route;
}

/**
 * True when the route's path may open a screen under "auth". A router may read the path as it is (a URL
 * parser resolves "." and ".." without decoding, and counts "%2e" as a dot), or undo one or more layers
 * of percent-encoding first. So the path is checked as it is, and again after each layer is undone (up
 * to a limit), not only once it is fully decoded. A reading counts when it hides a space, backslash or
 * control character, or when its first segment is "auth" (see `readingOpensAuth`). A path that cannot
 * be decoded, or that has more layers than the limit, also counts, so it is refused.
 */
function firstSegmentIsAuth(route: string): boolean {
  let layer = route.split(/[?#]/)[0];
  // The path as it is, before any decoding: as written, and with "%2e" counted as "." (the URL rule).
  if (readingOpensAuth(layer) || readingOpensAuth(layer.replace(/%2e/gi, '.'))) return true;
  for (let pass = 0; pass <= MAX_DECODE_PASSES; pass++) {
    let next: string;
    try {
      next = decodeURIComponent(layer);
    } catch {
      return true; // the encoding cannot be read
    }
    if (readingOpensAuth(next)) return true;
    if (next === layer) return false; // fully decoded, and no layer opens "auth"
    layer = next;
  }
  return true; // more layers of encoding than the limit
}

/**
 * One reading of the path, without letter case. It counts when it hides a space, backslash or control
 * character, when it has a "." or ".." segment (also spelled with "%2e"), or when its first segment,
 * skipping route groups such as "(tabs)", is "auth": either as written, or after "." and ".." are applied.
 */
function readingOpensAuth(path: string): boolean {
  if (SPACE_OR_CONTROL.test(path)) return true;
  // No notification route has a "." or ".." segment. Refusing them in every reading closes every way of
  // resolving and decoding the path, in any order, into "auth".
  if (path.split('/').some((segment) => DOT_SEGMENT.test(segment))) return true;
  const segments = path
    .toLowerCase()
    .split('/')
    .filter((segment) => segment !== '');
  // The first segment as written ("/auth/confirm/../.." starts with "auth").
  if (firstRealSegment(segments) === 'auth') return true;
  // The first segment after "." and ".." are applied ("/x/../auth/confirm" becomes "/auth/confirm").
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === '.') continue;
    if (segment === '..') resolved.pop();
    else resolved.push(segment);
  }
  return firstRealSegment(resolved) === 'auth';
}

/** The first segment that is not a route group such as "(tabs)". */
function firstRealSegment(segments: string[]): string | undefined {
  return segments.find((segment) => !/^\(.*\)$/.test(segment));
}
