/**
 * Tests for ReceiptView.
 *
 * Verifies: renders breakdown card, shows payment meta, download/share
 * buttons are disabled (placeholder) since canDownloadReceipt === false.
 */
import { render, screen } from '@testing-library/react-native';
import { ReceiptView } from '@/components/customer/receipt-view';
import type { Receipt } from '@/lib/receipts';

// Mock receipts.ts canDownloadReceipt = false (the constant)
jest.mock('@/lib/receipts', () => ({
  canDownloadReceipt: false,
}));

const RECEIPT: Receipt = {
  currency:       'KES',
  status:         'paid',
  method:         'mpesa',
  paidAt:         '2026-07-01T10:00:00Z',
  lines:          [],
  subtotal:       2500,
  walletApplied:  0,
  promoDiscount:  0,
  amountDue:      2500,
  total:          2500,
  bookingId:      'bk-abc-123',
};

describe('ReceiptView', () => {
  it('renders the receipt section header', () => {
    render(<ReceiptView receipt={RECEIPT} />);
    expect(screen.getByText('Receipt')).toBeOnTheScreen();
  });

  it('renders payment status', () => {
    render(<ReceiptView receipt={RECEIPT} />);
    expect(screen.getByText('Paid')).toBeOnTheScreen();
  });

  it('renders payment method', () => {
    render(<ReceiptView receipt={RECEIPT} />);
    expect(screen.getByText('Mpesa')).toBeOnTheScreen();
  });

  it('renders the subtotal via PaymentBreakdownCard', () => {
    render(<ReceiptView receipt={RECEIPT} />);
    expect(screen.getByText('Subtotal')).toBeOnTheScreen();
    // subtotal and amount-due are both 2500 so multiple elements exist
    const amounts = screen.getAllByText('KES 2,500');
    expect(amounts.length).toBeGreaterThanOrEqual(1);
  });

  it('renders total', () => {
    render(<ReceiptView receipt={RECEIPT} />);
    expect(screen.getByText('Total')).toBeOnTheScreen();
  });

  it('renders download placeholder button as disabled', () => {
    render(<ReceiptView receipt={RECEIPT} />);
    expect(screen.getByText('Download (Coming soon)')).toBeOnTheScreen();
  });

  it('renders share placeholder button as disabled', () => {
    render(<ReceiptView receipt={RECEIPT} />);
    expect(screen.getByText('Share (Coming soon)')).toBeOnTheScreen();
  });

  it('shows the booking id in the meta section', () => {
    render(<ReceiptView receipt={RECEIPT} />);
    // Booking ID truncated to 8 chars uppercase
    expect(screen.getByText('#BK-ABC-1')).toBeOnTheScreen();
  });
});
