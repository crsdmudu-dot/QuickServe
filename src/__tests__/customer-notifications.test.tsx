/**
 * Tests for src/app/(customer)/notifications.tsx
 *
 * Mocks expo-router and @/lib/notifications so no network calls are made.
 * Uses findBy* to await state settle after getMyNotifications resolves.
 *
 * Updated for Slice 36: screen now uses filterNotifications, getUnreadNotificationCount,
 * and resolveNotificationDeepLink (from constants/notifications).
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
    type: 'booking_accepted',
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

// Mock use-paginated-list so we control items/loading
const mockReload = jest.fn();
jest.mock('@/hooks/use-paginated-list', () => ({
  usePaginatedList: jest.fn(() => ({
    items: [
      {
        id: 'n1',
        user_id: 'u1',
        booking_id: 'bk1',
        title: 'Booking update',
        body: 'A professional has been assigned to your booking.',
        is_read: false,
        created_at: '2026-07-01T10:00:00Z',
        type: 'booking_accepted',
        category: 'booking',
      },
    ],
    loading: false,
    hasMore: false,
    loadMore: jest.fn(),
    reload: mockReload,
  })),
}));

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import CustomerNotificationsScreen from '@/app/(customer)/notifications';

describe('CustomerNotificationsScreen', () => {
  beforeEach(() => {
    mockGetMyNotifications.mockClear();
    mockMarkNotificationRead.mockClear();
    mockMarkAllNotificationsRead.mockClear();
    mockGetUnreadNotificationCount.mockClear();
    mockFilterNotifications.mockClear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockFilterNotifications.mockImplementation((ns: any[]) => ns);
    mockReload.mockClear();
    (router.push as jest.Mock).mockClear();
    const { usePaginatedList } = require('@/hooks/use-paginated-list');
    (usePaginatedList as jest.Mock).mockReturnValue({
      items: [
        {
          id: 'n1',
          user_id: 'u1',
          booking_id: 'bk1',
          title: 'Booking update',
          body: 'A professional has been assigned to your booking.',
          is_read: false,
          created_at: '2026-07-01T10:00:00Z',
          type: 'booking_accepted',
          category: 'booking',
        },
      ],
      loading: false,
      hasMore: false,
      loadMore: jest.fn(),
      reload: mockReload,
    });
  });

  it('renders the notification title after notifications load', async () => {
    render(<CustomerNotificationsScreen />);
    expect(await screen.findByText('Booking update')).toBeOnTheScreen();
  });

  it('tapping the row calls markNotificationRead and router.push with resolved deep link', async () => {
    render(<CustomerNotificationsScreen />);
    // Wait for the notification title to appear then press it
    const title = await screen.findByText('Booking update');
    await act(async () => {
      fireEvent.press(title);
    });
    expect(mockMarkNotificationRead).toHaveBeenCalledWith('n1');
    // New screen uses resolveNotificationDeepLink → returns '/booking/bk1'
    expect(router.push).toHaveBeenCalledWith('/booking/bk1');
  });

  it('pressing "Mark all read" calls markAllNotificationsRead', async () => {
    render(<CustomerNotificationsScreen />);
    // Wait for notifications to load so the button appears
    await screen.findByText('Booking update');
    const markAllBtn = screen.getByText('Mark all read');
    await act(async () => {
      fireEvent.press(markAllBtn);
    });
    expect(mockMarkAllNotificationsRead).toHaveBeenCalled();
  });
});
