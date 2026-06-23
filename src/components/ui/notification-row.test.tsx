// notification-row.test.tsx — Tests for NotificationRow component.
import { render, screen, fireEvent } from '@testing-library/react-native';
import { NotificationRow } from '@/components/ui/notification-row';
import { type AppNotification } from '@/lib/notifications';

const base: AppNotification = {
  id: 'n1',
  user_id: 'u1',
  booking_id: 'bk1',
  title: 'Booking confirmed',
  body: 'Your booking has been confirmed.',
  is_read: false,
  created_at: '2026-07-01T10:00:00Z',
};

describe('NotificationRow', () => {
  it('shows title and body', () => {
    render(<NotificationRow notification={base} onPress={jest.fn()} />);
    expect(screen.getByText('Booking confirmed')).toBeOnTheScreen();
    expect(screen.getByText('Your booking has been confirmed.')).toBeOnTheScreen();
  });

  it('shows unread-dot when is_read is false', () => {
    render(<NotificationRow notification={{ ...base, is_read: false }} onPress={jest.fn()} />);
    expect(screen.getByTestId('unread-dot')).toBeOnTheScreen();
  });

  it('does not show unread-dot when is_read is true', () => {
    render(<NotificationRow notification={{ ...base, is_read: true }} onPress={jest.fn()} />);
    expect(screen.queryByTestId('unread-dot')).toBeNull();
  });

  it('calls onPress when card is pressed', () => {
    const onPress = jest.fn();
    render(<NotificationRow notification={base} onPress={onPress} />);
    fireEvent.press(screen.getByText('Booking confirmed'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
