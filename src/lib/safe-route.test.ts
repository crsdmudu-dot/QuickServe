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

  // R-1: a notification can never open the emailed-link screens (FX-AL, F3).
  it.each([
    '/auth',
    '/auth/',
    '/auth/confirm',
    '/auth/recovery',
    '/auth/confirm?x=1',
    '/auth/recovery?x=1',
    '/auth?x=1',
    '/auth#x',
    '/AUTH/confirm',
    '/%61uth/confirm',
    '/./auth/confirm',
    '/booking/../auth/confirm',
    '/(onboarding)/auth/recovery',
    // The first segment as written is "auth", even where ".." would move it away.
    '/auth/..',
    '/auth/confirm/../..',
    '/auth/recovery/../../?x=1',
    '/auth/%2e%2e/%2e%2e/confirm',
    // Other spellings a router may read as "auth".
    '/%41%55%54%48/confirm',
    '/auth%2Fconfirm',
    '/%2Fauth/confirm',
    '/x/../../auth/confirm',
    '/%2561uth/confirm',
    // Checked at every decoding layer: a router that decodes once sees "auth" first in these.
    '/x/../auth/%252e%252e',
    '/x/../auth/confirm/%252e%252e/%252e%252e',
    '/../auth/%252e%252e',
    '/%2e%2e/auth/%252e%252e',
    // Read as it is, before decoding: a URL parser resolves these to /auth/confirm or /auth/recovery.
    '/x%2Fy/../auth/confirm',
    '/x%2Fy/%2e%2e/auth/confirm',
    '/x%2Fy/.%2E/auth/recovery?token_hash=x',
    // Resolved like a URL first, then decoded: these become /auth/confirm and /auth.
    '/x%2Fy/../%61uth/confirm?token_hash=x',
    '/../%61uth/%2F/..',
  ])('refuses the emailed-link route %s', (route) => {
    expect(safeInternalRoute(route)).toBeNull();
  });

  it('refuses a path whose percent-encoding cannot be read (it might hide "auth")', () => {
    expect(safeInternalRoute('/%zz')).toBeNull();
  });

  it.each(['/auth%00/confirm', '/auth%20/confirm', '/%20auth/confirm', '/auth%5C/confirm'])(
    'refuses %s, which hides a space, backslash or control character behind its encoding',
    (route) => {
      expect(safeInternalRoute(route)).toBeNull();
    },
  );

  it.each(['/booking/./123', '/booking/123/..', '/booking/%2e%2e/123', '/booking/%252e/123', '/booking/.%2E'])(
    'refuses %s: no notification route has a "." or ".." segment, in any spelling',
    (route) => {
      expect(safeInternalRoute(route)).toBeNull();
    },
  );

  // R-2: the sample paths accepted before are still accepted, including ones that only start like "auth".
  it.each(['/booking/123', '/provider/job/abc', '/wallet', '/booking/review', '/operations/op1?tab=notes', '/', '/authors', '/booking/auth'])(
    'still accepts %s',
    (route) => {
      expect(safeInternalRoute(route)).toBe(route);
    },
  );
});
