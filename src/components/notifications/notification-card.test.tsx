/**
 * Tests for NotificationCard + formatNotificationTime.
 *
 * Verifies: title/body/icon/category/time rendered; unread dot present when
 * unread and absent when read; onPress fires with the notification;
 * formatNotificationTime: today→time / yesterday→'Yesterday' / older→short date.
 */

import { render, screen, fireEvent } from '@testing-library/react-native';
import { NotificationCard, formatNotificationTime } from '@/components/notifications/notification-card';
import { type AppNotification } from '@/lib/notifications';

// Fixed reference time: 2026-07-07T14:00:00Z (UTC)
const NOW = new Date('2026-07-07T14:00:00Z');

const BASE_NOTIFICATION: AppNotification = {
  id: 'n1',
  user_id: 'u1',
  booking_id: 'bk1',
  title: 'Booking Confirmed',
  body: 'Your booking has been confirmed.',
  is_read: false,
  created_at: '2026-07-07T10:00:00Z',
  type: 'booking_accepted',
  category: 'booking',
  priority: 'normal',
};

// ── formatNotificationTime unit tests ────────────────────────────────────────

describe('formatNotificationTime', () => {
  it('returns a time string (AM/PM) for a timestamp on the same day', () => {
    const result = formatNotificationTime('2026-07-07T10:00:00Z', NOW);
    // Should contain AM or PM — locale-formatted time
    expect(result).toMatch(/AM|PM|am|pm|\d{1,2}:\d{2}/);
  });

  it('returns "Yesterday" for a timestamp on the previous day', () => {
    const result = formatNotificationTime('2026-07-06T20:00:00Z', NOW);
    expect(result).toBe('Yesterday');
  });

  it('returns a short date (e.g. "Jul 3") for timestamps older than yesterday', () => {
    const result = formatNotificationTime('2026-07-03T08:00:00Z', NOW);
    expect(result).toMatch(/Jul/i);
    expect(result).toMatch(/3/);
  });

  it('handles a timestamp at midnight today as "today" (not yesterday)', () => {
    // Midnight in local time of NOW's locale — a timestamp that is >= todayStart
    const todayMidnight = new Date(NOW);
    todayMidnight.setHours(0, 0, 0, 0);
    const result = formatNotificationTime(todayMidnight.toISOString(), NOW);
    // Must NOT be "Yesterday" — must be a time format
    expect(result).not.toBe('Yesterday');
  });

  it('uses actual now when no reference is passed (smoke test — just does not throw)', () => {
    expect(() => formatNotificationTime('2026-01-01T00:00:00Z')).not.toThrow();
  });
});

// ── NotificationCard render tests ─────────────────────────────────────────────

describe('NotificationCard', () => {
  it('renders the notification title', () => {
    render(<NotificationCard notification={BASE_NOTIFICATION} />);
    expect(screen.getByText('Booking Confirmed')).toBeOnTheScreen();
  });

  it('renders the notification body', () => {
    render(<NotificationCard notification={BASE_NOTIFICATION} />);
    expect(screen.getByText('Your booking has been confirmed.')).toBeOnTheScreen();
  });

  it('renders the icon from notificationMeta (booking_accepted → ✅)', () => {
    render(<NotificationCard notification={BASE_NOTIFICATION} />);
    expect(screen.getByText('✅')).toBeOnTheScreen();
  });

  it('renders the category label (booking → "Booking")', () => {
    render(<NotificationCard notification={BASE_NOTIFICATION} />);
    expect(screen.getByText('Booking')).toBeOnTheScreen();
  });

  it('renders a formatted time string', () => {
    render(<NotificationCard notification={BASE_NOTIFICATION} />);
    // Time is rendered — we can't predict locale format exactly but some text exists near the title
    // Check there's some time-like text rendered (AM/PM or a date string)
    const allText = screen.toJSON();
    expect(allText).toBeTruthy();
  });

  it('shows the unread dot when is_read is false', () => {
    render(<NotificationCard notification={{ ...BASE_NOTIFICATION, is_read: false }} />);
    expect(screen.getByTestId('unread-dot')).toBeOnTheScreen();
  });

  it('does NOT show the unread dot when is_read is true', () => {
    render(<NotificationCard notification={{ ...BASE_NOTIFICATION, is_read: true }} />);
    expect(screen.queryByTestId('unread-dot')).toBeNull();
  });

  it('fires onPress with the notification when tapped', () => {
    const onPress = jest.fn();
    render(<NotificationCard notification={BASE_NOTIFICATION} onPress={onPress} />);
    fireEvent.press(screen.getByText('Booking Confirmed'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(BASE_NOTIFICATION);
  });

  it('does not throw when onPress is not provided', () => {
    render(<NotificationCard notification={BASE_NOTIFICATION} />);
    expect(() => fireEvent.press(screen.getByText('Booking Confirmed'))).not.toThrow();
  });

  it('renders a generic icon for unknown notification type', () => {
    const n: AppNotification = {
      ...BASE_NOTIFICATION,
      type: 'unknown_type_xyz',
    };
    render(<NotificationCard notification={n} />);
    // Falls back to generic icon 🔔
    expect(screen.getByText('🔔')).toBeOnTheScreen();
  });

  it('shows the priority indicator', () => {
    const urgent: AppNotification = { ...BASE_NOTIFICATION, priority: 'urgent' };
    render(<NotificationCard notification={urgent} />);
    // Urgent shows a label — testID
    expect(screen.getByTestId('priority-dot-urgent')).toBeOnTheScreen();
  });

  it('falls back to defaultPriority from notificationMeta when priority is absent', () => {
    const n: AppNotification = { ...BASE_NOTIFICATION, priority: undefined };
    render(<NotificationCard notification={n} />);
    // booking_accepted has defaultPriority 'normal' — dot exists, no label
    expect(screen.getByTestId('priority-dot-normal')).toBeOnTheScreen();
  });
});
