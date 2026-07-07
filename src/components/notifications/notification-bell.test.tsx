/**
 * Tests for NotificationBell.
 *
 * Verifies: renders; shows badge when count > 0; no badge when count is 0;
 * onPress fires; accessibility label includes count.
 */

import { render, screen, fireEvent } from '@testing-library/react-native';
import { NotificationBell } from '@/components/notifications/notification-bell';

describe('NotificationBell', () => {
  it('renders the bell without throwing', () => {
    render(<NotificationBell count={0} onPress={jest.fn()} />);
    // Bell icon rendered — found by testID
    expect(screen.getByTestId('bell-icon')).toBeOnTheScreen();
  });

  it('shows the badge when count > 0', () => {
    render(<NotificationBell count={3} onPress={jest.fn()} />);
    expect(screen.getByTestId('notification-badge')).toBeOnTheScreen();
    expect(screen.getByText('3')).toBeOnTheScreen();
  });

  it('does NOT show the badge when count is 0', () => {
    render(<NotificationBell count={0} onPress={jest.fn()} />);
    expect(screen.queryByTestId('notification-badge')).toBeNull();
  });

  it('fires onPress when the bell is pressed', () => {
    const onPress = jest.fn();
    render(<NotificationBell count={2} onPress={onPress} />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('accessibility label includes count when count > 0', () => {
    render(<NotificationBell count={5} onPress={jest.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Notifications, 5 unread' }),
    ).toBeOnTheScreen();
  });

  it('accessibility label says "Notifications" when count is 0', () => {
    render(<NotificationBell count={0} onPress={jest.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Notifications' }),
    ).toBeOnTheScreen();
  });

  it('caps badge display at "99+" for count > 99', () => {
    render(<NotificationBell count={150} onPress={jest.fn()} />);
    expect(screen.getByText('99+')).toBeOnTheScreen();
  });
});
