/**
 * ios-privacy-manifest-config.test.ts — the iOS privacy-manifest fix, variant V-NOFS (PM stage 125e §7).
 *
 * Static checks only (fs read, no device). The fix leaves the expo-file-system native code out of
 * the iOS app, so the shipped app contains no disk-space API and its final privacy manifests make
 * no DiskSpace, 0A2A.1 or 3B52.1 statement. These tests pin that config so a later merge cannot
 * silently drop it, and guard its one risk: if any code imports expo-file-system, the iOS app
 * fails there at run time while Jest and Android still pass.
 *
 * T1 package.json `expo` is exactly: build expo-image from source (SDWebImage ships with its own
 *    privacy manifest, ITMS-91061) and exclude expo-file-system from iOS autolinking.
 * T2 app.json hand-authors no DiskSpace entry and none of the DiskSpace or SDK-only reasons.
 * T3 no file under src/ or apps/ imports or requires expo-file-system or looks up its native module.
 * T4 expo-file-system is not a direct dependency; in package-lock.json only `expo` depends on it.
 *
 * At every Expo SDK upgrade, re-check T4 (a new dependent would need the native module on iOS).
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const THIS_FILE = path.resolve(__filename);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const appRaw = fs.readFileSync(path.join(ROOT, 'app.json'), 'utf-8');
const expo = JSON.parse(appRaw).expo;

/** The npm package whose native code V-NOFS leaves out of the iOS build. */
const FS_PACKAGE = 'expo-file-system';

describe('T1 package.json: iOS autolinking config', () => {
  test('expo is exactly buildFromSource expo-image and exclude expo-file-system', () => {
    expect(pkg.expo).toEqual({
      autolinking: { ios: { buildFromSource: ['expo-image'], exclude: [FS_PACKAGE] } },
    });
  });
});

describe('T2 app.json: no DiskSpace declaration', () => {
  test('ios.privacyManifests has no DiskSpace entry', () => {
    const apiTypes = expo.ios?.privacyManifests?.NSPrivacyAccessedAPITypes ?? [];
    const diskSpace = apiTypes.filter(
      (entry: { NSPrivacyAccessedAPIType?: string }) =>
        entry.NSPrivacyAccessedAPIType === 'NSPrivacyAccessedAPICategoryDiskSpace',
    );
    expect(diskSpace).toEqual([]);
    expect(appRaw).not.toContain('NSPrivacyAccessedAPICategoryDiskSpace');
  });

  test('no DiskSpace or SDK-only reason code appears anywhere in app.json', () => {
    // DiskSpace: E174.1, 85F4.1, 7D9E.1, B728.1. FileTimestamp: 0A2A.1 ("may only be declared by
    // third-party SDKs") and 3B52.1 (user-granted files; KwikServe does not read their timestamps).
    const reasons = ['E174.1', '85F4.1', '7D9E.1', 'B728.1', '0A2A.1', '3B52.1'];
    expect(reasons.filter((r) => appRaw.includes(r))).toEqual([]);
  });
});

describe('T3 no code uses expo-file-system', () => {
  const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);

  /** Every source file under dir, skipping node_modules. */
  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);
      return entry.isFile() && EXTENSIONS.has(path.extname(entry.name)) ? [full] : [];
    });
  }

  /**
   * True when the text names the package (import, require, dynamic import, jest.mock or any
   * subpath such as /legacy or /next) or looks up its native module directly.
   */
  function usesFileSystem(text: string): boolean {
    return (
      text.includes(FS_PACKAGE) ||
      text.includes('ExponentFileSystem') ||
      /require(Optional)?NativeModule\s*(<[^>]*>)?\s*\(\s*['"`]FileSystem['"`]/.test(text)
    );
  }

  test('the matcher catches each form it guards against (positive control)', () => {
    const samples = [
      "import * as FS from 'expo-file-system';",
      "import { File } from 'expo-file-system/next';",
      "const fs = require('expo-file-system/legacy');",
      "const fs = await import('expo-file-system');",
      "requireNativeModule('FileSystem')",
      'requireOptionalNativeModule<any>("ExponentFileSystem")',
      'NativeModules.ExponentFileSystem',
    ];
    expect(samples.filter((s) => !usesFileSystem(s))).toEqual([]);
    expect(usesFileSystem("import { Image } from 'expo-image';")).toBe(false);
  });

  test('no file under src/ or apps/ (this test excluded) uses expo-file-system', () => {
    const files = ['src', 'apps']
      .flatMap((dir) => sourceFiles(path.join(ROOT, dir)))
      .filter((file) => path.resolve(file) !== THIS_FILE);
    // Guard against a vacuous pass (wrong root or an empty walk).
    expect(files.length).toBeGreaterThan(100);
    const offenders = files
      .filter((file) => usesFileSystem(fs.readFileSync(file, 'utf-8')))
      .map((file) => path.relative(ROOT, file).split(path.sep).join('/'));
    expect(offenders).toEqual([]);
  });
});

describe('T4 dependency graph: only expo depends on expo-file-system', () => {
  test('package.json does not list expo-file-system directly', () => {
    const fields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
    expect(fields.filter((field) => pkg[field]?.[FS_PACKAGE] !== undefined)).toEqual([]);
  });

  test('in package-lock.json the only dependent (besides the root) is node_modules/expo', () => {
    const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf-8'));
    const packages: Record<string, Record<string, Record<string, string> | undefined>> = lock.packages;
    expect(Object.keys(packages).length).toBeGreaterThan(100);
    const fields = ['dependencies', 'peerDependencies', 'optionalDependencies'];
    const dependents = Object.entries(packages)
      .filter(([key, entry]) => key !== '' && fields.some((field) => entry[field]?.[FS_PACKAGE] !== undefined))
      .map(([key]) => key);
    expect(dependents).toEqual(['node_modules/expo']);
  });
});
