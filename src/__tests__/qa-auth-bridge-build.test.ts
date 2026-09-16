/**
 * qa-auth-bridge-build.test.ts — the pure decisions of the QA bridge build script.
 *
 * `infra/qa-auth-bridge/build.ts` exports its policy decisions so they can be tested here without
 * running an export: which files a pruned bridge origin may contain, and what must abort the build.
 * The build is a placeholder-configured export, so ANY project credential, foreign Supabase host
 * or credential-shaped token in a kept file is a hard failure — and a finding must name the file
 * and the rule, never the matched value.
 */
import {
  collectBundleReferences,
  collectDocumentReferences,
  inlineScriptHashes,
  parseArgs,
  planPrune,
  scanForForbidden,
  unpinnedInlineScripts,
} from '../../infra/qa-auth-bridge/build';
import policy from '../../infra/qa-auth-bridge/policy.json';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENTRY = '/_expo/static/js/web/entry-70ebbdee2397a147eeda60ad6772152a.js';
const CSS = '/_expo/static/css/global-87fd0564cfa78f37afcb8d7603e15d75.css';

const DOC = `<!DOCTYPE html><html><head>
<link rel="preload" href="${CSS}" as="style">
<link rel="stylesheet" href="${CSS}">
<link rel="shortcut icon" href="/favicon.ico">
<link rel="canonical" href="https://example.com/auth/recovery">
<script src="${ENTRY}" defer></script>
</head><body><a href="#main">skip</a><img src="data:image/png;base64,AAA"></body></html>`;

describe('collectDocumentReferences', () => {
  it('collects same-origin absolute paths once, ignoring external, fragment and data references', () => {
    expect(collectDocumentReferences(DOC)).toEqual([CSS, ENTRY, '/favicon.ico']);
  });

  it('returns nothing for a document with no references', () => {
    expect(collectDocumentReferences('<html><body>hi</body></html>')).toEqual([]);
  });
});

describe('inlineScriptHashes', () => {
  // Expo's static export puts exactly one inline script in every document. It must be allowed by
  // hash, never by 'unsafe-inline', and the hash must be pinned in policy.json — so an Expo upgrade
  // that changes the snippet fails the build instead of silently shipping a blocked page.
  const HYDRATE = '<script type="module">globalThis.__EXPO_ROUTER_HYDRATE__=true;</script>';
  const EXPO_HYDRATE_HASH = 'sha256-67fhrP0+BkBqmgGGXTtgiVO/9EQs3QruYNU/7fnRkI8=';

  it('hashes each inline script and ignores sourced ones', () => {
    expect(inlineScriptHashes(DOC)).toEqual([]);
    expect(inlineScriptHashes(HYDRATE)).toEqual([EXPO_HYDRATE_HASH]);
    expect(inlineScriptHashes(`${HYDRATE}<script>alert(1)</script>`)).toHaveLength(2);
  });

  it('the enforced CSP pins that hash and never allows unsafe-inline scripts', () => {
    expect(policy.contentSecurityPolicy).toContain(`script-src 'self' '${EXPO_HYDRATE_HASH}'`);
    expect(policy.contentSecurityPolicy).not.toContain("'unsafe-inline' 'sha256");
    expect(/script-src[^;]*'unsafe-inline'/.test(policy.contentSecurityPolicy)).toBe(false);
  });

  it('every inline script of a built document must be pinned, or the build refuses', () => {
    expect(unpinnedInlineScripts(HYDRATE, policy.contentSecurityPolicy)).toEqual([]);
    expect(unpinnedInlineScripts('<script>alert(1)</script>', policy.contentSecurityPolicy)).toHaveLength(1);
  });
});

describe('parseArgs', () => {
  it('defaults to a fresh export and records an explicitly reused one', () => {
    expect(parseArgs([])).toEqual({ reuseExport: false });
    expect(parseArgs(['--reuse-export'])).toEqual({ reuseExport: true });
  });
});

describe('collectBundleReferences', () => {
  // Expo's entry bundle loads further chunks at runtime by literal path. They are NOT referenced by
  // the document, so a document-only prune ships an origin whose page 404s halfway through booting.
  const CHUNK = '/_expo/static/js/web/index-6650a7e8d7d425dba899ef4227d7843c.js';

  it('finds generated chunk paths a bundle loads at runtime', () => {
    expect(collectBundleReferences(`var a="${CHUNK}";f("${CSS}")`)).toEqual([CHUNK, CSS].sort());
  });

  it('ignores paths outside the generated asset space', () => {
    expect(collectBundleReferences('fetch("/api/data.js");img("/assets/icon.png")')).toEqual([]);
  });
});

describe('planPrune', () => {
  const exported = new Set([...policy.documentPaths, ENTRY, CSS, '/favicon.ico', '/index.html', '/signin.html', '/assets/icon.png']);

  it('keeps exactly the documents and their references, and nothing else from the export', () => {
    const plan = planPrune({ exported, references: new Set([CSS, ENTRY, '/favicon.ico']) });
    expect(plan.errors).toEqual([]);
    expect(plan.keep).toEqual([...policy.documentPaths, CSS, ENTRY, '/favicon.ico'].sort());
    expect(plan.keep).not.toContain('/index.html');
    expect(plan.keep).not.toContain('/assets/icon.png');
  });

  it('aborts when a bridge document is missing from the export', () => {
    const plan = planPrune({ exported: new Set([policy.documentPaths[0], ENTRY]), references: new Set([ENTRY]) });
    expect(plan.errors.join(' ')).toContain(policy.documentPaths[1]);
    expect(plan.keep).toEqual([]);
  });

  it('aborts when a document references a path the worker would refuse to serve', () => {
    const plan = planPrune({ exported, references: new Set([ENTRY, '/assets/icon.png']) });
    expect(plan.errors.join(' ')).toContain('/assets/icon.png');
    expect(plan.keep).toEqual([]);
  });

  it('keeps a chunk the bundle loads at runtime once it is discovered', () => {
    const chunk = '/_expo/static/js/web/index-6650a7e8d7d425dba899ef4227d7843c.js';
    const plan = planPrune({
      exported: new Set([...exported, chunk]),
      references: new Set([ENTRY, chunk]),
    });
    expect(plan.errors).toEqual([]);
    expect(plan.keep).toContain(chunk);
  });

  it('aborts when a referenced file is not in the export', () => {
    const plan = planPrune({ exported, references: new Set([ENTRY, '/_expo/static/css/missing-0000.css']) });
    expect(plan.errors.join(' ')).toContain('missing-0000.css');
    expect(plan.keep).toEqual([]);
  });
});

// Assembled at run time on purpose. A committed blob must never contain a credential-shaped value
// contiguously, or GitHub's secret-scanning push protection rejects the whole push — including the
// commits around it. The scanner under test still receives the exact shape it has to flag, and the
// first test below proves the assembled value really has that shape.
const SUPABASE_PAT_SHAPE = `sbp_${'0123456789abcdef'.repeat(3).slice(0, 40)}`;
const SUPABASE_SECRET_KEY_SHAPE = `sb_secret_${'abcdefgh'}${'ijklmnop'}`;

describe('scanForForbidden', () => {
  const clean = [
    { path: ENTRY, text: `var u="${policy.build.supabaseUrl}",k="${policy.build.supabaseAnonKey}";` },
    { path: '/auth/recovery', text: DOC },
  ];

  it('the runtime-built fixture really carries the credential shape under test', () => {
    expect(SUPABASE_PAT_SHAPE).toMatch(/^sbp_[0-9a-f]{40}$/);
    expect(SUPABASE_SECRET_KEY_SHAPE).toMatch(/^sb_secret_[a-z]{16}$/);
  });

  it('passes a placeholder-configured build', () => {
    expect(scanForForbidden(clean)).toEqual([]);
  });

  it.each([
    ['service_role', 'const key = "service_role_leak"'],
    ['sb_secret_', `const key = "${SUPABASE_SECRET_KEY_SHAPE}"`],
    ['sbp_', `const token = "${SUPABASE_PAT_SHAPE}"`],
    ['MPESA_', 'process.env.MPESA_CONSUMER_SECRET = "x"'],
    ['MPESA_', 'const passkey = MPESA_PASSKEY'],
  ])('flags a forbidden pattern (%s)', (label, text) => {
    const findings = scanForForbidden([{ path: ENTRY, text }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain(ENTRY);
    expect(findings[0]).toContain(label);
  });

  it('does not flag ordinary application identifiers that merely look sensitive', () => {
    // The web bundle legitimately exports names like MPESA_OPS_THRESHOLDS and MPESA_MODE; only
    // credential names may abort the build, or every build fails for no reason.
    expect(
      scanForForbidden([
        { path: ENTRY, text: 'Object.defineProperty(e,"MPESA_OPS_THRESHOLDS",{});const m=MPESA_MODE;' },
        { path: CSS, text: '.role-badge{}.token-row{}' },
      ]),
    ).toEqual([]);
  });

  it('flags any Supabase host other than the expected placeholder', () => {
    const findings = scanForForbidden([{ path: ENTRY, text: 'fetch("https://abcdefghijklmnopqrst.supabase.co/rest/v1/x")' }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('supabase host');
    expect(findings[0]).not.toContain('abcdefghijklmnopqrst'); // a finding never reproduces the value
  });

  it('flags a credential-shaped JWT whatever its role', () => {
    const jwt = (role: string) =>
      `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, ref: 'x' })).toString('base64url')}.c2ln`;
    for (const role of ['anon', 'service_role', 'authenticated']) {
      const findings = scanForForbidden([{ path: ENTRY, text: `const k="${jwt(role)}"` }]);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toContain('JWT');
      expect(findings[0]).not.toContain(jwt(role));
    }
  });

  it('reports every offending file, and reports offsets rather than values', () => {
    const findings = scanForForbidden([
      { path: ENTRY, text: 'service_role' },
      { path: CSS, text: `sb_secret_${'z'.repeat(16)}` },
    ]);
    expect(findings).toHaveLength(2);
    expect(findings.join(' ')).toMatch(/offset \d+/);
    expect(findings.join(' ')).not.toContain('zzzzzzzzzzzzzzzz');
  });
});

describe('_headers is validated as an input but never deployed', () => {
  // The QA bridge origin must carry nothing that names another project. `public/_headers` is the
  // Production site's CSP file and line 29 references the Production Supabase host, so copying it
  // into the bridge output published a Production project reference on a QA origin. It is
  // unreachable there (the Worker allow-list excludes it and Cloudflare treats it as configuration)
  // but it has no reason to be uploaded at all: the Worker builds every security header from
  // policy.json. The parity check against the export is kept, because it is what proves the export
  // was produced from the expected repository state.
  const source = readFileSync(join(process.cwd(), 'infra/qa-auth-bridge/build.ts'), 'utf8');

  it('still requires the repository copy to exist', () => {
    expect(source).toMatch(/if \(!existsSync\(headersSource\)\) fail\(/);
  });

  it('still refuses when the exported _headers differs from the repository copy', () => {
    expect(source).toMatch(/exportedHeaders/);
    expect(source).toMatch(/readFileSync\(exportedHeaders\)\.equals\(readFileSync\(headersSource\)\)/);
    expect(source).toMatch(/the exported _headers does not match the repository copy/);
  });

  it('never copies _headers into the deployable output directory', () => {
    expect(source).not.toMatch(/cpSync\(\s*headersSource\s*,/);
    expect(source).not.toMatch(/join\(\s*OUTPUT_DIR\s*,\s*'_headers'\s*\)/);
  });

  it('does not advertise _headers as part of the served set', () => {
    expect(source).not.toMatch(/\+ _headers/);
  });

  it('policy.json still declares the headers source, because it remains a validated input', () => {
    expect(policy.build.headersSource).toBe('public/_headers');
  });

  it('the worker allow-list has never included _headers', () => {
    expect(policy.documentPaths).not.toContain('/_headers');
    expect(policy.extraPaths).not.toContain('/_headers');
    expect(new RegExp(policy.assetPathPattern).test('/_headers')).toBe(false);
  });

  it('the seven permitted logical assets are exactly the documents, favicon and generated bundles', () => {
    const permitted = [
      '/auth/confirm',
      '/auth/recovery',
      '/favicon.ico',
      '/_expo/static/css/global-87fd0564cfa78f37afcb8d7603e15d75.css',
      '/_expo/static/css/native-tabs.module-77089ab91535ff8bca7a786d80f6a64f.css',
      '/_expo/static/js/web/entry-8d0bb52da47184c66f267d5910165c7d.js',
      '/_expo/static/js/web/index-f4559b8893eb6b574582210c00867ccd.js',
    ];
    const asset = new RegExp(policy.assetPathPattern);
    for (const path of permitted) {
      const allowed = policy.documentPaths.includes(path) || policy.extraPaths.includes(path) || asset.test(path);
      expect(allowed).toBe(true);
    }
    expect(permitted).toHaveLength(7);
  });

  it('the security headers the worker applies still come from policy.json', () => {
    expect(policy.contentSecurityPolicy).toContain("connect-src 'none'");
    expect(policy.contentSecurityPolicy).toContain("default-src 'none'");
    expect(policy.contentSecurityPolicy).toContain("frame-ancestors 'none'");
  });

  it('a real project reference in a kept file is still a hard failure, and is never echoed', () => {
    // Assembled from parts so the literal reference is not written into this file verbatim.
    const ref = ['lkigkltvstlxfd', 'ztffds'].join('');
    const host = `https://${ref}.supabase.co`;
    const findings = scanForForbidden([{ path: '/auth/confirm', text: `connect-src ${host}` }]);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.join(' ')).toContain('unexpected supabase host');
    expect(findings.join(' ')).not.toContain(ref);
  });
});
