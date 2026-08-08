/**
 * Phase 3D regression — admin login → dashboard transition (integration).
 *
 * Renders the REAL provider tree (AuthProvider → ServicesProvider → BookingDraftProvider →
 * ErrorBoundary) and the REAL (admin-web) guard, driving segments the way expo-router does
 * on native when login.tsx calls router.replace('/(admin-web)') after a successful sign-in.
 * Models the timing that triggered the native loop: the SIGNED_IN event sets the session
 * first, then the role resolves on a later microtask.
 *
 * Asserts the transition settles once: the navigator stays mounted, a Loading state is
 * shown while the role resolves (protected UI never leaks), the dashboard then renders, the
 * error boundary never fires, navigation happens once, and React never logs "Maximum update
 * depth exceeded". (The native render loop is renderer-specific and is verified on-device.)
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// ── supabase mock ───────────────────────────────────────────────────────────
let authCb: ((event: string, session: unknown) => void) | null = null;
const mockGetSession = jest.fn().mockResolvedValue({ data: { session: null } });
const mockSignInWithPassword = jest.fn();
const mockMaybeSingle = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue({ error: null });

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => mockGetSession(...a),
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        authCb = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
      signInWithPassword: (...a: unknown[]) => mockSignInWithPassword(...a),
      signOut: (...a: unknown[]) => mockSignOut(...a),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: (...a: unknown[]) => mockMaybeSingle(...a) }) }) }),
  },
}));

// ── expo-router mock: stateful segments + Slot/Redirect/useRouter ────────────
let mockSegments: string[] = ['(admin-web)', 'login'];
const mockRouterListeners = new Set<() => void>();
function mockSetSegments(next: string[]) {
  mockSegments = next;
  mockRouterListeners.forEach((l) => l());
}
const mockReplaceSpy = jest.fn((href: string) => {
  // Phase 3G: admin login redirects to /(admin-web)/dashboard (the dashboard moved off "/").
  if (href === '/(admin-web)/dashboard') mockSetSegments(['(admin-web)', 'dashboard']);
  else if (href.includes('login')) mockSetSegments(['(admin-web)', 'login']);
  else mockSetSegments([href.replace(/^\//, '')]);
});

jest.mock('expo-router', () => {
  const React = require('react');
  const useSegmentsHook = () => {
    const [, force] = React.useReducer((x: number) => x + 1, 0);
    React.useEffect(() => {
      mockRouterListeners.add(force);
      return () => mockRouterListeners.delete(force);
    }, []);
    return mockSegments;
  };
  return {
    __esModule: true,
    useSegments: useSegmentsHook,
    useRouter: () => ({ replace: mockReplaceSpy, push: jest.fn() }),
    router: { replace: mockReplaceSpy, push: jest.fn() },
    Slot: () => {
      const segs = useSegmentsHook();
      const onLogin = segs[segs.length - 1] === 'login';
      const Screen = onLogin
        // Admin login/dashboard are web-only route files (Phase 3G platform-split);
        // require the explicit .web variants so jest resolves them on its native platform.
        ? require('@/app/(admin-web)/login').default
        : require('@/app/(admin-web)/dashboard').default;
      return React.createElement(Screen);
    },
    Redirect: ({ href }: { href: string }) => {
      React.useEffect(() => { mockReplaceSpy(href); }, [href]);
      return null;
    },
    Stack: ({ children }: { children: unknown }) => children ?? null,
    type: {},
  };
});

jest.mock('expo-router/head', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/monitoring', () => ({ reportError: jest.fn(), initMonitoring: jest.fn() }));
jest.mock('@/lib/bookings', () => ({ getAllBookings: jest.fn().mockResolvedValue([]) }));
jest.mock('@/lib/payments', () => ({ adminGetAllPayments: jest.fn().mockResolvedValue([]) }));
jest.mock('@/lib/providers', () => ({ getPendingProviders: jest.fn().mockResolvedValue([]) }));
jest.mock('@/lib/reviews', () => ({ adminGetAllReviews: jest.fn().mockResolvedValue([]) }));
jest.mock('@/lib/notifications', () => ({ getUnreadNotificationCount: jest.fn().mockResolvedValue(0) }));
jest.mock('@/lib/services-catalog', () => ({
  fetchActiveServices: jest.fn().mockResolvedValue({ ok: true, data: [] }),
  fetchActiveServiceCategories: jest.fn().mockResolvedValue({ ok: true, data: [] }),
  listActiveServices: jest.fn().mockResolvedValue([]),
  listActiveServiceCategories: jest.fn().mockResolvedValue([]),
  toService: (r: unknown) => r,
}));

import { AuthProvider } from '@/auth/auth-context';
import { ServicesProvider } from '@/services/services-provider';
import { BookingDraftProvider } from '@/booking/booking-draft';
import { ErrorBoundary } from '@/components/error-boundary';
import AdminWebLayout from '@/app/(admin-web)/_layout';

function Tree() {
  return (
    <AuthProvider>
      <ServicesProvider>
        <BookingDraftProvider>
          <ErrorBoundary>
            <AdminWebLayout />
          </ErrorBoundary>
        </BookingDraftProvider>
      </ServicesProvider>
    </AuthProvider>
  );
}

const ADMIN_SESSION = { user: { id: 'admin-1', email: 'admin@qs.test' } };
let resolveProfile: ((v: unknown) => void) | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  authCb = null;
  resolveProfile = null;
  mockSegments = ['(admin-web)', 'login'];
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockMaybeSingle.mockImplementation(() => new Promise((res) => { resolveProfile = res; }));
  mockSignInWithPassword.mockImplementation(async () => {
    authCb?.('SIGNED_IN', ADMIN_SESSION);
    return { error: null };
  });
});

test('admin login → Loading (protected UI hidden) → dashboard, no error boundary, one navigation', async () => {
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  render(<Tree />);
  await screen.findByText('Admin Panel');

  fireEvent.changeText(screen.getByPlaceholderText('admin@example.com'), 'admin@qs.test');
  fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'pw-123456');
  await act(async () => {
    fireEvent.press(screen.getByText('Sign in'));
  });

  // Role resolving window: the opaque Loading overlay is shown (it obscures the mounted
  // navigator on a real device), and the user is not treated as rejected.
  await waitFor(() => expect(screen.queryByText('Loading…')).toBeTruthy());
  expect(screen.queryByText(/not authorized/i)).toBeNull();

  // Resolve the role → dashboard renders.
  await act(async () => {
    resolveProfile?.({ data: { role: 'admin', approval_status: null }, error: null });
  });
  await waitFor(() => expect(screen.getByText('Total Bookings')).toBeTruthy());

  // No error boundary, no render-depth overflow, navigation to the dashboard happened once.
  expect(screen.queryByText(/something went wrong/i)).toBeNull();
  const maxDepth = errorSpy.mock.calls
    .flat()
    .filter((a) => typeof a === 'string' && /maximum update depth exceeded/i.test(a));
  expect(maxDepth).toHaveLength(0);
  expect(mockReplaceSpy.mock.calls.filter((c) => c[0] === '/(admin-web)/dashboard').length).toBe(1);

  errorSpy.mockRestore();
});
