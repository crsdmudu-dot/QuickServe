/**
 * ios-config.test.ts — static invariants over app.json (fs read, no device).
 */
import * as fs from 'fs';
import * as path from 'path';

const APP_JSON = path.resolve(__dirname, '../../app.json');
let expo: any;
let raw: string;

beforeAll(() => {
  raw = fs.readFileSync(APP_JSON, 'utf-8');
  expo = JSON.parse(raw).expo;
});

/** Finds a plugin's options object by plugin name (plugins are string | [name, opts]). */
function pluginOpts(name: string): any {
  const entry = (expo.plugins as any[]).find(
    (p) => p === name || (Array.isArray(p) && p[0] === name),
  );
  if (!entry) return undefined;
  return Array.isArray(entry) ? entry[1] : {};
}

describe('iOS splash', () => {
  test('splash screen has an iOS-visible image (not only a background color)', () => {
    const opts = pluginOpts('expo-splash-screen');
    expect(opts).toBeDefined();
    // A top-level image applies to iOS (Android has its own override block).
    expect(typeof opts.image).toBe('string');
    expect(opts.image.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.resolve(__dirname, '../../', opts.image))).toBe(true);
  });
});

describe('iOS icons', () => {
  test('ios.icon is configured and the asset exists on disk', () => {
    expect(typeof expo.ios.icon).toBe('string');
    expect(fs.existsSync(path.resolve(__dirname, '../../', expo.ios.icon))).toBe(true);
  });
});

describe('iOS identity', () => {
  test('bundle identifier exists', () => {
    // Permanent iOS bundle id (Hired Corp Ltd, hiredcorp.co.ke), migrated in Phase 6E from
    // ke.co.hiredcorp.quickserve. The Apple App ID was registered in Phase 6B.2 with Push
    // Notifications + Associated Domains. Matches the Android package string by design —
    // Apple App IDs and Android application IDs are separate namespaces.
    expect(expo.ios.bundleIdentifier).toBe('ke.co.hiredcorp.kwikserve');
  });
  test('old iOS bundle ke.co.hiredcorp.quickserve is no longer used', () => {
    expect(expo.ios.bundleIdentifier).not.toBe('ke.co.hiredcorp.quickserve');
  });
  test('build number exists', () => {
    expect(typeof expo.ios.buildNumber).toBe('string');
    expect(expo.ios.buildNumber.length).toBeGreaterThan(0);
  });
  test('orientation remains portrait', () => {
    expect(expo.orientation).toBe('portrait');
  });
  // Item M (Phase 7B §11): legacy QuickServe and KwikServe both register `quickserve`, and iOS
  // resolves a contested scheme silently with no chooser — so `quickserve://` could not reach
  // KwikServe on a device holding both apps, and J-customer could not be executed there.
  //
  // `kwikserve` is the uncontested address that fixes that. `quickserve` is RETAINED for backward
  // compatibility with any link already distributed, so this does NOT eliminate the collision:
  // `quickserve://` stays ambiguous wherever both apps are installed. Dropping it is a later step,
  // gated on retiring the legacy app.
  //
  // Order is load-bearing: Expo treats the first entry as the default for `Linking.createURL`.
  // Nothing calls that today, so the effect is currently latent — which is exactly why it needs a
  // guard rather than a comment.
  test('registers kwikserve first and retains quickserve for compatibility', () => {
    expect(expo.scheme).toEqual(['kwikserve', 'quickserve']);
  });
});

describe('permission strings present', () => {
  test('photos usage string present and non-empty', () => {
    expect(pluginOpts('expo-image-picker').photosPermission.length).toBeGreaterThan(0);
  });
  test('location when-in-use usage string present and non-empty', () => {
    expect(pluginOpts('expo-location').locationWhenInUsePermission.length).toBeGreaterThan(0);
  });
});

describe('no camera permission introduced', () => {
  test('app.json declares no camera usage/permission', () => {
    expect(raw).not.toContain('NSCameraUsageDescription');
    expect(raw).not.toContain('cameraPermission');
    expect(raw).not.toContain('expo-camera');
  });
});

describe('associated domains scaffold', () => {
  test('inert placeholder applinks entry present', () => {
    expect(Array.isArray(expo.ios.associatedDomains)).toBe(true);
    const has = expo.ios.associatedDomains.some(
      (d: string) => d.startsWith('applinks:') && d.includes('REPLACE_ME'),
    );
    expect(has).toBe(true);
  });
});
