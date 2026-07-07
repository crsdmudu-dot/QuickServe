/**
 * Tests for the web-admin notifications center screen (enhanced Task 5):
 *   src/app/(admin-web)/notifications/index.tsx
 *
 * Verifies:
 *   - Notification titles are rendered in the grouped view.
 *   - Filter chips (All / Unread / Booking / Payments / Promotions / System) are present.
 *   - Unread badge from getUnreadNotificationCount.
 *   - "Mark all read" calls markAllNotificationsRead.
 *   - Tapping a notification card calls markNotificationRead + resolveNotificationDeepLink.
 *   - router.push called with the resolved deep-link route.
 *   - Empty state shows when there are no notifications.
 *   - No history delete exposed in the lib mock.
 *
 * All network calls are mocked.
 */

// ── expo-router mock ──────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useRouter: () => ({ push: jest.fn() }),
}));

// ── Notifications lib mocks ───────────────────────────────────────────────────

const mockGetMyNotifications = jest.fn().mockResolvedValue([] as unknown[]);
const mockGetUnreadNotificationCount = jest.fn().mockResolvedValue(0);
const mockMarkNotificationRead = jest.fn().mockResolvedValue({ ok: true });
const mockMarkAllNotificationsRead = jest.fn().mockResolvedValue({ ok: true });
const mockFilterNotifications = jest.fn((ns: any[]) => ns);

jest.mock('@/lib/notifications', () => ({
  getMyNotifications: (...args: unknown[]) => mockGetMyNotifications(...args),
  getUnreadNotificationCount: () => mockGetUnreadNotificationCount(),
  filterNotifications: (ns: unknown[], filter: unknown) => mockFilterNotifications(ns as any[], filter as any),
  markNotificationRead: (...args: unknown[]) => mockMarkNotificationRead(...args),
  markAllNotificationsRead: () => mockMarkAllNotificationsRead(),
  groupNotificationsByDate: (ns: any[]) => {
    if (!ns || ns.length === 0) return [];
    return [{ label: 'Today', items: ns }];
  },
}));

// ── constants/notifications mock ─────────────────────────────────────────────

const mockResolveNotificationDeepLink = jest.fn((n: any) => n.route ?? null);

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
    { id: 'low',    label: 'Low',    color: '#8C939D' },
    { id: 'normal', label: 'Normal', color: '#5B6470' },
    { id: 'high',   label: 'High',   color: '#F5A524' },
    { id: 'urgent', label: 'Urgent', color: '#E5484D' },
  ],
}));

// ── use-paginated-list mock ───────────────────────────────────────────────────

const mockReload = jest.fn();
const mockLoadMore = jest.fn();

jest.mock('@/hooks/use-paginated-list', () => ({
  usePaginatedList: jest.fn(() => ({
    items: [],
    loading: false,
    error: null,
    hasMore: false,
    loadMore: mockLoadMore,
    reload: mockReload,
  })),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { router } = require('expo-router') as { router: { push: jest.Mock } };

import AdminWebNotificationsScreen from '@/app/(admin-web)/notifications/index';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const MOCK_SYSTEM_NOTIF = {
  id: 'notif-sys-1111',
  user_id: 'admin-user-uuid',
  booking_id: 'bk-aaaa-1234',
  title: 'New Booking Received',
  body: 'A new booking has been placed and needs attention.',
  is_read: false,
  created_at: '2026-06-15T10:00:00Z',
  type: 'booking_new',
  category: 'system',
  route: '/(admin-web)/bookings',
  dedup_key: null,
  push_status: 'sent',
  push_error: null,
  push_attempts: 1,
};

const MOCK_OTHER_NOTIF = {
  id: 'notif-other-2222',
  user_id: 'admin-user-uuid',
  booking_id: null,
  title: 'Your Booking Was Confirmed',
  body: 'Your booking was confirmed by the provider.',
  is_read: true,
  created_at: '2026-06-14T08:00:00Z',
  type: 'booking_confirmed',
  category: 'booking',
  route: null,
  dedup_key: null,
  push_status: 'skipped',
  push_error: null,
  push_attempts: 0,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AdminWebNotificationsScreen (operational notifications feed)', () => {
  beforeEach(() => {
    mockGetMyNotifications.mockClear();
    mockGetUnreadNotificationCount.mockClear();
    mockMarkNotificationRead.mockClear();
    mockMarkAllNotificationsRead.mockClear();
    mockFilterNotifications.mockClear();
    mockResolveNotificationDeepLink.mockClear();
    router.push.mockClear();
    mockReload.mockClear();

    mockGetMyNotifications.mockResolvedValue([MOCK_SYSTEM_NOTIF, MOCK_OTHER_NOTIF]);
    mockGetUnreadNotificationCount.mockResolvedValue(2);
    mockMarkNotificationRead.mockResolvedValue({ ok: true });
    mockMarkAllNotificationsRead.mockResolvedValue({ ok: true });
    mockFilterNotifications.mockImplementation((ns: any[]) => ns);
    mockResolveNotificationDeepLink.mockImplementation((n: any) => n.route ?? null);

    const { usePaginatedList } = require('@/hooks/use-paginated-list');
    (usePaginatedList as jest.Mock).mockReturnValue({
      items: [MOCK_SYSTEM_NOTIF, MOCK_OTHER_NOTIF],
      loading: false,
      error: null,
      hasMore: false,
      loadMore: mockLoadMore,
      reload: mockReload,
    });

    const constantsMock = require('@/constants/notifications');
    constantsMock.notificationMeta.mockReturnValue({
      label: 'Notification',
      icon: '🔔',
      category: 'system',
      defaultPriority: 'normal',
    });
  });

  it('renders notification titles from the grouped list', async () => {
    render(<AdminWebNotificationsScreen />);
    expect(await screen.findByText('New Booking Received')).toBeOnTheScreen();
  });

  it('renders both system and non-system notifications (grouped view, no category filter by default)', async () => {
    render(<AdminWebNotificationsScreen />);
    expect(await screen.findByText('New Booking Received')).toBeOnTheScreen();
    expect(await screen.findByText('Your Booking Was Confirmed')).toBeOnTheScreen();
  });

  it('renders filter chips: All, Unread, Booking, Payments, Promotions, System', async () => {
    render(<AdminWebNotificationsScreen />);
    expect(screen.getAllByText('All').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('System').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Booking').length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Notifications" heading', async () => {
    render(<AdminWebNotificationsScreen />);
    expect(await screen.findByText('Notifications')).toBeOnTheScreen();
  });

  it('shows unread badge from getUnreadNotificationCount', async () => {
    render(<AdminWebNotificationsScreen />);
    await waitFor(() => expect(mockGetUnreadNotificationCount).toHaveBeenCalled());
    expect(await screen.findByTestId('notification-badge')).toBeOnTheScreen();
  });

  it('shows "Mark all read" button', async () => {
    render(<AdminWebNotificationsScreen />);
    expect(await screen.findByText('Mark all read')).toBeOnTheScreen();
  });

  it('pressing "Mark all read" calls markAllNotificationsRead', async () => {
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('Mark all read');
    fireEvent.press(screen.getByText('Mark all read'));
    await waitFor(() => expect(mockMarkAllNotificationsRead).toHaveBeenCalledTimes(1));
  });

  it('pressing "Mark all read" calls reload', async () => {
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('Mark all read');
    fireEvent.press(screen.getByText('Mark all read'));
    await waitFor(() => expect(mockReload).toHaveBeenCalled());
  });

  it('tapping a notification card calls markNotificationRead with the row id', async () => {
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('New Booking Received');
    fireEvent.press(screen.getByText('New Booking Received'));
    await waitFor(() =>
      expect(mockMarkNotificationRead).toHaveBeenCalledWith('notif-sys-1111'),
    );
  });

  it('tapping a notification card calls resolveNotificationDeepLink', async () => {
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('New Booking Received');
    fireEvent.press(screen.getByText('New Booking Received'));
    await waitFor(() =>
      expect(mockResolveNotificationDeepLink).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'notif-sys-1111' }),
      ),
    );
  });

  it('tapping a notification card with a route calls router.push with that route', async () => {
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('New Booking Received');
    fireEvent.press(screen.getByText('New Booking Received'));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith('/(admin-web)/bookings'),
    );
  });

  it('tapping a notification with no route does NOT call router.push', async () => {
    mockResolveNotificationDeepLink.mockReturnValueOnce(null);
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('New Booking Received');
    fireEvent.press(screen.getByText('New Booking Received'));
    await waitFor(() => expect(mockMarkNotificationRead).toHaveBeenCalled());
    expect(router.push).not.toHaveBeenCalled();
  });

  it('shows empty state when there are no notifications', async () => {
    const { usePaginatedList } = require('@/hooks/use-paginated-list');
    (usePaginatedList as jest.Mock).mockReturnValue({
      items: [],
      loading: false,
      error: null,
      hasMore: false,
      loadMore: mockLoadMore,
      reload: mockReload,
    });
    mockFilterNotifications.mockReturnValue([]);
    render(<AdminWebNotificationsScreen />);
    // NotificationEmptyState renders when list is empty
    await waitFor(() => expect(mockFilterNotifications).toHaveBeenCalled());
    // The 'all' filter empty variant renders "You're all caught up"
    expect(await screen.findByText("You're all caught up")).toBeOnTheScreen();
  });

  it('no history delete function exposed in the lib mock', () => {
    const libMock = require('@/lib/notifications');
    expect(libMock.deleteNotification).toBeUndefined();
  });

  it('shows "Broadcast" button linking to the broadcast composer', async () => {
    render(<AdminWebNotificationsScreen />);
    expect(await screen.findByText('Broadcast')).toBeOnTheScreen();
  });

  it('pressing Broadcast navigates to the broadcast route', async () => {
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('Broadcast');
    fireEvent.press(screen.getByText('Broadcast'));
    expect(router.push).toHaveBeenCalledWith('/(admin-web)/broadcast');
  });
});
