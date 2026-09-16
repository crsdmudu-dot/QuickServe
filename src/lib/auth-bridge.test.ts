/**
 * auth-bridge.test.ts — HTTPS bridge fragment parsing and destination policy.
 *
 * The emailed link is `https://<site>/auth/<route>#token_hash=…&type=…&redirect_to=…`. The bridge
 * reads ONLY the fragment (never the query string), validates it once, and admits exactly one
 * destination per type, derived from app configuration. Everything else fails closed.
 */
import appJson from '../../app.json';

import { BRIDGE_DESTINATIONS, buildMobileHandoffUrl, parseAuthBridgeFragment } from '@/lib/auth-bridge';

const SCHEME = (appJson as { expo: { scheme: string[] } }).expo.scheme[0];
const HASH = 'e'.repeat(64);
const REC = 'kwikserve://auth/recovery';
const CONF = 'kwikserve://auth/confirm';
const frag = (parts: Record<string, string>) => '#' + Object.entries(parts).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

describe('destination policy', () => {
  it('admits exactly one canonical destination per type, derived from app configuration', () => {
    expect(SCHEME).toBe('kwikserve');
    expect(BRIDGE_DESTINATIONS).toEqual({ recovery: REC, signup: CONF });
    expect(Object.isFrozen(BRIDGE_DESTINATIONS)).toBe(true);
  });
});

describe('parseAuthBridgeFragment — accepts', () => {
  it('a canonical recovery fragment', () => {
    expect(parseAuthBridgeFragment(frag({ token_hash: HASH, type: 'recovery', redirect_to: REC }), 'recovery')).toEqual({
      ok: true,
      type: 'recovery',
      tokenHash: HASH,
      destination: REC,
    });
  });

  it('a canonical confirmation fragment', () => {
    expect(parseAuthBridgeFragment(frag({ token_hash: HASH, type: 'signup', redirect_to: CONF }), 'signup')).toEqual({
      ok: true,
      type: 'signup',
      tokenHash: HASH,
      destination: CONF,
    });
  });

  it('decodes redirect_to exactly once (percent-encoded once in the email, as html/template renders it)', () => {
    expect(parseAuthBridgeFragment(`#token_hash=${HASH}&type=recovery&redirect_to=kwikserve%3A%2F%2Fauth%2Frecovery`, 'recovery').ok).toBe(true);
  });
});

describe('parseAuthBridgeFragment — fails closed', () => {
  const ok = (f: string, t: 'recovery' | 'signup' = 'recovery') => parseAuthBridgeFragment(f, t).ok;

  it('missing, empty or hash-only fragments', () => {
    expect(parseAuthBridgeFragment(undefined, 'recovery')).toEqual({ ok: false, reason: 'missing' });
    expect(parseAuthBridgeFragment(null, 'recovery')).toEqual({ ok: false, reason: 'missing' });
    expect(parseAuthBridgeFragment('', 'recovery')).toEqual({ ok: false, reason: 'missing' });
    expect(parseAuthBridgeFragment('#', 'recovery')).toEqual({ ok: false, reason: 'missing' });
  });

  it('type must be exactly the route type', () => {
    expect(ok(frag({ token_hash: HASH, type: 'signup', redirect_to: REC }), 'recovery')).toBe(false);
    expect(ok(frag({ token_hash: HASH, type: 'recovery', redirect_to: CONF }), 'signup')).toBe(false);
    expect(ok(frag({ token_hash: HASH, type: 'Recovery', redirect_to: REC }))).toBe(false);
    expect(ok(frag({ token_hash: HASH, type: 'magiclink', redirect_to: REC }))).toBe(false);
  });

  it('token_hash must satisfy the shared safe length/character rules', () => {
    expect(ok(frag({ token_hash: 'short', type: 'recovery', redirect_to: REC }))).toBe(false);
    expect(ok(frag({ token_hash: `${HASH}<b>`, type: 'recovery', redirect_to: REC }))).toBe(false);
    expect(ok(frag({ token_hash: 'a'.repeat(600), type: 'recovery', redirect_to: REC }))).toBe(false);
    expect(ok(`#token_hash=&type=recovery&redirect_to=${encodeURIComponent(REC)}`)).toBe(false);
  });

  it('missing or unapproved destinations are never treated as "mobile by default"', () => {
    expect(parseAuthBridgeFragment(frag({ token_hash: HASH, type: 'recovery' }), 'recovery')).toEqual({ ok: false, reason: 'missing' });
    expect(parseAuthBridgeFragment(`#token_hash=${HASH}&type=recovery&redirect_to=`, 'recovery')).toEqual({ ok: false, reason: 'missing' });
    expect(parseAuthBridgeFragment(frag({ token_hash: HASH, type: 'recovery', redirect_to: 'https://evil.example/auth/recovery' }), 'recovery')).toEqual({ ok: false, reason: 'unapproved-destination' });
  });

  it('bypass attempts on the destination fail: scheme, origin, encoding, userinfo, port, suffix, case, fragment, nested query, alias scheme', () => {
    for (const d of [
      'javascript:alert(1)',
      'https://admin.example/reset-password', // browser reset destination: not enabled in this slice
      'kwikserve%3A%2F%2Fauth%2Frecovery', // arrives double-encoded → decodes once to a percent string
      'kwikserve://user@auth/recovery',
      'kwikserve://auth:8080/recovery',
      'kwikserve://auth/recovery/',
      'kwikserve://auth/recovery.evil',
      'kwikserve://auth/recovery-extra',
      'Kwikserve://auth/recovery',
      'kwikserve://AUTH/recovery',
      'kwikserve://auth/recovery#frag',
      'kwikserve://auth/recovery?next=/admin',
      'kwikserve://auth/confirm',
      'quickserve://auth/recovery',
      ' kwikserve://auth/recovery',
      'kwikserve:///auth/recovery',
    ]) {
      expect(ok(frag({ token_hash: HASH, type: 'recovery', redirect_to: d }))).toBe(false);
    }
  });

  it('repeated parameters are malformed', () => {
    expect(ok(`#token_hash=${HASH}&token_hash=${HASH}&type=recovery&redirect_to=${encodeURIComponent(REC)}`)).toBe(false);
    expect(ok(`#token_hash=${HASH}&type=recovery&type=recovery&redirect_to=${encodeURIComponent(REC)}`)).toBe(false);
    expect(ok(`#token_hash=${HASH}&type=recovery&redirect_to=${encodeURIComponent(REC)}&redirect_to=${encodeURIComponent(REC)}`)).toBe(false);
  });

  it('access_token / refresh_token are never accepted, alone or alongside', () => {
    expect(parseAuthBridgeFragment(`#access_token=eyJx.y.z&refresh_token=abc&type=recovery`, 'recovery').ok).toBe(false);
    const withTokens = parseAuthBridgeFragment(`#access_token=eyJx.y.z&token_hash=${HASH}&type=recovery&redirect_to=${encodeURIComponent(REC)}`, 'recovery');
    expect(withTokens.ok).toBe(false);
  });

  it('never surfaces anything beyond the four allowed fields', () => {
    const parsed = parseAuthBridgeFragment(frag({ token_hash: HASH, type: 'recovery', redirect_to: REC, next: 'https://evil.example' }), 'recovery');
    expect(parsed.ok).toBe(false); // unknown parameters are rejected outright
  });
});

describe('buildMobileHandoffUrl', () => {
  it('builds the canonical app URL with encoded values from a validated link only', () => {
    const link = parseAuthBridgeFragment(frag({ token_hash: HASH, type: 'recovery', redirect_to: REC }), 'recovery');
    expect(link.ok).toBe(true);
    if (link.ok) expect(buildMobileHandoffUrl(link)).toBe(`${REC}?token_hash=${HASH}&type=recovery`);
    const conf = parseAuthBridgeFragment(frag({ token_hash: HASH, type: 'signup', redirect_to: CONF }), 'signup');
    if (conf.ok) expect(buildMobileHandoffUrl(conf)).toBe(`${CONF}?token_hash=${HASH}&type=signup`);
  });
});
