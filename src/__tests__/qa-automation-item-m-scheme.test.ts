/**
 * Item M — static guards for the focused kwikserve:// scheme gate.
 *
 * Phase 7B could not execute J-customer at all: on the physical iPhone `quickserve://admin` was
 * intercepted by the legacy QuickServe app before KwikServe's `/admin` guard ran, so the check
 * produced no PASS and no FAIL. Commit 060df7e added `kwikserve` as an uncontested address, and
 * qa/native/ios-item-m-scheme.sh is the runtime gate for it.
 *
 * These are STATIC guards over that gate's contract. They cannot prove the flows pass — only the
 * simulator can — but they protect the properties that make a pass MEAN anything:
 *   - S1 actually fires the NEW scheme (not the legacy one it replaced);
 *   - S2 still covers the retained legacy scheme, so backward compatibility cannot be dropped
 *     silently the day someone decides the migration is "done";
 *   - S3 authenticates as ADMIN, so the admission half is not accidentally a second customer run;
 *   - no admin mutation control is ever tapped;
 *   - the workflow pins an explicit build and cannot silently certify "latest".
 *
 * Scope note deliberately encoded here as well as in the flows: none of this says anything about
 * the collision. The CI simulator holds only KwikServe, so `quickserve://` is uncontested there
 * and item M cannot arise, let alone be proven resolved.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const FLOW_DIR = join(ROOT, 'qa', 'native', 'flows');

const flow = (name: string) => join(FLOW_DIR, name);
const read = (file: string) => readFileSync(file, 'utf8');

/** Lines that actually do something — comments and blanks are not flow steps. */
function commandLines(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

const S1 = 'item-m-customer-rejection.yaml';
const S2 = 'item-m-scheme-compat.yaml';
const S3 = 'item-m-admin-admission.yaml';
const RUNNER = join(ROOT, 'qa', 'native', 'ios-item-m-scheme.sh');
const WORKFLOW = join(ROOT, '.github', 'workflows', 'ios-item-m-scheme.yml');

describe('Item M — the focused scheme gate exists and is wired', () => {
  it('all three flows, the admin login step, the runner and the workflow are present', () => {
    for (const f of [S1, S2, S3]) expect(existsSync(flow(f))).toBe(true);
    expect(existsSync(join(FLOW_DIR, 'steps', 'login-admin.yaml'))).toBe(true);
    expect(existsSync(RUNNER)).toBe(true);
    expect(existsSync(WORKFLOW)).toBe(true);
  });
});

describe('Item M — each flow fires the scheme it claims to test', () => {
  it('S1 opens the NEW kwikserve:// scheme, not the legacy one', () => {
    const source = read(flow(S1));
    expect(source).toContain('- openLink: "kwikserve://admin"');
    // The whole point of S1 is the new address. If it were reverted to the legacy scheme it would
    // still pass at runtime on the simulator — where quickserve:// is uncontested — while proving
    // nothing about the remediation. That silent-success case is what this line prevents.
    expect(commandLines(source).join('\n')).not.toContain('openLink: "quickserve://admin"');
  });

  it('S2 keeps covering the RETAINED legacy scheme', () => {
    const source = read(flow(S2));
    expect(source).toContain('- openLink: "quickserve://admin"');
  });

  it('S3 opens the new scheme too, so S1 cannot be explained by the scheme routing nowhere', () => {
    expect(read(flow(S3))).toContain('- openLink: "kwikserve://admin"');
  });
});

describe('Item M — the guard is exercised in BOTH directions', () => {
  it('S1 and S2 authenticate as a CUSTOMER and assert rejection to Customer Home', () => {
    for (const f of [S1, S2]) {
      const source = read(flow(f));
      expect(source).toContain('runFlow: { file: steps/login-customer.yaml }');
      expect(source).toContain('assertVisible: "What service do you need today?"');
      // Admin-only chrome. Payments and My Bookings are NOT used as negatives: the customer
      // surface carries tabs with those names, so asserting them absent would be a false failure.
      expect(source).toContain('assertNotVisible: "Providers"');
      expect(source).toContain('assertNotVisible: "Admin"');
      expect(source).toContain('assertNotVisible: "Not authorized"');
    }
  });

  it('S3 authenticates as ADMIN — not a second customer run in disguise', () => {
    const source = read(flow(S3));
    expect(source).toContain('runFlow: { file: steps/login-admin.yaml }');
    expect(source).not.toContain('steps/login-customer.yaml');
    expect(source).toContain('assertVisible: "Admin"');
    expect(source).toContain('assertVisible: "Providers"');
    // Admitted, not bounced to a customer surface.
    expect(source).toContain('assertNotVisible: "What service do you need today?"');
  });

  it('the admin login step uses admin credentials, not customer ones', () => {
    const step = read(join(FLOW_DIR, 'steps', 'login-admin.yaml'));
    expect(step).toContain('${ADMIN_EMAIL}');
    expect(step).toContain('${ADMIN_PW}');
    expect(step).not.toContain('${CUST_EMAIL}');
    expect(step).not.toContain('${CUST_PW}');
  });
});

describe('Item M — the gate is read-only', () => {
  it('no flow taps an admin mutation control', () => {
    // The Admin surface carries live writes. Asserting and screenshotting is the entire gate; a
    // tap here would write provider approval or booking state to the QA backend.
    const forbidden = [
      'Approve',
      'Reject',
      'Assign',
      'Send quote',
      'Update Status',
      'Save notes',
      'Verify',
      'Delete',
      'Place Booking',
    ];
    for (const f of [S1, S2, S3]) {
      const taps = commandLines(read(flow(f))).filter((l) => l.startsWith('- tapOn:'));
      for (const t of taps) {
        for (const word of forbidden) expect(t).not.toContain(word);
      }
    }
  });

  it('the runner declares no booking marker, because it creates no data', () => {
    const runner = read(RUNNER);
    expect(runner).not.toContain('MARKER=');
    expect(runner).not.toContain('trap cleanup EXIT');
  });

  it('the runner requires both credential pairs up front rather than failing mid-run', () => {
    const runner = read(RUNNER);
    for (const v of [
      'QA_CUSTOMER_EMAIL',
      'QA_CUSTOMER_PASSWORD',
      'QA_ADMIN_EMAIL',
      'QA_ADMIN_PASSWORD',
    ]) {
      expect(runner).toContain(v);
    }
  });

  it('the runner invokes all three checks', () => {
    const runner = read(RUNNER);
    for (const f of [S1, S2, S3]) expect(runner).toContain(f);
  });
});

describe('Item M — the workflow certifies a chosen artifact, never "latest"', () => {
  const workflow = readFileSync(WORKFLOW, 'utf8');

  it('build_id is required and has no latest-build fallback', () => {
    expect(workflow).toContain('required: true');
    // `eas build:list … --limit 1` is how the full suite resolves "latest". If that ever appears
    // here, this gate could certify a build nobody selected — and the EAS fingerprint cannot tell
    // iOS builds apart, because it hashes the native layer and prior builds differed only in JS.
    expect(workflow).not.toContain('build:list');
    expect(workflow).not.toContain('--limit 1');
  });

  it('it verifies the artifact is a simulator build before installing it', () => {
    expect(workflow).toContain('isForIosSimulator');
  });

  it('it proves the NATIVE registration from Info.plist, not from app.json', () => {
    // Reading app.json here would prove nothing about the built artifact. plutil is used rather
    // than string-scanning because scanning a binary plist is precisely the mistake that produced
    // the false "exactly one scheme" claim corrected in Phase 7C.
    expect(workflow).toContain('CFBundleURLTypes.0.CFBundleURLSchemes');
    expect(workflow).toContain('plutil');
    expect(workflow).toContain('index("kwikserve")');
    expect(workflow).toContain('index("quickserve")');
    expect(workflow).toContain('.[0] == "kwikserve"');
  });

  it('it runs the focused runner and exports DEVICE_ID for the documented fallback', () => {
    expect(workflow).toContain('bash qa/native/ios-item-m-scheme.sh');
    expect(workflow).toContain('DEVICE_ID=$DEVICE_ID');
  });

  it('it does not swallow failures', () => {
    expect(workflow).not.toContain('continue-on-error');
    expect(workflow).not.toContain('|| true\n      - name');
  });
});

describe('Item M — the generated bundle-ID scheme is deliberately NOT covered', () => {
  it('no flow tests ke.co.hiredcorp.kwikserve:// as an entry point', () => {
    // It is an Expo-generated alternate scheme, not one we authored, and the guard is
    // scheme-agnostic — it acts on the resolved route after expo-router parses the URL. Testing
    // it would add zero guard coverage while pinning third-party generated behaviour. It is
    // documented in Phase 7C instead, so nobody later repeats the Phase 7B §11.2 error of
    // believing only one scheme is registered.
    for (const f of [S1, S2, S3]) {
      expect(read(flow(f))).not.toContain('ke.co.hiredcorp.kwikserve://');
    }
  });
});
