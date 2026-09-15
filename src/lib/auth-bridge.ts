/**
 * auth-bridge.ts — HTTPS authentication-link bridge: fragment parsing and destination policy.
 *
 * The emailed link is rendered by Supabase (Go html/template) as
 *   https://<Site URL>/auth/recovery#token_hash={{ .TokenHash }}&type=recovery&redirect_to={{ .RedirectTo | urlquery }}
 *   https://<Site URL>/auth/confirm#token_hash={{ .TokenHash }}&type=signup&redirect_to={{ .RedirectTo | urlquery }}
 * The values ride in the URL FRAGMENT, which browsers never send in the HTTP request, so the static
 * host does not see the one-time token hash; only this page (in the browser) reads it, once.
 *
 * Policy: the fragment is the only input (the query string is never consulted); it may contain
 * exactly the three expected keys; the token hash must satisfy the shared safe rules; the
 * destination must equal — byte for byte — the single approved destination for the route type,
 * derived from app configuration. Anything else fails closed. No destination is ever inferred.
 */
import { mobileAuthRedirectUrl, parseAuthLinkParams, type AuthLinkType } from '@/lib/auth-links';

/** Exactly one approved destination per link type (from app.json scheme; never from input). */
export const BRIDGE_DESTINATIONS: Readonly<Record<AuthLinkType, string>> = Object.freeze({
  recovery: mobileAuthRedirectUrl('recovery'),
  signup: mobileAuthRedirectUrl('signup'),
});

const ALLOWED_KEYS = ['token_hash', 'type', 'redirect_to'] as const;

export type BridgeLink =
  | { ok: true; type: AuthLinkType; tokenHash: string; destination: string }
  | { ok: false; reason: 'missing' | 'malformed' | 'unsupported-type' | 'unapproved-destination' };

/**
 * Parse and validate a bridge fragment (`window.location.hash`) for the given route type.
 * `URLSearchParams` percent-decodes each value exactly once — the same single encoding that
 * `urlquery` applied in the email — so a pre-encoded destination stays a percent string and fails.
 */
export function parseAuthBridgeFragment(fragment: string | null | undefined, expectedType: AuthLinkType): BridgeLink {
  if (typeof fragment !== 'string') return { ok: false, reason: 'missing' };
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (raw.length === 0) return { ok: false, reason: 'missing' };
  const params = new URLSearchParams(raw);
  for (const key of Array.from(params.keys())) {
    if (!(ALLOWED_KEYS as readonly string[]).includes(key)) return { ok: false, reason: 'malformed' }; // access_token, refresh_token, next, …
  }
  for (const key of ALLOWED_KEYS) {
    if (params.getAll(key).length > 1) return { ok: false, reason: 'malformed' };
  }
  const base = parseAuthLinkParams(
    { token_hash: params.get('token_hash') ?? undefined, type: params.get('type') ?? undefined },
    expectedType,
  );
  if (!base.ok) return base;
  const destination = params.get('redirect_to');
  if (destination === null || destination.length === 0) return { ok: false, reason: 'missing' };
  if (destination !== BRIDGE_DESTINATIONS[expectedType]) return { ok: false, reason: 'unapproved-destination' };
  return { ok: true, type: expectedType, tokenHash: base.tokenHash, destination };
}

/** The exact app URL opened on the explicit user action; values are encoded, destination is the approved one. */
export function buildMobileHandoffUrl(link: Extract<BridgeLink, { ok: true }>): string {
  return `${link.destination}?token_hash=${encodeURIComponent(link.tokenHash)}&type=${encodeURIComponent(link.type)}`;
}
