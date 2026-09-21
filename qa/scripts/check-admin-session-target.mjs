#!/usr/bin/env node
/**
 * check-admin-session-target.mjs — OFFLINE proof that the mocked admin session is bound to the
 * SERVED project, and that the test which proves the mock works cannot pass before hydration.
 *
 * WHY THIS EXISTS. mockAdminSession used to read the repo-root .env to build the Supabase session
 * storage key. That was correct only while the web server served the consumer app from the
 * repository root. Once the admin app moved to apps/admin the server took its environment from
 * qa/.env, the two project refs diverged, and the mock seeded a session under a key the app never
 * reads. Every dashboard test then landed on /login.
 *
 * It went unnoticed for three commits because the ONE test written to prove the mock works
 * asserted `getByText('Executive KPIs')` immediately after goto(). The admin app is built with
 * web.output "static", so that string is in the server-rendered HTML: the assertion was satisfied
 * before hydration, before AuthProvider settled, and before the guard could redirect. A test that
 * cannot observe the failure it exists to catch is worse than no test.
 *
 * This check therefore guards BOTH: the key derivation, and the post-hydration discipline.
 *
 * Runs with `node --experimental-strip-types` so it can exercise the real module. No network, no
 * database, no browser. It prints booleans and counts only, never a URL, project ref, storage key,
 * session or token.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const QA_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCK = path.join(QA_ROOT, 'playwright/support/mock-admin-session.ts');
const INFRA = path.join(QA_ROOT, 'playwright/tests/infra-health.spec.ts');
const EXEC = path.join(QA_ROOT, 'playwright/admin/executive-dashboard.spec.ts');
const DET = path.join(QA_ROOT, 'playwright/admin/detailed-analytics.spec.ts');
const DIST = path.join(QA_ROOT, '../apps/admin/dist');

const mock = fs.readFileSync(MOCK, 'utf8');
const infra = fs.readFileSync(INFRA, 'utf8');
const exec = fs.readFileSync(EXEC, 'utf8');
const det = fs.readFileSync(DET, 'utf8');

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}`);
  }
}

// ── 1. No file-system configuration source ──────────────────────────────────
console.log('key derivation reads no file');
check('does not import fs', !/from\s+['"](node:)?fs['"]/.test(mock));
check('does not import path', !/from\s+['"](node:)?path['"]/.test(mock));
check('does not resolve the repo-root .env', !mock.includes('../../../.env'));
check('mentions no .env path at all', !/\.env['"]/.test(mock));
check('derives from process.env.EXPO_PUBLIC_SUPABASE_URL', mock.includes('process.env.EXPO_PUBLIC_SUPABASE_URL'));
check('uses projectRefFromSupabaseUrl', mock.includes('projectRefFromSupabaseUrl('));
check('pins connected mode to the certified project', mock.includes('CERTIFIED_QA_PROJECT_REF'));
check('consults connectedModeConfigured', mock.includes('connectedModeConfigured()'));
check('logs nothing', !/console\./.test(mock));

// ── 2. Behaviour: fail closed ───────────────────────────────────────────────
console.log('\nfail-closed behaviour (real module, no network)');
// Node's ESM resolver cannot follow the extensionless TypeScript specifier that Playwright and
// tsc resolve for us, so the module is loaded through a transient copy whose single relative
// import is rewritten to an absolute file URL. Nothing else is altered: the logic exercised below
// is the real implementation, not a re-description of it. The copy lives in the OS temp directory
// and is removed immediately, leaving no repository artefact.
const { CERTIFIED_QA_PROJECT_REF } = await import(
  new URL('../shared/qa-target.ts', import.meta.url).href
);
const mockUrl = await (async () => {
  const target = new URL('../shared/qa-target.ts', import.meta.url).href;
  const Q1 = String.fromCharCode(39);
  const SPECIFIER = 'from ' + Q1 + '../../shared/qa-target' + Q1;
  const rewritten = mock.replace(SPECIFIER, () => 'from ' + Q1 + target + Q1);
  if (rewritten === mock) throw new Error('could not rewrite the qa-target specifier');
  // Inside qa/ so bare specifiers (@playwright/test) still resolve via qa/node_modules, and so
  // Node will type-strip it (it refuses to do so under node_modules). Removed immediately below.
  const dir = fs.mkdtempSync(path.join(QA_ROOT, '.session-check-'));
  const tmp = path.join(dir, 'mock-admin-session.ts');
  fs.writeFileSync(tmp, rewritten);
  return { href: new URL(`file://${tmp.split(path.sep).join('/')}`).href, dir: path.dirname(tmp) };
})();
const { mockAdminSessionConfigured, supabaseStorageKey } = await import(mockUrl.href);
fs.rmSync(mockUrl.dir, { recursive: true, force: true });

const SAVED = {
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  QA_SUPABASE_URL: process.env.QA_SUPABASE_URL,
  E2E_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD,
};
function setEnv(values) {
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
function throws(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

const CERTIFIED_URL = `https://${CERTIFIED_QA_PROJECT_REF}.supabase.co`;
const OTHER_URL = 'https://abcdefghijklmnopqrst.supabase.co';
const NOT_CONNECTED = { QA_SUPABASE_URL: undefined, E2E_ADMIN_EMAIL: undefined, E2E_ADMIN_PASSWORD: undefined };

setEnv({ ...NOT_CONNECTED, EXPO_PUBLIC_SUPABASE_URL: undefined });
check('missing served project -> not configured', mockAdminSessionConfigured() === false);
check('missing served project -> key throws', throws(() => supabaseStorageKey()));

setEnv({ EXPO_PUBLIC_SUPABASE_URL: 'not-a-url' });
check('malformed served project -> not configured', mockAdminSessionConfigured() === false);
check('malformed served project -> key throws', throws(() => supabaseStorageKey()));

setEnv({ EXPO_PUBLIC_SUPABASE_URL: 'https://example.com' });
check('non-Supabase host -> key throws', throws(() => supabaseStorageKey()));

setEnv({ EXPO_PUBLIC_SUPABASE_URL: `http://${CERTIFIED_QA_PROJECT_REF}.supabase.co` });
check('non-https served project -> key throws', throws(() => supabaseStorageKey()));

setEnv({ ...NOT_CONNECTED, EXPO_PUBLIC_SUPABASE_URL: OTHER_URL });
check('unconnected + any valid project -> configured', mockAdminSessionConfigured() === true);
check('key form is sb-<ref>-auth-token', /^sb-[a-z]{20}-auth-token$/.test(supabaseStorageKey()));

setEnv({ EXPO_PUBLIC_SUPABASE_URL: OTHER_URL, QA_SUPABASE_URL: CERTIFIED_URL });
check('connected + wrong served project -> not configured', mockAdminSessionConfigured() === false);
check('connected + wrong served project -> key throws', throws(() => supabaseStorageKey()));

setEnv({ EXPO_PUBLIC_SUPABASE_URL: CERTIFIED_URL, QA_SUPABASE_URL: CERTIFIED_URL });
check('connected + certified served project -> configured', mockAdminSessionConfigured() === true);
check('connected + certified -> key form holds', /^sb-[a-z]{20}-auth-token$/.test(supabaseStorageKey()));
check('managed release gate cannot silently skip', mockAdminSessionConfigured() === true);

setEnv(SAVED);

// ── 3. The pre-hydration false positive ─────────────────────────────────────
console.log('\ninfra-health observes a post-hydration outcome');
check(
  'no longer authenticates on the server-rendered Executive KPIs text',
  !/getByText\(\s*['"]Executive KPIs['"]/.test(infra),
);
check('waits for a terminal auth outcome', infra.includes('waitForAdminAuthOutcome('));
check('asserts the authenticated branch explicitly', /toBe\(\s*['"]authenticated['"]\s*\)/.test(infra));
check('observes the /login alternative', /not\.toContain\(\s*['"]login['"]\s*\)/.test(infra));
check('asserts the route was kept', infra.includes("startsWith('/analytics/detailed')"));
check('asserts an authenticated-only landmark', infra.includes('ADMIN_SHELL_LANDMARK'));

const outcomeHelper = mock.slice(mock.indexOf('export async function waitForAdminAuthOutcome'));
check('the helper waits for shell OR login, not a bare URL change', /shell\.or\(login\)/.test(outcomeHelper));
check(
  'the helper does not rely on waitForURL',
  !/waitForURL/.test(outcomeHelper),
);

// The landmark must be absent from exported HTML, or the false positive returns in a new form.
console.log('\nthe landmark is absent from server-rendered HTML');
const landmarkMatch = mock.match(/ADMIN_SHELL_LANDMARK\s*=\s*['"]([^'"]+)['"]/);
check('a landmark constant is declared', !!landmarkMatch);
if (landmarkMatch && fs.existsSync(DIST)) {
  const pages = ['analytics/index.html', 'analytics/detailed.html', 'login.html']
    .map((p) => path.join(DIST, p))
    .filter((p) => fs.existsSync(p));
  check('exported pages were available to inspect', pages.length > 0);
  for (const p of pages) {
    const html = fs.readFileSync(p, 'utf8');
    check(`landmark absent from ${path.relative(DIST, p).split(path.sep).join('/')}`, !html.includes(landmarkMatch[1]));
  }
} else {
  console.log('  SKIP  exported HTML not present (run build:admin to enable this check)');
}

// ── 4. Skip gating ──────────────────────────────────────────────────────────
console.log('\nmock-authenticated specs gate on configuration');
for (const [name, src] of [['infra-health', infra], ['executive-dashboard', exec], ['detailed-analytics', det]]) {
  check(`${name} skips when unconfigured`, src.includes('mockAdminSessionConfigured()'));
  check(`${name} states a reason`, src.includes('MOCK_ADMIN_SESSION_SKIP_REASON'));
}

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
