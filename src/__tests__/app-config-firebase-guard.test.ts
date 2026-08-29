/**
 * app-config-firebase-guard.test.ts — the production Firebase fail-loud guard.
 *
 * Why this guard exists: a production build that resolves no google-services.json
 * still succeeds, installs and launches looking healthy, while push notifications
 * are dead — getExpoPushTokenAsync fails and src/lib/push.ts swallows it by design
 * (`catch { return null }`, correct for Expo Go). Nothing surfaces the problem until
 * someone manually tests push on a device after release. The same is true of a
 * structurally valid file for the WRONG Firebase project.
 *
 * app.config.js therefore validates on the `production` EAS build profile only, and
 * stays tolerant everywhere else — web export, local dev and any machine without the
 * file must keep working exactly as before.
 *
 * Fixtures here are minimal SYNTHETIC JSON. The real google-services.json is never
 * read by these tests: it is git-ignored, and its API keys and OAuth client ids have
 * no place in a test fixture.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CONFIG = path.resolve(__dirname, '../../app.config.js');
const PROJECT_ID = 'quickserve-1bfa9';
const PACKAGE = 'ke.co.hiredcorp.kwikserve';

/** Minimal synthetic google-services.json — shape only, no credentials. */
function fixture(projectId: string, packageNames: string[]): string {
  return JSON.stringify({
    project_info: { project_id: projectId, project_number: '000000000000' },
    client: packageNames.map((p) => ({
      client_info: { android_client_info: { package_name: p } },
    })),
  });
}

let tmpDir: string;
const written: string[] = [];

/** Write a fixture to a temp path OUTSIDE the repo and return that path. */
function writeFixture(name: string, contents: string): string {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, contents);
  written.push(p);
  return p;
}

/**
 * Evaluate app.config.js with a controlled environment.
 *
 * The module is re-required each time so `process.env` is read fresh, and the base
 * config is a throwaway object — this never touches app.json or the real config.
 */
function evaluate(env: Record<string, string | undefined>): any {
  const prevProfile = process.env.EAS_BUILD_PROFILE;
  const prevGs = process.env.GOOGLE_SERVICES_JSON;
  const prevCwd = process.cwd();
  try {
    // cwd is moved off the repo root so the './google-services.json' fallback cannot
    // silently satisfy a case that is meant to resolve nothing.
    process.chdir(tmpDir);
    if (env.EAS_BUILD_PROFILE === undefined) delete process.env.EAS_BUILD_PROFILE;
    else process.env.EAS_BUILD_PROFILE = env.EAS_BUILD_PROFILE;
    if (env.GOOGLE_SERVICES_JSON === undefined) delete process.env.GOOGLE_SERVICES_JSON;
    else process.env.GOOGLE_SERVICES_JSON = env.GOOGLE_SERVICES_JSON;

    delete require.cache[require.resolve(CONFIG)];
    const mod = require(CONFIG);
    return mod({ config: { android: { package: PACKAGE } } });
  } finally {
    process.chdir(prevCwd);
    if (prevProfile === undefined) delete process.env.EAS_BUILD_PROFILE;
    else process.env.EAS_BUILD_PROFILE = prevProfile;
    if (prevGs === undefined) delete process.env.GOOGLE_SERVICES_JSON;
    else process.env.GOOGLE_SERVICES_JSON = prevGs;
  }
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwikserve-cfg-'));
});

afterAll(() => {
  written.forEach((p) => fs.existsSync(p) && fs.unlinkSync(p));
  if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
});

describe('production profile — the guard fails loudly', () => {
  it('FAILS when no Firebase config resolves at all', () => {
    expect(() => evaluate({ EAS_BUILD_PROFILE: 'production' })).toThrow(
      /production Firebase config missing/,
    );
  });

  it('FAILS when GOOGLE_SERVICES_JSON is set but the file does not exist', () => {
    // The env string is non-empty — the guard must check the FILE, not the string.
    const missing = path.join(tmpDir, 'does-not-exist.json');
    expect(() =>
      evaluate({ EAS_BUILD_PROFILE: 'production', GOOGLE_SERVICES_JSON: missing }),
    ).toThrow(/production Firebase config missing/);
  });

  it('FAILS on unreadable/invalid JSON', () => {
    const bad = writeFixture('bad.json', '{ not json');
    expect(() =>
      evaluate({ EAS_BUILD_PROFILE: 'production', GOOGLE_SERVICES_JSON: bad }),
    ).toThrow(/unreadable\/invalid JSON/);
  });

  it('FAILS on a wrong Firebase project', () => {
    const wrong = writeFixture('wrong-project.json', fixture('some-other-project', [PACKAGE]));
    expect(() =>
      evaluate({ EAS_BUILD_PROFILE: 'production', GOOGLE_SERVICES_JSON: wrong }),
    ).toThrow(/Firebase project mismatch/);
  });

  it('FAILS when the production Android package has no client', () => {
    const wrong = writeFixture('wrong-package.json', fixture(PROJECT_ID, ['com.quickserve.app']));
    expect(() =>
      evaluate({ EAS_BUILD_PROFILE: 'production', GOOGLE_SERVICES_JSON: wrong }),
    ).toThrow(/Firebase Android package mismatch/);
  });

  it('FAILS when the client list is missing entirely', () => {
    const empty = writeFixture('no-clients.json', JSON.stringify({ project_info: { project_id: PROJECT_ID } }));
    expect(() =>
      evaluate({ EAS_BUILD_PROFILE: 'production', GOOGLE_SERVICES_JSON: empty }),
    ).toThrow(/Firebase Android package mismatch/);
  });

  it('SUCCEEDS and sets googleServicesFile for the approved project + package', () => {
    const good = writeFixture('good.json', fixture(PROJECT_ID, ['com.quickserve.app', PACKAGE]));
    const out = evaluate({ EAS_BUILD_PROFILE: 'production', GOOGLE_SERVICES_JSON: good });
    expect(out.android.googleServicesFile).toBe(good);
    expect(out.android.package).toBe(PACKAGE);
  });

  it('never leaks file contents in an error message', () => {
    // A wrong-project fixture carries a recognisable marker; the thrown message must
    // classify the problem without echoing anything read out of the file.
    const marked = writeFixture(
      'marked.json',
      JSON.stringify({
        project_info: { project_id: 'other', api_key_marker: 'SHOULD-NEVER-APPEAR' },
        client: [],
      }),
    );
    try {
      evaluate({ EAS_BUILD_PROFILE: 'production', GOOGLE_SERVICES_JSON: marked });
      throw new Error('expected the guard to throw');
    } catch (e: any) {
      expect(e.message).not.toContain('SHOULD-NEVER-APPEAR');
      expect(e.message).toMatch(/Firebase project mismatch/);
    }
  });
});

describe('non-production profiles — tolerant behaviour is preserved', () => {
  it('no Firebase config + NO profile → succeeds, googleServicesFile unset', () => {
    const out = evaluate({});
    expect(out.android.googleServicesFile).toBeUndefined();
    expect(out.android.package).toBe(PACKAGE);
  });

  it('no Firebase config + preview → succeeds, googleServicesFile unset', () => {
    const out = evaluate({ EAS_BUILD_PROFILE: 'preview' });
    expect(out.android.googleServicesFile).toBeUndefined();
  });

  it('no Firebase config + development → succeeds, googleServicesFile unset', () => {
    const out = evaluate({ EAS_BUILD_PROFILE: 'development' });
    expect(out.android.googleServicesFile).toBeUndefined();
  });

  it('preview does NOT validate project/package — a wrong-project file is still accepted', () => {
    // Preview must not gain production's strictness: QA has historically carried a
    // superset config, and tightening it here would be scope creep, not safety.
    const wrong = writeFixture('preview-wrong.json', fixture('some-other-project', ['x.y.z']));
    const out = evaluate({ EAS_BUILD_PROFILE: 'preview', GOOGLE_SERVICES_JSON: wrong });
    expect(out.android.googleServicesFile).toBe(wrong);
  });
});
