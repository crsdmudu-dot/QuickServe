/**
 * Phase 4E.2 regression — the root "/" dispatcher must NEVER render a blank/black frame.
 *
 * Physical-iPhone defect: on a logged-IN cold relaunch the timed splash overlay
 * (`AnimatedSplashOverlay`, a fixed ~1.4s animation) lifts BEFORE auth finishes, because
 * `isLoading` stays true until `AuthProvider.applySession()` completes its network profile
 * fetch. The old `index.tsx` returned a bare `null` while `isLoading`, so the lifting overlay
 * exposed a BLACK screen. Every Maestro flow launches with `clearState:true` (always
 * logged-OUT → no network fetch → instant resolve), so automation never hit this path.
 *
 * This test locks the fix at the unit level: while auth is loading, the dispatcher renders the
 * branded AppLoadingScreen (never null); once resolved it redirects by role / to /welcome.
 */
import { render, screen } from '@testing-library/react-native';

let mockAuth: { isLoading: boolean; signedIn: boolean; role: string | null } = {
  isLoading: true,
  signedIn: false,
  role: null,
};
const mockRedirects: string[] = [];

jest.mock('@/auth/auth-context', () => ({ useAuth: () => mockAuth }));

jest.mock('expo-router', () => {
  return {
    __esModule: true,
    Redirect: ({ href }: { href: string }) => {
      mockRedirects.push(String(href));
      return null;
    },
  };
});

import Index from '@/app/index';

beforeEach(() => {
  mockRedirects.length = 0;
});

test('while auth is loading it renders the branded loading screen, NOT a blank/null frame', () => {
  mockAuth = { isLoading: true, signedIn: false, role: null };
  render(<Index />);
  // The branded screen must be present (this is the black-screen fix)...
  expect(screen.getByTestId('app-loading-screen')).toBeTruthy();
  // ...and it must NOT redirect while auth is still resolving.
  expect(mockRedirects).toHaveLength(0);
});

test('a signed-in user with a resolved role is redirected to their role home (no loading frame)', () => {
  mockAuth = { isLoading: false, signedIn: true, role: 'customer' };
  render(<Index />);
  expect(screen.queryByTestId('app-loading-screen')).toBeNull();
  expect(mockRedirects).toContain('/home');
});

test('a resolved signed-out user is redirected to /welcome (no loading frame)', () => {
  mockAuth = { isLoading: false, signedIn: false, role: null };
  render(<Index />);
  expect(screen.queryByTestId('app-loading-screen')).toBeNull();
  expect(mockRedirects).toContain('/welcome');
});
