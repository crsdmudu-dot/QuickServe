/**
 * Tests for WalletTransactionRow.
 *
 * We mock @/lib/wallet to avoid Supabase initialization in the test env.
 * WALLET_TXN_TYPES is a pure constant so we keep it from the actual module
 * value (inlined here to avoid pulling supabase.ts into the test runner).
 */

import { render, screen } from '@testing-library/react-native';

// ── Mock @/lib/wallet to bypass Supabase init ─────────────────────────────────
jest.mock('@/lib/wallet', () => ({
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

import { WalletTransactionRow } from '@/components/ui/wallet-transaction-row';
import type { WalletTransaction } from '@/lib/wallet';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const creditTxn: WalletTransaction = {
  id: 'txn-1',
  wallet_id: 'w1',
  customer_id: 'c1',
  type: 'refund_credit',
  amount: 500,
  balance_after: 500,
  booking_id: null,
  payment_id: null,
  note: null,
  created_by: null,
  created_at: '2026-06-01T10:00:00Z',
};

const debitTxn: WalletTransaction = {
  id: 'txn-2',
  wallet_id: 'w1',
  customer_id: 'c1',
  type: 'payment_applied',
  amount: -300,
  balance_after: 200,
  booking_id: 'b1',
  payment_id: 'pay1',
  note: null,
  created_by: null,
  created_at: '2026-06-02T10:00:00Z',
};

const txnWithNote: WalletTransaction = {
  ...creditTxn,
  id: 'txn-3',
  note: 'Compensation for delay',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WalletTransactionRow', () => {
  it('credit txn (refund_credit / 500) shows "Refund" label and "+...500" amount', () => {
    render(<WalletTransactionRow txn={creditTxn} />);
    expect(screen.getByText('Refund')).toBeOnTheScreen();
    // Signed amount contains "+" prefix and "500"
    const amountEl = screen.getByText(/\+/);
    expect(amountEl.props.children).toContain('500');
  });

  it('debit txn (payment_applied / -300) shows "Applied to booking" label and "−" amount', () => {
    render(<WalletTransactionRow txn={debitTxn} />);
    expect(screen.getByText('Applied to booking')).toBeOnTheScreen();
    // Signed amount contains "−" (minus sign) and "300"
    const amountEl = screen.getByText(/−/);
    expect(amountEl.props.children).toContain('300');
  });

  it('renders the note when present', () => {
    render(<WalletTransactionRow txn={txnWithNote} />);
    expect(screen.getByText('Compensation for delay')).toBeOnTheScreen();
  });
});
