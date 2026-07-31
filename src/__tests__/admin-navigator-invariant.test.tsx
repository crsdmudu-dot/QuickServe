/**
 * Phase 3D regression — the (admin-web) route guard must preserve the native navigator
 * invariant: once the navigator (<Slot/>) is mounted for a protected route it STAYS
 * mounted; authorization state is expressed by overlays, never by swapping the navigator
 * subtree for a non-navigator element.
 *
 * On the Phase 3B/3C native builds the guard returned a bare <SafeAreaView> (no <Slot/>)
 * for its Loading and "Not authorized" branches during the transient "session set, role
 * not yet resolved" window; that unmount/replace churned the React-Navigation native
 * stack → "Maximum update depth exceeded". These tests assert the invariant directly, so
 * they fail on the pre-fix guard (no navigator during loading / non-admin) and pass on the
 * fixed guard.
 *
 * The native render loop itself is renderer-specific (react-test-renderer/web reconcile the
 * transient harmlessly), so it is verified on-device in Phase 3D; here we lock the
 * architectural invariant + the security behaviour it guarantees.
 */
import { render, screen } from '@testing-library/react-native';

let mockGuard: { loading: boolean; session: unknown; isAdmin: boolean } = {
  loading: false,
  session: null,
  isAdmin: false,
};
let mockSegments: string[] = ['(admin-web)'];
const mockSignOut = jest.fn();
const mockRedirects: string[] = [];
let mockSlotMountCount = 0;

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    useSegments: () => mockSegments,
    // The navigator. A mount counter lets us prove it is never destroyed/recreated across
    // auth-state transitions (the invariant).
    Slot: () => {
      React.useEffect(() => {
        mockSlotMountCount++;
        return () => {};
      }, []);
      return React.createElement(View, { testID: 'admin-navigator' });
    },
    Redirect: ({ href }: { href: string }) => {
      mockRedirects.push(String(href));
      return null;
    },
  };
});

jest.mock('@/hooks/use-admin-guard', () => ({ useAdminGuard: () => mockGuard }));
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));
// Focus on the guard: render AdminShell as a light marker wrapper.
jest.mock('@/components/admin-web/admin-shell', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { AdminShell: ({ children }: { children: unknown }) => React.createElement(View, { testID: 'admin-shell' }, children) };
});

import AdminWebLayout from '@/app/(admin-web)/_layout';

const SESSION = { user: { id: 'admin-1', email: 'a@qs.test' } };

beforeEach(() => {
  mockRedirects.length = 0;
  mockSignOut.mockClear();
  mockSegments = ['(admin-web)'];
  mockSlotMountCount = 0;
});

// 1. Anonymous → login only.
test('anonymous (resolved) on a protected route → redirect to login; no navigator, no admin UI', () => {
  mockGuard = { loading: false, session: null, isAdmin: false };
  render(<AdminWebLayout />);
  expect(mockRedirects).toContain('/(admin-web)/login');
  expect(screen.queryByTestId('admin-navigator')).toBeNull();
  expect(screen.queryByTestId('admin-shell')).toBeNull();
});

test('the login route always renders the navigator (public), no redirect', () => {
  mockSegments = ['(admin-web)', 'login'];
  mockGuard = { loading: false, session: null, isAdmin: false };
  render(<AdminWebLayout />);
  expect(screen.getByTestId('admin-navigator')).toBeTruthy();
  expect(mockRedirects).toHaveLength(0);
});

// 4. Role resolving → navigator mounted, loading overlay, admin UI never visible.
test('role resolving → navigator mounted, Loading overlay shown, no "Not authorized", no redirect', () => {
  mockGuard = { loading: true, session: SESSION, isAdmin: false };
  render(<AdminWebLayout />);
  expect(screen.getByTestId('admin-navigator')).toBeTruthy(); // navigator stays mounted
  expect(screen.getByText('Loading…')).toBeTruthy(); // opaque overlay obscures protected UI
  expect(screen.queryByText(/not authorized/i)).toBeNull();
  expect(mockRedirects).toHaveLength(0);
});

// 3. Non-admin → never receives admin UI (navigator mounted but obscured).
test('authenticated non-admin → navigator mounted, "Not authorized" overlay, sign out available', () => {
  mockGuard = { loading: false, session: SESSION, isAdmin: false };
  render(<AdminWebLayout />);
  expect(screen.getByTestId('admin-navigator')).toBeTruthy(); // invariant: still mounted
  expect(screen.getByText(/not authorized/i)).toBeTruthy();
  expect(screen.getByText(/sign out/i)).toBeTruthy();
  expect(screen.queryByText('Loading…')).toBeNull();
});

// 2. Admin login → dashboard.
test('authenticated admin → dashboard (navigator + AdminShell), no overlay', () => {
  mockGuard = { loading: false, session: SESSION, isAdmin: true };
  render(<AdminWebLayout />);
  expect(screen.getByTestId('admin-navigator')).toBeTruthy();
  expect(screen.getByTestId('admin-shell')).toBeTruthy();
  expect(screen.queryByText('Loading…')).toBeNull();
  expect(screen.queryByText(/not authorized/i)).toBeNull();
});

// 6/7. INVARIANT: the navigator is mounted ONCE and never destroyed across auth-state
// transitions within the session'd routes (loading → admin → non-admin → admin).
test('the navigator is never unmounted/recreated across auth-state transitions', () => {
  mockGuard = { loading: true, session: SESSION, isAdmin: false };
  const { rerender } = render(<AdminWebLayout />);
  expect(screen.getByTestId('admin-navigator')).toBeTruthy();

  mockGuard = { loading: false, session: SESSION, isAdmin: true };
  rerender(<AdminWebLayout />);
  expect(screen.getByTestId('admin-navigator')).toBeTruthy();

  mockGuard = { loading: false, session: SESSION, isAdmin: false };
  rerender(<AdminWebLayout />);
  expect(screen.getByTestId('admin-navigator')).toBeTruthy();

  mockGuard = { loading: false, session: SESSION, isAdmin: true };
  rerender(<AdminWebLayout />);
  expect(screen.getByTestId('admin-navigator')).toBeTruthy();

  // Mounted exactly once → the navigator subtree was preserved, never swapped.
  expect(mockSlotMountCount).toBe(1);
});

// 5. Logout → returns to login.
test('logout (session cleared, resolved) → redirect to login', () => {
  mockGuard = { loading: false, session: null, isAdmin: false };
  render(<AdminWebLayout />);
  expect(mockRedirects).toContain('/(admin-web)/login');
});
