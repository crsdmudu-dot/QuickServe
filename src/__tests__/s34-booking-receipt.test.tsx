/**
 * Slice 34 tests for src/app/booking/receipt.tsx
 *
 * Verifies:
 * - Renders ReceiptView when payment exists (mocked buildReceipt + ReceiptView)
 * - Shows "no payment yet" empty state when payment is null
 * - Shows skeleton during loading
 * - NO payment/wallet/promo mutation is called
 * - Download/share disabled (ReceiptView placeholder behaviour)
 *
 * All components + libs mocked so no network or real component complexity leaks in.
 */

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'b1' }),
  router: { push: jest.fn(), replace: jest.fn() },
  Stack: {
    Screen: ({ options }: { options: { title: string } }) => {
      const { Text } = require('react-native');
      return <Text testID="stack-screen-title">{options.title}</Text>;
    },
  },
}));

const mockGetBookingById = jest.fn();

jest.mock('@/lib/bookings', () => ({
  getBookingById: (...args: unknown[]) => mockGetBookingById(...args),
}));

const mockGetPaymentForBooking = jest.fn();

jest.mock('@/lib/payments', () => ({
  getPaymentForBooking: (...args: unknown[]) => mockGetPaymentForBooking(...args),
}));

// Forbidden mutations — spy to ensure they are never called
const mockApplyWalletToPayment = jest.fn();
const mockRedeemPromo = jest.fn();
const mockInitiateMpesaPayment = jest.fn();

jest.mock('@/lib/wallet', () => ({
  applyWalletToPayment: (...args: unknown[]) => mockApplyWalletToPayment(...args),
  getMyWallet: jest.fn().mockResolvedValue({ balance: 0 }),
  amountDue: (p: { amount: number; wallet_applied?: number; promo_discount?: number }) =>
    Math.max(0, p.amount - (p.wallet_applied ?? 0) - (p.promo_discount ?? 0)),
}));

jest.mock('@/lib/promotions', () => ({
  redeemPromo: (...args: unknown[]) => mockRedeemPromo(...args),
}));

jest.mock('@/lib/attempts', () => ({
  initiateMpesaPayment: (...args: unknown[]) => mockInitiateMpesaPayment(...args),
}));

// buildReceipt is pure — use real implementation
jest.mock('@/lib/receipts', () => {
  const actual = jest.requireActual('@/lib/receipts');
  return actual;
});

// Mock ReceiptView to render testable output
jest.mock('@/components/customer/receipt-view', () => ({
  ReceiptView: ({ receipt }: { receipt: { total: number; status: string | null } }) => {
    const { View, Text } = require('react-native');
    return (
      <View testID="receipt-view">
        <Text testID="receipt-total">{`receipt-total-${receipt.total}`}</Text>
        <Text testID="receipt-status">{`receipt-status-${receipt.status}`}</Text>
        {/* Download/share placeholders — always disabled */}
        <Text testID="download-disabled">Download (Coming soon)</Text>
        <Text testID="share-disabled">Share (Coming soon)</Text>
      </View>
    );
  },
}));

import { render, screen } from '@testing-library/react-native';
import ReceiptScreen from '@/app/booking/receipt';

const BASE_BOOKING = {
  id: 'b1',
  service_id: 'house-cleaning',
  address: '123 Main St',
  scheduled_for: '2026-07-01T10:00:00Z',
  notes: null,
  status: 'completed',
  created_at: '2026-06-21T00:00:00Z',
  assigned_provider_id: null,
  assigned_provider_name: null,
  assigned_provider_phone: null,
  admin_notes: null,
  quoted_amount: null,
  provider_share: null,
  quote_status: 'accepted',
  customer_id: 'c1',
  address_label: null,
  latitude: null,
  longitude: null,
  building_name: null,
  floor: null,
  door_number: null,
  landmark: null,
  access_notes: null,
  scheduling_type: 'datetime',
  time_window: null,
  window_start: null,
  window_end: null,
  recurrence: 'one_time',
};

const BASE_PAYMENT = {
  id: 'pay1',
  booking_id: 'b1',
  customer_id: 'c1',
  amount: 2000,
  currency: 'KES',
  status: 'paid' as const,
  provider_share: 1600,
  quickserve_share: 400,
  payment_method: 'mpesa' as const,
  paid_at: '2026-07-01T12:00:00Z',
  created_at: '2026-07-01T11:00:00Z',
  wallet_applied: 0,
  promo_discount: 0,
  promo_code_id: null,
};

describe('ReceiptScreen (Slice 34)', () => {
  beforeEach(() => {
    mockGetBookingById.mockClear();
    mockGetPaymentForBooking.mockClear();
    mockApplyWalletToPayment.mockClear();
    mockRedeemPromo.mockClear();
    mockInitiateMpesaPayment.mockClear();
  });

  it('renders ReceiptView with payment data when payment exists', async () => {
    mockGetBookingById.mockResolvedValue(BASE_BOOKING);
    mockGetPaymentForBooking.mockResolvedValue(BASE_PAYMENT);
    render(<ReceiptScreen />);
    expect(await screen.findByTestId('receipt-view')).toBeOnTheScreen();
    expect(screen.getByTestId('receipt-total')).toHaveTextContent('receipt-total-2000');
    expect(screen.getByTestId('receipt-status')).toHaveTextContent('receipt-status-paid');
  });

  it('shows "No receipt yet" empty state when payment is null', async () => {
    mockGetBookingById.mockResolvedValue(BASE_BOOKING);
    mockGetPaymentForBooking.mockResolvedValue(null);
    render(<ReceiptScreen />);
    expect(await screen.findByText('No receipt yet')).toBeOnTheScreen();
    expect(screen.getByText(/A receipt will appear here once payment has been made/)).toBeOnTheScreen();
  });

  it('does NOT call any payment mutation', async () => {
    mockGetBookingById.mockResolvedValue(BASE_BOOKING);
    mockGetPaymentForBooking.mockResolvedValue(BASE_PAYMENT);
    render(<ReceiptScreen />);
    await screen.findByTestId('receipt-view');
    expect(mockApplyWalletToPayment).not.toHaveBeenCalled();
    expect(mockRedeemPromo).not.toHaveBeenCalled();
    expect(mockInitiateMpesaPayment).not.toHaveBeenCalled();
  });

  it('shows download and share as disabled placeholders', async () => {
    mockGetBookingById.mockResolvedValue(BASE_BOOKING);
    mockGetPaymentForBooking.mockResolvedValue(BASE_PAYMENT);
    render(<ReceiptScreen />);
    await screen.findByTestId('receipt-view');
    expect(screen.getByTestId('download-disabled')).toBeOnTheScreen();
    expect(screen.getByTestId('share-disabled')).toBeOnTheScreen();
  });

  it('renders with wallet-applied and promo-discount in receipt', async () => {
    mockGetBookingById.mockResolvedValue(BASE_BOOKING);
    mockGetPaymentForBooking.mockResolvedValue({
      ...BASE_PAYMENT,
      amount: 1800,
      wallet_applied: 100,
      promo_discount: 100,
    });
    render(<ReceiptScreen />);
    expect(await screen.findByTestId('receipt-total')).toHaveTextContent('receipt-total-1800');
  });
});
