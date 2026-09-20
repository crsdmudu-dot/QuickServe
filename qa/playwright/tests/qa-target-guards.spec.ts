import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  ADMIN_READY_PATH,
  ADMIN_SERVER_COMMAND,
  ADMIN_SERVER_CWD,
  ADMIN_TEST_BASE_URL,
  ADMIN_TEST_HOST,
  ADMIN_TEST_PORT,
  ADMIN_TEST_READY_URL,
  CERTIFIED_QA_PROJECT_REF,
  assertCertifiedAdminApp,
  assertCertifiedQaDatabase,
  assertLoopbackBaseUrl,
  assertManagedServerBaseUrl,
  connectedModeConfigured,
  projectRefFromSupabaseUrl,
} from '../../shared/qa-target';
import { loadEnv } from '../../shared/env';
import playwrightConfig from '../../playwright.config';

/**
 * qa-target-guards.spec.ts — OFFLINE proofs that connected certification fails closed.
 *
 * Nothing here contacts a network, a browser or a database: the guards are pure functions over
 * environment variables, and the route/cleanup assertions read repository files. That is the
 * point — these must be provable without the very connected run they protect.
 *
 * The scenarios mirror the ways a run could previously have reached the wrong backend: an absent
 * variable that disabled the old relative guard, a project ref nobody recognised, a UI pointed at
 * one project while the database pointed at another, and a remote BASE_URL whose backend cannot
 * be proven from here.
 */

const QA_URL = `https://${CERTIFIED_QA_PROJECT_REF}.supabase.co`;
const PRODUCTION_URL = 'https://lkigkltvstlxfdztffds.supabase.co';
const UNKNOWN_URL = 'https://abcdefghijklmnopqrst.supabase.co';
const QA_ROOT = path.resolve(__dirname, '../..');

/** Snapshot and restore the variables each case manipulates. */
const KEYS = [
  'QA_SUPABASE_URL',
  'QA_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'BASE_URL',
  'E2E_ADMIN_EMAIL',
  'E2E_ADMIN_PASSWORD',
] as const;

let saved: Record<string, string | undefined>;

test.beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
});

test.afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k] as string;
  }
});

function setEnv(values: Partial<Record<(typeof KEYS)[number], string | undefined>>): void {
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

test.describe('database target fails closed', () => {
  test('accepts the certified QA project', () => {
    setEnv({ QA_SUPABASE_URL: QA_URL });
    expect(assertCertifiedQaDatabase()).toBe(CERTIFIED_QA_PROJECT_REF);
  });

  test('rejects a missing QA_SUPABASE_URL (the case that disabled the old guard)', () => {
    setEnv({ QA_SUPABASE_URL: undefined });
    expect(() => assertCertifiedQaDatabase()).toThrow(/QA_SUPABASE_URL is not set/);
  });

  test('rejects an empty QA_SUPABASE_URL', () => {
    setEnv({ QA_SUPABASE_URL: '   ' });
    expect(() => assertCertifiedQaDatabase()).toThrow(/QA_SUPABASE_URL is not set/);
  });

  test('rejects a malformed URL', () => {
    setEnv({ QA_SUPABASE_URL: 'not-a-url' });
    expect(() => assertCertifiedQaDatabase()).toThrow(/not a valid URL/);
  });

  test('rejects a non-https URL', () => {
    setEnv({ QA_SUPABASE_URL: `http://${CERTIFIED_QA_PROJECT_REF}.supabase.co` });
    expect(() => assertCertifiedQaDatabase()).toThrow(/must use https/);
  });

  test('rejects a non-Supabase host', () => {
    setEnv({ QA_SUPABASE_URL: 'https://example.com' });
    expect(() => assertCertifiedQaDatabase()).toThrow(/not a .* host/);
  });

  test('rejects a structurally invalid project ref', () => {
    setEnv({ QA_SUPABASE_URL: 'https://SHORT.supabase.co' });
    expect(() => assertCertifiedQaDatabase()).toThrow(/well-formed Supabase project ref/);
  });

  test('rejects the Production project', () => {
    setEnv({ QA_SUPABASE_URL: PRODUCTION_URL });
    expect(() => assertCertifiedQaDatabase()).toThrow(/is not the certified QA project/);
  });

  test('rejects an unknown third project, not just Production', () => {
    setEnv({ QA_SUPABASE_URL: UNKNOWN_URL });
    expect(() => assertCertifiedQaDatabase()).toThrow(/is not the certified QA project/);
  });

  test('never puts a key or a whole credential-bearing URL in the message', () => {
    setEnv({ QA_SUPABASE_URL: PRODUCTION_URL });
    let message = '';
    try {
      assertCertifiedQaDatabase();
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toContain('https://');
    expect(message).not.toMatch(/eyJ|apikey|Bearer/i);
  });
});

test.describe('admin application target fails closed', () => {
  test('accepts a matching QA application and database', () => {
    setEnv({
      QA_SUPABASE_URL: QA_URL,
      QA_SUPABASE_ANON_KEY: 'present',
      EXPO_PUBLIC_SUPABASE_URL: QA_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'present',
    });
    expect(() => assertCertifiedAdminApp()).not.toThrow();
  });

  test('rejects an application pointed at Production', () => {
    setEnv({
      QA_SUPABASE_URL: QA_URL,
      QA_SUPABASE_ANON_KEY: 'present',
      EXPO_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'present',
    });
    expect(() => assertCertifiedAdminApp()).toThrow(/not the certified QA project/);
  });

  test('rejects a UI/database project mismatch', () => {
    // The application is the certified QA project; the database is not.
    setEnv({
      QA_SUPABASE_URL: UNKNOWN_URL,
      QA_SUPABASE_ANON_KEY: 'present',
      EXPO_PUBLIC_SUPABASE_URL: QA_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'present',
    });
    expect(() => assertCertifiedAdminApp()).toThrow(/is not the certified QA project/);
  });

  test('requires the anon keys to be present without reading them', () => {
    setEnv({
      QA_SUPABASE_URL: QA_URL,
      QA_SUPABASE_ANON_KEY: 'present',
      EXPO_PUBLIC_SUPABASE_URL: QA_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: undefined,
    });
    let message = '';
    try {
      assertCertifiedAdminApp();
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/EXPO_PUBLIC_SUPABASE_ANON_KEY is not set/);
    expect(message).not.toContain('present');
  });

  test('rejects a missing application URL', () => {
    setEnv({ QA_SUPABASE_URL: QA_URL, EXPO_PUBLIC_SUPABASE_URL: undefined });
    expect(() => assertCertifiedAdminApp()).toThrow(/EXPO_PUBLIC_SUPABASE_URL is not set/);
  });
});

test.describe('BASE_URL must be the locally launched admin application', () => {
  for (const ok of ['http://localhost:8081', 'http://127.0.0.1:8081', 'http://[::1]:8081']) {
    test(`accepts loopback origin ${ok}`, () => {
      expect(() => assertLoopbackBaseUrl(ok)).not.toThrow();
    });
  }

  for (const bad of ['https://admin.example.com', 'https://quickserve.zaka-crsd.workers.dev']) {
    test(`rejects remote origin ${bad}`, () => {
      expect(() => assertLoopbackBaseUrl(bad)).toThrow(/is not loopback/);
    });
  }

  test('rejects a malformed BASE_URL', () => {
    expect(() => assertLoopbackBaseUrl('::::')).toThrow(/not a valid URL/);
  });
});

test.describe('project-ref parsing', () => {
  test('extracts the ref from a well-formed Supabase URL', () => {
    expect(projectRefFromSupabaseUrl(QA_URL, 'TEST')).toBe(CERTIFIED_QA_PROJECT_REF);
  });

  test('names the offending variable so a misconfiguration is actionable', () => {
    expect(() => projectRefFromSupabaseUrl(undefined, 'SOME_VAR')).toThrow(/SOME_VAR/);
  });
});

test.describe('server ownership — connected runs drive only the managed admin instance', () => {
  test('the command, the port and the computed base URL cannot diverge', () => {
    expect(ADMIN_TEST_BASE_URL).toBe(`http://${ADMIN_TEST_HOST}:${ADMIN_TEST_PORT}`);
    expect(ADMIN_SERVER_COMMAND).toContain(`--port ${ADMIN_TEST_PORT}`);
    // A dedicated port, deliberately not Expo's default, so a stray dev server cannot be
    // mistaken for this suite's admin instance.
    expect(ADMIN_TEST_PORT).not.toBe(8081);
  });

  test('the managed server runs from exactly the admin application', () => {
    expect(ADMIN_SERVER_CWD).toBe('../apps/admin');
  });

  test('connected mode is detected from UI credentials or a QA database target', () => {
    setEnv({ E2E_ADMIN_EMAIL: undefined, E2E_ADMIN_PASSWORD: undefined, QA_SUPABASE_URL: undefined });
    expect(connectedModeConfigured()).toBe(false);

    setEnv({ E2E_ADMIN_EMAIL: 'a@b.c', E2E_ADMIN_PASSWORD: 'p' });
    expect(connectedModeConfigured()).toBe(true);

    setEnv({ E2E_ADMIN_EMAIL: undefined, E2E_ADMIN_PASSWORD: undefined, QA_SUPABASE_URL: QA_URL });
    expect(connectedModeConfigured()).toBe(true);
  });

  test('connected mode always enables the managed server', () => {
    setEnv({ QA_SUPABASE_URL: QA_URL, BASE_URL: undefined });
    const env = loadEnv();
    expect(env.connectedMode).toBe(true);
    expect(env.START_SERVER).toBe(true);
    expect(env.BASE_URL).toBe(ADMIN_TEST_BASE_URL);
  });

  test('an externally supplied BASE_URL cannot override connected mode', () => {
    // Loopback, so the loopback guard alone would have accepted it — this is exactly the
    // stray-server case being closed.
    setEnv({ QA_SUPABASE_URL: QA_URL, BASE_URL: 'http://localhost:8081' });
    expect(() => loadEnv()).toThrow(/managed admin instance/);

    setEnv({ QA_SUPABASE_URL: QA_URL, BASE_URL: 'https://admin.example.com' });
    expect(() => loadEnv()).toThrow(/managed admin instance/);
  });

  test('the base URL guard accepts only the derived managed URL', () => {
    expect(() => assertManagedServerBaseUrl(ADMIN_TEST_BASE_URL)).not.toThrow();
    expect(() => assertManagedServerBaseUrl('http://localhost:8081')).toThrow(/managed admin instance/);
    expect(() => assertManagedServerBaseUrl(`http://127.0.0.1:${ADMIN_TEST_PORT + 1}`)).toThrow(
      /managed admin instance/,
    );
  });

  test('non-connected public smoke keeps external BASE_URL support, intentionally', () => {
    setEnv({
      QA_SUPABASE_URL: undefined,
      E2E_ADMIN_EMAIL: undefined,
      E2E_ADMIN_PASSWORD: undefined,
      BASE_URL: 'https://some-public-origin.example',
    });
    const env = loadEnv();
    expect(env.connectedMode).toBe(false);
    expect(env.BASE_URL).toBe('https://some-public-origin.example');
    // No server is managed for an externally supplied origin.
    expect(env.START_SERVER).toBe(false);
  });

  test('non-connected with no BASE_URL still uses the managed admin instance', () => {
    setEnv({ QA_SUPABASE_URL: undefined, E2E_ADMIN_EMAIL: undefined, E2E_ADMIN_PASSWORD: undefined, BASE_URL: undefined });
    const env = loadEnv();
    expect(env.START_SERVER).toBe(true);
    expect(env.BASE_URL).toBe(ADMIN_TEST_BASE_URL);
  });

  test('an occupied port fails the run instead of attaching to the existing process', () => {
    // Proven statically: with reuseExistingServer false, Playwright does not probe-and-attach —
    // it starts the command and fails the run when the port is already serving. There is no
    // code path that reuses a process this suite did not start.
    const cfg = fs.readFileSync(path.join(QA_ROOT, 'playwright.config.ts'), 'utf8');
    expect(cfg).toContain('reuseExistingServer: false');
    expect(cfg).not.toMatch(/reuseExistingServer:\s*!?CI/);
    expect(cfg).not.toMatch(/reuseExistingServer:\s*true/);
  });

  test('the config derives command, cwd and URL from the shared constants', () => {
    const cfg = fs.readFileSync(path.join(QA_ROOT, 'playwright.config.ts'), 'utf8');
    expect(cfg).toContain('command: ADMIN_SERVER_COMMAND');
    expect(cfg).toContain('cwd: ADMIN_SERVER_CWD');
    // No hard-coded port anywhere in the config — the constant is the single source.
    expect(cfg).not.toContain('--port 8081');
  });

  test('global setup validates the configured base URL, not process.env', () => {
    const setup = fs.readFileSync(path.join(QA_ROOT, 'playwright/support/global-setup.ts'), 'utf8');
    expect(setup).toContain('config.projects[0]?.use?.baseURL');
    expect(setup).toContain('assertManagedServerBaseUrl(configuredBaseUrl)');
    // The managed-server check precedes the certified-target check and the browser launch.
    const managedAt = setup.indexOf('assertManagedServerBaseUrl(configuredBaseUrl)');
    const targetAt = setup.indexOf('assertCertifiedConnectedTarget(configuredBaseUrl)');
    const launchAt = setup.indexOf('chromium.launch');
    expect(managedAt).toBeLessThan(targetAt);
    expect(targetAt).toBeLessThan(launchAt);
  });
});

test.describe('webServer readiness probes a route the admin application actually serves', () => {
  // The admin application has no `/` route, so the origin root answers 404 and Playwright never
  // treats it as ready: it re-requests the root until the 180 s budget expires and the run dies
  // before global setup. Readiness and the browser origin are therefore separate values.
  const webServer = Array.isArray(playwrightConfig.webServer)
    ? playwrightConfig.webServer[0]
    : playwrightConfig.webServer;

  test('the readiness URL carries the exact managed-server origin', () => {
    expect(new URL(ADMIN_TEST_READY_URL).origin).toBe(new URL(ADMIN_TEST_BASE_URL).origin);
    expect(new URL(ADMIN_TEST_READY_URL).origin).toBe(`http://${ADMIN_TEST_HOST}:${ADMIN_TEST_PORT}`);
    expect(ADMIN_TEST_READY_URL.startsWith(ADMIN_TEST_BASE_URL)).toBe(true);
  });

  test('the readiness URL points at /login, never the origin root', () => {
    expect(ADMIN_READY_PATH).toBe('/login');
    expect(new URL(ADMIN_TEST_READY_URL).pathname).toBe('/login');
    expect(new URL(ADMIN_TEST_READY_URL).pathname).not.toBe('/');
    expect(ADMIN_TEST_READY_URL).not.toBe(ADMIN_TEST_BASE_URL);
  });

  test('the readiness path is a real route, not a stale route-group path', () => {
    // Built at runtime so this file does not contain the literal it searches for.
    const REMOVED_GROUP = ['(admin', '-web)'].join('');
    expect(ADMIN_READY_PATH).not.toContain(REMOVED_GROUP);
    expect(ADMIN_READY_PATH.startsWith('/')).toBe(true);
    // The route file backing it exists in the separated admin application.
    expect(fs.existsSync(path.join(QA_ROOT, '../apps/admin/src/app/login.tsx'))).toBe(true);
  });

  test('the readiness path agrees with the login path the specs navigate to', () => {
    const auth = fs.readFileSync(path.join(QA_ROOT, 'playwright/support/auth.ts'), 'utf8');
    expect(auth).toContain(`ADMIN_LOGIN_PATH = '${ADMIN_READY_PATH}'`);
  });

  test('use.baseURL remains the bare managed origin, not the readiness URL', () => {
    expect(playwrightConfig.use?.baseURL).toBe(ADMIN_TEST_BASE_URL);
    expect(new URL(String(playwrightConfig.use?.baseURL)).pathname).toBe('/');
    expect(playwrightConfig.use?.baseURL).not.toBe(ADMIN_TEST_READY_URL);
  });

  test('the resolved webServer probes the readiness URL and keeps every ownership setting', () => {
    test.skip(!webServer, 'no managed server in this mode (external BASE_URL, public smoke)');
    expect(webServer?.url).toBe(ADMIN_TEST_READY_URL);
    expect(webServer?.command).toBe(ADMIN_SERVER_COMMAND);
    expect(webServer?.command).toContain(`--port ${ADMIN_TEST_PORT}`);
    expect(webServer?.cwd).toBe(ADMIN_SERVER_CWD);
    // Ownership is unchanged: an occupied port still fails the run rather than attaching.
    expect(webServer?.reuseExistingServer).toBe(false);
    // The budget is unchanged — the fix is a correct probe target, not a longer wait.
    expect(webServer?.timeout).toBe(180_000);
  });

  test('the config source probes the shared readiness constant, never the bare origin', () => {
    const cfg = fs.readFileSync(path.join(QA_ROOT, 'playwright.config.ts'), 'utf8');
    expect(cfg).toContain('url: ADMIN_TEST_READY_URL');
    expect(cfg).not.toMatch(/url:\s*BASE_URL/);
    expect(cfg).toContain('baseURL: BASE_URL');
    // No hard-coded origin or path: the constants remain the single source.
    expect(cfg).not.toContain('127.0.0.1:8473');
  });
});

test.describe('repository invariants', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== 'test-results' && e.name !== 'reports') walk(p, out);
      } else out.push(p);
    }
    return out;
  }

  test('no stale route-group references remain anywhere in qa/', () => {
    // Built at runtime so this file does not itself contain the literal it searches for.
    const REMOVED_GROUP = ['(admin', '-web)'].join('');
    const offenders = walk(QA_ROOT).filter((f) => {
      if (!/\.(ts|md|jsonc?|yml)$/.test(f)) return false;
      return fs.readFileSync(f, 'utf8').includes(REMOVED_GROUP);
    });
    expect(offenders.map((f) => path.relative(QA_ROOT, f))).toEqual([]);
  });

  test('the admin login route targets the separated admin application', () => {
    const auth = fs.readFileSync(path.join(QA_ROOT, 'playwright/support/auth.ts'), 'utf8');
    expect(auth).toContain("ADMIN_LOGIN_PATH = '/login'");
  });

  test('the Playwright web server launches the admin application, not the consumer app', () => {
    const cfg = fs.readFileSync(path.join(QA_ROOT, 'playwright.config.ts'), 'utf8');
    expect(cfg).toContain("cwd: '../apps/admin'");
    expect(cfg).not.toMatch(/cwd:\s*'\.\.'/);
  });

  test('global setup aborts on login failure instead of continuing unauthenticated', () => {
    const setup = fs.readFileSync(path.join(QA_ROOT, 'playwright/support/global-setup.ts'), 'utf8');
    expect(setup).toContain('throw err;');
    expect(setup).not.toContain('continuing WITHOUT');
    // The target is verified before a browser is launched.
    const guardAt = setup.indexOf('assertCertifiedConnectedTarget');
    const launchAt = setup.indexOf('chromium.launch');
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(launchAt);
  });

  test('storage cleanup stays narrowly prefix-scoped and guarded', () => {
    const storage = fs.readFileSync(path.join(QA_ROOT, 'playwright/support/connected/qa-storage.ts'), 'utf8');
    // The sweep lists and deletes only under the marker prefix — never the whole bucket.
    expect(storage).toContain("data: { prefix: prefix + '/', limit: 200 }");
    expect(storage).toContain('assertNotProduction();');
    expect(storage).not.toMatch(/delete\(`\/storage\/v1\/object\/\$\{BUCKET\}`\)/);

    // And it is actually called by the storage certification spec.
    const spec = fs.readFileSync(path.join(QA_ROOT, 'playwright/certification/storage-uploads.spec.ts'), 'utf8');
    expect(spec).toContain('await sweepStorageObjects();');
  });

  test('every connected entry point routes through the absolute guard', () => {
    const accounts = fs.readFileSync(
      path.join(QA_ROOT, 'playwright/support/connected/qa-accounts.ts'),
      'utf8',
    );
    // assertNotProduction now delegates; the old relative host comparison is gone.
    expect(accounts).toContain('assertCertifiedQaDatabase();');
    expect(accounts).not.toContain('new URL(app).host');
  });
});
