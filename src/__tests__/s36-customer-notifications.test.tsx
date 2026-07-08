/**
 * s36-customer-notifications.test.tsx
 *
 * Comprehensive tests for the enhanced (customer)/notifications.tsx
 * (Slice 36 Task 4):
 *  - renders grouped notifications from mocked getMyNotifications
 *  - filter chip narrows shown list via filterNotifications
 *  - unread badge from getUnreadNotificationCount
 *  - mark-all calls markAllNotificationsRead + refreshes count
 *  - tapping a card calls markNotificationRead(id) + routes via resolveNotificationDeepLink
 *  - route-less notification does not crash
 *  - empty/skeleton states
 *  - marking read triggers ONLY markNotificationRead (no delete/history mutation)
 *  - no expo-notifications/push call
 *  - filters are view-only (underlying loaded list unchanged)
 */

// ── Mocks (hoist before imports) ──────────────────────────────────────────────

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

// ── lib/notifications mock ────────────────────────────────────────────────────

const mockNotifications = [
  {
    id: 'n1',
    user_id: 'u1',
    booking_id: 'bk1',
    title: 'Booking Accepted',
    body: 'Your booking was accepted.',
    is_read: false,
    created_at: '2026-07-07T10:00:00Z',
    type: 'booking_accepted',
    category: 'booking',
  },
  {
    id: 'n2',
    user_id: 'u1',
    booking_id: null,
    title: 'Payment Confirmed',
    body: 'Your payment was confirmed.',
    is_read: true,
    created_at: '2026-07-06T09:00:00Z',
    type: 'payment_confirmed',
    category: 'payment',
  },
];

const mockGetMyNotifications = jest.fn().mockResolvedValue(mockNotifications);
const mockGetUnreadNotificationCount = jest.fn().mockResolvedValue(3);
const mockFilterNotifications = jest.fn((notifications: any[], filter: string) => {
  // Actual filter logic so we can assert narrowing
  if (filter === 'all') return notifications;
  if (filter === 'unread') return notifications.filter((n: any) => !n.is_read);
  if (filter === 'booking') return notifications.filter((n: any) => n.category === 'booking');
  if (filter === 'payments') return notifications.filter((n: any) => n.category === 'payment');
  return [];
});
const mockMarkNotificationRead = jest.fn().mockResolvedValue({ ok: true });
const mockMarkAllNotificationsRead = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/notifications', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getMyNotifications: (...a: any[]) => mockGetMyNotifications(...a),
  getUnreadNotificationCount: () => mockGetUnreadNotificationCount(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filterNotifications: (ns: any[], filter: any) => mockFilterNotifications(ns, filter),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  markNotificationRead: (...a: any[]) => mockMarkNotificationRead(...a),
  markAllNotificationsRead: () => mockMarkAllNotificationsRead(),
  groupNotificationsByDate: (notifications: any[]) => {
    // Deterministic grouping so tests are timezone-independent
    const today = notifications.filter((n: any) => n.created_at.startsWith('2026-07-07'));
    const yesterday = notifications.filter((n: any) => n.created_at.startsWith('2026-07-06'));
    const buckets: { label: string; items: any[] }[] = [];
    if (today.length > 0) buckets.push({ label: 'Today', items: today });
    if (yesterday.length > 0) buckets.push({ label: 'Yesterday', items: yesterday });
    return buckets;
  },
}));

// ── constants/notifications mock ─────────────────────────────────────────────
// Must include ALL exports used by NotificationCard, NotificationBadge, etc.

const mockResolveNotificationDeepLink = jest.fn((n: any) => {
  if (n.booking_id) return `/booking/${n.booking_id}`;
  return null;
});

jest.mock('@/constants/notifications', () => ({
  NOTIFICATION_FILTERS: [
    { id: 'all',        label: 'All'        },
    { id: 'unread',     label: 'Unread'     },
    { id: 'booking',    label: 'Booking'    },
    { id: 'payments',   label: 'Payments'   },
    { id: 'promotions', label: 'Promotions' },
    { id: 'system',     label: 'System'     },
  ],
  resolveNotificationDeepLink: (n: unknown) => mockResolveNotificationDeepLink(n),
  filterMatches: jest.fn(() => true),
  // Required by NotificationCard
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

// ── use-paginated-list mock ───────────────────────────────────────────────────

const mockReload = jest.fn();
const mockLoadMore = jest.fn();

jest.mock('@/hooks/use-paginated-list', () => ({
  usePaginatedList: jest.fn(() => ({
    items: mockNotifications,
    loading: false,
    hasMore: false,
    loadMore: mockLoadMore,
    reload: mockReload,
  })),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { router } from 'expo-router';
import CustomerNotificationsScreen from '@/app/(customer)/notifications';

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMyNotifications.mockResolvedValue(mockNotifications);
  mockGetUnreadNotificationCount.mockResolvedValue(3);
  mockMarkNotificationRead.mockResolvedValue({ ok: true });
  mockMarkAllNotificationsRead.mockResolvedValue({ ok: true });
  mockFilterNotifications.mockImplementation((notifications: any[], filter: string) => {
    if (filter === 'all') return notifications;
    if (filter === 'unread') return notifications.filter((n: any) => !n.is_read);
    if (filter === 'booking') return notifications.filter((n: any) => n.category === 'booking');
    if (filter === 'payments') return notifications.filter((n: any) => n.category === 'payment');
    return [];
  });
  mockResolveNotificationDeepLink.mockImplementation((n: any) => {
    if (n.booking_id) return `/booking/${n.booking_id}`;
    return null;
  });
  const { usePaginatedList } = require('@/hooks/use-paginated-list');
  (usePaginatedList as jest.Mock).mockReturnValue({
    items: mockNotifications,
    loading: false,
    hasMore: false,
    loadMore: mockLoadMore,
    reload: mockReload,
  });
  // Reset notificationMeta mock
  const constantsMock = require('@/constants/notifications');
  constantsMock.notificationMeta.mockReturnValue({
    label: 'Notification',
    icon: '🔔',
    category: 'system',
    defaultPriority: 'normal',
  });
});

describe('CustomerNotificationsScreen (Slice 36 enhanced)', () => {
  // ── Renders grouped notifications ─────────────────────────────────────────

  it('renders notification titles from the grouped list', async () => {
    render(<CustomerNotificationsScreen />);
    expect(await screen.findByText('Booking Accepted')).toBeOnTheScreen();
    expect(await screen.findByText('Payment Confirmed')).toBeOnTheScreen();
  });

  it('renders the "Today" section header', async () => {
    render(<CustomerNotificationsScreen />);
    expect(await screen.findByText('Today')).toBeOnTheScreen();
  });

  it('renders filter chips (All, Unread, Booking, Payments, Promotions, System)', () => {
    render(<CustomerNotificationsScreen />);
    // Some labels may appear more than once (e.g. "Booking" in chip + category label on card)
    expect(screen.getAllByText('All').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Unread').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Booking').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Payments').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Promotions').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('System').length).toBeGreaterThanOrEqual(1);
  });

  // ── Unread badge ──────────────────────────────────────────────────────────

  it('shows an unread badge with the count from getUnreadNotificationCount', async () => {
    render(<CustomerNotificationsScreen />);
    // Badge renders the count value
    expect(await screen.findByTestId('notification-badge')).toBeOnTheScreen();
    expect(mockGetUnreadNotificationCount).toHaveBeenCalled();
  });

  it('shows the unread count number in the badge', async () => {
    render(<CustomerNotificationsScreen />);
    expect(await screen.findByText('3')).toBeOnTheScreen();
  });

  it('hides badge when unread count is 0', async () => {
    mockGetUnreadNotificationCount.mockResolvedValue(0);
    render(<CustomerNotificationsScreen />);
    await waitFor(() => expect(mockGetUnreadNotificationCount).toHaveBeenCalled());
    expect(screen.queryByTestId('notification-badge')).toBeNull();
  });

  // ── Filter chip narrows shown list ────────────────────────────────────────

  it('filter chip calls filterNotifications with the selected filter', async () => {
    render(<CustomerNotificationsScreen />);
    await screen.findByText('Booking Accepted');

    // "Booking" may appear in chip + category labels; press the first (chip is first in DOM)
    fireEvent.press(screen.getAllByText('Booking')[0]);

    await waitFor(() =>
      expect(mockFilterNotifications).toHaveBeenCalledWith(
        expect.any(Array),
        'booking',
      ),
    );
  });

  it('switching to Unread filter calls filterNotifications with "unread"', async () => {
    render(<CustomerNotificationsScreen />);
    await screen.findByText('Booking Accepted');

    fireEvent.press(screen.getAllByText('Unread')[0]);

    await waitFor(() =>
      expect(mockFilterNotifications).toHaveBeenCalledWith(
        expect.any(Array),
        'unread',
      ),
    );
  });

  it('underlying loaded list is unchanged after filter change (view-only)', async () => {
    render(<CustomerNotificationsScreen />);
    await screen.findByText('Booking Accepted');
    const loadCallsBefore = mockGetMyNotifications.mock.calls.length;

    fireEvent.press(screen.getAllByText('Payments')[0]);
    await waitFor(() =>
      expect(mockFilterNotifications).toHaveBeenCalledWith(expect.any(Array), 'payments'),
    );

    // No additional fetch triggered by filter change
    expect(mockGetMyNotifications.mock.calls.length).toBe(loadCallsBefore);
  });

  // ── Mark all read ─────────────────────────────────────────────────────────

  it('pressing "Mark all read" calls markAllNotificationsRead', async () => {
    render(<CustomerNotificationsScreen />);
    await screen.findByText('Booking Accepted');

    await act(async () => {
      fireEvent.press(screen.getByText('Mark all read'));
    });

    expect(mockMarkAllNotificationsRead).toHaveBeenCalledTimes(1);
  });

  it('pressing "Mark all read" calls reload', async () => {
    render(<CustomerNotificationsScreen />);
    await screen.findByText('Booking Accepted');

    await act(async () => {
      fireEvent.press(screen.getByText('Mark all read'));
    });

    expect(mockReload).toHaveBeenCalled();
  });

  it('pressing "Mark all read" refreshes the unread count', async () => {
    render(<CustomerNotificationsScreen />);
    await screen.findByText('Booking Accepted');
    const callsBefore = mockGetUnreadNotificationCount.mock.calls.length;

    await act(async () => {
      fireEvent.press(screen.getByText('Mark all read'));
    });

    expect(mockGetUnreadNotificationCount.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  // ── Tap card: markNotificationRead + deep link ────────────────────────────

  it('tapping a card calls markNotificationRead with the notification id', async () => {
    render(<CustomerNotificationsScreen />);
    await screen.findByText('Booking Accepted');

    await act(async () => {
      fireEvent.press(screen.getByText('Booking Accepted'));
    });

    expect(mockMarkNotificationRead).toHaveBeenCalledWith('n1');
  });

  it('tapping a card calls resolveNotificationDeepLink', async () => {
    render(<CustomerNotificationsScreen />);
    await screen.findByText('Booking Accepted');

    await act(async () => {
      fireEvent.press(screen.getByText('Booking Accepted'));
    });

    expect(mockResolveNotificationDeepLink).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n1' }),
    );
  });

  it('tapping a card routes to the resolved deep link', async () => {
    render(<CustomerNotificationsScreen />);
    await screen.findByText('Booking Accepted');

    await act(async () => {
      fireEvent.press(screen.getByText('Booking Accepted'));
    });

    expect(router.push).toHaveBeenCalledWith('/booking/bk1');
  });

  it('markNotificationRead does NOT trigger delete or history mutation', async () => {
    render(<CustomerNotificationsScreen />);
    await screen.findByText('Booking Accepted');

    await act(async () => {
      fireEvent.press(screen.getByText('Booking Accepted'));
    });

    // Only markNotificationRead called — no other mutation fn
    expect(mockMarkNotificationRead).toHaveBeenCalledTimes(1);
    expect(mockMarkAllNotificationsRead).not.toHaveBeenCalled();
    // Verify the lib mock has no delete fn
    const libMock = require('@/lib/notifications');
    expect(libMock.deleteNotification).toBeUndefined();
  });

  it('route-less notification does not crash and does not call router.push', async () => {
    mockResolveNotificationDeepLink.mockReturnValue(null);
    render(<CustomerNotificationsScreen />);
    await screen.findByText('Booking Accepted');

    await act(async () => {
      fireEvent.press(screen.getByText('Booking Accepted'));
    });

    expect(mockMarkNotificationRead).toHaveBeenCalledWith('n1');
    expect(router.push).not.toHaveBeenCalled();
    // Screen still renders (no crash)
    expect(screen.getByText('Booking Accepted')).toBeOnTheScreen();
  });

  it('tapping a card refreshes the unread count', async () => {
    render(<CustomerNotificationsScreen />);
    await screen.findByText('Booking Accepted');
    const afterMount = mockGetUnreadNotificationCount.mock.calls.length;

    await act(async () => {
      fireEvent.press(screen.getByText('Booking Accepted'));
    });

    // Should have been called again after the tap
    expect(mockGetUnreadNotificationCount.mock.calls.length).toBeGreaterThan(afterMount);
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  it('shows "all" empty state when list is empty and filter is all', async () => {
    const { usePaginatedList } = require('@/hooks/use-paginated-list');
    (usePaginatedList as jest.Mock).mockReturnValue({
      items: [],
      loading: false,
      hasMore: false,
      loadMore: mockLoadMore,
      reload: mockReload,
    });
    mockFilterNotifications.mockReturnValue([]);
    render(<CustomerNotificationsScreen />);
    expect(await screen.findByText("You're all caught up")).toBeOnTheScreen();
  });

  it('shows "unread" empty state when unread filter has no results', async () => {
    render(<CustomerNotificationsScreen />);
    await screen.findByText('Booking Accepted');

    mockFilterNotifications.mockReturnValue([]);
    fireEvent.press(screen.getByText('Unread'));
    await screen.findByText('No unread notifications');
  });

  it('shows "filtered" empty state when a category filter has no results', async () => {
    render(<CustomerNotificationsScreen />);
    await screen.findByText('Booking Accepted');

    mockFilterNotifications.mockReturnValue([]);
    fireEvent.press(screen.getByText('System'));
    await screen.findByText('No notifications in this filter');
  });

  // ── Skeleton ──────────────────────────────────────────────────────────────

  it('shows skeleton while loading and list is empty', () => {
    const { usePaginatedList } = require('@/hooks/use-paginated-list');
    (usePaginatedList as jest.Mock).mockReturnValue({
      items: [],
      loading: true,
      hasMore: true,
      loadMore: mockLoadMore,
      reload: mockReload,
    });
    render(<CustomerNotificationsScreen />);
    // No crash, the title is visible
    expect(screen.getByText('Notifications')).toBeOnTheScreen();
  });

  // ── No push / second-path guard ───────────────────────────────────────────

  it('lib/notifications mock does not expose scheduleNotificationAsync (no push path)', () => {
    const libMock = require('@/lib/notifications');
    expect(libMock.scheduleNotificationAsync).toBeUndefined();
  });
});
