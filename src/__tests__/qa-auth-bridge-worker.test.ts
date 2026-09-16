/**
 * qa-auth-bridge-worker.test.ts — the isolated QA authentication-bridge Worker.
 *
 * The QA bridge origin exists for one purpose: serve the two emailed-link landing documents
 * (`/auth/recovery`, `/auth/confirm`) and the exact generated assets they reference. Everything
 * else must fail closed. These tests are the executable specification of that policy; they run in
 * the repository's ordinary Jest/CI path and use a mocked assets binding, never a network.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import policy from '../../infra/qa-auth-bridge/policy.json';
import worker, { type BridgeEnv } from '../../infra/qa-auth-bridge/worker';

const ORIGIN = 'https://quickserve-auth-qa.example.workers.dev';
const ENTRY_JS = '/_expo/static/js/web/entry-70ebbdee2397a147eeda60ad6772152a.js';
const GLOBAL_CSS = '/_expo/static/css/global-87fd0564cfa78f37afcb8d7603e15d75.css';

/** Headers a Cloudflare assets response would carry (including the export's global `_headers`). */
const ASSET_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy-Report-Only': "default-src 'self'; connect-src 'self' https://example.supabase.co",
};

const PRESENT: Record<string, string> = {
  '/auth/recovery': '<!DOCTYPE html><html><head><title>Reset your password</title></head><body></body></html>',
  '/auth/confirm': '<!DOCTYPE html><html><head><title>Confirm your email</title></head><body></body></html>',
  [ENTRY_JS]: 'console.log(0)',
  [GLOBAL_CSS]: ':root{}',
  '/favicon.ico': 'icon-bytes',
};

type Assets = { calls: string[]; binding: BridgeEnv['ASSETS'] };

function assets(present: Record<string, string> = PRESENT, override?: (path: string) => Response | null): Assets {
  const calls: string[] = [];
  return {
    calls,
    binding: {
      async fetch(request: Request) {
        calls.push(request.url);
        const path = new URL(request.url).pathname;
        const forced = override?.(path);
        if (forced) return forced;
        const body = present[path];
        if (body === undefined) return new Response('not found', { status: 404 });
        return new Response(body, { status: 200, headers: ASSET_HEADERS });
      },
    },
  };
}

const env = (a: Assets, mode?: string): BridgeEnv => ({ ASSETS: a.binding, ...(mode === undefined ? {} : { BRIDGE_MODE: mode }) });

function get(path: string, init?: RequestInit, a: Assets = assets(), mode?: string) {
  return worker.fetch(new Request(`${ORIGIN}${path}`, init), env(a, mode));
}

describe('policy source of truth', () => {
  it('serves exactly the two bridge documents declared in policy.json', () => {
    expect(policy.documentPaths).toEqual(['/auth/recovery', '/auth/confirm']);
    expect(policy.extraPaths).toEqual(['/favicon.ico']);
    expect(policy.workerName).toBe('quickserve-auth-qa');
    expect(policy.outputDir).toBe('dist-qa-auth');
  });
});

describe('allowed requests', () => {
  it.each(policy.documentPaths)('GET %s returns the document', async (path) => {
    const a = assets();
    const res = await get(path, undefined, a);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(PRESENT[path]);
    expect(a.calls).toEqual([`${ORIGIN}${path}`]);
  });

  it.each([ENTRY_JS, GLOBAL_CSS, '/favicon.ico'])('GET %s returns the generated asset', async (path) => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(PRESENT[path]);
  });

  it('HEAD returns the headers with no body', async () => {
    const res = await get('/auth/recovery', { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('passes only the canonical path to the assets binding, never the query string', async () => {
    const a = assets();
    await get('/auth/recovery?error=access_denied&error_code=otp_expired', undefined, a);
    expect(a.calls).toEqual([`${ORIGIN}/auth/recovery`]);
  });

  it('serves a document carrying a harmless query string', async () => {
    const res = await get('/auth/confirm?error=access_denied');
    expect(res.status).toBe(200);
  });
});

describe('hardened response headers', () => {
  it.each(['/auth/recovery', ENTRY_JS])('%s is uncacheable, referrer-free, unindexed and CSP-enforced', async (path) => {
    const res = await get(path);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Content-Security-Policy-Report-Only')).toBeNull();
    const csp = res.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("script-src 'self'");
  });

  it('keeps the asset content type', async () => {
    const res = await get('/auth/recovery');
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
  });

  it('applies the same hardening to every refusal', async () => {
    for (const res of [await get('/signin'), await get('/auth/recovery', { method: 'POST' })]) {
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
      expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    }
  });
});

describe('denied paths fail closed', () => {
  const denied = [
    '/',
    '/index.html',
    '/_sitemap.html',
    '/signin',
    '/welcome',
    '/forgot-password',
    '/dashboard',
    '/customers',
    '/auth',
    '/auth/',
    '/auth/recovery/',
    '/auth/recovery.html',
    '/auth/recovery/x',
    '/auth/Recovery',
    '/AUTH/recovery',
    '//auth/recovery',
    '/assets/icon.png',
    '/_headers',
    '/_expo/static/js/web/entry.map',
    '/_expo/static/js/android/index.js',
    '/_expo/static/js/web/../../../index.html',
    '/_expo/static/css/../../auth/recovery',
  ];

  it.each(denied)('%s returns a neutral 404 without touching the assets binding', async (path) => {
    const a = assets();
    const res = await get(path, undefined, a);
    expect(res.status).toBe(404);
    expect(a.calls).toEqual([]);
    expect(await res.text()).toBe('Not Found');
  });

  it('an allowed path whose asset is missing returns the same neutral 404', async () => {
    const res = await get('/_expo/static/js/web/entry-deadbeef.js');
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Not Found');
  });

  it('a non-200 asset response (redirect or error) is never forwarded', async () => {
    for (const status of [204, 301, 302, 304, 500]) {
      const nullBody = status === 204 || status === 304;
      const a = assets(PRESENT, () => new Response(nullBody ? null : 'x', { status, headers: { Location: '/elsewhere' } }));
      const res = await get('/auth/recovery', undefined, a);
      expect(res.status).toBe(404);
      expect(res.headers.get('Location')).toBeNull();
    }
  });
});

describe('methods', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('%s is refused with 405 and an Allow header', async (method) => {
    for (const path of ['/auth/recovery', '/', '/signin']) {
      const a = assets();
      const res = await get(path, { method }, a);
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('GET, HEAD');
      expect(a.calls).toEqual([]);
    }
  });
});

describe('sensitive query parameters are rejected', () => {
  it.each(policy.sensitiveQueryKeys)('%s in the query string is refused with 400', async (key) => {
    const a = assets();
    const res = await get(`/auth/recovery?${key}=abc`, undefined, a);
    expect(res.status).toBe(400);
    expect(a.calls).toEqual([]);
    expect(await res.text()).toBe('Bad Request');
  });

  it('matches regardless of case, position or emptiness, on any path and method', async () => {
    for (const url of [
      '/auth/recovery?TOKEN_HASH=abc',
      '/auth/recovery?error=x&Access_Token=abc',
      '/auth/recovery?token_hash=',
      '/auth/confirm?type=signup&token=abc',
      '/signin?token_hash=abc',
      '/?code=abc',
    ]) {
      expect((await get(url)).status).toBe(400);
      expect((await get(url, { method: 'HEAD' })).status).toBe(400);
    }
  });

  it('never echoes the rejected value, and refuses the method first for unsafe methods', async () => {
    const res = await get('/auth/recovery?token_hash=supersecretvalue');
    expect(await res.text()).not.toContain('supersecretvalue');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect((await get('/auth/recovery?token_hash=abc', { method: 'POST' })).status).toBe(405);
  });
});

describe('deny-all rollback mode', () => {
  it.each(['deny', 'off', 'Deny', 'disabled', ''])('BRIDGE_MODE=%p closes every route', async (mode) => {
    for (const path of ['/auth/recovery', '/auth/confirm', ENTRY_JS, '/favicon.ico', '/']) {
      const a = assets();
      const res = await get(path, undefined, a, mode);
      expect(res.status).toBe(404);
      expect(a.calls).toEqual([]);
    }
  });

  it('BRIDGE_MODE=serve and an unset BRIDGE_MODE serve the bridge', async () => {
    expect((await get('/auth/recovery', undefined, assets(), 'serve')).status).toBe(200);
    expect((await get('/auth/recovery')).status).toBe(200);
  });

  it('deny mode still refuses unsafe methods and sensitive query strings', async () => {
    expect((await get('/auth/recovery', { method: 'POST' }, assets(), 'deny')).status).toBe(404);
    expect((await get('/auth/recovery?token_hash=abc', undefined, assets(), 'deny')).status).toBe(404);
  });
});

describe('secrecy', () => {
  it('never logs anything, including request URLs', async () => {
    const spies = [
      jest.spyOn(console, 'log'),
      jest.spyOn(console, 'warn'),
      jest.spyOn(console, 'error'),
      jest.spyOn(console, 'info'),
      jest.spyOn(console, 'debug'),
    ].map((s) => s.mockImplementation(() => {}));
    await get('/auth/recovery');
    await get('/auth/recovery?token_hash=abc');
    await get('/signin');
    await get('/auth/recovery', { method: 'POST' });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    spies.forEach((s) => s.mockRestore());
  });

  it('the worker module never imports the app or the Supabase client and never logs', () => {
    const source = readFileSync(join(__dirname, '..', '..', 'infra', 'qa-auth-bridge', 'worker.ts'), 'utf8');
    const imports = Array.from(source.matchAll(/from\s+'([^']+)'/g)).map((m) => m[1]);
    expect(imports).toEqual(['./policy.json']); // the policy file is the only dependency
    expect(source).not.toMatch(/require\(/);
    expect(source).not.toMatch(/console\./);
  });
});
