/**
 * auth-links.test.ts — mobile auth-link utilities (password recovery / email confirmation).
 *
 * Contract:
 *   - redirect URLs are built from the app's configured scheme (app.json), never from input;
 *   - link parameters are validated strictly (exact type, bounded token hash, no arrays);
 *   - nothing derived from a link can steer navigation (no `next` / `redirect_to` handling);
 *   - the log-safe description never carries the token hash.
 */
import appJson from '../../app.json';

import {
  AUTH_LINK_TYPES,
  describeAuthLinkForLog,
  mobileAuthRedirectUrl,
  parseAuthLinkParams,
} from '@/lib/auth-links';

const SCHEME = (appJson as { expo: { scheme: string[] } }).expo.scheme[0];
const HASH = 'a'.repeat(64);

describe('mobileAuthRedirectUrl', () => {
  it('derives the scheme from app.json (first configured scheme) and uses fixed internal paths', () => {
    expect(SCHEME).toBe('kwikserve');
    expect(mobileAuthRedirectUrl('recovery')).toBe(`${SCHEME}://auth/recovery`);
    expect(mobileAuthRedirectUrl('signup')).toBe(`${SCHEME}://auth/confirm`);
  });

  it('only knows the two supported link types', () => {
    expect([...AUTH_LINK_TYPES]).toEqual(['recovery', 'signup']);
  });
});

describe('parseAuthLinkParams', () => {
  it('accepts a well-formed token hash with the exact expected type', () => {
    expect(parseAuthLinkParams({ token_hash: HASH, type: 'recovery' }, 'recovery')).toEqual({
      ok: true,
      tokenHash: HASH,
      type: 'recovery',
    });
    expect(parseAuthLinkParams({ token_hash: HASH, type: 'signup' }, 'signup')).toEqual({
      ok: true,
      tokenHash: HASH,
      type: 'signup',
    });
  });

  it('rejects a missing token hash or type without throwing', () => {
    expect(parseAuthLinkParams(undefined, 'recovery')).toEqual({ ok: false, reason: 'missing' });
    expect(parseAuthLinkParams({}, 'recovery')).toEqual({ ok: false, reason: 'missing' });
    expect(parseAuthLinkParams({ type: 'recovery' }, 'recovery')).toEqual({ ok: false, reason: 'missing' });
    expect(parseAuthLinkParams({ token_hash: HASH }, 'recovery')).toEqual({ ok: false, reason: 'missing' });
  });

  it('rejects a type that is not exactly the expected one (case, whitespace, other types)', () => {
    for (const t of ['Recovery', ' recovery', 'signup', 'magiclink', 'email_change', 'invite', 'email']) {
      expect(parseAuthLinkParams({ token_hash: HASH, type: t }, 'recovery').ok).toBe(false);
    }
    expect(parseAuthLinkParams({ token_hash: HASH, type: 'recovery' }, 'signup').ok).toBe(false);
  });

  it('rejects malformed, oversized, empty or repeated (array) token hashes', () => {
    expect(parseAuthLinkParams({ token_hash: '', type: 'recovery' }, 'recovery').ok).toBe(false);
    expect(parseAuthLinkParams({ token_hash: 'short', type: 'recovery' }, 'recovery').ok).toBe(false);
    expect(parseAuthLinkParams({ token_hash: 'a'.repeat(513), type: 'recovery' }, 'recovery').ok).toBe(false);
    expect(parseAuthLinkParams({ token_hash: `${HASH}<script>`, type: 'recovery' }, 'recovery').ok).toBe(false);
    expect(parseAuthLinkParams({ token_hash: `${HASH} `, type: 'recovery' }, 'recovery').ok).toBe(false);
    expect(parseAuthLinkParams({ token_hash: [HASH, HASH], type: 'recovery' }, 'recovery').ok).toBe(false);
    expect(parseAuthLinkParams({ token_hash: HASH, type: ['recovery'] }, 'recovery').ok).toBe(false);
    expect(parseAuthLinkParams({ token_hash: 42, type: 'recovery' }, 'recovery').ok).toBe(false);
  });

  it('never surfaces a destination from the link (no open redirect / next handling)', () => {
    const parsed = parseAuthLinkParams(
      { token_hash: HASH, type: 'recovery', next: 'https://evil.example', redirect_to: '/admin', returnTo: 'x' },
      'recovery',
    );
    expect(parsed.ok).toBe(true);
    expect(Object.keys(parsed).sort()).toEqual(['ok', 'tokenHash', 'type']);
  });
});

describe('describeAuthLinkForLog', () => {
  it('describes outcome and type only — the token hash never appears', () => {
    const okDesc = describeAuthLinkForLog(parseAuthLinkParams({ token_hash: HASH, type: 'recovery' }, 'recovery'));
    expect(JSON.stringify(okDesc)).not.toContain(HASH);
    expect(okDesc).toEqual({ ok: true, type: 'recovery' });
    const badDesc = describeAuthLinkForLog(parseAuthLinkParams({ token_hash: 'x', type: 'recovery' }, 'recovery'));
    expect(badDesc).toEqual({ ok: false, reason: 'malformed' });
  });
});
