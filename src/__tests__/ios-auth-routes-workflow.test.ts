/**
 * ios-auth-routes-workflow.test.ts — the contract of the standalone iOS Simulator
 * authentication-route smoke gate (.github/workflows/ios-auth-routes-smoke.yml) and the two
 * Maestro flows it runs.
 *
 * Why a test and not just a reviewed YAML file: this gate is the only automated proof that the two
 * emailed-link routes fail closed on iOS, and its value depends entirely on properties that are
 * easy to weaken by accident — that it certifies ONE pinned artifact, verifies that artifact's
 * identity and hash before installing it, holds no fixture identity or service-role key, and never
 * signs in or mutates anything. Each of those is asserted here so a future edit that removes one
 * fails the suite instead of silently producing a green run that proves less.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const WORKFLOW_PATH = path.join(ROOT, '.github/workflows/ios-auth-routes-smoke.yml');
const FLOW_DIR = path.join(ROOT, 'qa/native/flows');
const RECOVERY_FLOW = path.join(FLOW_DIR, 'auth-recovery-no-token.yaml');
const CONFIRM_FLOW = path.join(FLOW_DIR, 'auth-confirm-no-token.yaml');

const BUILD_ID = 'b00fdcf7-4903-4153-a1ac-1e36ae9f881d';
const COMMIT = '44215962efd311a85d344cb775670c4ea8e36914';
const SHA256 = '6c5bfa9f3e8299ce429e4a924844c04d89ff891c075932a545f2b34693d0af7d';
const BUNDLE_ID = 'ke.co.hiredcorp.kwikserve';

const read = (p: string) => fs.readFileSync(p, 'utf8');
let yml: string;

beforeAll(() => {
  yml = read(WORKFLOW_PATH);
});

/** The value of a `key: value` line at a given indent, without pulling in a YAML parser. */
function scalarAt(text: string, key: string, indent: number): string | undefined {
  const re = new RegExp(`^ {${indent}}${key}:[ 	]*(.*)$`, 'm');
  const m = re.exec(text);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined;
}

describe('trigger and permissions are pinned', () => {
  it('never starts on its own — no push, pull request, schedule or repository dispatch', () => {
    expect(yml).toMatch(/^on:\n {2}workflow_dispatch:/m);
    for (const trigger of ['push:', 'pull_request:', 'schedule:', 'repository_dispatch:']) {
      expect(yml).not.toMatch(new RegExp(`^ {0,2}${trigger}`, 'm'));
    }
    // `workflow_call` is allowed and is NOT an automatic trigger: it only runs when a caller that
    // was itself manually dispatched invokes it, and it must name the one secret it accepts.
    // (The caller side is pinned in ios-item-m-auth-mode.test.ts.)
    expect(yml).toMatch(/^ {2}workflow_call:$/m);
    expect(yml).toMatch(/^ {4}secrets:\n {6}EXPO_TOKEN:$/m);
  });

  it('runs with least privilege', () => {
    expect(yml).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(yml).not.toMatch(/^\s+\w+: write$/m);
  });

  it('takes the three identity inputs, all required, defaulted to the certified artifact', () => {
    const inputs = yml.split('inputs:')[1] ?? '';
    for (const name of ['build_id', 'expected_commit', 'expected_sha256']) {
      expect(inputs).toMatch(new RegExp(`^ {6}${name}:$`, 'm'));
    }
    expect((inputs.match(/^ {8}required: true$/gm) ?? []).length).toBe(3);
    const block = (name: string) => inputs.split(new RegExp(`^ {6}${name}:$`, 'm'))[1]?.split(/^ {6}\w+:$/m)[0] ?? '';
    expect(scalarAt(block('build_id'), 'default', 8)).toBe(BUILD_ID);
    expect(scalarAt(block('expected_commit'), 'default', 8)).toBe(COMMIT);
    expect(scalarAt(block('expected_sha256'), 'default', 8)).toBe(SHA256);
  });
});

describe('secret allow-list', () => {
  it('uses EXPO_TOKEN and nothing else', () => {
    const referenced = [...yml.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
    expect([...new Set(referenced)]).toEqual(['EXPO_TOKEN']);
  });

  it('never mentions a fixture identity, a service-role key or a Supabase key', () => {
    for (const forbidden of [
      'QA_CUSTOMER', 'QA_PROVIDER', 'QA_ADMIN', 'SERVICE_ROLE', 'ANON_KEY', 'SUPABASE_URL',
      'CUST_EMAIL', 'CUST_PW', 'PASSWORD',
    ]) {
      expect(yml).not.toContain(forbidden);
    }
  });
});

describe('artifact identity is proved before anything is installed', () => {
  it('pins the one build this gate certifies and refuses any other', () => {
    expect(yml).toContain(BUILD_ID);
    expect(yml).toMatch(/PINNED_BUILD_ID|refus|exit 1/);
    // the run must compare the supplied build id against the pinned one
    expect(yml).toMatch(new RegExp(`"\\$\\{?BUILD_ID\\}?"\\s*=\\s*"\\$\\{?PINNED_BUILD_ID\\}?"|BUILD_ID.*!=.*PINNED`));
  });

  it('verifies status, platform, profile, bundle identifier and commit from EAS metadata', () => {
    expect(yml).toContain('.status');
    expect(yml).toContain('FINISHED');
    expect(yml).toContain('IOS');
    expect(yml).toContain('ios-simulator');
    expect(yml).toContain(BUNDLE_ID);
    expect(yml).toContain('gitCommitHash');
    expect(yml).toContain(COMMIT);
  });

  it('downloads only the authoritative Expo artifact host and checks the hash before install', () => {
    expect(yml).toMatch(/https:\/\/expo\.dev\//);
    expect(yml).toContain('shasum');
    expect(yml).toContain(SHA256);
    const hashAt = yml.indexOf('shasum');
    const installAt = yml.indexOf('simctl install');
    expect(hashAt).toBeGreaterThan(-1);
    expect(installAt).toBeGreaterThan(hashAt); // hash first, install second
  });
});

describe('the runner can actually run eas', () => {
  // Run 34836144016 failed here: `eas build:view` evaluates the project config, which loads
  // app.config.js and resolves the expo-router plugin, and that needs node_modules. The gate
  // installed eas-cli and Maestro but never installed the app's dependencies, so the very first
  // EAS call exited 1 and every meaningful step was skipped. The ordering assertion below is the
  // one that would have caught it before a dispatch.
  it('installs the app dependencies', () => {
    expect(yml).toMatch(/^ {8}run: npm ci$/m);
  });

  it('installs them before the first EAS command', () => {
    const npmCi = yml.search(/^ {8}run: npm ci$/m);
    // A real command line, not a mention in prose: comments start with `#` after the indent, so
    // this only matches a line that actually invokes the CLI.
    const firstEas = yml.search(/^\s+eas [a-z]/m);
    expect(npmCi).toBeGreaterThan(-1);
    expect(firstEas).toBeGreaterThan(-1);
    expect(npmCi).toBeLessThan(firstEas);
  });

  it('installs them after the tool install, so eas-cli exists first', () => {
    const tools = yml.indexOf('npm install -g eas-cli');
    const npmCi = yml.search(/^ {8}run: npm ci$/m);
    expect(tools).toBeGreaterThan(-1);
    expect(npmCi).toBeGreaterThan(tools);
  });
});

describe('simulator selection and launch', () => {
  it('chooses and records a compatible runtime, failing clearly when none exists', () => {
    expect(yml).toContain('simctl list');
    expect(yml).toMatch(/MinimumOSVersion/);
    expect(yml).toMatch(/No compatible|no compatible/);
    expect(yml).toContain('simctl boot');
  });

  it('cold-launches the app and runs both no-token flows', () => {
    expect(yml).toContain('simctl launch');
    // The URLs live in the flows (asserted below), so the workflow cannot drift from them; what
    // the workflow must prove is that it runs exactly those two and smuggles no parameter of
    // its own.
    expect(yml).toContain('qa/native/flows/auth-recovery-no-token.yaml');
    expect(yml).toContain('qa/native/flows/auth-confirm-no-token.yaml');
    expect(yml).not.toMatch(/kwikserve:\/\/auth\/(recovery|confirm)[?#]/);
    expect(yml).not.toMatch(/maestro test .* -e /);
  });
});

describe('no sign-in, no mutation, no leakage', () => {
  it('never signs in or exchanges a token', () => {
    for (const forbidden of ['signInWithPassword', 'verifyOtp', 'resetPasswordForEmail', 'inputText']) {
      expect(yml).not.toContain(forbidden);
    }
  });

  it('uploads screenshots and results only, and sanitizes what it prints', () => {
    expect(yml).toContain('upload-artifact');
    expect(yml).toMatch(/redact|sanitiz/i);
  });

  it('is standalone: the broad iOS workflows are not touched by this gate', () => {
    const others = ['ios-native-journeys.yml', 'ios-item-m-scheme.yml'];
    for (const other of others) {
      const text = read(path.join(ROOT, '.github/workflows', other));
      expect(text).not.toContain('auth/recovery');
      expect(text).not.toContain('auth/confirm');
    }
  });
});

describe('the workflow delivers each link itself, per route', () => {
  const routes = [
    { name: 'recovery', url: 'kwikserve://auth/recovery', flow: 'qa/native/flows/auth-recovery-no-token.yaml' },
    { name: 'confirm', url: 'kwikserve://auth/confirm', flow: 'qa/native/flows/auth-confirm-no-token.yaml' },
  ];

  it.each(routes)('$url is opened with xcrun simctl openurl against the selected device', ({ url }) => {
    expect(yml).toContain(`xcrun simctl openurl "$DEVICE_ID" "${url}"`);
  });

  it.each(routes)('$url carries no token and no query or fragment', ({ url }) => {
    const call = new RegExp(`xcrun simctl openurl "\\$DEVICE_ID" "${url.replace(/\//g, '\\/')}([^"]*)"`);
    const m = call.exec(yml);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe(''); // nothing after the route — no query, no fragment, no token
    // The workflow legitimately names `token_hash` in its scan and redaction rules, so the check
    // is that no simctl openurl command carries one, not that the string never appears.
    for (const [, opened] of yml.matchAll(/simctl openurl "\$DEVICE_ID" "([^"]*)"/g)) {
      expect(opened).not.toContain('token_hash');
      expect(opened).not.toMatch(/[?#]/);
    }
  });

  it.each(routes)('$name is prepared independently from a known signed-out launch', ({ url }) => {
    const before = yml.slice(0, yml.indexOf(`openurl "$DEVICE_ID" "${url}"`));
    const step = before.slice(before.lastIndexOf('      - name:'));
    // each route reinstalls and cold-launches before its own link is delivered
    expect(step).toContain('simctl uninstall');
    expect(step).toContain('simctl install');
    expect(step).toContain('simctl launch');
  });

  it.each(routes)('$name opens the URL before running its assertion flow', ({ url, flow }) => {
    const opened = yml.indexOf(`openurl "$DEVICE_ID" "${url}"`);
    const asserted = yml.indexOf(`maestro test ${flow}`);
    expect(opened).toBeGreaterThan(-1);
    expect(asserted).toBeGreaterThan(-1);
    expect(opened).toBeLessThan(asserted);
  });

  it('keeps the two routes in separate steps rather than one combined step', () => {
    const rec = yml.indexOf('openurl "$DEVICE_ID" "kwikserve://auth/recovery"');
    const con = yml.indexOf('openurl "$DEVICE_ID" "kwikserve://auth/confirm"');
    const recFlow = yml.indexOf('maestro test qa/native/flows/auth-recovery-no-token.yaml');
    expect(rec).toBeLessThan(recFlow);
    expect(recFlow).toBeLessThan(con); // recovery is fully asserted before confirmation begins
  });

  it('preserves every safeguard that came before', () => {
    for (const kept of [
      'PINNED_BUILD_ID', 'gitCommitHash', 'shasum', 'plutil -extract CFBundleIdentifier',
      'MinimumOSVersion', 'No compatible', 'DiagnosticReports', 'upload-artifact',
    ]) {
      expect(yml).toContain(kept);
    }
    const hashAt = yml.indexOf('shasum');
    expect(yml.indexOf('simctl install')).toBeGreaterThan(hashAt);
  });
});

describe('the Maestro flows assert the neutral invalid-link state', () => {
  const cases = [
    {
      file: RECOVERY_FLOW,
      url: 'kwikserve://auth/recovery',
      heading: 'Reset your password',
      detail: 'Reset links can only be used once and expire after a short time.',
      action: 'Request a new link',
    },
    {
      file: CONFIRM_FLOW,
      url: 'kwikserve://auth/confirm',
      heading: 'Confirm your email',
      detail: 'Sign in to request a new confirmation email.',
      action: 'Go to sign in',
    },
  ];

  it.each(cases)('$url fails closed with the neutral state', ({ file, heading, detail, action }) => {
    const text = read(file);
    expect(text).toMatch(/^---$/m); // Maestro's header/commands separator
    expect(text).toContain(`appId: ${BUNDLE_ID}`);
    expect(text).toContain('This link is invalid or has expired.');
    expect(text).toContain(heading);
    expect(text).toContain(detail);
    expect(text).toContain(action);
    expect(text).toContain('takeScreenshot');
  });

  it.each(cases)('$url is never delivered by Maestro itself', ({ file }) => {
    // Maestro's openLink raises the iOS system alert "Open in KwikServe?" and nothing taps it, so
    // the link is never delivered and the flow times out on a screen it never reached (run
    // 34838315160). Delivery belongs to the workflow, with xcrun simctl openurl.
    // As a Maestro COMMAND: the comment above the flow legitimately names it to explain why it is
    // not used.
    expect(read(file)).not.toMatch(/^\s*-\s+openLink\b/m);
  });

  it.each(cases)('$url does not relaunch, clear or navigate away from the route', ({ file }) => {
    const text = read(file);
    // The workflow prepares the app and delivers the link; relaunching here would discard the very
    // navigation under test.
    // Each matched as a command or a key, never as a substring: the explanatory comments name
    // these constructs precisely in order to forbid them.
    // Backslashes are doubled on purpose: inside a template literal `\s` collapses to `s` and `\b`
    // becomes a backspace character, which silently produces a regex that can never match.
    for (const forbidden of ['launchApp', 'stopApp', 'openLink', 'back']) {
      expect(text).not.toMatch(new RegExp(`^\\s*-\\s+${forbidden}\\b`, 'm'));
    }
    expect(text).not.toMatch(/^\s*clearState:/m);
  });

  it.each(cases)('$url never types credentials or signs in', ({ file }) => {
    const text = read(file);
    // Note: the screens legitimately SAY "password" ("Reset your password"), so the check is for
    // the mechanisms that could enter one, not for the word.
    for (const forbidden of ['inputText', 'CUST_EMAIL', 'CUST_PW', 'eraseText', 'pasteText']) {
      expect(text).not.toContain(forbidden);
    }
    expect(text).not.toMatch(/tapOn:\s*"?(Log in|Sign in|Request a new link|Go to sign in)/);
  });

  it.each(cases)('$url asserts only, and asserts the negatives too', ({ file }) => {
    const text = read(file);
    expect(text).toMatch(/extendedWaitUntil:/);
    expect(text).toMatch(/assertVisible:/);
    expect(text).toMatch(/assertNotVisible:/);
    expect(text).toContain('Welcome back'); // the signed-in surface must never appear
  });
});
