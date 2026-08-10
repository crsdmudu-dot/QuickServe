/**
 * Tests for src/app/provider/(tabs)/notifications.tsx
 *
 * Mocks expo-router and @/lib/notifications so no network calls are made.
 * Uses findBy* to await state settle after getMyNotifications resolves.
 *
 * Updated for Slice 36: screen now uses filterNotifications, getUnreadNotificationCount,
 * and resolveNotificationDeepLink (from constants/notifications).
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useFocusEffect: jest.fn(),
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
    type: 'new_job',
    category: 'booking',
  },
]);

const mockMarkNotificationRead = jest.fn().mockResolvedValue({ ok: true });
const mockMarkAllNotificationsRead = jest.fn().mockResolvedValue({ ok: true });
const mockGetUnreadNotificationCount = jest.fn().mockResolvedValue(0);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFilterNotifications = jest.fn((ns: any[], _filter: any) => ns); // pass-through by default

jest.mock('@/lib/notifications', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getMyNotifications: (...a: any[]) => mockGetMyNotifications(...a),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  markNotificationRead: (...a: any[]) => mockMarkNotificationRead(...a),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  markAllNotificationsRead: (...a: any[]) => mockMarkAllNotificationsRead(...a),
  getUnreadNotificationCount: () => mockGetUnreadNotificationCount(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filterNotifications: (ns: any[], filter: any) => mockFilterNotifications(ns, filter),
  groupNotificationsByDate: (notifications: unknown[]) => {
    // Simple deterministic grouping
    if (notifications.length === 0) return [];
    return [{ label: 'Today', items: notifications }];
  },
}));

// Mock constants/notifications — resolveNotificationDeepLink used by the new screen
jest.mock('@/constants/notifications', () => ({
  NOTIFICATION_FILTERS: [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'booking', label: 'Booking' },
    { id: 'payments', label: 'Payments' },
    { id: 'promotions', label: 'Promotions' },
    { id: 'system', label: 'System' },
  ],
  resolveNotificationDeepLink: (n: any) => {
    // For new_job type with booking_id, resolver returns /booking/:id
    if (n.booking_id) return `/booking/${n.booking_id}`;
    return null;
  },
  filterMatches: jest.fn(() => true),
  notificationMeta: jest.fn(() => ({
    label: 'Notification',
    icon: '🔔',
    category: 'system',
    defaultPriority: 'normal',
  })),
  CATEGORY_LABELS: {
    booking: 'Booking',
    payment: 'Payments',
    promotion: 'Promotions',
    system: 'System',
    quality: 'Quality',
    chat: 'Messages',
  },
  NOTIFICATION_TYPES: {},
  PRIORITY_LEVELS: [
    { id: 'low', label: 'Low', color: '#8C939D' },
    { id: 'normal', label: 'Normal', color: '#5B6470' },
    { id: 'high', label: 'High', color: '#F5A524' },
    { id: 'urgent', label: 'Urgent', color: '#E5484D' },
  ],
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import ProviderNotificationsScreen from '@/app/provider/(tabs)/notifications';

describe('ProviderNotificationsScreen', () => {
  beforeEach(() => {
    mockGetMyNotifications.mockClear();
    mockMarkNotificationRead.mockClear();
    mockMarkAllNotificationsRead.mockClear();
    mockGetUnreadNotificationCount.mockClear();
    mockFilterNotifications.mockClear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFilterNotifications.mockImplementation((ns: any[]) => ns);
    (router.push as jest.Mock).mockClear();
    // Reset to default return value
    mockGetMyNotifications.mockResolvedValue([
      {
        id: 'n1',
        user_id: 'u1',
        booking_id: 'bk1',
        title: 'New job assigned',
        body: 'You have been assigned a new job.',
        is_read: false,
        created_at: '2026-07-01T10:00:00Z',
        type: 'new_job',
        category: 'booking',
      },
    ]);
  });

  it('renders the notification title after notifications load', async () => {
    render(<ProviderNotificationsScreen />);
    expect(await screen.findByText('New job assigned')).toBeOnTheScreen();
  });

  it('tapping the row calls markNotificationRead and router.push', async () => {
    render(<ProviderNotificationsScreen />);
    // Wait for the notification title to appear then press it
    const title = await screen.findByText('New job assigned');
    await act(async () => {
      fireEvent.press(title);
    });
    expect(mockMarkNotificationRead).toHaveBeenCalledWith('n1');
    // Resolver returns '/booking/bk1'; that is pushed.
    expect(router.push).toHaveBeenCalledWith('/booking/bk1');
  });

  it('pressing "Mark all read" calls markAllNotificationsRead', async () => {
    render(<ProviderNotificationsScreen />);
    // Wait for notifications to load so the button appears
    await screen.findByText('New job assigned');
    const markAllBtn = screen.getByText('Mark all read');
    await act(async () => {
      fireEvent.press(markAllBtn);
    });
    expect(mockMarkAllNotificationsRead).toHaveBeenCalled();
  });
});
