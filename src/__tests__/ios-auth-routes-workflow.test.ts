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
  it('is manually dispatched only — never on push, pull request or a schedule', () => {
    expect(yml).toMatch(/^on:\n {2}workflow_dispatch:/m);
    for (const trigger of ['push:', 'pull_request:', 'schedule:', 'workflow_call:', 'repository_dispatch:']) {
      expect(yml).not.toMatch(new RegExp(`^ {0,2}${trigger.replace(':', ':')}`, 'm'));
    }
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

  it.each(cases)('$url fails closed with the neutral state', ({ file, url, heading, detail, action }) => {
    const text = read(file);
    expect(text).toMatch(/^---$/m); // Maestro's header/commands separator
    expect(text).toContain(`appId: ${BUNDLE_ID}`);
    expect(text).toContain(`openLink`);
    expect(text).toContain(url);
    expect(text).not.toMatch(new RegExp(`${url}[?#]`));
    expect(text).toContain('This link is invalid or has expired.');
    expect(text).toContain(heading);
    expect(text).toContain(detail);
    expect(text).toContain(action);
    expect(text).toContain('takeScreenshot');
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

  it.each(cases)('$url starts from a cleared state so no session can exist', ({ file }) => {
    expect(read(file)).toMatch(/clearState:\s*true/);
  });
});
