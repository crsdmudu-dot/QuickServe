/**
 * auth-links.ts — mobile authentication-link utilities (password recovery, email confirmation).
 *
 * Flow (Supabase "token hash" pattern): the email carries a ONE-TIME, short-lived token hash that
 * the app exchanges through `supabase.auth.verifyOtp({ token_hash, type })`. Access and refresh
 * tokens are never carried in the link, and the client never reads URL fragments. The token hash
 * is still an authentication secret while it is valid: it is captured once, kept in memory only,
 * never logged, persisted or shown, and stripped from the visible route as soon as it is read.
 *
 * Redirect targets are fixed internal routes on the app's configured scheme (app.json). Nothing
 * in a link can steer navigation: `next`, `redirect_to` and similar parameters are ignored.
 */
import appJson from '../../app.json';

export const AUTH_LINK_TYPES = ['recovery', 'signup'] as const;
export type AuthLinkType = (typeof AUTH_LINK_TYPES)[number];

/** First configured scheme (`expo.scheme[0]`): the canonical scheme for generated links. */
export const AUTH_LINK_SCHEME: string = (() => {
  const scheme = (appJson as { expo?: { scheme?: string | string[] } }).expo?.scheme;
  const first = Array.isArray(scheme) ? scheme[0] : scheme;
  if (!first) throw new Error('app.json must define expo.scheme for auth links');
  return first;
})();

const LINK_PATHS: Record<AuthLinkType, string> = {
  recovery: 'auth/recovery',
  signup: 'auth/confirm',
};

/** The exact redirect URL sent to Supabase for the given link type (must be allow-listed per project). */
export function mobileAuthRedirectUrl(type: AuthLinkType): string {
  return `${AUTH_LINK_SCHEME}://${LINK_PATHS[type]}`;
}

export type ParsedAuthLink =
  | { ok: true; tokenHash: string; type: AuthLinkType }
  | { ok: false; reason: 'missing' | 'malformed' | 'unsupported-type' };

// Supabase token hashes are opaque hex/base64url-safe strings; bound length defensively.
const TOKEN_HASH_PATTERN = /^[A-Za-z0-9._~-]{16,512}$/;

/**
 * Validate the parameters of an incoming auth link against the type the route expects.
 * Accepts only plain strings; arrays (repeated params), numbers and objects are rejected.
 */
export function parseAuthLinkParams(
  params: Record<string, unknown> | undefined,
  expectedType: AuthLinkType,
): ParsedAuthLink {
  if (!params) return { ok: false, reason: 'missing' };
  const tokenHash = params.token_hash;
  const type = params.type;
  if (tokenHash === undefined || tokenHash === null || type === undefined || type === null) {
    return { ok: false, reason: 'missing' };
  }
  if (typeof type !== 'string' || type !== expectedType) return { ok: false, reason: 'unsupported-type' };
  if (typeof tokenHash !== 'string' || tokenHash.length === 0) return { ok: false, reason: 'malformed' };
  if (!TOKEN_HASH_PATTERN.test(tokenHash)) return { ok: false, reason: 'malformed' };
  return { ok: true, tokenHash, type: expectedType };
}

/** Log-safe description of a parsed link: outcome and type only, never the token hash. */
export function describeAuthLinkForLog(parsed: ParsedAuthLink): { ok: boolean; type?: AuthLinkType; reason?: string } {
  return parsed.ok ? { ok: true, type: parsed.type } : { ok: false, reason: parsed.reason };
}
