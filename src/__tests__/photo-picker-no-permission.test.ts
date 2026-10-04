/**
 * photo-picker-no-permission.test.ts — no app code asks for photo-library access (C-124-7).
 *
 * Every photo picker in the app opens the system picker, which runs outside the app and hands
 * back only the photo the user picks, so no permission is needed. Apple 5.1.1(iii) asks apps to
 * use the out-of-process picker rather than request full access to Photos. Static scan of the
 * app source (tests excluded); no device.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });
}

const files = sourceFiles(SRC);

describe('photo pickers', () => {
  test('the scan reads the app source, including every picker call site', () => {
    const pickers = files.filter((f) => fs.readFileSync(f, 'utf8').includes('launchImageLibraryAsync'));
    const names = pickers.map((f) => path.relative(SRC, f).split(path.sep).join('/')).sort();
    expect(names).toEqual([
      'app/booking/notes.tsx',
      'app/booking/service-details.tsx',
      'components/ui/photo-upload-button.tsx',
    ]);
  });

  test('no source file requests or reads the photo-library permission', () => {
    const offenders = files.filter((f) =>
      /\b(request|get)MediaLibraryPermissionsAsync\b|useMediaLibraryPermissions/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
