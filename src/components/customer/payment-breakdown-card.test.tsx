/**
 * Tests for PaymentBreakdownCard.
 *
 * Verifies: subtotal shown, wallet credit shown/hidden, promo discount shown/hidden,
 * amount-due shown, total shown.
 */
import { render, screen } from '@testing-library/react-native';
import { PaymentBreakdownCard } from '@/components/customer/payment-breakdown-card';
import type { Receipt } from '@/lib/receipts';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const BASE_RECEIPT: Receipt = {
  currency:       'KES',
  status:         'paid',
  method:         'mpesa',
  paidAt:         '2026-07-01T10:00:00Z',
  lines:          [],
  subtotal:       3000,
  walletApplied:  500,
  promoDiscount:  200,
  amountDue:      2300,
  total:          2300,
};

const NO_DISCOUNTS_RECEIPT: Receipt = {
  ...BASE_RECEIPT,
  walletApplied: 0,
  promoDiscount: 0,
  amountDue:     3000,
  total:         3000,
};

describe('PaymentBreakdownCard', () => {
  it('renders the subtotal', () => {
    render(<PaymentBreakdownCard receipt={BASE_RECEIPT} />);
    expect(screen.getByText('KES 3,000')).toBeOnTheScreen();
  });

  it('renders the wallet credit when walletApplied > 0', () => {
    render(<PaymentBreakdownCard receipt={BASE_RECEIPT} />);
    expect(screen.getByText('Wallet credit')).toBeOnTheScreen();
    expect(screen.getByText('- KES 500')).toBeOnTheScreen();
  });

  it('hides wallet credit line when walletApplied is 0', () => {
    render(<PaymentBreakdownCard receipt={NO_DISCOUNTS_RECEIPT} />);
    expect(screen.queryByText('Wallet credit')).toBeNull();
  });

  it('renders the promo discount when promoDiscount > 0', () => {
    render(<PaymentBreakdownCard receipt={BASE_RECEIPT} />);
    expect(screen.getByText('Promo discount')).toBeOnTheScreen();
    expect(screen.getByText('- KES 200')).toBeOnTheScreen();
  });

  it('hides promo discount line when promoDiscount is 0', () => {
    render(<PaymentBreakdownCard receipt={NO_DISCOUNTS_RECEIPT} />);
    expect(screen.queryByText('Promo discount')).toBeNull();
  });

  it('renders the amount due', () => {
    render(<PaymentBreakdownCard receipt={BASE_RECEIPT} />);
    expect(screen.getByText('Amount due')).toBeOnTheScreen();
    expect(screen.getByTestId('amount-due-value')).toBeOnTheScreen();
  });

  it('renders the total', () => {
    render(<PaymentBreakdownCard receipt={BASE_RECEIPT} />);
    expect(screen.getByText('Total')).toBeOnTheScreen();
    expect(screen.getByTestId('total-value')).toBeOnTheScreen();
  });

  it('renders correct KES amounts without discounts', () => {
    render(<PaymentBreakdownCard receipt={NO_DISCOUNTS_RECEIPT} />);
    // Subtotal and total both show KES 3,000
    const amounts = screen.getAllByText('KES 3,000');
    expect(amounts.length).toBeGreaterThanOrEqual(1);
  });
});
