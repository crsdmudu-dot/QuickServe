/**
 * build.ts — build the pruned asset directory for the isolated QA authentication-bridge Worker.
 *
 * Run from the repository root with Node 24+ (native TypeScript execution):
 *
 *     node infra/qa-auth-bridge/build.ts
 *
 * What it does, in order:
 *   1. Exports the web app with the CI PLACEHOLDER Supabase configuration and `EXPO_NO_DOTENV=1`,
 *      into a temporary directory. The bridge makes no Supabase request, so the QA origin needs no
 *      project configuration at all, and therefore carries no credential.
 *   2. Reads the two bridge documents, collects every same-origin file they reference, and refuses
 *      to continue if a reference is not a path the Worker would serve, or is missing.
 *   3. Copies ONLY the documents and those references into `dist-qa-auth/`. Every other route of
 *      the export (admin, customer, sitemap, index) is left behind, so it cannot be served even if
 *      the Worker's allow-list were bypassed. `public/_headers` is validated against the export but
 *      deliberately NOT copied: it names the Production Supabase host, and this origin builds all
 *      of its headers from policy.json instead.
 *   4. Scans every kept file for project credentials, foreign Supabase hosts and credential-shaped
 *      tokens, and aborts on any finding. Findings name the file, the rule and the offset — never
 *      the matched value.
 *   5. Writes `.qa-auth-bridge-manifest.json` (sha256 per kept file) for the certification and
 *      deployment steps, and prints a summary.
 *
 * It never deploys, never reads `.env`, never contacts Cloudflare, Supabase or any network service
 * beyond the Expo export's own bundling, and never writes to `dist/` (the Production export path).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';

type Policy = {
  workerName: string;
  outputDir: string;
  documentPaths: string[];
  extraPaths: string[];
  assetPathPattern: string;
  sensitiveQueryKeys: string[];
  contentSecurityPolicy: string;
  build: {
    supabaseUrl: string;
    supabaseAnonKey: string;
    headersSource: string;
    forbiddenPatterns: string[];
  };
};

const REPO_ROOT = process.cwd();
const POLICY_PATH = join(REPO_ROOT, 'infra', 'qa-auth-bridge', 'policy.json');

if (!existsSync(POLICY_PATH)) {
  throw new Error('run this script from the repository root: infra/qa-auth-bridge/policy.json not found');
}

const POLICY: Policy = JSON.parse(readFileSync(POLICY_PATH, 'utf8')) as Policy;
const ASSET_PATH = new RegExp(POLICY.assetPathPattern);
const EXPORT_DIR = join(REPO_ROOT, 'dist-qa-auth.export');
const OUTPUT_DIR = join(REPO_ROOT, POLICY.outputDir);
const MANIFEST_PATH = join(REPO_ROOT, '.qa-auth-bridge-manifest.json');
const WRANGLER_CONFIG = join(REPO_ROOT, 'wrangler.qa-auth.jsonc');

// ── Pure decisions (unit-tested in src/__tests__/qa-auth-bridge-build.test.ts) ────────────────

/** Same-origin absolute paths referenced by a document, sorted and de-duplicated. */
export function collectDocumentReferences(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const value = match[1];
    if (!value.startsWith('/') || value.startsWith('//')) continue;
    found.add(value);
  }
  return [...found].sort();
}

/**
 * Generated-asset paths a bundle loads at RUNTIME (Expo splits the router into further chunks that
 * no document references). Pruning on document references alone ships an origin whose page 404s
 * halfway through booting, so these are followed transitively.
 */
export function collectBundleReferences(text: string): string[] {
  const inline = new RegExp(POLICY.assetPathPattern.replace(/^\^/, '').replace(/\$$/, ''), 'g');
  return [...new Set([...text.matchAll(inline)].map((match) => match[0]))].sort();
}

/**
 * CSP hashes (`sha256-…`) of the document's inline scripts, in document order. Expo's static
 * export emits exactly one — `globalThis.__EXPO_ROUTER_HYDRATE__=true;` — which the enforced CSP
 * allows by hash, never by 'unsafe-inline'.
 */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const match of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    hashes.push(`sha256-${createHash('sha256').update(match[1], 'utf8').digest('base64')}`);
  }
  return hashes;
}

/** Inline-script hashes the enforced CSP does not pin: any of these must abort the build. */
export function unpinnedInlineScripts(html: string, csp: string): string[] {
  return inlineScriptHashes(html).filter((hash) => !csp.includes(`'${hash}'`));
}

/** Command-line options. A fresh export is the default; reuse is recorded in the manifest. */
export function parseArgs(argv: string[]): { reuseExport: boolean } {
  return { reuseExport: argv.includes('--reuse-export') };
}

/** Decide the keep-set, or refuse with reasons. An empty keep-set always accompanies errors. */
export function planPrune({ exported, references }: { exported: Set<string>; references: Set<string> }): {
  keep: string[];
  errors: string[];
} {
  const errors: string[] = [];
  for (const document of POLICY.documentPaths) {
    if (!exported.has(document)) errors.push(`bridge document missing from the export: ${document}`);
  }
  for (const reference of references) {
    const servable = POLICY.extraPaths.includes(reference) || ASSET_PATH.test(reference);
    if (!servable) errors.push(`document references a path the worker will not serve: ${reference}`);
    else if (!exported.has(reference)) errors.push(`referenced file is not in the export: ${reference}`);
  }
  if (errors.length > 0) return { keep: [], errors };
  return { keep: [...new Set([...POLICY.documentPaths, ...references])].sort(), errors: [] };
}

/** Credential findings for the kept files. Messages carry the rule and offset, never the value. */
export function scanForForbidden(files: { path: string; text: string }[]): string[] {
  const findings: string[] = [];
  const expectedHost = new URL(POLICY.build.supabaseUrl).host;
  for (const { path, text } of files) {
    for (const pattern of POLICY.build.forbiddenPatterns) {
      const match = new RegExp(pattern).exec(text);
      if (match) findings.push(`${path}: forbidden pattern ${pattern} at offset ${match.index}`);
    }
    for (const match of text.matchAll(/https?:\/\/([a-z0-9-]+)\.supabase\.(?:co|in|net)/gi)) {
      if (match[0].slice(match[0].indexOf('//') + 2) !== expectedHost) {
        findings.push(`${path}: unexpected supabase host at offset ${match.index}`);
        break;
      }
    }
    const jwt = /eyJ[A-Za-z0-9_-]{6,}\.eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}/.exec(text);
    if (jwt) findings.push(`${path}: credential-shaped JWT at offset ${jwt.index}`);
  }
  return findings;
}

// ── IO (only when this file is executed directly) ─────────────────────────────────────────────

function servedPath(root: string, file: string): string {
  return '/' + relative(root, file).split(sep).join(posix.sep);
}

function walk(root: string, current = root, out: string[] = []): string[] {
  for (const entry of readdirSync(current)) {
    const full = join(current, entry);
    if (statSync(full).isDirectory()) walk(root, full, out);
    else out.push(full);
  }
  return out;
}

function fail(message: string, details: string[] = []): never {
  process.stderr.write(`\nQA bridge build FAILED: ${message}\n`);
  for (const detail of details) process.stderr.write(`  - ${detail}\n`);
  process.exit(1);
}

function checkWranglerConfig(): void {
  if (!existsSync(WRANGLER_CONFIG)) fail('wrangler.qa-auth.jsonc not found');
  const raw = readFileSync(WRANGLER_CONFIG, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
  const config = JSON.parse(raw) as Record<string, unknown>;
  const assets = (config.assets ?? {}) as Record<string, unknown>;
  const problems: string[] = [];
  if (config.name !== POLICY.workerName) problems.push(`name must be ${POLICY.workerName}`);
  if (assets.directory !== `./${POLICY.outputDir}`) problems.push(`assets.directory must be ./${POLICY.outputDir}`);
  if (assets.run_worker_first !== true) problems.push('assets.run_worker_first must be true');
  if (assets.not_found_handling !== 'none') problems.push('assets.not_found_handling must be "none"');
  if (config.routes !== undefined) problems.push('routes must not be set (workers.dev only)');
  if (config.main !== 'infra/qa-auth-bridge/worker.ts') problems.push('main must be the bridge worker');
  if (problems.length > 0) fail('wrangler.qa-auth.jsonc does not match the QA bridge policy', problems);
}

function runExport(reuse: boolean): void {
  if (reuse && existsSync(EXPORT_DIR)) {
    process.stdout.write('\nWARNING: reusing the existing export (--reuse-export). A deployment requires a fresh build.\n');
    return;
  }
  rmSync(EXPORT_DIR, { recursive: true, force: true });
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('EXPO_PUBLIC_')) delete env[key];
  }
  env.EXPO_NO_DOTENV = '1';
  env.EXPO_PUBLIC_SUPABASE_URL = POLICY.build.supabaseUrl;
  env.EXPO_PUBLIC_SUPABASE_ANON_KEY = POLICY.build.supabaseAnonKey;

  // Invoke the local Expo CLI directly (no shell, no npx): arguments are passed as an argv array,
  // so nothing is concatenated into a command line.
  const expoCli = join(REPO_ROOT, 'node_modules', 'expo', 'bin', 'cli');
  if (!existsSync(expoCli)) fail('expo CLI not found: run npm ci first');
  const result = spawnSync(process.execPath, [expoCli, 'export', '-p', 'web', '--output-dir', EXPORT_DIR, '--clear'], {
    cwd: REPO_ROOT,
    env,
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) fail(`expo export exited with ${String(result.status)}`);
}

function main(argv: string[]): void {
  if (existsSync(join(REPO_ROOT, 'dist'))) {
    fail('dist/ exists: remove the Production export before building the QA bridge origin');
  }
  const { reuseExport } = parseArgs(argv);
  checkWranglerConfig();
  runExport(reuseExport);

  const files = walk(EXPORT_DIR);
  const exported = new Set(files.map((file) => servedPath(EXPORT_DIR, file)));

  const references = new Set<string>();
  for (const document of POLICY.documentPaths) {
    const html = readFileSync(join(EXPORT_DIR, `${document.slice(1)}.html`), 'utf8');
    const unpinned = unpinnedInlineScripts(html, POLICY.contentSecurityPolicy);
    if (unpinned.length > 0) {
      fail(`${document} has an inline script the enforced CSP does not pin`, unpinned);
    }
    for (const reference of collectDocumentReferences(html)) references.add(reference);
  }

  // Follow runtime chunk references transitively: a bundle that loads another chunk by path must
  // have that chunk on the origin, or the page breaks after the document has already been served.
  const pending = [...references].filter((reference) => reference.endsWith('.js'));
  while (pending.length > 0) {
    const reference = pending.pop() as string;
    const file = join(EXPORT_DIR, reference.slice(1));
    if (!existsSync(file)) continue; // planPrune reports the missing file below
    for (const discovered of collectBundleReferences(readFileSync(file, 'utf8'))) {
      if (references.has(discovered)) continue;
      references.add(discovered);
      if (discovered.endsWith('.js')) pending.push(discovered);
    }
  }

  const { keep, errors } = planPrune({ exported: new Set([...exported, ...POLICY.documentPaths]), references });
  if (errors.length > 0) fail('the export does not match the bridge policy', errors);

  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const manifest: {
    worker: string;
    generated: string;
    freshExport: boolean;
    files: { path: string; bytes: number; sha256: string }[];
  } = {
    worker: POLICY.workerName,
    generated: new Date().toISOString(),
    freshExport: !reuseExport,
    files: [],
  };
  const scanned: { path: string; text: string }[] = [];

  for (const served of keep) {
    const isDocument = POLICY.documentPaths.includes(served);
    const source = join(EXPORT_DIR, `${served.slice(1)}${isDocument ? '.html' : ''}`);
    const target = join(OUTPUT_DIR, `${served.slice(1)}${isDocument ? '.html' : ''}`);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target);
    const bytes = readFileSync(target);
    manifest.files.push({ path: served, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    if (/\.(html|js|css)$/.test(source)) scanned.push({ path: served, text: bytes.toString('utf8') });
  }

  // `public/_headers` stays an INPUT ONLY. It is the production web app's header file, and one of
  // its connect-src entries names the Production Supabase host. Copying it into this origin
  // published a Production project reference on a QA host for no benefit: the Worker builds every
  // security header itself from policy.json, the assets system does not apply `_headers` when
  // `run_worker_first` is set, and the Worker's allow-list refuses `/_headers` regardless.
  // The parity check is KEPT: it is what proves the export was produced from the expected
  // repository state, and it would still catch an export built against a different headers file.
  const headersSource = join(REPO_ROOT, ...POLICY.build.headersSource.split('/'));
  const exportedHeaders = join(EXPORT_DIR, '_headers');
  if (!existsSync(headersSource)) fail(`${POLICY.build.headersSource} not found`);
  if (!existsSync(exportedHeaders) || !readFileSync(exportedHeaders).equals(readFileSync(headersSource))) {
    fail('the exported _headers does not match the repository copy');
  }

  const findings = scanForForbidden(scanned);
  if (findings.length > 0) {
    rmSync(OUTPUT_DIR, { recursive: true, force: true });
    fail('credential scan found problems in the pruned output (output removed)', findings);
  }

  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  if (!reuseExport) rmSync(EXPORT_DIR, { recursive: true, force: true });

  const total = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
  process.stdout.write(`\nQA bridge origin built: ${POLICY.outputDir}\n`);
  process.stdout.write(`  worker        ${POLICY.workerName}\n`);
  process.stdout.write(`  served files  ${manifest.files.length} (${total} bytes)\n`);
  for (const file of manifest.files) {
    process.stdout.write(`  ${file.sha256.slice(0, 16)}  ${String(file.bytes).padStart(8)}  ${file.path}\n`);
  }
  process.stdout.write(`  manifest      ${relative(REPO_ROOT, MANIFEST_PATH)}\n`);
  process.stdout.write('  credential scan: clean (placeholder configuration only)\n\n');
}

const invokedPath = resolve(process.argv[1] ?? '');
if (invokedPath === resolve(REPO_ROOT, 'infra', 'qa-auth-bridge', 'build.ts')) main(process.argv.slice(2));
