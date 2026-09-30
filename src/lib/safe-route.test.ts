// safe-route.test.ts — only plain in-app paths may be followed from a notification (S11-1).
import { safeInternalRoute } from '@/lib/safe-route';

describe('safeInternalRoute', () => {
  it.each(['/booking/123', '/provider/job/abc', '/wallet', '/booking/review', '/operations/op1?tab=notes', '/'])(
    'accepts the in-app path %s',
    (route) => {
      expect(safeInternalRoute(route)).toBe(route);
    },
  );

  it.each([
    ['an https link', 'https://evil.example/login'],
    ['an http link', 'http://evil.example'],
    ['a scheme-relative link', '//evil.example/path'],
    ['a backslash trick', '/\\evil.example'],
    ['a mail link', 'mailto:someone@evil.example'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a phone link', 'tel:+254700000000'],
    ['an app-scheme link', 'kwikserve://booking/1'],
    ['a relative path', 'booking/123'],
    ['a leading space', ' /booking/1'],
    ['a line break', '/booking/1\nhttps://evil.example'],
    ['a tab', '/booking/1\t'],
    ['a control character', '/booking/\u0000'],
    ['an empty string', ''],
    ['an over-long path', `/${'a'.repeat(512)}`],
  ])('refuses %s', (_label, route) => {
    expect(safeInternalRoute(route)).toBeNull();
  });

  it.each([null, undefined, 42, {}, ['/booking/1']])('refuses a non-string value (%p)', (value) => {
    expect(safeInternalRoute(value)).toBeNull();
  });
});
