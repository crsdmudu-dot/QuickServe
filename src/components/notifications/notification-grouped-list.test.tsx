/**
 * Tests for NotificationGroupedList.
 *
 * Verifies: buckets into Today/Yesterday/Earlier using a fixed dataset;
 * empty list renders NotificationEmptyState; onPressItem fires from a card.
 *
 * We mock groupNotificationsByDate (the only lib function used) with a
 * deterministic implementation keyed on created_at date prefix, so these
 * tests are timezone-independent and avoid the supabase env check.
 */

import { render, screen, fireEvent } from '@testing-library/react-native';
import { NotificationGroupedList } from '@/components/notifications/notification-grouped-list';
import { type AppNotification } from '@/lib/notifications';

// ── Module mocks ──────────────────────────────────────────────────────────────

// Mock the whole notifications lib to avoid the supabase env guard.
jest.mock('@/lib/notifications', () => ({
  groupNotificationsByDate: (notifications: AppNotification[]) => {
    // Deterministic grouping keyed on ISO-date prefix
    const today = notifications.filter((n: AppNotification) =>
      n.created_at.startsWith('2026-07-07'),
    );
    const yesterday = notifications.filter((n: AppNotification) =>
      n.created_at.startsWith('2026-07-06'),
    );
    const earlier = notifications.filter(
      (n: AppNotification) =>
        !n.created_at.startsWith('2026-07-07') && !n.created_at.startsWith('2026-07-06'),
    );
    const buckets: { label: string; items: AppNotification[] }[] = [];
    if (today.length > 0) buckets.push({ label: 'Today', items: today });
    if (yesterday.length > 0) buckets.push({ label: 'Yesterday', items: yesterday });
    if (earlier.length > 0) buckets.push({ label: 'Earlier', items: earlier });
    return buckets;
  },
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const N_TODAY: AppNotification = {
  id: 'n-today',
  user_id: 'u1',
  booking_id: null,
  title: 'Today Notification',
  body: 'Happened today.',
  is_read: false,
  created_at: '2026-07-07T10:00:00Z',
  type: 'booking_accepted',
  category: 'booking',
};

const N_YESTERDAY: AppNotification = {
  id: 'n-yesterday',
  user_id: 'u1',
  booking_id: null,
  title: 'Yesterday Notification',
  body: 'Happened yesterday.',
  is_read: true,
  created_at: '2026-07-06T15:00:00Z',
  type: 'payment_received',
  category: 'payment',
};

const N_EARLIER: AppNotification = {
  id: 'n-earlier',
  user_id: 'u1',
  booking_id: null,
  title: 'Earlier Notification',
  body: 'Happened a while ago.',
  is_read: true,
  created_at: '2026-07-03T08:00:00Z',
  type: 'generic',
  category: 'system',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NotificationGroupedList', () => {
  // Pin the clock to the fixtures' "today" (2026-07-07). The NotificationCard
  // renders formatNotificationTime(created_at) against the real clock, so
  // without this the N_TODAY card would label itself "Yesterday" on any later
  // calendar day and collide with the "no Yesterday" assertions below.
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-07-07T12:00:00Z') });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('renders NotificationEmptyState when list is empty', () => {
    render(<NotificationGroupedList notifications={[]} />);
    // NotificationEmptyState with variant "all" renders this title
    expect(screen.getByText("You're all caught up")).toBeOnTheScreen();
  });

  it('renders "Today" section header with today notifications', () => {
    render(<NotificationGroupedList notifications={[N_TODAY]} />);
    expect(screen.getByText('Today')).toBeOnTheScreen();
    expect(screen.getByText('Today Notification')).toBeOnTheScreen();
  });

  it('renders "Yesterday" section header with yesterday notifications', () => {
    render(<NotificationGroupedList notifications={[N_YESTERDAY]} />);
    // "Yesterday" may appear twice: once as the section header and once as the
    // formatted time on the card itself (formatNotificationTime returns 'Yesterday').
    // Use getAllByText and assert at least one match.
    expect(screen.getAllByText('Yesterday').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Yesterday Notification')).toBeOnTheScreen();
  });

  it('renders "Earlier" section header with older notifications', () => {
    render(<NotificationGroupedList notifications={[N_EARLIER]} />);
    expect(screen.getByText('Earlier')).toBeOnTheScreen();
    expect(screen.getByText('Earlier Notification')).toBeOnTheScreen();
  });

  it('renders all three sections when all buckets have items', () => {
    render(
      <NotificationGroupedList notifications={[N_TODAY, N_YESTERDAY, N_EARLIER]} />,
    );
    expect(screen.getByText('Today')).toBeOnTheScreen();
    // "Yesterday" may appear in both the section header and the card time label
    expect(screen.getAllByText('Yesterday').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Earlier')).toBeOnTheScreen();
  });

  it('omits empty buckets (no "Yesterday" when no yesterday items)', () => {
    render(<NotificationGroupedList notifications={[N_TODAY, N_EARLIER]} />);
    expect(screen.getByText('Today')).toBeOnTheScreen();
    expect(screen.getByText('Earlier')).toBeOnTheScreen();
    expect(screen.queryByText('Yesterday')).toBeNull();
  });

  it('fires onPressItem with the correct notification when a card is tapped', () => {
    const onPressItem = jest.fn();
    render(
      <NotificationGroupedList
        notifications={[N_TODAY, N_YESTERDAY]}
        onPressItem={onPressItem}
      />,
    );
    fireEvent.press(screen.getByText('Today Notification'));
    expect(onPressItem).toHaveBeenCalledTimes(1);
    expect(onPressItem).toHaveBeenCalledWith(N_TODAY);
  });
});
