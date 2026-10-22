/**
 * app-icon-config.test.ts — the KwikServe brand icon, adaptive icon, splash and favicon in app.json.
 *
 * Static checks only (fs read, no device). The artwork is the owner-approved Option 2 export
 * (kwikserve-updates/85b-app-icon-option2-exports); the digests below pin the exact files, so a
 * changed or re-exported image fails here until it is approved again.
 */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const expo = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf-8')).expo;

/** Brand green, the bottom stop of the icon gradient. */
const BRAND_GREEN = '#00875A';

/** sha256 of each approved file (85b SHA256SUMS.txt; the favicon from 86 make-favicon.mjs). */
const APPROVED: Record<string, string> = {
  'kwikserve-icon-1024.png': '0a3002babce9892d2b0fec7ed67b6cfcc27279369aaf4041b82833ecbea3e701',
  'kwikserve-adaptive-foreground.png': 'b0157e0e0b09a26913759d32d77eb8a89a7fb930f41a5e4a2e725d33aca1a11f',
  'kwikserve-adaptive-background.png': '27a5616b476b262c03acb7ef1dc1f73c594d6c1fc84cbd657a604023cbc1b76c',
  'kwikserve-adaptive-monochrome.png': 'b0157e0e0b09a26913759d32d77eb8a89a7fb930f41a5e4a2e725d33aca1a11f',
  'kwikserve-splash-mark.png': 'b0157e0e0b09a26913759d32d77eb8a89a7fb930f41a5e4a2e725d33aca1a11f',
  'kwikserve-favicon-48.png': 'd722fafc0c6c26c407c167f87d2965007283502d9e66980f6a8f3292dd07be35',
};

/** Reads width, height and colour type from a PNG header (colour type 2 = RGB, 6 = RGBA). */
function pngHeader(file: string) {
  const b = fs.readFileSync(path.join(ROOT, file));
  expect(b.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(b.toString('ascii', 12, 16)).toBe('IHDR');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colourType: b[25] };
}

function sha256(file: string) {
  return createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
}

function splashOpts(): any {
  const entry = (expo.plugins as any[]).find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen');
  return entry[1];
}

describe('app icon (iOS, App Store and the Expo default)', () => {
  test('the top-level icon and ios.icon are the same brand PNG, not the template', () => {
    expect(expo.icon).toBe('./assets/images/kwikserve-icon-1024.png');
    expect(expo.ios.icon).toBe(expo.icon);
    expect(JSON.stringify(expo)).not.toContain('expo.icon');
  });

  test('it is 1024 x 1024 with no alpha channel (Apple: no transparency)', () => {
    expect(pngHeader(expo.icon)).toEqual({ width: 1024, height: 1024, colourType: 2 });
  });
});

describe('Android adaptive icon', () => {
  test('uses the brand layers and the brand background colour', () => {
    expect(expo.android.adaptiveIcon).toEqual({
      backgroundColor: BRAND_GREEN,
      foregroundImage: './assets/images/kwikserve-adaptive-foreground.png',
      backgroundImage: './assets/images/kwikserve-adaptive-background.png',
      monochromeImage: './assets/images/kwikserve-adaptive-monochrome.png',
    });
  });

  test('the layers share one size; the foreground and monochrome are transparent, the background is not', () => {
    const { foregroundImage, backgroundImage, monochromeImage } = expo.android.adaptiveIcon;
    expect(pngHeader(foregroundImage)).toEqual({ width: 1024, height: 1024, colourType: 6 });
    expect(pngHeader(monochromeImage)).toEqual({ width: 1024, height: 1024, colourType: 6 });
    expect(pngHeader(backgroundImage)).toEqual({ width: 1024, height: 1024, colourType: 2 });
  });
});

describe('splash screen', () => {
  test('shows the white mark on brand green', () => {
    const opts = splashOpts();
    expect(opts.backgroundColor).toBe(BRAND_GREEN);
    expect(opts.image).toBe('./assets/images/kwikserve-splash-mark.png');
    expect(opts.imageWidth).toBe(200);
    expect(pngHeader(opts.image)).toEqual({ width: 1024, height: 1024, colourType: 6 });
  });
});

describe('web favicon', () => {
  test('is the 48 x 48 brand favicon', () => {
    expect(expo.web.favicon).toBe('./assets/images/kwikserve-favicon-48.png');
    expect(pngHeader(expo.web.favicon)).toEqual({ width: 48, height: 48, colourType: 2 });
  });
});

describe('approved artwork', () => {
  test.each(Object.entries(APPROVED))('%s matches the approved export', (name, digest) => {
    expect(sha256(`assets/images/${name}`)).toBe(digest);
  });

  test('every brand image app.json names is one of the approved files', () => {
    const named = [
      expo.icon,
      expo.ios.icon,
      expo.android.adaptiveIcon.foregroundImage,
      expo.android.adaptiveIcon.backgroundImage,
      expo.android.adaptiveIcon.monochromeImage,
      splashOpts().image,
      expo.web.favicon,
    ].map((p: string) => path.basename(p));
    for (const n of named) expect(Object.keys(APPROVED)).toContain(n);
  });
});

/**
 * C-128-5 (PM stage 128, F-128-6(a)): the Expo template's image files stay on disk until a later
 * clean-up, so no app.json value may name one, in any slot (a future platform override included).
 */
describe('no template image in app.json', () => {
  /** The names PM stage 128 C-128-5 lists, searched in the whole expo config. */
  const C_128_5 = ['/icon.png"', 'android-icon-', 'splash-icon', 'favicon.png', 'expo.icon'];

  /** Every image the Expo template put in assets/ (all from the initial commit, 7c0f1ed). */
  const TEMPLATE_IMAGES = [
    'assets/expo.icon',
    'assets/images/android-icon-background.png',
    'assets/images/android-icon-foreground.png',
    'assets/images/android-icon-monochrome.png',
    'assets/images/expo-badge-white.png',
    'assets/images/expo-badge.png',
    'assets/images/expo-logo.png',
    'assets/images/favicon.png',
    'assets/images/icon.png',
    'assets/images/logo-glow.png',
    'assets/images/react-logo.png',
    'assets/images/react-logo@2x.png',
    'assets/images/react-logo@3x.png',
    'assets/images/splash-icon.png',
    'assets/images/tabIcons/',
    'assets/images/tutorial-web.png',
  ];

  /** Every string value anywhere in the expo config. */
  function allStrings(value: unknown): string[] {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(allStrings);
    if (value && typeof value === 'object') return Object.values(value).flatMap(allStrings);
    return [];
  }

  test('the whole config contains none of the C-128-5 template names', () => {
    const text = JSON.stringify(expo);
    expect(C_128_5.filter((name) => text.includes(name))).toEqual([]);
  });

  test('no value in the config names a template image', () => {
    const values = allStrings(expo).map((s) => s.replace(/^\.\//, ''));
    const offenders = values.filter((v) => TEMPLATE_IMAGES.some((t) => v.startsWith(t)));
    expect(offenders).toEqual([]);
  });
});
