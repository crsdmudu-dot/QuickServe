/**
 * qa-auth-bridge-pages-build.test.ts — the Cloudflare Pages packaging of the QA auth bridge.
 *
 * The Pages target is packaging only: it deploys the SAME `infra/qa-auth-bridge/worker.ts` and the
 * SAME certified asset set as the Workers target, laid out the way Pages advanced mode expects
 * (`_worker.js` in the build output directory, `env.ASSETS` for the assets). These tests pin the
 * pure decisions of that packaging — what is deployable, what Pages will and will not serve, and
 * what makes the build refuse. Behavioural parity with the Worker is proved separately, in
 * `qa-auth-bridge-pages-parity.test.ts`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import policy from '../../infra/qa-auth-bridge/policy.json';
import {
  PAGES_CONFIG_TEMPLATE,
  PAGES_NON_SERVED_FILES,
  PAGES_SERVED_SUBDIR,
  RUNTIME_POLICY_KEYS,
  bundleStructureErrors,
  bundleWorkerForPages,
  pagesConfigErrors,
  pagesOutputName,
  planPagesOutput,
  publicPathForOutputFile,
  runtimePolicy,
  spaFallbackErrors,
} from '../../infra/qa-auth-bridge/pages-build';

const ENTRY_JS = '/_expo/static/js/web/entry-70ebbdee2397a147eeda60ad6772152a.js';
const GLOBAL_CSS = '/_expo/static/css/global-87fd0564cfa78f37afcb8d7603e15d75.css';
const CERTIFIED = ['/auth/confirm', '/auth/recovery', ENTRY_JS, GLOBAL_CSS, '/favicon.ico'];

const WORKER_ENTRY = join(__dirname, '..', '..', 'infra', 'qa-auth-bridge', 'worker.ts');

describe('policy declares the Pages target without naming a host or an account', () => {
  it('names the project and the output directory, separate from the Workers target', () => {
    expect(policy.pages.projectName).toBe('quickserve-auth-qa-pages');
    expect(policy.pages.outputDir).toBe('dist-qa-auth-pages');
    expect(policy.pages.outputDir).not.toBe(policy.outputDir);
  });

  it('carries no hostname, account identifier, credential or DNS value', () => {
    const text = JSON.stringify(policy.pages);
    expect(text).not.toMatch(/hiredcorp|pages\.dev|workers\.dev|supabase\.co/i);
    expect(text).not.toMatch(/[0-9a-f]{32}/i);
  });
});

describe('the deployment workspace works around Pages rejecting a custom config path', () => {
  // Verified against the installed wrangler 4.131.1: `wrangler pages dev|deploy -c <path>` is
  // refused ("Pages does not support custom paths for the Wrangler configuration file"), and with
  // no -c it reads the repository root wrangler.jsonc — the PRODUCTION Worker's config. So the
  // Pages configuration cannot live at the repository root under its own name; the build writes a
  // self-contained workspace whose own wrangler.jsonc is the one Pages finds.
  it('uploads a subdirectory, so the workspace config is never itself an asset', () => {
    expect(PAGES_SERVED_SUBDIR).toBe('origin');
    expect(publicPathForOutputFile('../wrangler.jsonc')).toBeNull();
  });

  it('commits the project configuration as a template, outside the repository root', () => {
    expect(PAGES_CONFIG_TEMPLATE).toMatch(/infra[\\/]qa-auth-bridge[\\/]pages-wrangler\.jsonc$/);
    expect(existsSync(PAGES_CONFIG_TEMPLATE)).toBe(true);
  });
});

describe('pagesConfigErrors', () => {
  const template = () => readFileSync(PAGES_CONFIG_TEMPLATE, 'utf8');

  it('accepts the committed template', () => {
    expect(pagesConfigErrors(template())).toEqual([]);
  });

  it('the committed template names the project and uploads only the served subdirectory', () => {
    const parsed = JSON.parse(template().replace(/^\s*\/\/.*$/gm, '')) as Record<string, unknown>;
    expect(parsed.name).toBe(policy.pages.projectName);
    expect(parsed.pages_build_output_dir).toBe(`./${PAGES_SERVED_SUBDIR}`);
  });

  it('refuses a configuration that names the wrong project', () => {
    expect(pagesConfigErrors('{"name":"something-else","pages_build_output_dir":"./origin"}')).toContain(
      `name must be ${policy.pages.projectName}`,
    );
  });

  it('refuses a configuration that uploads the workspace root', () => {
    expect(pagesConfigErrors(`{"name":"${policy.pages.projectName}","pages_build_output_dir":"."}`)).toContain(
      `pages_build_output_dir must be ./${PAGES_SERVED_SUBDIR}`,
    );
  });

  it.each(['account_id', 'vars', 'routes', 'route', 'send_metrics'])('refuses a configuration carrying %s', (key) => {
    const text = `{"name":"${policy.pages.projectName}","pages_build_output_dir":"./origin","${key}":"x"}`;
    expect(pagesConfigErrors(text)).toContain(`${key} must not be set`);
  });

  it('refuses a configuration that hard-codes a hostname', () => {
    const text = `{"name":"${policy.pages.projectName}","pages_build_output_dir":"./origin","x":"links.auth-qa.hiredcorp.co.ke"}`;
    expect(pagesConfigErrors(text)).toContain('a hostname must not be committed to the configuration');
  });

  it('refuses a configuration that is not valid JSONC', () => {
    expect(pagesConfigErrors('{ not json')).toEqual(['the configuration is not valid JSONC']);
  });
});

describe('PAGES_NON_SERVED_FILES', () => {
  it('is exactly the set Wrangler keeps out of the Pages asset namespace', () => {
    // Verified against the installed wrangler 4.131.1 upload IGNORE_LIST.
    expect([...PAGES_NON_SERVED_FILES]).toEqual(['_worker.js', '_redirects', '_headers', '_routes.json', 'functions']);
  });

  it('is the same list policy.json records, so the build and the docs cannot drift', () => {
    expect(policy.pages.nonServedFiles).toEqual([...PAGES_NON_SERVED_FILES]);
  });
});

describe('planPagesOutput', () => {
  it('keeps exactly the certified asset set, sorted, and reports no error', () => {
    expect(planPagesOutput(CERTIFIED)).toEqual({ assets: [...CERTIFIED].sort(), errors: [] });
  });

  it('refuses a path the worker would not serve, so the two targets cannot drift apart', () => {
    const { assets, errors } = planPagesOutput([...CERTIFIED, '/admin']);
    expect(assets).toEqual([]);
    expect(errors).toEqual(['/admin is not a path the bridge worker serves']);
  });

  it('refuses an index document, because Pages falls back to it for every unmatched path', () => {
    const { assets, errors } = planPagesOutput([...CERTIFIED, '/index.html']);
    expect(assets).toEqual([]);
    expect(errors).toContain('/index.html is not a path the bridge worker serves');
  });

  it.each(['/_headers', '/_redirects', '/_routes.json', '/_worker.js'])(
    'refuses %s, which Pages treats as deployment configuration rather than an asset',
    (path) => {
      const { assets, errors } = planPagesOutput([...CERTIFIED, path]);
      expect(assets).toEqual([]);
      expect(errors).toContain(`${path} is a Pages deployment internal, not a deployable asset`);
    },
  );

  it('refuses an empty manifest rather than deploying an origin with no documents', () => {
    const { errors } = planPagesOutput([]);
    for (const document of policy.documentPaths) {
      expect(errors).toContain(`bridge document missing from the certified manifest: ${document}`);
    }
  });

  it('refuses a manifest that is missing one of the two bridge documents', () => {
    const { assets, errors } = planPagesOutput(CERTIFIED.filter((path) => path !== '/auth/confirm'));
    expect(assets).toEqual([]);
    expect(errors).toEqual(['bridge document missing from the certified manifest: /auth/confirm']);
  });
});

describe('pagesOutputName', () => {
  it.each(policy.documentPaths)('writes the extension-less document %s as its .html file', (path) => {
    expect(pagesOutputName(path)).toBe(`${path.slice(1)}.html`);
  });

  it.each([
    [ENTRY_JS, ENTRY_JS.slice(1)],
    [GLOBAL_CSS, GLOBAL_CSS.slice(1)],
    ['/favicon.ico', 'favicon.ico'],
  ])('writes the generated asset %s at its own path', (served, expected) => {
    expect(pagesOutputName(served)).toBe(expected);
  });
});

describe('publicPathForOutputFile', () => {
  it('serves an .html file at its extension-less pretty path, as Pages does', () => {
    expect(publicPathForOutputFile('auth/recovery.html')).toBe('/auth/recovery');
    expect(publicPathForOutputFile('auth/confirm.html')).toBe('/auth/confirm');
  });

  it('serves a non-HTML asset at its own path', () => {
    expect(publicPathForOutputFile(ENTRY_JS.slice(1))).toBe(ENTRY_JS);
    expect(publicPathForOutputFile('favicon.ico')).toBe('/favicon.ico');
  });

  it.each([...PAGES_NON_SERVED_FILES])('never serves %s, whatever a request asks for', (name) => {
    expect(publicPathForOutputFile(name)).toBeNull();
  });

  it('never serves anything inside the functions directory', () => {
    expect(publicPathForOutputFile('functions/api/hello.js')).toBeNull();
  });

  it('never serves the bundled worker, even addressed as a directory module', () => {
    expect(publicPathForOutputFile('_worker.js/index.js')).toBeNull();
  });
});

describe('spaFallbackErrors', () => {
  it('accepts an output that pins 404 handling and ships no index document', () => {
    expect(spaFallbackErrors(['404.html', 'auth/recovery.html', '_worker.js'])).toEqual([]);
  });

  it('refuses an output with no top-level 404.html, because Pages then falls back to /', () => {
    expect(spaFallbackErrors(['auth/recovery.html', '_worker.js'])).toEqual([
      '404.html is missing: Pages would treat the origin as a single-page application',
    ]);
  });

  it('refuses an index document, which a fallback could serve for an unmatched path', () => {
    expect(spaFallbackErrors(['404.html', 'index.html', '_worker.js'])).toEqual([
      'index.html must not be deployed: it is the single-page-application fallback target',
    ]);
  });
});

describe('bundleWorkerForPages', () => {
  let bundled: string;

  beforeAll(async () => {
    bundled = await bundleWorkerForPages(WORKER_ENTRY);
  });

  it('produces a self-contained ES module with no remaining imports', () => {
    expect(bundleStructureErrors(bundled)).toEqual([]);
  });

  it('inlines policy.json, so the deployed worker needs no companion file', () => {
    expect(bundled).toContain(policy.contentSecurityPolicy);
    for (const key of policy.sensitiveQueryKeys) expect(bundled).toContain(key);
  });

  it('carries no credential, project reference or logging call', () => {
    expect(bundled).not.toMatch(/console\./);
    expect(bundled).not.toMatch(/supabase\.co/i);
    expect(bundled).not.toMatch(/eyJ[A-Za-z0-9_-]{6,}\./);
  });

  it('deploys only the half of policy.json the worker reads at runtime', () => {
    for (const key of RUNTIME_POLICY_KEYS) expect(bundled).toContain(`${key}:`);
    for (const key of ['build', 'pages', 'workerName', 'outputDir', 'supabaseAnonKey', 'headersSource']) {
      expect(bundled).not.toContain(`${key}:`);
    }
  });

  it('carries none of the build-only guard patterns, which would trip the credential scan itself', () => {
    for (const pattern of policy.build.forbiddenPatterns) {
      expect(new RegExp(pattern).test(bundled)).toBe(false);
    }
  });

  it('is byte-for-byte reproducible, so the manifest hash is meaningful', async () => {
    expect(await bundleWorkerForPages(WORKER_ENTRY)).toBe(bundled);
  });

  it('is built from the unmodified Workers entry point, not a copy of it', () => {
    const source = readFileSync(WORKER_ENTRY, 'utf8');
    expect(source).toContain("import policy from './policy.json'");
    expect(source).toContain('export default {');
  });
});

describe('RUNTIME_POLICY_KEYS', () => {
  it('is exactly the set of policy fields the worker source reads, so the subset can never be wrong', () => {
    // Comments and imports are stripped first, so a mention of `./policy.json` in either is not
    // mistaken for a field the worker reads.
    const source = readFileSync(WORKER_ENTRY, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/^import .*$/gm, '');
    const read = [...new Set([...source.matchAll(/\bpolicy\.([A-Za-z0-9_]+)/g)].map((match) => match[1]))].sort();
    expect(read).toEqual([...RUNTIME_POLICY_KEYS].sort());
  });

  it('never includes a build-only or packaging-only field', () => {
    expect(RUNTIME_POLICY_KEYS).not.toContain('build');
    expect(RUNTIME_POLICY_KEYS).not.toContain('pages');
  });
});

describe('runtimePolicy', () => {
  it('copies the runtime fields unchanged from policy.json', () => {
    const runtime = runtimePolicy() as Record<string, unknown>;
    expect(Object.keys(runtime).sort()).toEqual([...RUNTIME_POLICY_KEYS].sort());
    expect(runtime.sensitiveQueryKeys).toEqual(policy.sensitiveQueryKeys);
    expect(runtime.contentSecurityPolicy).toBe(policy.contentSecurityPolicy);
    expect(runtime.documentPaths).toEqual(policy.documentPaths);
    expect(runtime.extraPaths).toEqual(policy.extraPaths);
    expect(runtime.assetPathPattern).toBe(policy.assetPathPattern);
  });
});

describe('bundleStructureErrors', () => {
  it('reports a bundle that still imports another module at runtime', () => {
    expect(bundleStructureErrors('import x from "./policy.json";\nexport default { fetch: x };')).toContain(
      'the bundle still imports another module at runtime',
    );
  });

  it('reports a bundle that calls require()', () => {
    expect(bundleStructureErrors('const p = require("./policy.json");\nexport default {};')).toContain(
      'the bundle still calls require() at runtime',
    );
  });

  it('reports a bundle with no default export, which Pages cannot invoke', () => {
    expect(bundleStructureErrors('const handler = {};')).toContain('the bundle has no default export');
  });

  it('reports a bundle that logs', () => {
    expect(bundleStructureErrors('export default { fetch: () => console.log(1) };')).toContain(
      'the bundle contains a logging call',
    );
  });
});
