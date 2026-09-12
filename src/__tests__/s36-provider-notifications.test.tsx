/**
 * s36-provider-notifications.test.tsx
 *
 * Comprehensive tests for the enhanced provider/(tabs)/notifications.tsx
 * (Slice 36 Task 4):
 *  - renders grouped notifications
 *  - filter chip narrows list via filterNotifications
 *  - unread badge from getUnreadNotificationCount
 *  - mark-all calls markAllNotificationsRead + refreshes count
 *  - tapping a card calls markNotificationRead + routes via resolveNotificationDeepLink
 *  - falls back to /provider/job/:id when resolver returns null but booking_id present
 *  - route-less notification does not crash
 *  - marking read = is_read+read_at only (no delete)
 *  - filters are view-only
 */

// ── Mocks (hoist before imports) ──────────────────────────────────────────────

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
}));

// ── lib/notifications mock ────────────────────────────────────────────────────

const mockProviderNotifications = [
  {
    id: 'pn1',
    user_id: 'p1',
    booking_id: 'j1',
    title: 'New Job Available',
    body: 'A new job has been assigned to you.',
    is_read: false,
    created_at: '2026-07-07T10:00:00Z',
    type: 'new_job',
    category: 'booking',
  },
  {
    id: 'pn2',
    user_id: 'p1',
    booking_id: null,
    title: 'Payment Released',
    body: 'Payment for your last job has been released.',
    is_read: true,
    created_at: '2026-07-06T09:00:00Z',
    type: 'payment_released',
    category: 'payment',
  },
];

const mockGetMyNotifications = jest.fn().mockResolvedValue(mockProviderNotifications);
const mockGetUnreadNotificationCount = jest.fn().mockResolvedValue(1);
const mockFilterNotifications = jest.fn((notifications: any[], filter: string) => {
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
    const today = notifications.filter((n: any) => n.created_at.startsWith('2026-07-07'));
    const yesterday = notifications.filter((n: any) => n.created_at.startsWith('2026-07-06'));
    const buckets: { label: string; items: any[] }[] = [];
    if (today.length > 0) buckets.push({ label: 'Today', items: today });
    if (yesterday.length > 0) buckets.push({ label: 'Yesterday', items: yesterday });
    return buckets;
  },
}));

// ── constants/notifications mock ─────────────────────────────────────────────
// Must include ALL exports used by NotificationCard etc.

const mockResolveNotificationDeepLink = jest.fn((n: any) => {
  if (n.type === 'payment_released') return '/wallet';
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

// ── Imports ───────────────────────────────────────────────name────────────────

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { router } from 'expo-router';
import ProviderNotificationsScreen from '@/app/provider/(tabs)/notifications';

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMyNotifications.mockResolvedValue(mockProviderNotifications);
  mockGetUnreadNotificationCount.mockResolvedValue(1);
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
    if (n.type === 'payment_released') return '/wallet';
    if (n.booking_id) return `/booking/${n.booking_id}`;
    return null;
  });
  const constantsMock = require('@/constants/notifications');
  constantsMock.notificationMeta.mockReturnValue({
    label: 'Notification',
    icon: '🔔',
    category: 'system',
    defaultPriority: 'normal',
  });
});

describe('ProviderNotificationsScreen (Slice 36 enhanced)', () => {
  // ── Renders grouped notifications ─────────────────────────────────────────

  it('renders notification titles after loading', async () => {
    render(<ProviderNotificationsScreen />);
    expect(await screen.findByText('New Job Available')).toBeOnTheScreen();
    expect(await screen.findByText('Payment Released')).toBeOnTheScreen();
  });

  it('renders Today section header', async () => {
    render(<ProviderNotificationsScreen />);
    expect(await screen.findByText('Today')).toBeOnTheScreen();
  });

  it('renders the 6 filter chips', async () => {
    render(<ProviderNotificationsScreen />);
    // Wait for initial render
    await waitFor(() => expect(mockGetMyNotifications).toHaveBeenCalled());
    // Some labels may appear multiple times (e.g. chip + category label on card)
    expect(screen.getAllByText('All').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Unread').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Booking').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Payments').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Promotions').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('System').length).toBeGreaterThanOrEqual(1);
  });

  // ── Unread badge ──────────────────────────────────────────────────────────

  it('shows unread badge when getUnreadNotificationCount returns > 0', async () => {
    render(<ProviderNotificationsScreen />);
    expect(await screen.findByTestId('notification-badge')).toBeOnTheScreen();
    expect(mockGetUnreadNotificationCount).toHaveBeenCalled();
  });

  it('shows count "1" in badge', async () => {
    render(<ProviderNotificationsScreen />);
    expect(await screen.findByText('1')).toBeOnTheScreen();
  });

  it('hides badge when unread count is 0', async () => {
    mockGetUnreadNotificationCount.mockResolvedValue(0);
    render(<ProviderNotificationsScreen />);
    await waitFor(() => expect(mockGetUnreadNotificationCount).toHaveBeenCalled());
    expect(screen.queryByTestId('notification-badge')).toBeNull();
  });

  // ── Filter narrows list ───────────────────────────────────────────────────

  it('filter chip calls filterNotifications with selected filter', async () => {
    render(<ProviderNotificationsScreen />);
    await waitFor(() => expect(mockGetMyNotifications).toHaveBeenCalled());

    // "Booking" may appear multiple times; press the first (chip appears before category labels)
    fireEvent.press(screen.getAllByText('Booking')[0]);

    await waitFor(() =>
      expect(mockFilterNotifications).toHaveBeenCalledWith(
        expect.any(Array),
        'booking',
      ),
    );
  });

  it('filter change does not trigger additional network fetch (view-only)', async () => {
    render(<ProviderNotificationsScreen />);
    await waitFor(() => expect(mockGetMyNotifications).toHaveBeenCalled());
    const fetchCallsBefore = mockGetMyNotifications.mock.calls.length;

    // "Payments" may appear multiple times; press the first (chip)
    fireEvent.press(screen.getAllByText('Payments')[0]);
    await waitFor(() =>
      expect(mockFilterNotifications).toHaveBeenCalledWith(expect.any(Array), 'payments'),
    );

    expect(mockGetMyNotifications.mock.calls.length).toBe(fetchCallsBefore);
  });

  // ── Mark all read ─────────────────────────────────────────────────────────

  it('pressing "Mark all read" calls markAllNotificationsRead', async () => {
    render(<ProviderNotificationsScreen />);
    await waitFor(() => expect(mockGetMyNotifications).toHaveBeenCalled());

    await act(async () => {
      fireEvent.press(screen.getByText('Mark all read'));
    });

    expect(mockMarkAllNotificationsRead).toHaveBeenCalledTimes(1);
  });

  it('pressing "Mark all read" reloads the list', async () => {
    render(<ProviderNotificationsScreen />);
    await waitFor(() => expect(mockGetMyNotifications).toHaveBeenCalled());
    const callsBefore = mockGetMyNotifications.mock.calls.length;

    await act(async () => {
      fireEvent.press(screen.getByText('Mark all read'));
    });

    expect(mockGetMyNotifications.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('pressing "Mark all read" refreshes unread count', async () => {
    render(<ProviderNotificationsScreen />);
    await waitFor(() => expect(mockGetMyNotifications).toHaveBeenCalled());
    const countCallsBefore = mockGetUnreadNotificationCount.mock.calls.length;

    await act(async () => {
      fireEvent.press(screen.getByText('Mark all read'));
    });

    expect(mockGetUnreadNotificationCount.mock.calls.length).toBeGreaterThan(countCallsBefore);
  });

  // ── Tap card: markNotificationRead + deep link ────────────────────────────

  it('tapping a card calls markNotificationRead(id)', async () => {
    render(<ProviderNotificationsScreen />);
    expect(await screen.findByText('New Job Available')).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(screen.getByText('New Job Available'));
    });

    expect(mockMarkNotificationRead).toHaveBeenCalledWith('pn1');
  });

  it('tapping a card routes via resolveNotificationDeepLink', async () => {
    render(<ProviderNotificationsScreen />);
    expect(await screen.findByText('New Job Available')).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(screen.getByText('New Job Available'));
    });

    expect(mockResolveNotificationDeepLink).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pn1' }),
    );
    expect(router.push).toHaveBeenCalledWith('/booking/j1');
  });

  it('falls back to /provider/job/:id when resolver returns null but booking_id present', async () => {
    mockResolveNotificationDeepLink.mockReturnValue(null);
    render(<ProviderNotificationsScreen />);
    expect(await screen.findByText('New Job Available')).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(screen.getByText('New Job Available'));
    });

    expect(mockMarkNotificationRead).toHaveBeenCalledWith('pn1');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/provider/job/[id]',
      params: { id: 'j1' },
    });
  });

  it('marking read triggers only markNotificationRead — no delete/history mutation', async () => {
    render(<ProviderNotificationsScreen />);
    expect(await screen.findByText('New Job Available')).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(screen.getByText('New Job Available'));
    });

    expect(mockMarkNotificationRead).toHaveBeenCalledTimes(1);
    expect(mockMarkAllNotificationsRead).not.toHaveBeenCalled();
    const libMock = require('@/lib/notifications');
    expect(libMock.deleteNotification).toBeUndefined();
  });

  it('route-less notification without booking_id does not crash and does not route', async () => {
    mockResolveNotificationDeepLink.mockReturnValue(null);
    // notification with no booking_id
    mockGetMyNotifications.mockResolvedValue([
      {
        id: 'pn-sys',
        user_id: 'p1',
        booking_id: null,
        title: 'System Alert',
        body: 'Something happened.',
        is_read: false,
        created_at: '2026-07-07T08:00:00Z',
        type: 'system_announcement',
        category: 'system',
      },
    ]);
    render(<ProviderNotificationsScreen />);
    expect(await screen.findByText('System Alert')).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(screen.getByText('System Alert'));
    });

    expect(mockMarkNotificationRead).toHaveBeenCalledWith('pn-sys');
    expect(router.push).not.toHaveBeenCalled();
    // Screen still renders (no crash)
    expect(screen.getByText('System Alert')).toBeOnTheScreen();
  });

  it('tapping a card refreshes unread count', async () => {
    render(<ProviderNotificationsScreen />);
    expect(await screen.findByText('New Job Available')).toBeOnTheScreen();
    const afterMount = mockGetUnreadNotificationCount.mock.calls.length;

    await act(async () => {
      fireEvent.press(screen.getByText('New Job Available'));
    });

    expect(mockGetUnreadNotificationCount.mock.calls.length).toBeGreaterThan(afterMount);
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  it('shows empty state when list is empty', async () => {
    mockGetMyNotifications.mockResolvedValue([]);
    mockFilterNotifications.mockReturnValue([]);
    render(<ProviderNotificationsScreen />);
    expect(await screen.findByText("You're all caught up")).toBeOnTheScreen();
  });

  it('shows "unread" empty state variant for unread filter with no results', async () => {
    render(<ProviderNotificationsScreen />);
    await waitFor(() => expect(mockGetMyNotifications).toHaveBeenCalled());

    mockFilterNotifications.mockReturnValue([]);
    fireEvent.press(screen.getByText('Unread'));
    await screen.findByText('No unread notifications');
  });
});
