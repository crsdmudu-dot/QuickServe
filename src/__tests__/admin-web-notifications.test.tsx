/**
 * Tests for the web-admin operational notifications feed screen:
 *   - src/app/(admin-web)/notifications/index.tsx
 *
 * Verifies:
 *   - Only system-category rows are rendered (non-system rows filtered out).
 *   - System rows display their `type` and `push_status` fields.
 *   - Pressing "Open" calls markNotificationRead with the row id AND
 *     router.push with the row route.
 *   - Empty notifications list renders the empty state.
 *
 * All network calls are mocked. Uses findBy* for async data loads.
 */

// ── expo-router mock ──────────────────────────────────────────────────────────
// jest.mock is hoisted; jest.fn() inside the factory is created at hoist time.
// We retrieve a reference to router.push after the import via require().

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

// ── Notifications lib mocks ───────────────────────────────────────────────────

const mockGetMyNotifications = jest
  .fn()
  .mockResolvedValue([] as unknown[]);

const mockMarkNotificationRead = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/notifications', () => ({
  getMyNotifications: (...args: unknown[]) => mockGetMyNotifications(...args),
  markNotificationRead: (...args: unknown[]) =>
    mockMarkNotificationRead(...args),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { router } = require('expo-router') as { router: { push: jest.Mock } };

import AdminWebNotificationsScreen from '@/app/(admin-web)/notifications/index';

// ── Test fixtures ─────────────────────────────────────────────────────────────

/** A system-category (admin operational) notification. */
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

/** A non-system notification — should NOT appear in the admin feed. */
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
    mockMarkNotificationRead.mockClear();
    router.push.mockClear();
    mockGetMyNotifications.mockResolvedValue([MOCK_SYSTEM_NOTIF, MOCK_OTHER_NOTIF]);
    mockMarkNotificationRead.mockResolvedValue({ ok: true });
  });

  it('filters to system-category rows only: system row title IS rendered', async () => {
    render(<AdminWebNotificationsScreen />);
    expect(await screen.findByText('New Booking Received')).toBeOnTheScreen();
  });

  it('filters to system-category rows only: non-system row title is NOT rendered', async () => {
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('New Booking Received');
    expect(screen.queryByText('Your Booking Was Confirmed')).toBeNull();
  });

  it('shows the type field for a system notification', async () => {
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('New Booking Received');
    expect(screen.getByText('booking_new')).toBeOnTheScreen();
  });

  it('shows the push_status field for a system notification', async () => {
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('New Booking Received');
    expect(screen.getByText('sent')).toBeOnTheScreen();
  });

  it('pressing "Open" calls markNotificationRead with the row id', async () => {
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('New Booking Received');
    fireEvent.press(screen.getByText('Open'));
    await waitFor(() =>
      expect(mockMarkNotificationRead).toHaveBeenCalledWith('notif-sys-1111'),
    );
  });

  it('pressing "Open" calls router.push with the row route when route is present', async () => {
    render(<AdminWebNotificationsScreen />);
    await screen.findByText('New Booking Received');
    fireEvent.press(screen.getByText('Open'));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith('/(admin-web)/bookings'),
    );
  });

  it('shows the empty state when there are no notifications', async () => {
    mockGetMyNotifications.mockResolvedValueOnce([]);
    render(<AdminWebNotificationsScreen />);
    expect(await screen.findByText('No notifications yet.')).toBeOnTheScreen();
  });

  it('shows empty state when all notifications are non-system (filter removes everything)', async () => {
    mockGetMyNotifications.mockResolvedValueOnce([MOCK_OTHER_NOTIF]);
    render(<AdminWebNotificationsScreen />);
    expect(await screen.findByText('No notifications yet.')).toBeOnTheScreen();
  });
});
