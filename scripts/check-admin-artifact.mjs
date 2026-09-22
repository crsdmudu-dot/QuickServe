#!/usr/bin/env node
/**
 * check-admin-artifact.mjs — prove that apps/admin/dist holds the ADMIN application.
 *
 * WHY THIS EXISTS. The Cloudflare Worker `quickserve` serves the admin portal. Its configuration
 * used to sit at the repository root and point at `./dist`; once the admin app moved to apps/admin
 * that path became the CONSUMER export, and a push to main published the consumer bundle over the
 * admin URL. Nothing detected it, because "a web bundle was produced" was the only thing anyone
 * checked. Building successfully is not the same as building the right application.
 *
 * This runs immediately after `npm run build:admin` and fails the build unless the artifact that
 * would be uploaded is unmistakably the admin app: admin route documents present, consumer-only
 * route documents absent, and the response-header file shipped.
 *
 * Read-only. It never deploys, never contacts Cloudflare and never reads configuration values.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(REPO_ROOT, 'apps', 'admin', 'dist');

/** Documents only the admin application exports. */
const REQUIRED_ADMIN_DOCS = [
  'login.html',
  'dashboard.html',
  'bookings/index.html',
  'bookings/[id].html',
  'providers/index.html',
  'payments/index.html',
  'analytics/index.html',
  'analytics/detailed.html',
];

/**
 * Documents only the CONSUMER application exports. `staff-notice.html` is the sharpest signal:
 * it was added by the separation itself and exists solely to tell an admin identity on the phone
 * that administration lives on the web portal. If it is here, the consumer app was built.
 */
const FORBIDDEN_CONSUMER_DOCS = ['home.html', 'staff-notice.html', 'provider.html', 'onboarding.html'];

/**
 * The Cloudflare SPA shell. `not_found_handling: "single-page-application"` answers every
 * unmatched request with `/index.html` — the bare root, and every dynamic route on a hard
 * refresh, because `/bookings/<id>` cannot match the literal exported `bookings/[id].html`.
 * A build without this file returns 404 for all of them while still looking like a healthy
 * admin artifact, which is exactly how it reached production once. `+not-found.html` is not a
 * substitute: it is an Expo route reachable only after hydration.
 */
const SPA_SHELL = 'index.html';

/** Shipped response headers — without this the deployment loses its security posture silently. */
const REQUIRED_FILES = ['_headers'];

const failures = [];
const notes = [];

if (!existsSync(DIST)) {
  console.error('FAIL  apps/admin/dist does not exist. Run `npm run build:admin` first.');
  process.exit(1);
}
if (!statSync(DIST).isDirectory()) {
  console.error('FAIL  apps/admin/dist is not a directory.');
  process.exit(1);
}

for (const rel of REQUIRED_ADMIN_DOCS) {
  if (existsSync(join(DIST, rel))) notes.push(`ok        present  ${rel}`);
  else failures.push(`missing admin document: ${rel}`);
}

for (const rel of FORBIDDEN_CONSUMER_DOCS) {
  if (existsSync(join(DIST, rel))) failures.push(`CONSUMER document present in the admin artifact: ${rel}`);
  else notes.push(`ok        absent   ${rel}`);
}

if (existsSync(join(DIST, SPA_SHELL))) {
  notes.push(`ok        present  ${SPA_SHELL} (Cloudflare SPA shell)`);
} else {
  failures.push(
    `MISSING SPA SHELL: ${SPA_SHELL} is not in the artifact. Cloudflare serves it for the bare ` +
      `root and for every dynamic route on a hard refresh, so this build would return 404 for ` +
      `"/" and for /bookings/<id>. Add a root route (apps/admin/src/app/index.tsx) — ` +
      `+not-found.html and bookings/[id].html are NOT substitutes.`,
  );
}

for (const rel of REQUIRED_FILES) {
  if (existsSync(join(DIST, rel))) notes.push(`ok        present  ${rel}`);
  else failures.push(`missing required file: ${rel}`);
}

// A web export must actually contain HTML. The root ./dist is routinely overwritten by
// `expo export --platform android`, which emits no documents at all; catch that shape here too.
const htmlCount = (function walk(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) n += walk(full);
    else if (e.name.endsWith('.html')) n += 1;
  }
  return n;
})(DIST);
if (htmlCount < REQUIRED_ADMIN_DOCS.length + 1) {
  failures.push(`only ${htmlCount} HTML documents found; this does not look like a static web export`);
} else {
  notes.push(`ok        ${htmlCount} HTML documents in the artifact`);
}

for (const n of notes) console.log('  ' + n);

if (failures.length) {
  console.error('\nadmin artifact check FAILED:');
  for (const f of failures) console.error('  - ' + f);
  console.error('\napps/admin/dist must be the ADMIN export (npm run build:admin), never the consumer export.');
  process.exit(1);
}
console.log(`\n  admin artifact check PASSED (${notes.length} assertions)`);
