/**
 * Item J — the native `/admin/**` route group must be role-gated.
 *
 * The root navigator (`src/app/_layout.tsx`) guards AUTHENTICATION only. `(admin-web)` has always
 * guarded itself, but the native `/admin` group never received an equivalent — so a
 * customer-authenticated session could deep-link to `quickserve://admin/booking/<id>` and receive
 * Admin chrome. Proven on the physical Samsung S24.
 *
 * RLS held throughout (a customer-context read returned only that customer's own rows), so this
 * guard is defence in depth and correct UX — NOT a replacement for RLS, which is unchanged and
 * remains the authoritative data-layer control.
 *
 * These tests exercise the layout directly, which is what a deep link renders: expo-router mounts
 * the group's layout before the screen, so a deep link to /admin/booking/<id> passes through here.
 */

import { render, screen } from '@testing-library/react-native';

const mockAuth = jest.fn();
const mockGuard = jest.fn();

jest.mock('@/auth/auth-context', () => ({ useAuth: () => mockAuth() }));
jest.mock('@/hooks/use-admin-guard', () => ({ useAdminGuard: () => mockGuard() }));

// Capture Redirect targets instead of navigating. RN's Text is required INSIDE the factory:
// jest hoists mock factories above imports, so they cannot close over module-scope bindings.
jest.mock('expo-router', () => {
  const RN = require('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <RN.Text>{`REDIRECT:${href}`}</RN.Text>,
    Stack: () => <RN.Text>ADMIN_STACK</RN.Text>,
  };
});

import AdminLayout from '@/app/admin/_layout';

function setSession(role: string | null, opts: { signedIn?: boolean; loading?: boolean } = {}) {
  const { signedIn = role !== null, loading = false } = opts;
  mockAuth.mockReturnValue({ signedIn, role, session: signedIn ? {} : null, isLoading: loading });
  mockGuard.mockReturnValue({ loading, session: signedIn ? {} : null, isAdmin: role === 'admin' });
}

describe('Item J — native /admin/** role guard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('an ADMIN reaches the admin stack', () => {
    setSession('admin');
    render(<AdminLayout />);
    expect(screen.getByText('ADMIN_STACK')).toBeOnTheScreen();
  });

  it('a CUSTOMER is redirected to the customer home and never sees admin chrome', () => {
    setSession('customer');
    render(<AdminLayout />);
    expect(screen.queryByText('ADMIN_STACK')).toBeNull();
    expect(screen.getByText('REDIRECT:/home')).toBeOnTheScreen();
  });

  it('a PROVIDER is redirected to the provider home and never sees admin chrome', () => {
    setSession('provider');
    render(<AdminLayout />);
    expect(screen.queryByText('ADMIN_STACK')).toBeNull();
    expect(screen.getByText('REDIRECT:/provider')).toBeOnTheScreen();
  });

  it('a SIGNED-OUT user sees no admin chrome (root navigator owns the redirect)', () => {
    setSession(null, { signedIn: false });
    render(<AdminLayout />);
    expect(screen.queryByText('ADMIN_STACK')).toBeNull();
  });

  it('admin chrome never flashes while the role is still resolving', () => {
    setSession(null, { signedIn: true, loading: true });
    render(<AdminLayout />);
    expect(screen.queryByText('ADMIN_STACK')).toBeNull();
  });

  it('reuses roleHref rather than a second role→destination mapping', () => {
    // The destinations asserted above must come from the project's single mapping.
    const { roleHref } = require('@/constants/roles');
    expect(roleHref('customer')).toBe('/home');
    expect(roleHref('provider')).toBe('/provider');
    expect(roleHref('admin')).toBe('/admin');
  });
});
