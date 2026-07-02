/**
 * Tests for AdminSidebar
 *
 * Mocks:
 * - @/auth/auth-context → useAuth with a fake session + signOut spy
 * - expo-router → useSegments returns [] (no active route); router.push is a jest.fn()
 *
 * Covers:
 * - all nav item labels are rendered
 * - Sign out control is present
 * - pressing Sign out calls signOut()
 */

const mockSignOut = jest.fn();
const mockRouterPush = jest.fn();

jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({
    session: { user: { email: 'a@b.c' } },
    signOut: mockSignOut,
  }),
}));

jest.mock('expo-router', () => ({
  useSegments: () => [],
  router: { push: (...args: unknown[]) => mockRouterPush(...args) },
}));

import { render, screen, fireEvent } from '@testing-library/react-native';
import { AdminSidebar } from '@/components/admin-web/admin-sidebar';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AdminSidebar', () => {
  beforeEach(() => {
    mockSignOut.mockClear();
    mockRouterPush.mockClear();
  });

  it('renders all nav item labels', () => {
    render(<AdminSidebar />);
    expect(screen.getByText('Dashboard')).toBeOnTheScreen();
    expect(screen.getByText('Bookings')).toBeOnTheScreen();
    expect(screen.getByText('Providers')).toBeOnTheScreen();
    expect(screen.getByText('Customers')).toBeOnTheScreen();
    expect(screen.getByText('Payments')).toBeOnTheScreen();
    expect(screen.getByText('Payment Attempts')).toBeOnTheScreen();
    expect(screen.getByText('Earnings & Payouts')).toBeOnTheScreen();
    expect(screen.getByText('Reviews')).toBeOnTheScreen();
  });

  it('renders a Sign out control', () => {
    render(<AdminSidebar />);
    expect(screen.getByText('Sign out')).toBeOnTheScreen();
  });

  it('calls signOut when Sign out is pressed', () => {
    render(<AdminSidebar />);
    fireEvent.press(screen.getByText('Sign out'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('renders the admin email in the footer', () => {
    render(<AdminSidebar />);
    expect(screen.getByText('a@b.c')).toBeOnTheScreen();
  });

  it('navigates to Dashboard route when Dashboard is pressed', () => {
    render(<AdminSidebar />);
    fireEvent.press(screen.getByText('Dashboard'));
    expect(mockRouterPush).toHaveBeenCalledWith('/(admin-web)');
  });

  it('renders all nav item labels in orientation="top"', () => {
    render(<AdminSidebar orientation="top" />);
    expect(screen.getByText('Dashboard')).toBeOnTheScreen();
    expect(screen.getByText('Bookings')).toBeOnTheScreen();
    expect(screen.getByText('Providers')).toBeOnTheScreen();
    expect(screen.getByText('Customers')).toBeOnTheScreen();
    expect(screen.getByText('Payments')).toBeOnTheScreen();
    expect(screen.getByText('Payment Attempts')).toBeOnTheScreen();
    expect(screen.getByText('Earnings & Payouts')).toBeOnTheScreen();
    expect(screen.getByText('Reviews')).toBeOnTheScreen();
    expect(screen.getByText('Sign out')).toBeOnTheScreen();
  });
});
