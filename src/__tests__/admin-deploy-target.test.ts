/**
 * admin-deploy-target.test.ts — static proof that the Cloudflare Worker `quickserve` is aimed at
 * the ADMIN application and cannot be aimed at the consumer export by accident.
 *
 * WHY THIS EXISTS. The Worker configuration used to live at the repository root and serve `./dist`.
 * That was correct only while the admin routes lived inside the consumer app. After the admin app
 * was separated into apps/admin, `./dist` became the CONSUMER export, and merging the separation
 * published the consumer bundle over the admin portal's URL. The configuration was not wrong in
 * isolation — it was wrong *relative to where the app had moved*, and nothing asserted the
 * relationship. These tests assert it.
 *
 * Everything here is offline and filesystem-only: no network, no Cloudflare, no deploy.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../..');
const ADMIN_CONFIG = join(REPO_ROOT, 'apps/admin/wrangler.jsonc');

/** Strip line and block comments, leaving comment-like sequences inside strings alone. */
function stripJsonc(source: string): string {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const n = source[i + 1];
    if (inLine) {
      if (c === '\n') { inLine = false; out += c; }
      continue;
    }
    if (inBlock) {
      if (c === '*' && n === '/') { inBlock = false; i += 1; }
      continue;
    }
    if (inString) {
      out += c;
      if (c.charCodeAt(0) === 92) { out += source[i + 1] ?? ''; i += 1; continue; } // backslash escape
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === '/' && n === '/') { inLine = true; i += 1; continue; }
    if (c === '/' && n === '*') { inBlock = true; i += 1; continue; }
    out += c;
  }
  return out;
}

function readJsonc(path: string): Record<string, unknown> {
  return JSON.parse(stripJsonc(readFileSync(path, 'utf8')));
}

function readPackageScripts(relative: string): Record<string, string> {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, relative), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  return pkg.scripts ?? {};
}

describe('the repository root cannot deploy anything', () => {
  it('has no root Wrangler configuration, so a bare `wrangler deploy` fails closed', () => {
    for (const name of ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml']) {
      expect(existsSync(join(REPO_ROOT, name))).toBe(false);
    }
  });

  it('no longer exposes a deploy:web script', () => {
    expect(readPackageScripts('package.json')['deploy:web']).toBeUndefined();
  });

  it('never runs an unqualified `wrangler deploy` from any package script', () => {
    const offenders: string[] = [];
    for (const rel of ['package.json', 'apps/admin/package.json', 'qa/package.json']) {
      if (!existsSync(join(REPO_ROOT, rel))) continue;
      for (const [name, body] of Object.entries(readPackageScripts(rel))) {
        if (!/wrangler\s+deploy/.test(body)) continue;
        if (!/(^|\s)(-c|--config)\s+\S+/.test(body)) offenders.push(`${rel}:${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the admin Worker configuration', () => {
  const config = readJsonc(ADMIN_CONFIG);
  const assets = config.assets as Record<string, unknown>;

  it('lives beside the application it deploys', () => {
    expect(existsSync(ADMIN_CONFIG)).toBe(true);
  });

  it('keeps the existing Worker name, inheriting the admin URL', () => {
    expect(config.name).toBe('quickserve');
  });

  it('resolves its asset directory to apps/admin/dist', () => {
    expect(assets.directory).toBe('./dist');
    // The relative path is what actually matters: resolve it exactly as Wrangler does, against
    // the directory holding the configuration file.
    const resolved = resolve(join(REPO_ROOT, 'apps/admin'), assets.directory as string);
    expect(resolved).toBe(join(REPO_ROOT, 'apps', 'admin', 'dist'));
    expect(resolved).not.toBe(join(REPO_ROOT, 'dist'));
  });

  it('pins the single-page-application routing behaviour', () => {
    expect(assets.not_found_handling).toBe('single-page-application');
    expect(assets.html_handling).toBe('drop-trailing-slash');
  });

  it('stays assets-only: no Worker script and no runtime configuration', () => {
    expect(config.main).toBeUndefined();
    expect(config.vars).toBeUndefined();
    expect(config.secrets).toBeUndefined();
    expect((config.assets as Record<string, unknown>).binding).toBeUndefined();
    expect(config.run_worker_first).toBeUndefined();
  });

  it('keeps the deployment surface unchanged', () => {
    expect(config.workers_dev).toBe(true);
    expect(config.preview_urls).toBe(false);
    expect(config.compatibility_date).toBe('2026-09-01');
  });

  it('points $schema at the hoisted root node_modules', () => {
    expect(config.$schema).toBe('../../node_modules/wrangler/config-schema.json');
  });
});

describe('the deploy command', () => {
  const scripts = readPackageScripts('package.json');

  it('exists and names the nested configuration explicitly', () => {
    expect(scripts['deploy:admin']).toBe(
      'npm run build:admin && npm run check:admin-artifact && npm run check:admin-routing && wrangler deploy -c apps/admin/wrangler.jsonc',
    );
  });

  // A manual deployment must not be able to skip the shape check. PR CI already runs it, but CI
  // is not what an operator types at 2am. Order is the whole point: the check has to run AFTER
  // the build that produces the artifact and BEFORE anything is uploaded, so a stale or wrong
  // artifact cannot reach the Worker that serves the admin portal.
  it('runs build, then the artifact check, then the explicit deploy, in that order', () => {
    const stages = scripts['deploy:admin'].split('&&').map((part) => part.trim());
    expect(stages).toHaveLength(4);
    expect(stages[0]).toBe('npm run build:admin');
    expect(stages[1]).toBe('npm run check:admin-artifact');
    expect(stages[2]).toBe('npm run check:admin-routing');
    expect(stages[3].startsWith('wrangler deploy ')).toBe(true);
    expect(stages[3]).toContain('-c apps/admin/wrangler.jsonc');
  });

  it('cannot deploy without the artifact check having run first', () => {
    const command = scripts['deploy:admin'];
    const checkAt = command.indexOf('check:admin-artifact');
    const routingAt = command.indexOf('check:admin-routing');
    const deployAt = command.indexOf('wrangler deploy');
    const buildAt = command.indexOf('build:admin');
    expect(buildAt).toBeGreaterThan(-1);
    expect(checkAt).toBeGreaterThan(buildAt);
    expect(routingAt).toBeGreaterThan(checkAt);
    expect(deployAt).toBeGreaterThan(routingAt);
  });

  it('builds the admin app it deploys', () => {
    expect(scripts['build:admin']).toBe('npm --prefix apps/admin run build:web');
  });

  it('ships a mandatory artifact check', () => {
    expect(scripts['check:admin-artifact']).toBe('node scripts/check-admin-artifact.mjs');
    expect(existsSync(join(REPO_ROOT, 'scripts/check-admin-artifact.mjs'))).toBe(true);
  });

  it('runs that check in PR CI immediately after the admin export', () => {
    const ci = readFileSync(join(REPO_ROOT, '.github/workflows/pr-ci.yml'), 'utf8');
    const exportAt = ci.indexOf('npm run build:admin');
    const checkAt = ci.indexOf('npm run check:admin-artifact');
    expect(exportAt).toBeGreaterThan(-1);
    expect(checkAt).toBeGreaterThan(exportAt);
  });
});

describe('build outputs stay out of version control', () => {
  it('ignores both dist directories', () => {
    const ignored = readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8');
    // CRLF-safe: this repository checks out with CRLF, so the line is `dist/` + CR.
    expect(ignored).toMatch(/^dist\/\r?$/m);
    expect(ignored.split(/\r?\n/).map((l) => l.trim())).toContain('dist/');
  });
});

describe('the Cloudflare SPA shell', () => {
  const ROOT_ROUTE = join(REPO_ROOT, 'apps/admin/src/app/index.tsx');

  // Production returned 404 for the bare root AND for every dynamic route on a hard refresh,
  // because the admin app had no root route and therefore the export emitted no index.html for
  // not_found_handling: single-page-application to serve. The artifact check was green throughout:
  // it proved WHICH app was built, never that the build was routable.
  it('the admin application has a root route, so the export emits index.html', () => {
    expect(existsSync(ROOT_ROUTE)).toBe(true);
  });

  it('the root route records why it must not be deleted', () => {
    const src = readFileSync(ROOT_ROUTE, 'utf8');
    expect(src).toContain('index.html');
    expect(src).toContain('single-page-application');
  });

  it('the artifact checker requires index.html and says why when it is missing', () => {
    const checker = readFileSync(join(REPO_ROOT, 'scripts/check-admin-artifact.mjs'), 'utf8');
    expect(checker).toContain('SPA_SHELL');
    expect(checker).toContain('MISSING SPA SHELL');
  });

  it('a routing smoke exists and runs after the artifact check in PR CI', () => {
    expect(existsSync(join(REPO_ROOT, 'scripts/check-admin-routing.mjs'))).toBe(true);
    expect(readPackageScripts('package.json')['check:admin-routing']).toBe(
      'node scripts/check-admin-routing.mjs',
    );
    const ci = readFileSync(join(REPO_ROOT, '.github/workflows/pr-ci.yml'), 'utf8');
    const artifactAt = ci.indexOf('npm run check:admin-artifact');
    const routingAt = ci.indexOf('npm run check:admin-routing');
    expect(artifactAt).toBeGreaterThan(-1);
    expect(routingAt).toBeGreaterThan(artifactAt);
  });

  it('the routing smoke asserts the root, the dynamic route and the fallback identity', () => {
    const smoke = readFileSync(join(REPO_ROOT, 'scripts/check-admin-routing.mjs'), 'utf8');
    expect(smoke).toContain('/bookings/00000000-0000-0000-0000-000000000000');
    expect(smoke).toContain('not_found_handling');
    expect(smoke).toContain('equals(shell)');
    expect(smoke).toContain('portIsFree');
  });
});
