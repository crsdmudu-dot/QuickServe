/**
 * ios-item-m-auth-mode.test.ts — the contract of the auth-routes dispatch mode added to
 * .github/workflows/ios-item-m-scheme.yml.
 *
 * Why this exists: GitHub only lists a `workflow_dispatch` workflow that is present on the DEFAULT
 * branch, but it executes the file at the ref you select. The new auth-route smoke gate lives only
 * on this feature branch, so it cannot be dispatched directly. Item M is already registered on the
 * default branch, so it can act as the entry point and call the new gate as a LOCAL reusable
 * workflow — local, so it resolves from the selected ref rather than from the default branch.
 *
 * That makes Item M a dispatcher for something it was not designed for, which is exactly the kind
 * of change that quietly breaks the original gate or leaks its credentials into the new one. The
 * assertions below pin the three things that must hold: Item M's own path is untouched and stays
 * the default, the auth path never sees a fixture identity or a service-role key, and the secret
 * hand-off is an explicit allow-list rather than `inherit`.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const ITEM_M = path.join(ROOT, '.github/workflows/ios-item-m-scheme.yml');
const SMOKE = path.join(ROOT, '.github/workflows/ios-auth-routes-smoke.yml');

const BUILD_ID = 'b00fdcf7-4903-4153-a1ac-1e36ae9f881d';
const COMMIT = '44215962efd311a85d344cb775670c4ea8e36914';
const SHA256 = '6c5bfa9f3e8299ce429e4a924844c04d89ff891c075932a545f2b34693d0af7d';

const read = (p: string) => fs.readFileSync(p, 'utf8');
let yml: string;
let smoke: string;

/** The text of one top-level job block, from its header to the next job at the same indent. */
function jobBlock(text: string, name: string): string {
  const start = text.indexOf(`\n  ${name}:\n`);
  if (start < 0) return '';
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z0-9_-]+:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

beforeAll(() => {
  yml = read(ITEM_M);
  smoke = read(SMOKE);
});

describe('the Item M gate keeps its own behaviour as the default', () => {
  it('still dispatches manually and still requires an explicit build id', () => {
    expect(yml).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(yml).toMatch(/^ {6}build_id:\n(?: {8}.*\n)*? {8}required: true$/m);
    for (const trigger of ['push:', 'pull_request:', 'schedule:', 'repository_dispatch:']) {
      expect(yml).not.toMatch(new RegExp(`^ {0,2}${trigger}`, 'm'));
    }
  });

  it('offers exactly two modes and defaults to the original one', () => {
    const block = yml.split(/^ {6}mode:$/m)[1] ?? '';
    expect(block).toMatch(/^ {8}default: ["']?item-m["']?$/m);
    expect(block).toMatch(/^ {8}type: choice$/m);
    expect(block).toMatch(/- item-m$/m);
    expect(block).toMatch(/- auth-routes$/m);
  });

  it('runs the original job only in the original mode, and leaves its steps intact', () => {
    const block = jobBlock(yml, 'item-m-scheme');
    expect(block).toMatch(/if: \$\{\{ inputs\.mode == 'item-m' \}\}/);
    // the steps that define the Item M gate must still be there, unchanged in intent
    for (const step of [
      'Download the PINNED EAS iOS simulator build',
      'Prove the installed artifact registers both schemes',
      'Boot iOS simulator and install the app',
      'qa/native/ios-item-m-scheme.sh',
    ]) {
      expect(block).toContain(step);
    }
    // and it keeps its own credentials, which belong to it alone
    expect(block).toContain('QA_CUSTOMER_EMAIL');
    expect(block).toContain('QA_ADMIN_EMAIL');
  });
});

describe('the auth-routes mode is isolated', () => {
  it('is a separate job that runs only when that mode is selected', () => {
    const block = jobBlock(yml, 'auth-routes');
    expect(block).not.toBe('');
    expect(block).toMatch(/if: \$\{\{ inputs\.mode == 'auth-routes' \}\}/);
  });

  it('calls the new gate as a LOCAL reusable workflow, so it resolves from the selected ref', () => {
    const block = jobBlock(yml, 'auth-routes');
    expect(block).toMatch(/uses: \.\/\.github\/workflows\/ios-auth-routes-smoke\.yml/);
    // a remote `owner/repo/.github/workflows/x.yml@ref` reference would pin a branch and defeat
    // the entire point of dispatching this from the feature branch
    expect(block).not.toMatch(/uses: [A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/\.github/);
  });

  it('passes the pinned artifact identity through to the gate', () => {
    const block = jobBlock(yml, 'auth-routes');
    expect(block).toMatch(/build_id: \$\{\{ inputs\.build_id \}\}/);
    expect(block).toMatch(/expected_commit: \$\{\{ inputs\.expected_commit \}\}/);
    expect(block).toMatch(/expected_sha256: \$\{\{ inputs\.expected_sha256 \}\}/);
    expect(yml).toContain(COMMIT);
    expect(yml).toContain(SHA256);
  });

  it('hands over EXPO_TOKEN and nothing else, never by inheritance', () => {
    const block = jobBlock(yml, 'auth-routes');
    expect(block).toMatch(/secrets:\n {6}EXPO_TOKEN: \$\{\{ secrets\.EXPO_TOKEN \}\}/);
    expect(block).not.toContain('inherit');
    for (const forbidden of ['QA_CUSTOMER', 'QA_ADMIN', 'QA_PROVIDER', 'SERVICE_ROLE', 'ANON_KEY', 'SUPABASE_URL']) {
      expect(block).not.toContain(forbidden);
    }
    // and nowhere in the file may secrets be passed wholesale. Matched as a real YAML line, not as
    // a substring: the prose above legitimately names the construct in order to forbid it.
    expect(yml).not.toMatch(/^\s*secrets: inherit\s*$/m);
    expect(smoke).not.toMatch(/^\s*secrets: inherit\s*$/m);
  });

  it('runs no Item M step: no sign-in, no admin flow, no fixture script', () => {
    const block = jobBlock(yml, 'auth-routes');
    for (const forbidden of ['ios-item-m-scheme.sh', 'maestro', 'simctl', 'steps:', 'CUST_EMAIL']) {
      expect(block).not.toContain(forbidden);
    }
  });
});

describe('the gate itself accepts being called, and still stands alone', () => {
  it('declares workflow_call alongside workflow_dispatch, and no automatic trigger', () => {
    expect(smoke).toMatch(/^on:\n {2}workflow_dispatch:/m);
    expect(smoke).toMatch(/^ {2}workflow_call:$/m);
    for (const trigger of ['push:', 'pull_request:', 'schedule:', 'repository_dispatch:']) {
      expect(smoke).not.toMatch(new RegExp(`^ {0,2}${trigger}`, 'm'));
    }
  });

  it('declares the three inputs for the caller as well, and the one secret it needs', () => {
    const call = smoke.split(/^ {2}workflow_call:$/m)[1]?.split(/^permissions:/m)[0] ?? '';
    for (const name of ['build_id', 'expected_commit', 'expected_sha256']) {
      expect(call).toMatch(new RegExp(`^ {6}${name}:$`, 'm'));
    }
    expect(call).toMatch(/^ {4}secrets:$/m);
    expect(call).toMatch(/^ {6}EXPO_TOKEN:$/m);
    expect(call).toMatch(/^ {8}required: true$/m);
    // exactly one secret may be declared
    expect((call.match(/^ {6}[A-Z0-9_]+:$/gm) ?? [])).toEqual(['      EXPO_TOKEN:']);
  });

  it('reads its inputs from the inputs context so both triggers work', () => {
    expect(smoke).not.toContain('github.event.inputs');
    expect(smoke).toMatch(/\$\{\{ inputs\.build_id \}\}/);
    expect(smoke).toMatch(/\$\{\{ inputs\.expected_commit \}\}/);
    expect(smoke).toMatch(/\$\{\{ inputs\.expected_sha256 \}\}/);
  });

  it('keeps refusing any build other than the pinned one', () => {
    expect(smoke).toContain(BUILD_ID);
    expect(smoke).toMatch(/!= "\$PINNED_BUILD_ID"/);
  });
});
