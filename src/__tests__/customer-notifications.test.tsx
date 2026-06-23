/**
 * Tests for src/app/(customer)/notifications.tsx
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
    title: 'Booking update',
    body: 'A professional has been assigned to your booking.',
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
import CustomerNotificationsScreen from '@/app/(customer)/notifications';

describe('CustomerNotificationsScreen', () => {
  beforeEach(() => {
    mockGetMyNotifications.mockClear();
    mockMarkNotificationRead.mockClear();
    mockMarkAllNotificationsRead.mockClear();
    (router.push as jest.Mock).mockClear();
  });

  it('renders the notification title after notifications load', async () => {
    render(<CustomerNotificationsScreen />);
    expect(await screen.findByText('Booking update')).toBeOnTheScreen();
  });

  it('tapping the row calls markNotificationRead and router.push', async () => {
    render(<CustomerNotificationsScreen />);
    // Wait for the notification title to appear then press it
    const title = await screen.findByText('Booking update');
    fireEvent.press(title);
    // Wait for the async handlers to complete
    await screen.findByText('Booking update');
    expect(mockMarkNotificationRead).toHaveBeenCalledWith('n1');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/booking/[id]', params: { id: 'bk1' } });
  });

  it('pressing "Mark all read" calls markAllNotificationsRead', async () => {
    render(<CustomerNotificationsScreen />);
    // Wait for notifications to load so the button appears
    await screen.findByText('Booking update');
    const markAllBtn = screen.getByText('Mark all read');
    fireEvent.press(markAllBtn);
    // Wait for reload after marking all read
    await screen.findByText('Booking update');
    expect(mockMarkAllNotificationsRead).toHaveBeenCalled();
  });
});
