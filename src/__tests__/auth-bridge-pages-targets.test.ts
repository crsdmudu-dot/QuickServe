/**
 * auth-bridge-pages-targets.test.ts — the explicit QA and Production Pages targets of the auth
 * bridge.
 *
 * The bridge is environment-neutral: one placeholder-configured export, one worker module, no
 * credential. The ONLY thing a target decides is which Cloudflare Pages project a later,
 * separately authorised deploy reaches. So these tests pin two things:
 *
 *   1. selection fails closed — no default, no alias, no Development or legacy target, no
 *      arbitrary project, no target/project mismatch;
 *   2. the targets cannot differ in anything but the project they name — same uploaded files,
 *      same request policy, same headers, same redirect allowlist — and neither the Production
 *      hostname nor the Production sender reaches any deployable or QA file.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import policy from '../../infra/qa-auth-bridge/policy.json';
import {
  PAGES_TARGET_NAMES,
  type PagesTarget,
  RUNTIME_POLICY_KEYS,
  allPagesTargets,
  bundleWorkerForPages,
  pagesConfigErrors,
  parsePagesArgs,
  resolvePagesTarget,
  runtimePolicy,
  targetTableErrors,
} from '../../infra/qa-auth-bridge/pages-build';
import { BRIDGE_DESTINATIONS } from '@/lib/auth-bridge';

const ROOT = join(__dirname, '..', '..');
const BRIDGE = join(ROOT, 'infra', 'qa-auth-bridge');
const read = (...parts: string[]) => readFileSync(join(...parts), 'utf8');
const stripComments = (text: string) => text.replace(/^\s*\/\/.*$/gm, '');

const QA = resolvePagesTarget('qa').target as PagesTarget;
const PRODUCTION = resolvePagesTarget('production').target as PagesTarget;

// The planned Production identities. They belong in documentation only — never in a deployable or
// QA file. Assembled from parts so this guard is not itself an occurrence in a scanned file.
const PRODUCTION_HOSTNAME = ['links', 'auth', 'hiredcorp', 'co', 'ke'].join('.');
const PRODUCTION_SENDING_DOMAIN = ['auth', 'hiredcorp', 'co', 'ke'].join('.');
const PRODUCTION_SENDER = `no-reply@${PRODUCTION_SENDING_DOMAIN}`;

describe('the target table', () => {
  it('declares exactly two targets: qa and production', () => {
    expect([...PAGES_TARGET_NAMES]).toEqual(['qa', 'production']);
    expect(Object.keys(policy.pages.targets).sort()).toEqual(['production', 'qa']);
  });

  it('keeps the QA target exactly as it was deployed', () => {
    expect(QA.projectName).toBe('kwikserve-auth-qa-bridge');
    expect(QA.outputDir).toBe('dist-qa-auth-pages');
    expect(QA.configTemplate).toBe('pages-wrangler.jsonc');
    expect(QA.manifest).toBe('.qa-auth-bridge-pages-manifest.json');
  });

  it('names the approved Production project', () => {
    expect(PRODUCTION.projectName).toBe('kwikserve-auth-prod-bridge');
    expect(PRODUCTION.outputDir).toBe('dist-prod-auth-pages');
    expect(PRODUCTION.configTemplate).toBe('pages-wrangler.production.jsonc');
    expect(PRODUCTION.manifest).toBe('.prod-auth-bridge-pages-manifest.json');
  });

  it('shares no project, output directory, template or manifest between the targets', () => {
    expect(targetTableErrors()).toEqual([]);
  });

  it('requires a fresh export for Production, and keeps the existing QA warning behaviour', () => {
    expect(PRODUCTION.requireFreshExport).toBe(true);
    expect(QA.requireFreshExport).toBe(false);
  });

  it('keeps both build outputs and manifests out of version control', () => {
    const ignored = read(ROOT, '.gitignore');
    for (const target of allPagesTargets()) {
      expect(ignored).toContain(`${target.outputDir}/`);
      expect(ignored).toContain(target.manifest);
    }
  });
});

describe('target selection fails closed', () => {
  it('refuses a missing target', () => {
    expect(parsePagesArgs([]).errors).toContain('--target is required: one of qa, production');
    expect(parsePagesArgs(['--out', '/tmp/x']).target).toBeUndefined();
  });

  it.each([
    'development',
    'dev',
    'Development',
    'legacy',
    'quickserve',
    'prod',
    'Production',
    'QA',
    'qa ',
    'staging',
    'constructor',
    '__proto__',
    'toString',
    'kwikserve-auth-qa-bridge',
    'kwikserve-auth-prod-bridge',
  ])('refuses the target %j', (name) => {
    expect(resolvePagesTarget(name).target).toBeUndefined();
    expect(parsePagesArgs(['--target', name]).target).toBeUndefined();
    expect(parsePagesArgs(['--target', name]).errors.join('\n')).toMatch(/unknown target/);
  });

  it('accepts exactly qa and production, each resolving to its own project', () => {
    expect(parsePagesArgs(['--target', 'qa']).target?.projectName).toBe('kwikserve-auth-qa-bridge');
    expect(parsePagesArgs(['--target', 'production']).target?.projectName).toBe('kwikserve-auth-prod-bridge');
  });

  it('defaults the output directory to the target’s own, never the other one', () => {
    expect(parsePagesArgs(['--target', 'qa']).outputDir).toBe('dist-qa-auth-pages');
    expect(parsePagesArgs(['--target', 'production']).outputDir).toBe('dist-prod-auth-pages');
  });

  it('accepts a matching --project confirmation', () => {
    expect(parsePagesArgs(['--target', 'production', '--project', 'kwikserve-auth-prod-bridge']).errors).toEqual([]);
    expect(parsePagesArgs(['--target', 'qa', '--project', 'kwikserve-auth-qa-bridge']).errors).toEqual([]);
  });

  it('refuses the QA target with the Production project', () => {
    const result = parsePagesArgs(['--target', 'qa', '--project', 'kwikserve-auth-prod-bridge']);
    expect(result.target).toBeUndefined();
    expect(result.errors.join('\n')).toMatch(/does not match the qa target/);
  });

  it('refuses the Production target with the QA project', () => {
    const result = parsePagesArgs(['--target', 'production', '--project', 'kwikserve-auth-qa-bridge']);
    expect(result.target).toBeUndefined();
    expect(result.errors.join('\n')).toMatch(/does not match the production target/);
  });

  it.each(['kwikserve-auth-prod-brdige', 'kwikserve-auth-production-bridge', 'some-other-pages-project', 'quickserve'])(
    'refuses the typoed or arbitrary project %j',
    (project) => {
      for (const target of ['qa', 'production']) {
        expect(parsePagesArgs(['--target', target, '--project', project]).target).toBeUndefined();
      }
    },
  );

  it('refuses a flag with no value, a repeated flag and an unknown argument', () => {
    expect(parsePagesArgs(['--target']).errors).toContain('--target needs a value');
    expect(parsePagesArgs(['--target', '--out', 'x']).errors).toContain('--target needs a value');
    expect(parsePagesArgs(['--target', 'qa', '--target', 'production']).errors).toContain(
      '--target may be given only once',
    );
    expect(parsePagesArgs(['--target', 'qa', '--deploy']).errors).toContain('unknown argument "--deploy"');
    expect(parsePagesArgs(['--target', 'qa', '--account', 'x']).target).toBeUndefined();
  });
});

describe('each template belongs to exactly one target', () => {
  it('accepts each template for its own target', () => {
    expect(pagesConfigErrors(read(QA.configTemplatePath), QA)).toEqual([]);
    expect(pagesConfigErrors(read(PRODUCTION.configTemplatePath), PRODUCTION)).toEqual([]);
  });

  it('refuses the Production template for the QA target', () => {
    const errors = pagesConfigErrors(read(PRODUCTION.configTemplatePath), QA);
    expect(errors).toContain('name must be kwikserve-auth-qa-bridge');
    expect(errors).toContain('the qa configuration must not mention the production project kwikserve-auth-prod-bridge');
  });

  it('refuses the QA template for the Production target', () => {
    const errors = pagesConfigErrors(read(QA.configTemplatePath), PRODUCTION);
    expect(errors).toContain('name must be kwikserve-auth-prod-bridge');
    expect(errors).toContain('the production configuration must not mention the qa project kwikserve-auth-qa-bridge');
  });

  it('the two templates differ in nothing but the project name', () => {
    const qa = JSON.parse(stripComments(read(QA.configTemplatePath))) as Record<string, unknown>;
    const production = JSON.parse(stripComments(read(PRODUCTION.configTemplatePath))) as Record<string, unknown>;
    expect(qa.name).toBe(QA.projectName);
    expect(production.name).toBe(PRODUCTION.projectName);
    delete qa.name;
    delete production.name;
    expect(production).toEqual(qa);
  });
});

describe('the deployable bridge is identical for both targets', () => {
  let bundle = '';
  beforeAll(async () => {
    bundle = await bundleWorkerForPages(join(BRIDGE, 'worker.ts'));
  });

  it('builds the worker without any target input, so it cannot vary by target', () => {
    expect(bundleWorkerForPages.length).toBe(1);
    expect(runtimePolicy()).not.toHaveProperty('pages');
  });

  it('deploys only the runtime request policy, which no target field can reach', () => {
    const targetFields = new Set(Object.values(policy.pages.targets).flatMap((target) => Object.keys(target)));
    for (const key of RUNTIME_POLICY_KEYS) expect(targetFields.has(key)).toBe(false);
    expect(Object.keys(runtimePolicy()).sort()).toEqual([...RUNTIME_POLICY_KEYS].sort());
  });

  it('keeps the identical request policy: paths, token-query rejection and CSP', () => {
    const runtime = runtimePolicy() as {
      documentPaths: string[];
      sensitiveQueryKeys: string[];
      contentSecurityPolicy: string;
    };
    expect(runtime.documentPaths).toEqual(['/auth/recovery', '/auth/confirm']);
    for (const key of ['token_hash', 'token', 'access_token', 'refresh_token', 'code', 'apikey']) {
      expect(runtime.sensitiveQueryKeys).toContain(key);
    }
    expect(runtime.contentSecurityPolicy).toContain("default-src 'none'");
    expect(runtime.contentSecurityPolicy).toContain("connect-src 'none'");
    expect(runtime.contentSecurityPolicy).toContain("frame-ancestors 'none'");
  });

  it('carries the no-store, no-referrer and noindex controls in the one worker both targets deploy', () => {
    expect(bundle).toMatch(/["']Cache-Control["']:\s*["']no-store["']/);
    expect(bundle).toMatch(/["']Referrer-Policy["']:\s*["']no-referrer["']/);
    expect(bundle).toMatch(/["']X-Robots-Tag["']:\s*["']noindex, nofollow["']/);
    expect(bundle).toMatch(/["']Content-Security-Policy["']:\s*policy_default\.contentSecurityPolicy/);
  });

  it('keeps the exact native redirect allowlist and the only two link types', () => {
    expect(Object.keys(BRIDGE_DESTINATIONS).sort()).toEqual(['recovery', 'signup']);
    expect(Object.values(BRIDGE_DESTINATIONS).sort()).toEqual(['kwikserve://auth/confirm', 'kwikserve://auth/recovery']);
  });

  it('names neither project, neither hostname and no sender in the deployed worker', () => {
    for (const needle of [QA.projectName, PRODUCTION.projectName, PRODUCTION_HOSTNAME, PRODUCTION_SENDER, 'hiredcorp']) {
      expect(bundle).not.toContain(needle);
    }
  });

  it('carries no Supabase host, project reference, key, JWT or secret', () => {
    expect(bundle).not.toMatch(/supabase\.co/i);
    expect(bundle).not.toMatch(/\b[a-z]{20}\b/);
    expect(bundle).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
    expect(bundle).not.toMatch(/service_role|sb_secret_|sbp_|anon[_-]?key|PRIVATE KEY/i);
  });
});

describe('no Production identity leaks into QA logic or deployable files', () => {
  const files: [string, string][] = [
    ['infra/qa-auth-bridge/policy.json', join(BRIDGE, 'policy.json')],
    ['infra/qa-auth-bridge/pages-wrangler.jsonc', join(BRIDGE, 'pages-wrangler.jsonc')],
    ['infra/qa-auth-bridge/pages-wrangler.production.jsonc', join(BRIDGE, 'pages-wrangler.production.jsonc')],
    ['infra/qa-auth-bridge/worker.ts', join(BRIDGE, 'worker.ts')],
    ['infra/qa-auth-bridge/build.ts', join(BRIDGE, 'build.ts')],
    ['infra/qa-auth-bridge/pages-build.ts', join(BRIDGE, 'pages-build.ts')],
    ['wrangler.qa-auth.jsonc', join(ROOT, 'wrangler.qa-auth.jsonc')],
  ];

  it.each(files)('%s names no Production hostname, sending domain or sender', (_label, path) => {
    const text = readFileSync(path, 'utf8');
    expect(text).not.toContain(PRODUCTION_HOSTNAME);
    expect(text).not.toContain(PRODUCTION_SENDING_DOMAIN);
    expect(text).not.toContain(PRODUCTION_SENDER);
  });

  it('the QA Workers target still names only the QA Worker and never the Production project', () => {
    const workers = read(ROOT, 'wrangler.qa-auth.jsonc');
    expect(workers).toContain('"name": "quickserve-auth-qa"');
    expect(workers).not.toContain(PRODUCTION.projectName);
  });
});

describe('packaging never deploys and never touches the network', () => {
  const source = read(BRIDGE, 'pages-build.ts');
  // Executable code only: block and line comments may legitimately describe `env.ASSETS.fetch()`.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('imports no process, network or HTTP module', () => {
    expect(code).not.toMatch(/from ['"](node:)?(child_process|http|https|net|tls|dns|undici)['"]/);
    expect(code).not.toMatch(/require\(['"](node:)?(child_process|http|https|net|tls|dns|undici)['"]\)/);
  });

  it('makes no network, spawn or exec call', () => {
    expect(code).not.toMatch(/(^|[^.\w])fetch\s*\(/m);
    expect(code).not.toMatch(/\b(spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\s*\(/);
    expect(code).not.toMatch(/XMLHttpRequest|WebSocket/);
  });

  it('only ever prints the deploy command for a human, as a separately authorised step', () => {
    const deployMentions = source.split('\n').filter((line) => /wrangler pages deploy/.test(line));
    expect(deployMentions.length).toBeGreaterThan(0);
    for (const line of deployMentions) expect(line).toMatch(/process\.stdout\.write|^\s*(\*|\/\/)/);
  });
});
