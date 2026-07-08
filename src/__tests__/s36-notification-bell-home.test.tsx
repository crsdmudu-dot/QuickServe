/**
 * s36-notification-bell-home.test.tsx
 *
 * Tests for NotificationBell integration on customer and provider home screens
 * (Slice 36 Task 4):
 *  - Customer home renders NotificationBell with unread count
 *  - Customer bell press routes to /(customer)/notifications
 *  - Provider home renders NotificationBell with unread count
 *  - Provider bell press routes to /provider/notifications
 *  - Existing home screen behavior is preserved
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const mockGetUnreadNotificationCount = jest.fn().mockResolvedValue(5);

jest.mock('@/lib/notifications', () => ({
  getUnreadNotificationCount: () => mockGetUnreadNotificationCount(),
}));

// Customer home mocks
const mockGetRecentlyUsedServiceIds = jest.fn().mockResolvedValue([]);

jest.mock('@/lib/recent-services', () => ({
  getRecentlyUsedServiceIds: (...args: unknown[]) => mockGetRecentlyUsedServiceIds(...args),
  getRecentlyUsedServices: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/services/services-provider', () => {
  const { mockServicesProviderModule } = require('../../test/mock-services');
  return mockServicesProviderModule();
});

jest.mock('@/booking/booking-draft', () => ({
  useBookingDraft: () => ({ start: jest.fn() }),
  BookingDraftProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Provider home mocks
const mockGetProviderJobs = jest.fn().mockResolvedValue([]);

jest.mock('@/lib/bookings', () => ({
  getProviderJobs: (...args: unknown[]) => mockGetProviderJobs(...args),
}));

jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({ approvalStatus: 'approved', signOut: jest.fn() }),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import CustomerHomeScreen from '@/app/(customer)/index';
import ProviderHomeScreen from '@/app/provider/(tabs)/index';

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUnreadNotificationCount.mockResolvedValue(5);
  mockGetRecentlyUsedServiceIds.mockResolvedValue([]);
  mockGetProviderJobs.mockResolvedValue([]);
});

describe('Customer Home — NotificationBell integration', () => {
  it('renders NotificationBell on the customer home screen', async () => {
    render(<CustomerHomeScreen />);
    // Bell is present (bell-icon testID from NotificationBell component)
    expect(await screen.findByTestId('bell-icon')).toBeOnTheScreen();
  });

  it('shows unread count on the bell', async () => {
    render(<CustomerHomeScreen />);
    // The badge should display the count returned by getUnreadNotificationCount
    expect(await screen.findByText('5')).toBeOnTheScreen();
    expect(mockGetUnreadNotificationCount).toHaveBeenCalled();
  });

  it('pressing the bell routes to /(customer)/notifications', async () => {
    render(<CustomerHomeScreen />);
    await screen.findByTestId('bell-icon');

    fireEvent.press(screen.getByRole('button', { name: /Notifications/i }));

    expect(router.push).toHaveBeenCalledWith('/(customer)/notifications');
  });

  it('does not route to notifications when the bell is NOT pressed', async () => {
    render(<CustomerHomeScreen />);
    await screen.findByTestId('bell-icon');

    // No bell press — router.push should not have been called for notifications
    expect(router.push).not.toHaveBeenCalledWith('/(customer)/notifications');
  });

  it('still renders the greeting after bell integration', async () => {
    render(<CustomerHomeScreen />);
    expect(
      await screen.findByText(/Good (Morning|Afternoon|Evening)/),
    ).toBeOnTheScreen();
  });

  it('still renders the subtitle after bell integration', async () => {
    render(<CustomerHomeScreen />);
    expect(
      await screen.findByText('What service do you need today?'),
    ).toBeOnTheScreen();
  });

  it('shows no badge when unread count is 0', async () => {
    mockGetUnreadNotificationCount.mockResolvedValue(0);
    render(<CustomerHomeScreen />);
    await waitFor(() => expect(mockGetUnreadNotificationCount).toHaveBeenCalled());
    expect(screen.queryByTestId('notification-badge')).toBeNull();
  });
});

describe('Provider Home — NotificationBell integration', () => {
  it('renders NotificationBell on the provider home screen', async () => {
    render(<ProviderHomeScreen />);
    expect(await screen.findByTestId('bell-icon')).toBeOnTheScreen();
  });

  it('shows unread count on the provider bell', async () => {
    render(<ProviderHomeScreen />);
    expect(await screen.findByText('5')).toBeOnTheScreen();
    expect(mockGetUnreadNotificationCount).toHaveBeenCalled();
  });

  it('pressing the bell routes to /provider/notifications', async () => {
    render(<ProviderHomeScreen />);
    await screen.findByTestId('bell-icon');

    fireEvent.press(screen.getByRole('button', { name: /Notifications/i }));

    expect(router.push).toHaveBeenCalledWith('/provider/notifications');
  });

  it('still renders "My Jobs" title after bell integration', async () => {
    render(<ProviderHomeScreen />);
    expect(await screen.findByText('My Jobs')).toBeOnTheScreen();
  });

  it('still renders "Sign out" button after bell integration', async () => {
    render(<ProviderHomeScreen />);
    expect(await screen.findByText('Sign out')).toBeOnTheScreen();
  });

  it('shows no badge when unread count is 0 on provider home', async () => {
    mockGetUnreadNotificationCount.mockResolvedValue(0);
    render(<ProviderHomeScreen />);
    await waitFor(() => expect(mockGetUnreadNotificationCount).toHaveBeenCalled());
    expect(screen.queryByTestId('notification-badge')).toBeNull();
  });
});
