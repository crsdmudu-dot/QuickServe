/**
 * supabase-keys-functions.test.ts — every Edge Function that needs a Supabase API key gets it
 * through `_shared/supabase-keys.ts` (package 262, QA migration to publishable and secret keys).
 *
 * Two layers, in the style of the existing function tests:
 *   1. Static: no function names a legacy injected variable (SUPABASE_SERVICE_ROLE_KEY /
 *      SUPABASE_ANON_KEY) in code, and each of the seven imports and calls the helper.
 *   2. Behavioural: each index.ts runs for real under a `Deno` shim and a VIRTUAL mock of
 *      `jsr:@supabase/supabase-js@2` that records every createClient call. With the new keys the
 *      clients are signed with them; with a missing or broken key no client is created, the
 *      function answers its generic error, and no key text reaches a log line. With ONLY the
 *      legacy variables set, the functions refuse (no fallback).
 *   3. Key-failure log line (package 265): every key failure leaves one diagnosable line holding
 *      fixed words only (function name, key kind, reason word), never key text.
 * No network, no database, and every key is FAKE (short, hyphenated, matching no scanner).
 */
import * as fs from 'fs';
import * as path from 'path';

// ─── The recording fake Supabase client (virtual module) ─────────────────────

type ClientCall = { url: string; key: string; options: unknown };
let mockClientCalls: ClientCall[] = [];

jest.mock(
  'jsr:@supabase/supabase-js@2',
  () => {
    /** A chainable stand-in: any property is callable, and awaiting anything gives an empty result. */
    const fake = (): unknown =>
      new Proxy(function () {}, {
        get: (_t, prop) => {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
          }
          return fake();
        },
        apply: () => fake(),
      });
    return {
      createClient: (url: string, key: string, options?: unknown) => {
        mockClientCalls.push({ url, key, options });
        return fake();
      },
    };
  },
  { virtual: true },
);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '../..');
const FUNCTIONS = path.join(ROOT, 'supabase/functions');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const read = (rel: string) => fs.readFileSync(path.join(FUNCTIONS, rel), 'utf-8');

const QA_URL = 'https://qaprojectref0000000000.supabase.co';
const FAKE_SECRET = 'sb_secret_fake-test-only-2';
const FAKE_PUBLISHABLE = 'sb_publishable_fake-test-only-2';
const FAKE_LEGACY_SERVICE = 'eyJfake-legacy-service.test.only';
const FAKE_LEGACY_ANON = 'eyJfake-legacy-anon.test.only';
const CALLBACK_SECRET = 'fake-callback-secret-pkg262';
const WEBHOOK_SECRET = 'fake-webhook-secret-pkg262';
const WORKER_SECRET = 'fake-worker-secret-pkg262';

const NEW_KEYS = {
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: FAKE_SECRET }),
  SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: FAKE_PUBLISHABLE }),
};
const LEGACY_KEYS = { SUPABASE_SERVICE_ROLE_KEY: FAKE_LEGACY_SERVICE, SUPABASE_ANON_KEY: FAKE_LEGACY_ANON };
const BASE_ENV: Record<string, string> = {
  SUPABASE_URL: QA_URL,
  MPESA_MODE: 'mock',
  MPESA_CALLBACK_SECRET: CALLBACK_SECRET,
  PUSH_WEBHOOK_SECRET: WEBHOOK_SECRET,
  DELETION_WORKER_SECRET: WORKER_SECRET,
};
const KEY_TEXTS = [FAKE_SECRET, FAKE_PUBLISHABLE, FAKE_LEGACY_SERVICE, FAKE_LEGACY_ANON, 'fake-test-only', 'eyJfake'];

type Fn =
  | 'admin-account-suspension'
  | 'delete-account'
  | 'deletion-worker'
  | 'mpesa-callback'
  | 'mpesa-stk-push'
  | 'register-device'
  | 'send-push';

/** Which helper calls each function must make, and a request that reaches its key read. */
const CASES: Record<Fn, { secret: boolean; publishable: boolean; request: () => Request; failStatus: number }> = {
  'admin-account-suspension': {
    secret: true,
    publishable: true,
    failStatus: 500,
    request: () =>
      new Request('https://fn.test/admin-account-suspension', {
        method: 'POST',
        headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suspend' }),
      }),
  },
  'delete-account': {
    secret: true,
    publishable: true,
    failStatus: 500,
    request: () =>
      new Request('https://fn.test/delete-account', {
        method: 'POST',
        headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE', password: 'not-a-real-password' }),
      }),
  },
  'deletion-worker': {
    secret: true,
    publishable: false,
    failStatus: 500,
    request: () =>
      new Request('https://fn.test/deletion-worker', {
        method: 'POST',
        headers: { 'x-worker-secret': WORKER_SECRET, 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 1 }),
      }),
  },
  'mpesa-callback': {
    secret: true,
    publishable: false,
    failStatus: 500,
    request: () =>
      new Request(`https://fn.test/mpesa-callback?token=${CALLBACK_SECRET}`, { method: 'POST', body: 'not json' }),
  },
  'mpesa-stk-push': {
    secret: true,
    publishable: true,
    failStatus: 500,
    request: () =>
      new Request('https://fn.test/mpesa-stk-push', {
        method: 'POST',
        headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: 'pay-1', phone: '254700000000' }),
      }),
  },
  'register-device': {
    secret: true,
    publishable: true,
    failStatus: 500,
    request: () =>
      new Request('https://fn.test/register-device', {
        method: 'POST',
        headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({ push_token: 'ExponentPushToken[fake]', platform: 'ios' }),
      }),
  },
  // send-push always answers 200 (no pg_net retry storm); a key failure is logged, never thrown.
  'send-push': {
    secret: true,
    publishable: false,
    failStatus: 200,
    request: () =>
      new Request('https://fn.test/send-push', {
        method: 'POST',
        headers: { 'x-webhook-secret': WEBHOOK_SECRET, 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'nothing_to_send' }),
      }),
  },
};
const ALL = Object.keys(CASES) as Fn[];

type Handler = (req: Request) => Promise<Response>;

/** Loads one function fresh under a Deno shim with the given environment. */
function load(fn: Fn, env: Record<string, string | undefined>): Handler {
  jest.resetModules();
  let handler: Handler | null = null;
  (globalThis as unknown as { Deno: unknown }).Deno = {
    serve: (h: Handler) => {
      handler = h;
    },
    env: { get: (k: string) => env[k] },
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(`../../supabase/functions/${fn}/index.ts`);
  if (!handler) throw new Error('handler not registered');
  return handler;
}

let spies: jest.SpyInstance[] = [];
const logged = () => spies.flatMap((s) => s.mock.calls.map((c: unknown[]) => c.map(String).join(' '))).join('\n');

beforeEach(() => {
  mockClientCalls = [];
  spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation(() => undefined),
  );
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => {
    throw new Error('no network in this test');
  });
});
afterEach(() => {
  for (const s of spies) s.mockRestore();
});

// ─── 1. Static ───────────────────────────────────────────────────────────────

describe('static: the legacy injected names are gone', () => {
  const files = fs
    .readdirSync(FUNCTIONS, { withFileTypes: true })
    .flatMap((d) =>
      d.isDirectory()
        ? fs.readdirSync(path.join(FUNCTIONS, d.name)).filter((f) => f.endsWith('.ts')).map((f) => `${d.name}/${f}`)
        : [],
    );

  it('finds the function sources', () => {
    expect(files.length).toBeGreaterThanOrEqual(19);
  });

  it.each(files)('%s names no legacy key variable in code', (rel) => {
    expect(code(read(rel))).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY/);
  });

  it('only the shared helper names the new injected variables', () => {
    const users = files.filter((rel) => /SUPABASE_SECRET_KEYS|SUPABASE_PUBLISHABLE_KEYS/.test(code(read(rel))));
    expect(users).toEqual(['_shared/supabase-keys.ts']);
  });
});

describe.each(ALL)('static: %s uses the helper', (fn) => {
  const src = code(read(`${fn}/index.ts`));
  const c = CASES[fn];

  it('imports it from _shared', () => {
    expect(src).toMatch(/from '\.\.\/_shared\/supabase-keys\.ts'/);
  });

  it(`calls secretKeyFrom (${c.secret}) and publishableKeyFrom (${c.publishable})`, () => {
    expect(/secretKeyFrom\(/.test(src)).toBe(c.secret);
    expect(/publishableKeyFrom\(/.test(src)).toBe(c.publishable);
  });

  it('reads no key with Deno.env.get directly', () => {
    expect(src).not.toMatch(/Deno\.env\.get\('SUPABASE_(SECRET|PUBLISHABLE)/);
  });
});

// ─── 2. Behavioural ──────────────────────────────────────────────────────────

describe.each(ALL)('behaviour: %s', (fn) => {
  const c = CASES[fn];

  it('signs its clients with the new keys only, and logs no key', async () => {
    await load(fn, { ...BASE_ENV, ...NEW_KEYS, ...LEGACY_KEYS })(c.request());
    expect(mockClientCalls.length).toBeGreaterThan(0);
    const keys = new Set(mockClientCalls.map((x) => x.key));
    for (const k of keys) expect([FAKE_SECRET, FAKE_PUBLISHABLE]).toContain(k);
    expect(keys.has(FAKE_LEGACY_SERVICE) || keys.has(FAKE_LEGACY_ANON)).toBe(false);
    for (const t of KEY_TEXTS) expect(logged()).not.toContain(t);
  });

  // The kind and reason the function's key-failure log line must name (package 265, F-40bb-12).
  // Functions that use both keys read the publishable key first, so "absent" names it.
  const absentKind = c.publishable ? 'publishable' : 'secret';
  it.each([
    ['both new variables absent', {}, absentKind, 'absent'],
    ['the secret dictionary unparseable', { SUPABASE_SECRET_KEYS: `{${FAKE_SECRET}`, SUPABASE_PUBLISHABLE_KEYS: NEW_KEYS.SUPABASE_PUBLISHABLE_KEYS }, 'secret', 'unparseable'],
    ['a legacy JWT in the secret slot', { SUPABASE_SECRET_KEYS: JSON.stringify({ default: FAKE_LEGACY_SERVICE }), SUPABASE_PUBLISHABLE_KEYS: NEW_KEYS.SUPABASE_PUBLISHABLE_KEYS }, 'secret', 'wrong_kind'],
    ['no default secret key', { SUPABASE_SECRET_KEYS: JSON.stringify({ other: FAKE_SECRET }), SUPABASE_PUBLISHABLE_KEYS: NEW_KEYS.SUPABASE_PUBLISHABLE_KEYS }, 'secret', 'no_default_key'],
    ['only the legacy variables (no fallback)', { ...LEGACY_KEYS }, absentKind, 'absent'],
  ])('fails closed when %s: no client, generic answer, no key in logs, the fixed reason logged', async (_label, keys, kind, reason) => {
    const res = await load(fn, { ...BASE_ENV, ...keys })(c.request());
    expect(res.status).toBe(c.failStatus);
    expect(mockClientCalls).toEqual([]);
    const body = await res.text();
    for (const t of KEY_TEXTS) {
      expect(logged()).not.toContain(t);
      expect(body).not.toContain(t);
    }
    expectKeyFailureLogged(fn, kind, reason);
  });

  if (c.publishable) {
    it('fails closed when only the publishable dictionary is broken, and logs the fixed reason', async () => {
      const keys = { SUPABASE_SECRET_KEYS: NEW_KEYS.SUPABASE_SECRET_KEYS, SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: FAKE_SECRET }) };
      const res = await load(fn, { ...BASE_ENV, ...keys })(c.request());
      expect(res.status).toBe(c.failStatus);
      expect(mockClientCalls).toEqual([]);
      for (const t of KEY_TEXTS) expect(logged()).not.toContain(t);
      expectKeyFailureLogged(fn, 'publishable', 'wrong_kind');
    });
  }

  it('writes no key-failure line when the keys are good', async () => {
    await load(fn, { ...BASE_ENV, ...NEW_KEYS })(c.request());
    expect(logged()).not.toMatch(/server key unavailable|is not usable \(/);
  });
});

// ─── 3. The key-failure log line (package 265, F-40bb-12) ───────────────────

/** The five functions that log through logApiKeyFailure; the other two keep their own lines. */
const LOGS_THROUGH_HELPER: Fn[] = ['admin-account-suspension', 'delete-account', 'deletion-worker', 'mpesa-stk-push', 'register-device'];

function expectKeyFailureLogged(fn: Fn, kind: string, reason: string) {
  const lines = logged().split('\n');
  if (LOGS_THROUGH_HELPER.includes(fn)) {
    // Exactly one line, the fixed one, naming this function, the key kind and the reason word.
    expect(lines.filter((l) => l.includes('server key unavailable'))).toEqual([
      `${fn}: server key unavailable (${kind}, ${reason}).`,
    ]);
  } else if (fn === 'mpesa-callback') {
    expect(lines).toContain('mpesa-callback: server key unavailable; answered 500.');
  } else {
    // send-push: its existing catch logs the helper's fixed message.
    expect(logged()).toMatch(/\[send-push\] Unexpected error:.*SUPABASE_(SECRET|PUBLISHABLE)_KEYS is not usable \((absent|unparseable|no_default_key|wrong_kind)\)\./);
  }
}

/** The exact statement each of the five writes in its outer catch. */
const LOG_STATEMENT = (fn: Fn) => `logApiKeyFailure('${fn}', error, (line) => console.error(line));`;

describe.each(LOGS_THROUGH_HELPER)('static: %s logs a key failure through the helper only', (fn) => {
  const src = code(read(`${fn}/index.ts`));
  // The outer catch: everything after the LAST `} catch (error) {`.
  const outerCatch = src.slice(src.lastIndexOf('} catch (error) {'));

  it('imports logApiKeyFailure and calls it exactly once, with its own name, in its outer catch', () => {
    expect(src).toMatch(/import \{[^}]*\blogApiKeyFailure\b[^}]*\} from '\.\.\/_shared\/supabase-keys\.ts'/);
    expect(src.match(/logApiKeyFailure\(/g) ?? []).toHaveLength(1);
    expect(src.split(LOG_STATEMENT(fn))).toHaveLength(2);
    expect(src.lastIndexOf('} catch (error) {')).toBeGreaterThan(-1);
    expect(outerCatch).toContain(LOG_STATEMENT(fn));
  });

  it('the outer catch logs nothing else and never touches the error object itself', () => {
    // Drop the catch header, the one allowed statement and string literals; what remains may not
    // log, and may not use the caught `error` (an `error:` object key in a response is fine).
    const rest = outerCatch
      .replace('} catch (error) {', '')
      .replace(LOG_STATEMENT(fn), '')
      .replace(/'[^'\n]*'/g, "''");
    expect(rest).not.toMatch(/console\.|Deno\.std(out|err)/);
    expect(rest).not.toMatch(/\berror\b(?!\s*:)/);
  });
});
