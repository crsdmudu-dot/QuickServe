/**
 * notifications-refresh.test.tsx
 *
 * Phase 4E.1 regression — the in-app notifications screen must surface a
 * notification created AFTER the initial load, via pull-to-refresh and on screen
 * re-focus. Previously the list loaded only once on mount (no RefreshControl, no
 * useFocusEffect, no realtime), so a new row never appeared until a cold restart
 * (proven on a physical device against QA).
 *
 * Uses the REAL usePaginatedList so the refresh path is exercised end-to-end;
 * only getMyNotifications is mocked (sequential responses simulate a row arriving
 * between loads).
 */
import { RefreshControl } from 'react-native';

const N1 = {
  id: 'n1', user_id: 'u1', booking_id: 'bk1', title: 'Booking received',
  body: 'We received your booking.', is_read: false, created_at: '2026-08-08T10:00:00Z',
  type: 'booking_received', category: 'booking', route: '/booking/bk1',
};
const N2 = {
  id: 'n2', user_id: 'u1', booking_id: 'bk2', title: 'Provider assigned',
  body: 'A professional has been assigned.', is_read: false, created_at: '2026-08-08T11:00:00Z',
  type: 'provider_assigned', category: 'booking', route: '/booking/bk2',
};

const mockGetMyNotifications = jest.fn();
const mockGetUnread = jest.fn().mockResolvedValue(0);

jest.mock('@/lib/notifications', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getMyNotifications: (...a: any[]) => mockGetMyNotifications(...a),
  getUnreadNotificationCount: () => mockGetUnread(),
  markNotificationRead: jest.fn().mockResolvedValue({ ok: true }),
  markAllNotificationsRead: jest.fn().mockResolvedValue({ ok: true }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filterNotifications: (ns: any[]) => ns,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  groupNotificationsByDate: (ns: any[]) => (ns.length ? [{ label: 'Today', items: ns }] : []),
}));

jest.mock('@/constants/notifications', () => ({
  NOTIFICATION_FILTERS: [{ id: 'all', label: 'All' }, { id: 'unread', label: 'Unread' }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolveNotificationDeepLink: (n: any) => (n.booking_id ? `/booking/${n.booking_id}` : null),
  filterMatches: () => true,
  notificationMeta: () => ({ label: 'Notification', icon: '🔔', category: 'system', defaultPriority: 'normal' }),
  CATEGORY_LABELS: { booking: 'Booking', payment: 'Payments', promotion: 'Promotions', system: 'System', quality: 'Quality', chat: 'Messages' },
  NOTIFICATION_TYPES: {},
  PRIORITY_LEVELS: [{ id: 'normal', label: 'Normal', color: '#5B6470' }],
}));

// Capture the focus callback so a test can simulate returning to the screen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let focusCallback: null | (() => any) = null;
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useFocusEffect: (cb: () => any) => { focusCallback = cb; },
}));

import { act, render, screen } from '@testing-library/react-native';
import CustomerNotificationsScreen from '@/app/(customer)/notifications';

describe('CustomerNotificationsScreen refresh (Phase 4E.1)', () => {
  beforeEach(() => {
    mockGetMyNotifications.mockReset();
    mockGetUnread.mockClear();
    focusCallback = null;
  });

  it('renders the initial notification list on mount', async () => {
    mockGetMyNotifications.mockResolvedValue([N1]);
    render(<CustomerNotificationsScreen />);
    expect(await screen.findByText('Booking received')).toBeOnTheScreen();
  });

  it('pull-to-refresh surfaces a notification created after initial load — no duplicate rows', async () => {
    mockGetMyNotifications.mockResolvedValueOnce([N1]).mockResolvedValueOnce([N2, N1]);
    render(<CustomerNotificationsScreen />);
    await screen.findByText('Booking received');
    expect(screen.queryByText('Provider assigned')).toBeNull();

    const rc = screen.UNSAFE_getByType(RefreshControl);
    await act(async () => { await rc.props.onRefresh(); });

    expect(await screen.findByText('Provider assigned')).toBeOnTheScreen();
    // The originally-loaded row is replaced, not appended twice.
    expect(screen.getAllByText('Booking received')).toHaveLength(1);
  });

  it('clears the refresh spinner after a successful refresh', async () => {
    mockGetMyNotifications.mockResolvedValueOnce([N1]).mockResolvedValueOnce([N1]);
    render(<CustomerNotificationsScreen />);
    await screen.findByText('Booking received');
    const rc = screen.UNSAFE_getByType(RefreshControl);
    expect(rc.props.refreshing).toBe(false);
    await act(async () => { await rc.props.onRefresh(); });
    expect(rc.props.refreshing).toBe(false);
  });

  it('does not leave the refresh spinner stuck when the refetch errors', async () => {
    mockGetMyNotifications.mockResolvedValueOnce([N1]).mockRejectedValue(new Error('network down'));
    render(<CustomerNotificationsScreen />);
    await screen.findByText('Booking received');
    const rc = screen.UNSAFE_getByType(RefreshControl);
    await act(async () => { await rc.props.onRefresh(); });
    // Spinner cleared even though the refetch failed, and the prior list is intact.
    expect(rc.props.refreshing).toBe(false);
    expect(screen.getByText('Booking received')).toBeOnTheScreen();
  });

  it('refetches on screen re-focus but skips the first focus (no redundant mount fetch)', async () => {
    mockGetMyNotifications.mockResolvedValueOnce([N1]).mockResolvedValueOnce([N2, N1]);
    render(<CustomerNotificationsScreen />);
    await screen.findByText('Booking received');
    const callsAfterMount = mockGetMyNotifications.mock.calls.length; // 1 (mount load only)

    // First focus is skipped (mount already loaded).
    await act(async () => { focusCallback?.(); });
    expect(mockGetMyNotifications.mock.calls.length).toBe(callsAfterMount);

    // Returning to the screen (second focus) refetches → new row appears.
    await act(async () => { await focusCallback?.(); });
    expect(await screen.findByText('Provider assigned')).toBeOnTheScreen();
  });
});
