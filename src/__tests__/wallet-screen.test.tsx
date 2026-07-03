/**
 * Tests for src/app/wallet.tsx — Customer wallet screen.
 *
 * Mocks @/lib/wallet so no Supabase calls are made, and expo-router so
 * router.back() doesn't crash. Uses waitFor / findBy to wait for the async
 * data load to settle.
 */

// ── expo-router ───────────────────────────────────────────────────────────────
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));

// ── @/lib/wallet — mock data functions; keep WALLET_TXN_TYPES as a constant ──
const mockGetMyWallet = jest.fn();
const mockGetMyWalletTransactions = jest.fn();

jest.mock('@/lib/wallet', () => ({
  getMyWallet: (...args: unknown[]) => mockGetMyWallet(...args),
  getMyWalletTransactions: (...args: unknown[]) => mockGetMyWalletTransactions(...args),
  WALLET_TXN_TYPES: {
    admin_credit:    { label: 'Admin credit',      direction: 'credit' },
    admin_debit:     { label: 'Admin debit',        direction: 'debit'  },
    refund_credit:   { label: 'Refund',             direction: 'credit' },
    promo_credit:    { label: 'Promo credit',       direction: 'credit' },
    referral_credit: { label: 'Referral reward',    direction: 'credit' },
    gift_credit:     { label: 'Gift credit',        direction: 'credit' },
    payment_applied: { label: 'Applied to booking', direction: 'debit'  },
    adjustment:      { label: 'Adjustment',         direction: 'credit' },
  },
}));

import { render, screen, waitFor } from '@testing-library/react-native';
import WalletScreen from '@/app/wallet';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const walletFixture = {
  id: 'w1',
  customer_id: 'c1',
  balance: 1200,
  currency: 'KES',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
};

const txnFixtures = [
  {
    id: 'txn-1',
    wallet_id: 'w1',
    customer_id: 'c1',
    type: 'refund_credit' as const,
    amount: 500,
    balance_after: 1200,
    booking_id: null,
    payment_id: null,
    note: null,
    created_by: null,
    created_at: '2026-06-01T10:00:00Z',
  },
  {
    id: 'txn-2',
    wallet_id: 'w1',
    customer_id: 'c1',
    type: 'payment_applied' as const,
    amount: -300,
    balance_after: 700,
    booking_id: 'b1',
    payment_id: 'pay1',
    note: null,
    created_by: null,
    created_at: '2026-05-28T08:00:00Z',
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WalletScreen', () => {
  beforeEach(() => {
    mockGetMyWallet.mockClear();
    mockGetMyWalletTransactions.mockClear();
    mockGetMyWallet.mockResolvedValue(walletFixture);
    mockGetMyWalletTransactions.mockResolvedValue(txnFixtures);
  });

  it('renders the available balance after data loads', async () => {
    render(<WalletScreen />);
    // formatKes(1200) → "KES 1,200"
    await waitFor(() => {
      expect(screen.getByText('KES 1,200')).toBeOnTheScreen();
    });
  });

  it('renders both transaction rows after data loads', async () => {
    render(<WalletScreen />);
    await waitFor(() => {
      expect(screen.getByText('Refund')).toBeOnTheScreen();
      expect(screen.getByText('Applied to booking')).toBeOnTheScreen();
    });
  });

  it('shows the empty state when there are no transactions', async () => {
    mockGetMyWalletTransactions.mockResolvedValue([]);
    render(<WalletScreen />);
    await waitFor(() => {
      expect(screen.getByText('No wallet activity yet')).toBeOnTheScreen();
    });
  });
});
