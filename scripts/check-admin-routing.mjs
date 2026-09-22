#!/usr/bin/env node
/**
 * check-admin-routing.mjs — prove the admin artifact actually ROUTES, not merely that files exist.
 *
 * WHY THIS EXISTS. `check-admin-artifact.mjs` verifies WHICH application was built. It cannot
 * verify HOW Cloudflare will serve it. Production returned 404 for the bare root and for every
 * dynamic route on a hard refresh while every file-presence check passed, because the artifact had
 * no `index.html` for `not_found_handling: "single-page-application"` to fall back to. A file list
 * could never have caught that; only issuing real requests through Wrangler's static-assets server
 * can.
 *
 * This starts a LOCAL Wrangler dev server against apps/admin/wrangler.jsonc — the same config the
 * deployment uses, so the same `not_found_handling` and `html_handling` semantics apply — and
 * asserts the routing contract. It performs no external network access: Wrangler v4 `dev` runs
 * locally in workerd, metrics are disabled, and every request targets 127.0.0.1.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(REPO_ROOT, 'apps/admin/wrangler.jsonc');
const DIST = join(REPO_ROOT, 'apps/admin/dist');
const SHELL_FILE = join(DIST, 'index.html');

const READY_TIMEOUT_MS = 90_000;
const READY_POLL_MS = 500;
const REQUEST_TIMEOUT_MS = 15_000;

/** A representative NON-SENSITIVE identifier. Never a real booking id. */
const DYNAMIC_PATH = '/bookings/00000000-0000-0000-0000-000000000000';
/** Routes that must be served by their OWN document. */
const OWN_DOCUMENT_PATHS = ['/login', '/bookings'];
/** Consumer-only routes: must NOT have their own document; they may only reach the fallback. */
const CONSUMER_ONLY_PATHS = ['/home', '/staff-notice'];

const failures = [];
const notes = [];
const fail = (m) => failures.push(m);
const ok = (m) => notes.push('ok    ' + m);

/** Reserve an ephemeral high port, then release it for Wrangler. */
function pickPort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.once('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

function portIsFree(port) {
  return new Promise((res) => {
    const srv = createServer();
    srv.once('error', () => res(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => res(true)));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(port, path) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const r = await fetch('http://127.0.0.1:' + port + path, { redirect: 'follow', signal: ctl.signal });
    return { status: r.status, body: Buffer.from(await r.arrayBuffer()) };
  } finally {
    clearTimeout(t);
  }
}

/** Kill the whole process tree — on Windows child.kill() leaves workerd behind. */
function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

async function main() {
  if (!existsSync(DIST)) {
    console.error('FAIL  apps/admin/dist does not exist. Run `npm run build:admin` first.');
    process.exit(1);
  }
  if (!existsSync(SHELL_FILE)) {
    console.error(
      'FAIL  apps/admin/dist/index.html is missing, so the SPA fallback cannot work at all.\n' +
        '      Run `npm run check:admin-artifact` for the full explanation.',
    );
    process.exit(1);
  }

  const port = await pickPort();
  // Run Wrangler's JS entry point directly with this Node binary. Spawning `npx.cmd` would need
  // `shell: true` on Windows, which Node deprecates (DEP0190) because arguments are concatenated
  // rather than escaped. Resolving the bin avoids the shell entirely on every platform.
  const wranglerBin = join(REPO_ROOT, 'node_modules/wrangler/bin/wrangler.js');
  if (!existsSync(wranglerBin)) {
    console.error('FAIL  wrangler is not installed. Run `npm ci` first.');
    process.exit(1);
  }
  const child = spawn(
    process.execPath,
    [wranglerBin, 'dev', '-c', CONFIG, '--port', String(port), '--show-interactive-dev-session', 'false'],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    },
  );

  let serverLog = '';
  child.stdout.on('data', (d) => {
    serverLog += d.toString();
  });
  child.stderr.on('data', (d) => {
    serverLog += d.toString();
  });
  let exited = false;
  child.on('exit', () => {
    exited = true;
  });

  try {
    // ---- readiness, bounded ------------------------------------------------
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let ready = false;
    while (Date.now() < deadline && !exited) {
      try {
        const r = await get(port, '/login');
        if (r.status === 200) {
          ready = true;
          break;
        }
      } catch {
        /* not up yet */
      }
      await sleep(READY_POLL_MS);
    }
    if (!ready) {
      console.error('FAIL  Wrangler did not become ready within ' + READY_TIMEOUT_MS + ' ms.');
      console.error(serverLog.split('\n').slice(-25).join('\n'));
      process.exitCode = 1;
      return;
    }
    ok('Wrangler assets server ready on an isolated port');

    // ---- the shell ---------------------------------------------------------
    const diskShell = readFileSync(SHELL_FILE);
    const root = await get(port, '/');
    if (root.status !== 200) {
      fail('bare "/" returned ' + root.status + ', expected 200 (this was the production failure)');
    } else {
      ok('/ returned 200');
    }

    if (!root.body.equals(diskShell)) {
      fail('"/" is not byte-identical to dist/index.html, so the shell served is not the one built');
    } else {
      ok('/ is byte-identical to dist/index.html');
    }
    const shell = root.body;

    // ---- routes that must own their document -------------------------------
    for (const p of OWN_DOCUMENT_PATHS) {
      const r = await get(port, p);
      if (r.status !== 200) {
        fail(p + ' returned ' + r.status + ', expected 200');
        continue;
      }
      ok(p + ' returned 200');
      if (r.body.equals(shell)) {
        fail(p + ' was served through the SPA fallback; it must have its own document');
      } else {
        ok(p + ' is served by its own document (not the fallback)');
      }
    }

    // ---- the dynamic route: 200 THROUGH the fallback ------------------------
    const dyn = await get(port, DYNAMIC_PATH);
    if (dyn.status !== 200) {
      fail(DYNAMIC_PATH + ' returned ' + dyn.status + ', expected 200 — this is the hard-refresh failure');
    } else {
      ok(DYNAMIC_PATH + ' returned 200');
      if (dyn.body.equals(shell)) {
        ok('the dynamic route is served through the SPA shell, as intended');
      } else {
        fail('the dynamic route returned 200 but NOT the shell; the fallback is not what answered');
      }
    }

    // ---- consumer-only paths: fallback only, never their own document -------
    for (const p of CONSUMER_ONLY_PATHS) {
      const r = await get(port, p);
      if (r.status === 200 && !r.body.equals(shell)) {
        fail(p + ' has its OWN document — a consumer route leaked into the admin artifact');
      } else {
        ok(p + ' has no document of its own (fallback only)');
      }
    }
  } finally {
    killTree(child.pid);
    // Give the OS a moment to release the socket, then prove it.
    for (let i = 0; i < 20 && !(await portIsFree(port)); i += 1) await sleep(250);
    if (await portIsFree(port)) {
      ok('port released cleanly after shutdown');
    } else {
      fail('port ' + port + ' still bound after shutdown — a process was left behind');
    }
  }

  for (const n of notes) console.log('  ' + n);
  if (failures.length) {
    console.error('\nadmin routing check FAILED:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
  }
  console.log('\n  admin routing check PASSED (' + notes.length + ' assertions)');
}

main().catch((err) => {
  console.error('admin routing check ERRORED:', err?.message ?? err);
  process.exit(1);
});
