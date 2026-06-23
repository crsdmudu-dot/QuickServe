// notification-list.test.tsx — Tests for NotificationList component.
import { render, screen, fireEvent } from '@testing-library/react-native';
import { NotificationList } from '@/components/ui/notification-list';
import { type AppNotification } from '@/lib/notifications';

const n1: AppNotification = {
  id: 'n1',
  user_id: 'u1',
  booking_id: 'bk1',
  title: 'Booking confirmed',
  body: 'Your booking has been confirmed.',
  is_read: false,
  created_at: '2026-07-01T10:00:00Z',
};

const n2: AppNotification = {
  id: 'n2',
  user_id: 'u1',
  booking_id: 'bk2',
  title: 'Provider on the way',
  body: 'Your provider is heading to you.',
  is_read: true,
  created_at: '2026-07-01T11:00:00Z',
};

describe('NotificationList', () => {
  it('shows EmptyState "No notifications" when list is empty', () => {
    render(<NotificationList notifications={[]} onPressItem={jest.fn()} />);
    expect(screen.getByText('No notifications')).toBeOnTheScreen();
  });

  it('renders notification titles when list has items', () => {
    render(<NotificationList notifications={[n1, n2]} onPressItem={jest.fn()} />);
    expect(screen.getByText('Booking confirmed')).toBeOnTheScreen();
    expect(screen.getByText('Provider on the way')).toBeOnTheScreen();
  });

  it('calls onPressItem with the correct notification when a row is pressed', () => {
    const onPressItem = jest.fn();
    render(<NotificationList notifications={[n1, n2]} onPressItem={onPressItem} />);
    fireEvent.press(screen.getByText('Booking confirmed'));
    expect(onPressItem).toHaveBeenCalledWith(n1);
  });

  it('shows "Mark all read" button when onMarkAllRead is provided', () => {
    render(
      <NotificationList
        notifications={[n1]}
        onPressItem={jest.fn()}
        onMarkAllRead={jest.fn()}
      />
    );
    expect(screen.getByText('Mark all read')).toBeOnTheScreen();
  });

  it('calls onMarkAllRead when "Mark all read" is pressed', () => {
    const onMarkAllRead = jest.fn();
    render(
      <NotificationList
        notifications={[n1]}
        onPressItem={jest.fn()}
        onMarkAllRead={onMarkAllRead}
      />
    );
    fireEvent.press(screen.getByText('Mark all read'));
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('does not show "Mark all read" button when onMarkAllRead is not provided', () => {
    render(<NotificationList notifications={[n1]} onPressItem={jest.fn()} />);
    expect(screen.queryByText('Mark all read')).toBeNull();
  });
});
