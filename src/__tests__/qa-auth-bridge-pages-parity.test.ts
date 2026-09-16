/**
 * qa-auth-bridge-pages-parity.test.ts — the Pages target must behave exactly like the live Worker.
 *
 * The QA auth bridge has two deployment targets and ONE request policy. The Workers target
 * (`wrangler.qa-auth.jsonc` → `infra/qa-auth-bridge/worker.ts`) is live and is the rollback; the
 * Pages target deploys the very same module, bundled to `_worker.js` for Pages advanced mode.
 *
 * This suite runs one request matrix against BOTH targets and fails if any answer differs — status,
 * body, every response header, and the exact sequence of calls made to the assets binding. A change
 * that hardens or weakens one target without the other cannot pass.
 *
 * The Pages side under test is the REAL artifact: `bundleWorkerForPages` produces the ES module the
 * build writes to `_worker.js`, and the test evaluates that exact source. Only the module wrapper is
 * rewritten (ESM → CommonJS) so Jest can load it; no statement of the policy is re-authored here.
 */
import { transformSync } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import policy from '../../infra/qa-auth-bridge/policy.json';
import { bundleWorkerForPages } from '../../infra/qa-auth-bridge/pages-build';
import workersTarget, { type BridgeEnv } from '../../infra/qa-auth-bridge/worker';

const ORIGIN = 'https://quickserve-auth-qa.example.test';
const ENTRY_JS = '/_expo/static/js/web/entry-70ebbdee2397a147eeda60ad6772152a.js';
const GLOBAL_CSS = '/_expo/static/css/global-87fd0564cfa78f37afcb8d7603e15d75.css';
const WORKER_ENTRY = join(__dirname, '..', '..', 'infra', 'qa-auth-bridge', 'worker.ts');

const ASSET_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy-Report-Only': "default-src 'self'; connect-src 'self' https://example.supabase.co",
};

const PRESENT: Record<string, string> = {
  '/auth/recovery': '<!DOCTYPE html><html><head><title>Reset your password</title></head><body></body></html>',
  '/auth/confirm': '<!DOCTYPE html><html><head><title>Confirm your email</title></head><body></body></html>',
  [ENTRY_JS]: 'globalThis.__EXPO_ROUTER_HYDRATE__=true;',
  [GLOBAL_CSS]: ':root{}',
  '/favicon.ico': 'icon-bytes',
};

type Target = { fetch(request: Request, env: BridgeEnv): Promise<Response> };

/**
 * Load the bundled `_worker.js` source the Pages build writes, as a module Jest can invoke.
 *
 * The bundle is the real deployable artifact; only its module wrapper is rewritten (ES modules →
 * CommonJS) so Jest's CommonJS runtime can require it. It is written to a temporary file and
 * required, so nothing is evaluated from a string.
 */
async function loadPagesTarget(): Promise<Target> {
  const esm = await bundleWorkerForPages(WORKER_ENTRY);
  const cjs = transformSync(esm, { format: 'cjs', loader: 'js' }).code;
  const file = join(mkdtempSync(join(tmpdir(), 'qa-auth-pages-')), 'worker.cjs');
  writeFileSync(file, cjs, 'utf8');
  const loadModule = createRequire(__filename);
  const loaded = (loadModule(file) as { default?: Target }).default;
  if (!loaded) throw new Error('the bundled Pages worker has no default export');
  return loaded;
}

/** The live Workers target, and the Pages artifact built from the very same module. */
const TARGETS: { workers: Target; pages: Target } = { workers: workersTarget as Target, pages: undefined as never };

beforeAll(async () => {
  TARGETS.pages = await loadPagesTarget();
});

type Assets = { calls: string[]; binding: BridgeEnv['ASSETS'] };

function assets(present: Record<string, string>, force?: () => Response): Assets {
  const calls: string[] = [];
  return {
    calls,
    binding: {
      async fetch(request: Request) {
        calls.push(request.url);
        if (force) return force();
        const body = present[new URL(request.url).pathname];
        if (body === undefined) return new Response('not found', { status: 404 });
        return new Response(body, { status: 200, headers: ASSET_HEADERS });
      },
    },
  };
}

type Case = {
  /** Path, optionally with a query string and/or fragment, as a browser would request it. */
  url: string;
  method?: string;
  mode?: string;
  present?: Record<string, string>;
  force?: () => Response;
};

type Observation = {
  status: number;
  body: string | null;
  headers: [string, string][];
  assetCalls: string[];
};

async function observe(target: Target, testCase: Case): Promise<Observation> {
  const bound = assets(testCase.present ?? PRESENT, testCase.force);
  const env: BridgeEnv = {
    ASSETS: bound.binding,
    ...(testCase.mode === undefined ? {} : { BRIDGE_MODE: testCase.mode }),
  };
  const response = await target.fetch(new Request(`${ORIGIN}${testCase.url}`, { method: testCase.method }), env);
  return {
    status: response.status,
    body: response.body === null ? null : await response.text(),
    headers: [...response.headers.entries()].sort(),
    assetCalls: bound.calls,
  };
}

/** Run one case against both targets, assert they agree, and return the agreed answer. */
async function bothTargets(testCase: Case): Promise<Observation> {
  const [workers, pages] = await Promise.all([observe(TARGETS.workers, testCase), observe(TARGETS.pages, testCase)]);
  expect(pages).toEqual(workers);
  return workers;
}

describe('the Pages artifact is the Workers module', () => {
  it('exposes a fetch handler bundled from the live Worker entry point', () => {
    expect(typeof TARGETS.pages.fetch).toBe('function');
  });
});

describe('kill switch', () => {
  it.each(['deny', 'off', 'Deny', 'disabled', '', 'serve '])('BRIDGE_MODE=%p closes every route on both targets', async (mode) => {
    for (const url of [...policy.documentPaths, ENTRY_JS, GLOBAL_CSS, '/favicon.ico', '/']) {
      const answer = await bothTargets({ url, mode });
      expect(answer.status).toBe(404);
      expect(answer.assetCalls).toEqual([]);
    }
  });

  it('serves when BRIDGE_MODE is "serve" and when it is unset', async () => {
    expect((await bothTargets({ url: '/auth/recovery', mode: 'serve' })).status).toBe(200);
    expect((await bothTargets({ url: '/auth/recovery' })).status).toBe(200);
  });
});

describe('methods', () => {
  it.each(['GET', 'HEAD'])('%s is answered on both targets', async (method) => {
    const answer = await bothTargets({ url: '/auth/recovery', method });
    expect(answer.status).toBe(200);
    expect(answer.body).toBe(method === 'HEAD' ? null : PRESENT['/auth/recovery']);
  });

  // TRACE is omitted: the fetch Request constructor forbids it outright, so it never reaches either
  // target. Every method a browser or client can actually construct is covered here.
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('%s is refused with 405 on both targets', async (method) => {
    for (const url of ['/auth/recovery', '/', '/admin', ENTRY_JS]) {
      const answer = await bothTargets({ url, method });
      expect(answer.status).toBe(405);
      expect(answer.headers).toContainEqual(['allow', 'GET, HEAD']);
      expect(answer.assetCalls).toEqual([]);
    }
  });
});

describe('sensitive query keys', () => {
  it('policy.json still declares all sixteen', () => {
    expect(policy.sensitiveQueryKeys).toHaveLength(16);
  });

  it.each(policy.sensitiveQueryKeys)('%s is refused with 400 on both targets', async (key) => {
    const answer = await bothTargets({ url: `/auth/recovery?${key}=abc` });
    expect(answer.status).toBe(400);
    expect(answer.body).toBe('Bad Request');
    expect(answer.assetCalls).toEqual([]);
  });

  it.each(policy.sensitiveQueryKeys)('%s is refused whatever its case, position or value', async (key) => {
    for (const url of [
      `/auth/confirm?${key.toUpperCase()}=abc`,
      `/auth/confirm?type=signup&${key}=`,
      `/favicon.ico?${key}=abc`,
    ]) {
      expect((await bothTargets({ url })).status).toBe(400);
    }
  });

  it('never echoes the refused value on either target', async () => {
    const answer = await bothTargets({ url: '/auth/recovery?token_hash=supersecretvalue' });
    expect(answer.body).not.toContain('supersecretvalue');
    expect(JSON.stringify(answer.headers)).not.toContain('supersecretvalue');
  });
});

describe('the query string is removed before the asset fetch', () => {
  it.each(policy.documentPaths)('%s is fetched at its canonical path only', async (path) => {
    const answer = await bothTargets({ url: `${path}?error=access_denied&error_code=otp_expired` });
    expect(answer.status).toBe(200);
    expect(answer.assetCalls).toEqual([`${ORIGIN}${path}`]);
  });
});

describe('the allow-list', () => {
  it.each([...policy.documentPaths, ENTRY_JS, GLOBAL_CSS, '/favicon.ico'])('%s is served by both targets', async (url) => {
    const answer = await bothTargets({ url });
    expect(answer.status).toBe(200);
    expect(answer.body).toBe(PRESENT[url]);
    expect(answer.assetCalls).toEqual([`${ORIGIN}${url}`]);
  });

  const denied = [
    '/',
    '/index.html',
    '/home',
    '/admin',
    '/sitemap.xml',
    '/_headers',
    '/_redirects',
    '/_routes.json',
    '/_worker.js',
    '/_worker.js/index.js',
    '/functions/hello.js',
    '/404',
    '/404.html',
    '/policy.json',
    '/infra/qa-auth-bridge/policy.json',
    '/.qa-auth-bridge-manifest.json',
    '/.qa-auth-bridge-pages-manifest.json',
    '/wrangler.qa-auth.jsonc',
    '/wrangler.qa-auth-pages.jsonc',
    '/.assetsignore',
    '/_sitemap.html',
    '/auth',
    '/auth/',
    '/auth/recovery/',
    '/auth/recovery.html',
    '/auth/Recovery',
    '/_expo/static/js/web/../../../index.html',
    '/assets/icon.png',
  ];

  it.each(denied)('%s returns a neutral 404 on both targets, without touching the assets binding', async (url) => {
    const answer = await bothTargets({ url });
    expect(answer.status).toBe(404);
    expect(answer.body).toBe('Not Found');
    expect(answer.assetCalls).toEqual([]);
  });
});

describe('only successful asset responses are forwarded', () => {
  it.each([201, 204, 301, 302, 304, 404, 500])('a %s from the assets binding becomes a neutral 404 on both targets', async (status) => {
    const answer = await bothTargets({
      url: '/auth/recovery',
      force: () =>
        new Response(status === 204 || status === 304 ? null : 'elsewhere', {
          status,
          headers: { Location: '/index.html', 'Set-Cookie': 'a=b' },
        }),
    });
    expect(answer.status).toBe(404);
    expect(answer.body).toBe('Not Found');
    expect(answer.headers.map(([name]) => name)).not.toContain('location');
  });

  it('an allowed path whose asset is absent is a neutral 404 on both targets', async () => {
    const answer = await bothTargets({ url: ENTRY_JS, present: {} });
    expect(answer.status).toBe(404);
    expect(answer.body).toBe('Not Found');
  });
});

describe('hardened response headers', () => {
  const hardened: [string, string][] = [
    ['cache-control', 'no-store'],
    ['referrer-policy', 'no-referrer'],
    ['x-robots-tag', 'noindex, nofollow'],
    ['x-content-type-options', 'nosniff'],
    ['x-frame-options', 'DENY'],
    ['content-security-policy', policy.contentSecurityPolicy],
  ];

  it.each(['/auth/recovery', '/auth/confirm', ENTRY_JS, '/favicon.ico', '/admin', '/auth/recovery?token_hash=x'])(
    'all six hardened headers are present and identical on both targets for %s',
    async (url) => {
      const answer = await bothTargets({ url });
      for (const pair of hardened) expect(answer.headers).toContainEqual(pair);
    },
  );

  it('applies the same six headers to a 405 refusal', async () => {
    const answer = await bothTargets({ url: '/auth/recovery', method: 'POST' });
    for (const pair of hardened) expect(answer.headers).toContainEqual(pair);
  });

  it('replaces the export report-only CSP with the enforced one', async () => {
    const answer = await bothTargets({ url: '/auth/recovery' });
    expect(answer.headers.map(([name]) => name)).not.toContain('content-security-policy-report-only');
    const csp = answer.headers.find(([name]) => name === 'content-security-policy')?.[1] ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toContain("'unsafe-inline'; script-src");
  });

  it('keeps the asset content type', async () => {
    const answer = await bothTargets({ url: '/auth/recovery' });
    expect(answer.headers).toContainEqual(['content-type', 'text/html; charset=utf-8']);
  });
});

describe('the emailed token stays in the fragment, client-side', () => {
  it('a fragment never reaches either target, so the answer equals the bare request', async () => {
    const withFragment = await bothTargets({ url: '/auth/recovery#token_hash=abc&type=recovery' });
    const bare = await bothTargets({ url: '/auth/recovery' });
    expect(withFragment).toEqual(bare);
    expect(withFragment.assetCalls).toEqual([`${ORIGIN}/auth/recovery`]);
    expect(JSON.stringify(withFragment)).not.toContain('token_hash');
  });

  it('the same token shape in the query string is refused instead of served', async () => {
    expect((await bothTargets({ url: '/auth/recovery?token_hash=abc&type=recovery' })).status).toBe(400);
  });

  it('the enforced CSP still forbids the page from making any network request', async () => {
    const answer = await bothTargets({ url: '/auth/recovery' });
    const csp = answer.headers.find(([name]) => name === 'content-security-policy')?.[1] ?? '';
    expect(csp).toContain("connect-src 'none'");
  });
});
