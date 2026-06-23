/**
 * Tests for src/app/provider/(tabs)/notifications.tsx
 *
 * Mocks expo-router and @/lib/notifications so no network calls are made.
 * Uses findBy* to await state settle after getMyNotifications resolves.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

const mockGetMyNotifications = jest.fn().mockResolvedValue([
  {
    id: 'n1',
    user_id: 'u1',
    booking_id: 'bk1',
    title: 'New job assigned',
    body: 'You have been assigned a new job.',
    is_read: false,
    created_at: '2026-07-01T10:00:00Z',
  },
]);

const mockMarkNotificationRead = jest.fn().mockResolvedValue({ ok: true });
const mockMarkAllNotificationsRead = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/notifications', () => ({
  getMyNotifications: (...args: unknown[]) => mockGetMyNotifications(...args),
  markNotificationRead: (...args: unknown[]) => mockMarkNotificationRead(...args),
  markAllNotificationsRead: (...args: unknown[]) => mockMarkAllNotificationsRead(...args),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import ProviderNotificationsScreen from '@/app/provider/(tabs)/notifications';

describe('ProviderNotificationsScreen', () => {
  beforeEach(() => {
    mockGetMyNotifications.mockClear();
    mockMarkNotificationRead.mockClear();
    mockMarkAllNotificationsRead.mockClear();
    (router.push as jest.Mock).mockClear();
  });

  it('renders the notification title after notifications load', async () => {
    render(<ProviderNotificationsScreen />);
    expect(await screen.findByText('New job assigned')).toBeOnTheScreen();
  });

  it('tapping the row calls markNotificationRead and router.push', async () => {
    render(<ProviderNotificationsScreen />);
    // Wait for the notification title to appear then press it
    const title = await screen.findByText('New job assigned');
    fireEvent.press(title);
    // Wait for the async handlers to complete
    await screen.findByText('New job assigned');
    expect(mockMarkNotificationRead).toHaveBeenCalledWith('n1');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/provider/job/[id]', params: { id: 'bk1' } });
  });

  it('pressing "Mark all read" calls markAllNotificationsRead', async () => {
    render(<ProviderNotificationsScreen />);
    // Wait for notifications to load so the button appears
    await screen.findByText('New job assigned');
    const markAllBtn = screen.getByText('Mark all read');
    fireEvent.press(markAllBtn);
    // Wait for reload after marking all read
    await screen.findByText('New job assigned');
    expect(mockMarkAllNotificationsRead).toHaveBeenCalled();
  });
});
