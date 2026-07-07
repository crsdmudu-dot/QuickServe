/**
 * Tests for NotificationBadge.
 *
 * Verifies: hidden at 0 and negative counts; shows count string; caps at "99+".
 */

import { render, screen } from '@testing-library/react-native';
import { NotificationBadge } from '@/components/notifications/notification-badge';

describe('NotificationBadge', () => {
  it('renders nothing when count is 0', () => {
    render(<NotificationBadge count={0} />);
    expect(screen.queryByTestId('notification-badge')).toBeNull();
  });

  it('renders nothing when count is negative', () => {
    render(<NotificationBadge count={-5} />);
    expect(screen.queryByTestId('notification-badge')).toBeNull();
  });

  it('shows the count when count is 1', () => {
    render(<NotificationBadge count={1} />);
    expect(screen.getByText('1')).toBeOnTheScreen();
  });

  it('shows the count for a mid-range value (42)', () => {
    render(<NotificationBadge count={42} />);
    expect(screen.getByText('42')).toBeOnTheScreen();
  });

  it('shows the count at the boundary (99)', () => {
    render(<NotificationBadge count={99} />);
    expect(screen.getByText('99')).toBeOnTheScreen();
  });

  it('caps at "99+" when count is 100', () => {
    render(<NotificationBadge count={100} />);
    expect(screen.getByText('99+')).toBeOnTheScreen();
  });

  it('caps at "99+" for very large counts', () => {
    render(<NotificationBadge count={9999} />);
    expect(screen.getByText('99+')).toBeOnTheScreen();
  });

  it('the badge container is visible for count > 0', () => {
    render(<NotificationBadge count={5} />);
    expect(screen.getByTestId('notification-badge')).toBeOnTheScreen();
  });
});
