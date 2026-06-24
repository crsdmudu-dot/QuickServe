/**
 * Tests for src/app/(customer)/payments.tsx
 *
 * Mirrors customer-bookings.test.tsx. Mocks expo-router and @/lib/payments so
 * no network calls are made.  Uses findBy* to await state settle after
 * getMyPayments resolves.
 *
 * SECURITY assertion: provider_share and quickserve_share values are NEVER
 * rendered — the customer must not see the split breakdown.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

const mockGetMyPayments = jest.fn().mockResolvedValue([
  {
    id: 'pay1',
    booking_id: 'b1',
    customer_id: 'c1',
    amount: 3000,
    currency: 'KES',
    status: 'pending' as const,
    provider_share: 2100,
    quickserve_share: 900,
    paid_at: null,
    created_at: '2026-06-21T00:00:00Z',
  },
]);

jest.mock('@/lib/payments', () => ({
  getMyPayments: (...args: unknown[]) => mockGetMyPayments(...args),
}));

import { render, screen } from '@testing-library/react-native';
import CustomerPaymentsScreen from '@/app/(customer)/payments';

describe('CustomerPaymentsScreen', () => {
  beforeEach(() => {
    mockGetMyPayments.mockClear();
    mockGetMyPayments.mockResolvedValue([
      {
        id: 'pay1',
        booking_id: 'b1',
        customer_id: 'c1',
        amount: 3000,
        currency: 'KES',
        status: 'pending' as const,
        provider_share: 2100,
        quickserve_share: 900,
        paid_at: null,
        created_at: '2026-06-21T00:00:00Z',
      },
    ]);
  });

  it('renders the formatted amount after payments load', async () => {
    render(<CustomerPaymentsScreen />);
    expect(await screen.findByText('KES 3,000')).toBeOnTheScreen();
  });

  it('renders the payment status badge after payments load', async () => {
    render(<CustomerPaymentsScreen />);
    expect(await screen.findByText('Pending')).toBeOnTheScreen();
  });

  it('SECURITY: never renders provider_share or quickserve_share amounts', async () => {
    render(<CustomerPaymentsScreen />);
    // Wait for data to load
    await screen.findByText('KES 3,000');
    // Split values must not appear anywhere in the customer UI
    expect(screen.queryByText('KES 2,100')).toBeNull();
    expect(screen.queryByText('KES 900')).toBeNull();
  });

  it('shows empty state when there are no payments', async () => {
    mockGetMyPayments.mockResolvedValueOnce([]);
    render(<CustomerPaymentsScreen />);
    expect(await screen.findByText('No payments yet')).toBeOnTheScreen();
  });
});
