/**
 * Tests for NotificationPriorityIndicator.
 *
 * Verifies: dot present for each level; label shown for high/urgent; no label for low/normal.
 */

import { render, screen } from '@testing-library/react-native';
import { NotificationPriorityIndicator } from '@/components/notifications/notification-priority-indicator';

describe('NotificationPriorityIndicator', () => {
  it('renders a dot for "low" priority without a label', () => {
    render(<NotificationPriorityIndicator priority="low" />);
    expect(screen.getByTestId('priority-dot-low')).toBeOnTheScreen();
    expect(screen.queryByText('Low')).toBeNull();
  });

  it('renders a dot for "normal" priority without a label', () => {
    render(<NotificationPriorityIndicator priority="normal" />);
    expect(screen.getByTestId('priority-dot-normal')).toBeOnTheScreen();
    expect(screen.queryByText('Normal')).toBeNull();
  });

  it('renders a dot AND "High" label for "high" priority', () => {
    render(<NotificationPriorityIndicator priority="high" />);
    expect(screen.getByTestId('priority-dot-high')).toBeOnTheScreen();
    expect(screen.getByText('High')).toBeOnTheScreen();
  });

  it('renders a dot AND "Urgent" label for "urgent" priority', () => {
    render(<NotificationPriorityIndicator priority="urgent" />);
    expect(screen.getByTestId('priority-dot-urgent')).toBeOnTheScreen();
    expect(screen.getByText('Urgent')).toBeOnTheScreen();
  });
});
