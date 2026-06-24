/**
 * Tests for PaymentStatusBadge — verifies that the correct label is rendered
 * for each of the 4 PaymentStatus values.
 */

import { render, screen } from '@testing-library/react-native';
import { PaymentStatusBadge } from '@/components/ui/payment-status-badge';

describe('PaymentStatusBadge', () => {
  it('renders "Pending" for status pending', () => {
    render(<PaymentStatusBadge status="pending" />);
    expect(screen.getByText('Pending')).toBeOnTheScreen();
  });

  it('renders "Paid" for status paid', () => {
    render(<PaymentStatusBadge status="paid" />);
    expect(screen.getByText('Paid')).toBeOnTheScreen();
  });

  it('renders "Refunded" for status refunded', () => {
    render(<PaymentStatusBadge status="refunded" />);
    expect(screen.getByText('Refunded')).toBeOnTheScreen();
  });

  it('renders "Cancelled" for status cancelled', () => {
    render(<PaymentStatusBadge status="cancelled" />);
    expect(screen.getByText('Cancelled')).toBeOnTheScreen();
  });
});
