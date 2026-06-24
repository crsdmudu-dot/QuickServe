/**
 * Tests for AttemptStatusBadge — verifies that the correct label is rendered
 * for each of the 5 AttemptStatus values.
 */

import { render, screen } from '@testing-library/react-native';
import { AttemptStatusBadge } from '@/components/ui/attempt-status-badge';

describe('AttemptStatusBadge', () => {
  it('renders "Initiated" for status initiated', () => {
    render(<AttemptStatusBadge status="initiated" />);
    expect(screen.getByText('Initiated')).toBeOnTheScreen();
  });

  it('renders "Pending" for status pending', () => {
    render(<AttemptStatusBadge status="pending" />);
    expect(screen.getByText('Pending')).toBeOnTheScreen();
  });

  it('renders "Successful" for status successful', () => {
    render(<AttemptStatusBadge status="successful" />);
    expect(screen.getByText('Successful')).toBeOnTheScreen();
  });

  it('renders "Failed" for status failed', () => {
    render(<AttemptStatusBadge status="failed" />);
    expect(screen.getByText('Failed')).toBeOnTheScreen();
  });

  it('renders "Cancelled" for status cancelled', () => {
    render(<AttemptStatusBadge status="cancelled" />);
    expect(screen.getByText('Cancelled')).toBeOnTheScreen();
  });
});
