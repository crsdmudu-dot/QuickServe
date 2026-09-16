/**
 * pages-build.ts — package the QA authentication bridge for Cloudflare Pages (advanced mode).
 *
 * Run from the repository root with Node 24+ (native TypeScript execution), AFTER the ordinary
 * bridge build has produced the certified asset set:
 *
 *     node infra/qa-auth-bridge/build.ts                           # Workers target: dist-qa-auth/
 *     node infra/qa-auth-bridge/pages-build.ts --out <outside-repo>  # Pages deployment workspace
 *
 * This is PACKAGING ONLY. It adds no request policy of its own: the Pages origin runs the very same
 * module as the live Workers origin (`./worker.ts`, whose single source of truth is `./policy.json`)
 * and serves the very same bytes (the files recorded in `.qa-auth-bridge-manifest.json`). The
 * Workers target — `wrangler.qa-auth.jsonc`, `build.ts`, `dist-qa-auth/` — is not touched by this
 * script and remains the live deployment and the rollback.
 *
 * Why the layout looks the way it does (verified against the Cloudflare Pages documentation and the
 * installed Wrangler 4.131.1):
 *
 *   - Advanced mode means a `_worker.js` in the build output directory. Pages then routes EVERY
 *     request to that module and ignores any `functions/` directory, which is exactly the
 *     "worker runs first, fails closed" model `run_worker_first: true` gives the Workers target.
 *   - Pages does not read `_worker.ts`, so `worker.ts` is bundled to one self-contained ES module
 *     with esbuild (a hard dependency of Wrangler, already installed). Bundling inlines the runtime
 *     half of `policy.json`, so the deployed worker needs no companion file. Wrangler also supports
 *     a `_worker.js/` DIRECTORY whose `index.js` is the entry point and whose sibling `*.js`/`*.mjs`
 *     files are uploaded as additional modules; a single pre-bundled file is used instead because
 *     it is one hashable artifact with no runtime module resolution.
 *   - The Pages commands REFUSE a custom config path (`-c`) and otherwise read the repository root
 *     `wrangler.jsonc` — the Production Worker — plus the root `.env`. So the output is a
 *     self-contained workspace: `wrangler.jsonc` (copied from `./pages-wrangler.jsonc`) at its root,
 *     and the uploaded files under `origin/`, where that config can never become an asset. Build it
 *     OUTSIDE the repository working tree, or Wrangler still resolves the repository as the project.
 *   - `env.ASSETS` is the default Pages binding, the same name the Workers target binds, so the
 *     worker module needs no change. `env.ASSETS.fetch()` resolves pretty paths the way Pages
 *     serves them: `/auth/recovery` comes from `auth/recovery.html`.
 *   - Pages treats `_worker.js`, `_redirects`, `_headers`, `_routes.json` and `functions` as
 *     deployment inputs and keeps them out of the public asset namespace (Wrangler's upload
 *     ignore list). The worker's allow-list refuses those paths as well, so the internals are
 *     unreachable by two independent mechanisms.
 *   - Pages assumes a single-page application and falls back to `/` when no top-level `404.html`
 *     exists. A minimal `404.html` is therefore written, and an `index.html` is refused: together
 *     they stop the assets binding from ever answering 200 for a path the worker did not mean.
 *
 * It never deploys, never creates a Pages project, never reads `.env`, never contacts Cloudflare,
 * Supabase or any network service, and never writes outside its own workspace directory.
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';

import { scanForForbidden } from './build.ts';

type Build = (options: Record<string, unknown>) => Promise<{ outputFiles: { text: string }[] }>;

/**
 * The policy fields `worker.ts` reads at runtime. `policy.json` also holds build-only fields (the
 * placeholder Supabase configuration, the credential-scan patterns) and packaging-only fields, and
 * none of them belong in a deployed artifact — not least because the scan patterns themselves
 * (`service_role`, `sbp_`, …) would otherwise appear verbatim in the output and trip the scan.
 * `qa-auth-bridge-pages-build.test.ts` asserts this list is exactly what the worker source reads.
 */
export const RUNTIME_POLICY_KEYS = [
  'documentPaths',
  'extraPaths',
  'assetPathPattern',
  'sensitiveQueryKeys',
  'contentSecurityPolicy',
] as const;

const REPO_ROOT = process.cwd();

/**
 * policy.json is READ rather than imported, exactly as `build.ts` reads it: these build scripts are
 * executed directly by Node (`node infra/qa-auth-bridge/pages-build.ts`), and Node's ES module
 * loader would need an import attribute for a JSON module.
 */
type Policy = {
  outputDir: string;
  documentPaths: string[];
  extraPaths: string[];
  assetPathPattern: string;
  sensitiveQueryKeys: string[];
  contentSecurityPolicy: string;
  pages: { projectName: string; outputDir: string; nonServedFiles: string[] };
  build: { forbiddenPatterns: string[] };
};

const policy: Policy = JSON.parse(
  readFileSync(join(REPO_ROOT, 'infra', 'qa-auth-bridge', 'policy.json'), 'utf8'),
) as Policy;

const WORKERS_MANIFEST_PATH = join(REPO_ROOT, '.qa-auth-bridge-manifest.json');
const PAGES_MANIFEST_PATH = join(REPO_ROOT, '.qa-auth-bridge-pages-manifest.json');
const WORKER_ENTRY_PATH = join(REPO_ROOT, 'infra', 'qa-auth-bridge', 'worker.ts');
const ASSET_PATH = new RegExp(policy.assetPathPattern);

/** Files Cloudflare Pages accepts in the build output but never serves as public assets. */
export const PAGES_NON_SERVED_FILES: readonly string[] = policy.pages.nonServedFiles;

/**
 * The subdirectory of the deployment workspace that Pages uploads.
 *
 * Wrangler 4.131.1 refuses `wrangler pages dev|deploy -c <path>` ("Pages does not support custom
 * paths for the Wrangler configuration file"), and with no `-c` the Pages commands read the
 * repository root `wrangler.jsonc` — the PRODUCTION Worker's config — and the root `.env`. So the
 * build writes a self-contained workspace: `wrangler.jsonc` at its root (the only config Wrangler
 * finds from there) and the uploaded output in this subdirectory, where the config cannot itself
 * become an asset.
 */
export const PAGES_SERVED_SUBDIR = 'origin';

/** The committed Pages project configuration, copied verbatim into the workspace root. */
export const PAGES_CONFIG_TEMPLATE = join(REPO_ROOT, 'infra', 'qa-auth-bridge', 'pages-wrangler.jsonc');

/** Keys that must never appear in the committed Pages configuration. */
const FORBIDDEN_CONFIG_KEYS = ['account_id', 'vars', 'routes', 'route', 'send_metrics'];

/** The minimal document that stops Pages treating the origin as a single-page application. */
export const NOT_FOUND_DOCUMENT =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="robots" content="noindex, nofollow"><title>Not Found</title></head><body></body></html>\n';

// ── Pure decisions (unit-tested in src/__tests__/qa-auth-bridge-pages-build.test.ts) ──────────

/** True when the bridge worker's allow-list would serve this path. */
function servedByWorker(path: string): boolean {
  return policy.documentPaths.includes(path) || policy.extraPaths.includes(path) || ASSET_PATH.test(path);
}

/** The first path segment, which is what Pages matches its deployment-internal names against. */
function rootSegment(path: string): string {
  return path.replace(/^\//, '').split('/')[0] ?? '';
}

/**
 * Decide the deployable asset set from the certified Workers manifest, or refuse with reasons.
 * Nothing the Workers target does not serve may reach the Pages origin, and no Pages deployment
 * internal may be smuggled in as an asset. An empty set always accompanies errors.
 */
export function planPagesOutput(manifestPaths: string[]): { assets: string[]; errors: string[] } {
  const errors: string[] = [];
  const present = new Set(manifestPaths);
  for (const document of policy.documentPaths) {
    if (!present.has(document)) errors.push(`bridge document missing from the certified manifest: ${document}`);
  }
  for (const path of manifestPaths) {
    if (PAGES_NON_SERVED_FILES.includes(rootSegment(path))) {
      errors.push(`${path} is a Pages deployment internal, not a deployable asset`);
    }
    if (!servedByWorker(path)) errors.push(`${path} is not a path the bridge worker serves`);
  }
  if (errors.length > 0) return { assets: [], errors };
  return { assets: [...present].sort(), errors: [] };
}

/** Where a served path is written inside the Pages output directory. */
export function pagesOutputName(servedPath: string): string {
  const relativePath = servedPath.slice(1);
  return policy.documentPaths.includes(servedPath) ? `${relativePath}.html` : relativePath;
}

/** The public URL Pages serves an output file at, or null when Pages never serves it. */
export function publicPathForOutputFile(outputRelativePath: string): string | null {
  const normalised = outputRelativePath.split(sep).join(posix.sep);
  // Anything outside the uploaded subdirectory — the workspace's own wrangler.jsonc, above all —
  // is not part of the asset namespace at all.
  if (normalised.startsWith('../') || normalised.startsWith('/')) return null;
  if (PAGES_NON_SERVED_FILES.includes(rootSegment(normalised))) return null;
  return normalised.endsWith('.html') ? `/${normalised.slice(0, -'.html'.length)}` : `/${normalised}`;
}

/** Ways the committed Pages project configuration would be wrong, or would leak something. */
export function pagesConfigErrors(text: string): string[] {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.replace(/^\s*\/\/.*$/gm, '')) as Record<string, unknown>;
  } catch {
    return ['the configuration is not valid JSONC'];
  }
  const errors: string[] = [];
  if (parsed.name !== policy.pages.projectName) errors.push(`name must be ${policy.pages.projectName}`);
  if (parsed.pages_build_output_dir !== `./${PAGES_SERVED_SUBDIR}`) {
    errors.push(`pages_build_output_dir must be ./${PAGES_SERVED_SUBDIR}`);
  }
  for (const key of FORBIDDEN_CONFIG_KEYS) {
    if (parsed[key] !== undefined) errors.push(`${key} must not be set`);
  }
  // A hostname in the configuration would commit either the account's *.pages.dev subdomain or the
  // proposed custom domain; both belong in the documentation, not in a deployable file.
  if (/[a-z0-9-]+\.(?:[a-z0-9-]+\.)+[a-z]{2,}/i.test(JSON.stringify(parsed))) {
    errors.push('a hostname must not be committed to the configuration');
  }
  return errors;
}

/** Errors that would leave Pages' implicit single-page-application fallback reachable. */
export function spaFallbackErrors(outputFiles: string[]): string[] {
  const errors: string[] = [];
  if (!outputFiles.includes('404.html')) {
    errors.push('404.html is missing: Pages would treat the origin as a single-page application');
  }
  if (outputFiles.includes('index.html')) {
    errors.push('index.html must not be deployed: it is the single-page-application fallback target');
  }
  return errors;
}

/** Ways a bundle could fail to be the self-contained, silent ES module Pages needs. */
export function bundleStructureErrors(source: string): string[] {
  const errors: string[] = [];
  if (/(^|\n)\s*import\s[^\n]*\sfrom\s/.test(source) || /\bimport\s*\(/.test(source)) {
    errors.push('the bundle still imports another module at runtime');
  }
  if (/\brequire\s*\(/.test(source)) errors.push('the bundle still calls require() at runtime');
  if (!/export\s+default\b/.test(source) && !/\bas\s+default\b/.test(source)) {
    errors.push('the bundle has no default export');
  }
  if (/\bconsole\s*\./.test(source)) errors.push('the bundle contains a logging call');
  return errors;
}

/** The runtime half of policy.json, copied field for field — the only policy a deployment needs. */
export function runtimePolicy(): Record<string, unknown> {
  const full = policy as unknown as Record<string, unknown>;
  return Object.fromEntries(RUNTIME_POLICY_KEYS.map((key) => [key, full[key]]));
}

/**
 * Bundle the Workers entry point into the single ES module Pages runs as `_worker.js`.
 *
 * esbuild is resolved from Wrangler's own dependency tree: the Pages target cannot be deployed
 * without Wrangler, so it can never be missing when this build is meaningful.
 *
 * The one substitution is `policy.json`, which is narrowed to `runtimePolicy()`. The worker reads
 * no other field (asserted by test), so this changes no behaviour — it keeps the build-only halves
 * of the policy out of a deployable file.
 */
export async function bundleWorkerForPages(entryPath: string): Promise<string> {
  const requireFrom = createRequire(join(REPO_ROOT, 'node_modules', 'wrangler', 'package.json'));
  const { build } = requireFrom('esbuild') as { build: Build };
  const runtimePolicyPlugin = {
    name: 'qa-auth-bridge-runtime-policy',
    setup(build: {
      onLoad(
        options: { filter: RegExp },
        callback: () => { contents: string; loader: string },
      ): void;
    }) {
      build.onLoad({ filter: /[\\/]qa-auth-bridge[\\/]policy\.json$/ }, () => ({
        contents: JSON.stringify(runtimePolicy()),
        loader: 'json',
      }));
    },
  };
  const result = await build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'neutral',
    charset: 'utf8',
    legalComments: 'none',
    minify: false,
    write: false,
    logLevel: 'silent',
    plugins: [runtimePolicyPlugin],
  });
  return result.outputFiles[0].text;
}

/** Command-line options. The default output directory is the one policy.json declares. */
export function parsePagesArgs(argv: string[]): { outputDir: string } {
  const index = argv.indexOf('--out');
  const given = index === -1 ? undefined : argv[index + 1];
  return { outputDir: given ?? policy.pages.outputDir };
}

// ── IO (only when this file is executed directly) ─────────────────────────────────────────────

type WorkersManifest = {
  worker: string;
  freshExport: boolean;
  files: { path: string; bytes: number; sha256: string }[];
};

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function walk(root: string, current = root, out: string[] = []): string[] {
  for (const entry of readdirSync(current)) {
    const full = join(current, entry);
    if (statSync(full).isDirectory()) walk(root, full, out);
    else out.push(relative(root, full).split(sep).join(posix.sep));
  }
  return out.sort();
}

function fail(message: string, details: string[] = []): never {
  process.stderr.write(`\nQA bridge Pages build FAILED: ${message}\n`);
  for (const detail of details) process.stderr.write(`  - ${detail}\n`);
  process.exit(1);
}

async function main(argv: string[]): Promise<void> {
  const { outputDir } = parsePagesArgs(argv);
  const workspacePath = resolve(REPO_ROOT, outputDir);
  const outputPath = join(workspacePath, PAGES_SERVED_SUBDIR);
  const assetsDir = join(REPO_ROOT, policy.outputDir);

  if (!existsSync(WORKERS_MANIFEST_PATH)) fail('run `node infra/qa-auth-bridge/build.ts` first: no certified manifest');
  if (!existsSync(assetsDir)) fail(`run \`node infra/qa-auth-bridge/build.ts\` first: ${policy.outputDir}/ is missing`);

  const manifest: WorkersManifest = JSON.parse(readFileSync(WORKERS_MANIFEST_PATH, 'utf8')) as WorkersManifest;
  if (!manifest.freshExport) {
    process.stdout.write('\nWARNING: the certified manifest records a reused export. A deployment requires a fresh build.\n');
  }

  // The Pages origin must serve the bytes that were certified for the Workers origin, so the
  // asset directory is verified against the manifest before anything is copied out of it.
  const drift: string[] = [];
  const onDisk = new Set(walk(assetsDir));
  for (const file of manifest.files) {
    const name = pagesOutputName(file.path);
    onDisk.delete(name);
    const source = join(assetsDir, name);
    if (!existsSync(source)) drift.push(`${file.path}: missing from ${policy.outputDir}/`);
    else if (sha256(readFileSync(source)) !== file.sha256) drift.push(`${file.path}: content differs from the manifest`);
  }
  for (const extra of onDisk) drift.push(`${extra}: present in ${policy.outputDir}/ but not in the manifest`);
  if (drift.length > 0) fail(`${policy.outputDir}/ does not match the certified manifest`, drift);

  const { assets, errors } = planPagesOutput(manifest.files.map((file) => file.path));
  if (errors.length > 0) fail('the certified manifest does not match the Pages packaging policy', errors);

  // The workspace configuration is copied, never generated, and is validated before it is used.
  if (!existsSync(PAGES_CONFIG_TEMPLATE)) fail('infra/qa-auth-bridge/pages-wrangler.jsonc not found');
  const configText = readFileSync(PAGES_CONFIG_TEMPLATE, 'utf8');
  const configProblems = pagesConfigErrors(configText);
  if (configProblems.length > 0) fail('infra/qa-auth-bridge/pages-wrangler.jsonc is not a safe Pages config', configProblems);

  rmSync(workspacePath, { recursive: true, force: true });
  mkdirSync(outputPath, { recursive: true });
  writeFileSync(join(workspacePath, 'wrangler.jsonc'), configText, 'utf8');

  for (const served of assets) {
    const name = pagesOutputName(served);
    const target = join(outputPath, name);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(assetsDir, name), target);
  }
  writeFileSync(join(outputPath, '404.html'), NOT_FOUND_DOCUMENT, 'utf8');

  const bundle = await bundleWorkerForPages(WORKER_ENTRY_PATH);
  const structure = bundleStructureErrors(bundle);
  if (structure.length > 0) {
    rmSync(workspacePath, { recursive: true, force: true });
    fail('the bundled Pages worker is not a self-contained ES module (output removed)', structure);
  }
  writeFileSync(join(outputPath, '_worker.js'), bundle, 'utf8');

  const written = walk(outputPath);
  const fallback = spaFallbackErrors(written);
  const internals = written.filter(
    (name) => PAGES_NON_SERVED_FILES.includes(rootSegment(name)) && rootSegment(name) !== '_worker.js',
  );
  const layout = [...fallback, ...internals.map((name) => `${name} must not be deployed to the Pages origin`)];
  if (layout.length > 0) {
    rmSync(workspacePath, { recursive: true, force: true });
    fail('the Pages output layout is unsafe (output removed)', layout);
  }

  const scanned = written
    .filter((name) => /\.(html|js|css)$/.test(name))
    .map((name) => ({ path: `/${name}`, text: readFileSync(join(outputPath, name), 'utf8') }));
  const findings = scanForForbidden(scanned);
  if (findings.length > 0) {
    rmSync(workspacePath, { recursive: true, force: true });
    fail('credential scan found problems in the Pages output (output removed)', findings);
  }

  const files = written.map((name) => {
    const bytes = readFileSync(join(outputPath, name));
    return { file: name, publicPath: publicPathForOutputFile(name), bytes: bytes.length, sha256: sha256(bytes) };
  });
  const pagesManifest = {
    project: policy.pages.projectName,
    generated: new Date().toISOString(),
    deployed: false,
    source: { workersManifest: relative(REPO_ROOT, WORKERS_MANIFEST_PATH), assetsDir: policy.outputDir },
    workerEntry: relative(REPO_ROOT, WORKER_ENTRY_PATH).split(sep).join(posix.sep),
    workspace: {
      root: outputDir,
      config: 'wrangler.jsonc',
      configSha256: sha256(Buffer.from(configText, 'utf8')),
      uploadedDir: PAGES_SERVED_SUBDIR,
    },
    files,
  };
  writeFileSync(PAGES_MANIFEST_PATH, `${JSON.stringify(pagesManifest, null, 2)}\n`, 'utf8');

  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  process.stdout.write(`\nQA bridge Pages workspace built: ${outputDir}\n`);
  process.stdout.write(`  project       ${policy.pages.projectName} (NOT created, NOT deployed)\n`);
  process.stdout.write(`  config        ${outputDir}/wrangler.jsonc (copied; outside the uploaded directory)\n`);
  process.stdout.write(`  uploaded dir  ${outputDir}/${PAGES_SERVED_SUBDIR}\n`);
  process.stdout.write(`  files         ${files.length} (${total} bytes)\n`);
  for (const file of files) {
    const publicPath = file.publicPath ?? '(not served publicly)';
    process.stdout.write(`  ${file.sha256.slice(0, 16)}  ${String(file.bytes).padStart(8)}  ${file.file}  →  ${publicPath}\n`);
  }
  process.stdout.write(`  manifest      ${relative(REPO_ROOT, PAGES_MANIFEST_PATH)}\n`);
  process.stdout.write('  credential scan: clean (placeholder configuration only)\n');
  process.stdout.write(`  deploy from   cd ${outputDir} && npx wrangler pages deploy   (separate authorisation)\n\n`);
}

const invokedPath = resolve(process.argv[1] ?? '');
if (invokedPath === resolve(REPO_ROOT, 'infra', 'qa-auth-bridge', 'pages-build.ts')) main(process.argv.slice(2));
