/**
 * Tests for src/components/admin-web/admin-wallet-panel.tsx
 *
 * Verifies:
 *   - Balance and transaction history render correctly.
 *   - "Apply adjustment" button is disabled until amount > 0 AND note non-empty.
 *   - Submitting with admin_debit calls adminAdjustWallet with a negative amount.
 *   - Submitting with a credit type calls adminAdjustWallet with a positive amount.
 *   - An adminAdjustWallet error renders in the UI.
 */

// ── @/lib/wallet mock ──────────────────────────────────────────────────────

const mockAdminGetWallet = jest.fn();
const mockAdminGetWalletTransactions = jest.fn();
const mockAdminAdjustWallet = jest.fn();

jest.mock('@/lib/wallet', () => ({
  adminGetWallet: (...args: unknown[]) => mockAdminGetWallet(...args),
  adminGetWalletTransactions: (...args: unknown[]) =>
    mockAdminGetWalletTransactions(...args),
  adminAdjustWallet: (...args: unknown[]) => mockAdminAdjustWallet(...args),
  // Keep WALLET_TXN_TYPES as the real constant so the panel renders labels correctly.
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

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AdminWalletPanel } from '@/components/admin-web/admin-wallet-panel';

// ── Fixtures ───────────────────────────────────────────────────────────────

const walletFixture = {
  id: 'w1',
  customer_id: 'cust1',
  balance: 1500,
  currency: 'KES',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
};

const txnFixtures = [
  {
    id: 'txn-1',
    wallet_id: 'w1',
    customer_id: 'cust1',
    type: 'admin_credit' as const,
    amount: 500,
    balance_after: 1500,
    booking_id: null,
    payment_id: 'pay-abcdef12',
    note: 'Goodwill credit for late arrival',
    // Deliberately distinct first-8 prefix: 'adminact' (8 chars)
    created_by: 'adminact-aaaa-bbbb-cccc-dddddddddddd',
    created_at: '2026-06-01T10:00:00Z',
  },
  {
    id: 'txn-2',
    wallet_id: 'w1',
    customer_id: 'cust1',
    type: 'admin_debit' as const,
    amount: -200,
    balance_after: 1000,
    booking_id: null,
    payment_id: null,
    note: 'Adjustment for duplicate credit',
    created_by: 'supportop-1111-2222-3333-444444444444',
    created_at: '2026-05-28T08:00:00Z',
  },
];

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AdminWalletPanel', () => {
  beforeEach(() => {
    mockAdminGetWallet.mockClear();
    mockAdminGetWalletTransactions.mockClear();
    mockAdminAdjustWallet.mockClear();

    mockAdminGetWallet.mockResolvedValue(walletFixture);
    mockAdminGetWalletTransactions.mockResolvedValue(txnFixtures);
    mockAdminAdjustWallet.mockResolvedValue({ ok: true });
  });

  // ── Balance + history rendering ────────────────────────────────────────

  it('renders the balance after data loads', async () => {
    render(<AdminWalletPanel customerId="cust1" />);
    // formatKes(1500) → "KES 1,500"
    await waitFor(() => {
      expect(screen.getByText('KES 1,500')).toBeOnTheScreen();
    });
  });

  it('renders a transaction row with note and created_by slice', async () => {
    render(<AdminWalletPanel customerId="cust1" />);
    await waitFor(() => {
      // Note text
      expect(screen.getByText('Goodwill credit for late arrival')).toBeOnTheScreen();
      // created_by slice: first 8 chars of 'adminact-aaaa-...' → 'adminact'
      expect(screen.getByText('Actor #adminact')).toBeOnTheScreen();
    });
  });

  it('renders the payment ref when payment_id is present', async () => {
    render(<AdminWalletPanel customerId="cust1" />);
    await waitFor(() => {
      // payment_id slice: first 8 chars of 'pay-abcdef12' → 'pay-abcd'
      expect(screen.getByText('Ref #pay-abcd')).toBeOnTheScreen();
    });
  });

  it('shows "No wallet activity." when there are no transactions', async () => {
    mockAdminGetWalletTransactions.mockResolvedValue([]);
    render(<AdminWalletPanel customerId="cust1" />);
    await waitFor(() => {
      expect(screen.getByText('No wallet activity.')).toBeOnTheScreen();
    });
  });

  // ── Apply adjustment button disabled logic ─────────────────────────────

  it('Apply adjustment button is disabled when amount and note are empty', async () => {
    render(<AdminWalletPanel customerId="cust1" />);
    await waitFor(() => screen.getByText('KES 1,500'));

    // Use getByRole to get the button (not the SectionHeader text with the same label)
    const pressable = screen.getByRole('button', { name: 'Apply adjustment' });
    expect(pressable).toBeDisabled();
  });

  it('Apply adjustment button is disabled when only amount is filled', async () => {
    render(<AdminWalletPanel customerId="cust1" />);
    await waitFor(() => screen.getByText('KES 1,500'));

    fireEvent.changeText(screen.getByPlaceholderText('e.g. 500'), '200');
    const pressable = screen.getByRole('button', { name: 'Apply adjustment' });
    expect(pressable).toBeDisabled();
  });

  it('Apply adjustment button is disabled when only note is filled', async () => {
    render(<AdminWalletPanel customerId="cust1" />);
    await waitFor(() => screen.getByText('KES 1,500'));

    fireEvent.changeText(
      screen.getByPlaceholderText('Reason for this adjustment…'),
      'Some reason',
    );
    const pressable = screen.getByRole('button', { name: 'Apply adjustment' });
    expect(pressable).toBeDisabled();
  });

  it('Apply adjustment button is enabled when amount > 0 AND note non-empty', async () => {
    render(<AdminWalletPanel customerId="cust1" />);
    await waitFor(() => screen.getByText('KES 1,500'));

    fireEvent.changeText(screen.getByPlaceholderText('e.g. 500'), '300');
    fireEvent.changeText(
      screen.getByPlaceholderText('Reason for this adjustment…'),
      'Refund for issue',
    );
    const pressable = screen.getByRole('button', { name: 'Apply adjustment' });
    expect(pressable).not.toBeDisabled();
  });

  // ── Submission: sign derivation ───────────────────────────────────────

  it('submitting with admin_debit calls adminAdjustWallet with a NEGATIVE amount', async () => {
    render(<AdminWalletPanel customerId="cust1" />);
    await waitFor(() => screen.getByText('KES 1,500'));

    // Select admin_debit chip
    fireEvent.press(screen.getByRole('button', { name: 'Admin debit' }));

    fireEvent.changeText(screen.getByPlaceholderText('e.g. 500'), '200');
    fireEvent.changeText(
      screen.getByPlaceholderText('Reason for this adjustment…'),
      'Over-credit correction',
    );

    fireEvent.press(screen.getByRole('button', { name: 'Apply adjustment' }));

    await waitFor(() => {
      expect(mockAdminAdjustWallet).toHaveBeenCalledWith(
        'cust1',
        'admin_debit',
        -200,
        'Over-credit correction',
      );
    });
  });

  it('submitting with admin_credit calls adminAdjustWallet with a POSITIVE amount', async () => {
    render(<AdminWalletPanel customerId="cust1" />);
    await waitFor(() => screen.getByText('KES 1,500'));

    // admin_credit is the default — no chip press needed
    fireEvent.changeText(screen.getByPlaceholderText('e.g. 500'), '750');
    fireEvent.changeText(
      screen.getByPlaceholderText('Reason for this adjustment…'),
      'Loyalty bonus',
    );

    fireEvent.press(screen.getByRole('button', { name: 'Apply adjustment' }));

    await waitFor(() => {
      expect(mockAdminAdjustWallet).toHaveBeenCalledWith(
        'cust1',
        'admin_credit',
        750,
        'Loyalty bonus',
      );
    });
  });

  it('clears form fields after a successful submission', async () => {
    render(<AdminWalletPanel customerId="cust1" />);
    await waitFor(() => screen.getByText('KES 1,500'));

    fireEvent.changeText(screen.getByPlaceholderText('e.g. 500'), '100');
    fireEvent.changeText(
      screen.getByPlaceholderText('Reason for this adjustment…'),
      'Test',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Apply adjustment' }));

    await waitFor(() => {
      expect(mockAdminAdjustWallet).toHaveBeenCalled();
    });

    // After success, inputs should be cleared
    const amountInput = screen.getByPlaceholderText('e.g. 500');
    const noteInput = screen.getByPlaceholderText('Reason for this adjustment…');
    expect(amountInput.props.value).toBe('');
    expect(noteInput.props.value).toBe('');
  });

  // ── Error rendering ────────────────────────────────────────────────────

  it('renders an error message when adminAdjustWallet returns an error', async () => {
    mockAdminAdjustWallet.mockResolvedValue({
      ok: false,
      error: 'Insufficient balance for debit.',
    });

    render(<AdminWalletPanel customerId="cust1" />);
    await waitFor(() => screen.getByText('KES 1,500'));

    fireEvent.changeText(screen.getByPlaceholderText('e.g. 500'), '9999');
    fireEvent.changeText(
      screen.getByPlaceholderText('Reason for this adjustment…'),
      'Should fail',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Apply adjustment' }));

    await waitFor(() => {
      expect(screen.getByText('Insufficient balance for debit.')).toBeOnTheScreen();
    });
  });

  it('renders a fallback error when adminAdjustWallet returns ok:false with no message', async () => {
    mockAdminAdjustWallet.mockResolvedValue({ ok: false });

    render(<AdminWalletPanel customerId="cust1" />);
    await waitFor(() => screen.getByText('KES 1,500'));

    fireEvent.changeText(screen.getByPlaceholderText('e.g. 500'), '100');
    fireEvent.changeText(
      screen.getByPlaceholderText('Reason for this adjustment…'),
      'Fallback test',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Apply adjustment' }));

    await waitFor(() => {
      expect(screen.getByText('Could not adjust wallet.')).toBeOnTheScreen();
    });
  });
});
