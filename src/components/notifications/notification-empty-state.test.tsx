/**
 * Tests for NotificationEmptyState.
 *
 * Verifies each variant renders its unique copy, and default ('all') works.
 */

import { render, screen } from '@testing-library/react-native';
import { NotificationEmptyState } from '@/components/notifications/notification-empty-state';

describe('NotificationEmptyState', () => {
  it('renders "all" variant copy by default', () => {
    render(<NotificationEmptyState />);
    expect(screen.getByText("You're all caught up")).toBeOnTheScreen();
    expect(
      screen.getByText('No notifications yet. Check back later for updates.'),
    ).toBeOnTheScreen();
  });

  it('renders "all" variant when explicitly passed', () => {
    render(<NotificationEmptyState variant="all" />);
    expect(screen.getByText("You're all caught up")).toBeOnTheScreen();
  });

  it('renders "unread" variant copy', () => {
    render(<NotificationEmptyState variant="unread" />);
    expect(screen.getByText('No unread notifications')).toBeOnTheScreen();
    expect(
      screen.getByText("You've read everything — nice work!"),
    ).toBeOnTheScreen();
  });

  it('renders "filtered" variant copy', () => {
    render(<NotificationEmptyState variant="filtered" />);
    expect(screen.getByText('No notifications in this filter')).toBeOnTheScreen();
    expect(
      screen.getByText('Try switching to a different category to see more.'),
    ).toBeOnTheScreen();
  });

  it('renders the bell icon (🔔) in all variants', () => {
    const { rerender } = render(<NotificationEmptyState variant="all" />);
    expect(screen.getByText('🔔')).toBeOnTheScreen();

    rerender(<NotificationEmptyState variant="unread" />);
    expect(screen.getByText('🔔')).toBeOnTheScreen();

    rerender(<NotificationEmptyState variant="filtered" />);
    expect(screen.getByText('🔔')).toBeOnTheScreen();
  });
});
