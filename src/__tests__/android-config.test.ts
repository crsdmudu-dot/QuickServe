/**
 * android-config.test.ts — static invariants over app.json for the Android
 * identity migration (Phase 3B: com.quickserve.app -> ke.co.hiredcorp.kwikserve).
 * Pure fs read, no device. Also cross-checks that identifiers we intentionally
 * did NOT touch in this phase remain exactly as certified.
 */
import * as fs from 'fs';
import * as path from 'path';

const APP_JSON = path.resolve(__dirname, '../../app.json');
let expo: any;

beforeAll(() => {
  expo = JSON.parse(fs.readFileSync(APP_JSON, 'utf-8')).expo;
});

describe('Android identity (Phase 3B migration)', () => {
  test('android.package is the permanent Hired Corp KwikServe package', () => {
    expect(expo.android.package).toBe('ke.co.hiredcorp.kwikserve');
  });
  test('android.package is a syntactically valid applicationId', () => {
    // Java-package rules: >=2 dot segments, each starts with a lowercase letter,
    // then lowercase alphanumerics/underscore only.
    expect(expo.android.package).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
  });
  test('android.versionCode is present', () => {
    expect(typeof expo.android.versionCode).toBe('number');
  });
  test('old package com.quickserve.app is no longer used', () => {
    expect(expo.android.package).not.toBe('com.quickserve.app');
  });
});

describe('identifiers cross-checked against the Android package', () => {
  test('public app name remains KwikServe', () => {
    expect(expo.name).toBe('KwikServe');
  });
  test('iOS bundle identifier is the migrated KwikServe identity (Phase 6E)', () => {
    expect(expo.ios.bundleIdentifier).toBe('ke.co.hiredcorp.kwikserve');
  });
  // Item M remediation. This test previously pinned the scheme as deliberately UNCHANGED; that
  // deferral ended when Phase 7B proved the shared `quickserve` scheme was unreachable on a device
  // holding both apps. `kwikserve` is the new uncontested address; `quickserve` is retained so
  // already-distributed links keep working, which means the collision is SIDESTEPPED, not removed.
  //
  // Asserted three ways on purpose: the array pins the exact contract, and the membership and
  // ordering checks make a failure say WHICH property broke rather than just dumping a diff.
  test('registers kwikserve first and retains quickserve for compatibility', () => {
    expect(expo.scheme).toEqual(['kwikserve', 'quickserve']);
    expect(expo.scheme).toContain('kwikserve');
    expect(expo.scheme).toContain('quickserve');
    expect(expo.scheme[0]).toBe('kwikserve');
  });
  test('EAS projectId is unchanged', () => {
    expect(expo.extra.eas.projectId).toBe('587f8663-a722-4882-ab56-9007413003ee');
  });
  test('Expo owner is unchanged', () => {
    expect(expo.owner).toBe('dalmarmudu');
  });
});
