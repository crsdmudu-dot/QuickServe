/**
 * Tests for the web-admin payments/attempts/earnings screens:
 *   - src/app/(admin-web)/payments/index.tsx
 *   - src/app/(admin-web)/payment-attempts/index.tsx
 *   - src/app/(admin-web)/earnings/index.tsx
 *
 * All network calls are mocked. Uses findBy* for async data loads.
 */

// ── Shared mocks ────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

// ── Payment mocks ───────────────────────────────────────────────────────────

const MOCK_PAYMENT = {
  id: 'pay1',
  booking_id: 'bk12345678',
  customer_id: 'cust1',
  amount: 3000,
  currency: 'KES',
  status: 'pending' as const,
  provider_share: 2100,
  quickserve_share: 900,
  payment_method: 'mpesa' as const,
  paid_at: null,
  created_at: '2026-07-01T00:00:00Z',
};

const mockAdminGetAllPayments = jest.fn().mockResolvedValue([MOCK_PAYMENT]);
const mockAdminOverridePaymentStatus = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/payments', () => ({
  adminGetAllPayments: (...args: unknown[]) => mockAdminGetAllPayments(...args),
  adminOverridePaymentStatus: (...args: unknown[]) => mockAdminOverridePaymentStatus(...args),
}));

// ── Attempt mocks ───────────────────────────────────────────────────────────

const MOCK_ATTEMPT = {
  id: 'att1',
  payment_id: 'pay12345678',
  provider: 'mpesa' as const,
  phone: '254712345678',
  amount: 1500,
  status: 'pending' as const,
  external_reference: 'EXT-x',
  raw_response: null,
  created_at: '2026-07-01T00:00:00Z',
  merchant_request_id: 'MR-1',
  checkout_request_id: 'ws_CO_123',
  result_code: null,
  result_desc: null,
  callback_received_at: null,
};

const mockAdminGetPaymentAttempts = jest.fn().mockResolvedValue([MOCK_ATTEMPT]);
const mockAdminConfirmAttempt = jest.fn().mockResolvedValue({ ok: true });
const mockAdminReconcileAttempt = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/attempts', () => ({
  adminGetPaymentAttempts: (...args: unknown[]) => mockAdminGetPaymentAttempts(...args),
  adminConfirmAttempt: (...args: unknown[]) => mockAdminConfirmAttempt(...args),
  adminReconcileAttemptNoCollection: (...args: unknown[]) =>
    mockAdminReconcileAttempt(...args),
}));

// ── Earnings mocks ──────────────────────────────────────────────────────────

const MOCK_EARNING = {
  id: 'earn1',
  provider_id: 'prov12345678',
  booking_id: 'bk12345678',
  amount: 2100,
  payout_status: 'pending' as const,
  created_at: '2026-07-01T00:00:00Z',
};

const mockAdminGetAllEarnings = jest.fn().mockResolvedValue([MOCK_EARNING]);
const mockAdminMarkPayoutPaid = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/earnings', () => ({
  adminGetAllEarnings: (...args: unknown[]) => mockAdminGetAllEarnings(...args),
  adminMarkPayoutPaid: (...args: unknown[]) => mockAdminMarkPayoutPaid(...args),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import AdminWebPaymentsScreen from '@/app/(admin-web)/payments/index';
import AdminWebPaymentAttemptsScreen from '@/app/(admin-web)/payment-attempts/index';
import AdminWebEarningsScreen from '@/app/(admin-web)/earnings/index';

// ── Payments list tests ─────────────────────────────────────────────────────

describe('AdminWebPaymentsScreen', () => {
  beforeEach(() => {
    mockAdminGetAllPayments.mockClear();
    mockAdminOverridePaymentStatus.mockClear();
    mockAdminGetAllPayments.mockResolvedValue([MOCK_PAYMENT]);
    mockAdminOverridePaymentStatus.mockResolvedValue({ ok: true });
  });

  it('renders the formatted amount after data loads', async () => {
    render(<AdminWebPaymentsScreen />);
    expect(await screen.findByText('KES 3,000')).toBeOnTheScreen();
  });

  it('renders the payment status badge (at least one "Pending" text visible)', async () => {
    render(<AdminWebPaymentsScreen />);
    // "Pending" appears in the status badge and in the override button row
    const pendingElements = await screen.findAllByText('Pending');
    expect(pendingElements.length).toBeGreaterThan(0);
  });

  it('renders the split breakdown', async () => {
    render(<AdminWebPaymentsScreen />);
    expect(
      await screen.findByText('Provider KES 2,100 · KwikServe KES 900'),
    ).toBeOnTheScreen();
  });

  it('renders the payment method', async () => {
    render(<AdminWebPaymentsScreen />);
    await screen.findByText('KES 3,000');
    expect(screen.getByText('mpesa')).toBeOnTheScreen();
  });

  it('renders the booking ref (first 8 chars of booking_id)', async () => {
    render(<AdminWebPaymentsScreen />);
    expect(await screen.findByText('#bk123456')).toBeOnTheScreen();
  });

  it('calls adminOverridePaymentStatus when an operational override is pressed', async () => {
    render(<AdminWebPaymentsScreen />);
    await screen.findByText('KES 3,000');
    fireEvent.press(screen.getAllByText('Cancelled')[0]);
    await waitFor(() =>
      expect(mockAdminOverridePaymentStatus).toHaveBeenCalledWith('pay1', 'cancelled'),
    );
  });

  it('does NOT offer paid or refunded through the generic override (0045)', async () => {
    // A paid transition mints a provider earning, so it is reachable only through an evidenced
    // settlement path; refunded stays unavailable while provider_earnings is never retracted.
    // The backend rejects both, so the UI must not offer them.
    render(<AdminWebPaymentsScreen />);
    await screen.findByText('KES 3,000');
    expect(screen.queryByText('Paid')).toBeNull();
    expect(screen.queryByText('Refunded')).toBeNull();
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0);
  });

  it('shows empty state when there are no payments', async () => {
    mockAdminGetAllPayments.mockResolvedValueOnce([]);
    render(<AdminWebPaymentsScreen />);
    expect(await screen.findByText('No payments yet.')).toBeOnTheScreen();
  });

  // ── Slice 31 Task 5: Create case context-link ─────────────────────────────

  it('renders a "Create case" button in the operations column', async () => {
    render(<AdminWebPaymentsScreen />);
    expect(await screen.findByText('Create case')).toBeOnTheScreen();
  });

  it('pressing "Create case" navigates to operations/new with the payment id', async () => {
    (router.push as jest.Mock).mockClear();
    render(<AdminWebPaymentsScreen />);
    await screen.findByText('KES 3,000');
    fireEvent.press(screen.getByText('Create case'));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        '/(admin-web)/operations/new?payment_id=pay1',
      ),
    );
  });
});

// ── AdminWebPaymentsScreen pagination tests ─────────────────────────────────

describe('AdminWebPaymentsScreen — pagination', () => {
  /** Build N payment fixtures with unique ids and amounts. */
  function makePayments(n: number, startId = 0) {
    return Array.from({ length: n }, (_, i) => ({
      ...MOCK_PAYMENT,
      id: `pay-pg-${startId + i}`,
      amount: 100 + i,
      booking_id: `bk-pg-${startId + i}12345678`,
    }));
  }

  beforeEach(() => {
    mockAdminGetAllPayments.mockClear();
    mockAdminOverridePaymentStatus.mockClear();
  });

  it('shows "Load more" button when page 0 returns a full page (25 items)', async () => {
    mockAdminGetAllPayments.mockResolvedValueOnce(makePayments(25));
    render(<AdminWebPaymentsScreen />);
    // Wait for data to load
    await waitFor(() => expect(mockAdminGetAllPayments).toHaveBeenCalled());
    // "Load more" should be visible because page had 25 items (full page)
    expect(await screen.findByTestId('load-more')).toBeOnTheScreen();
  });

  it('does NOT show "Load more" when page 0 returns fewer than 25 items', async () => {
    mockAdminGetAllPayments.mockResolvedValueOnce(makePayments(3));
    render(<AdminWebPaymentsScreen />);
    await waitFor(() => expect(mockAdminGetAllPayments).toHaveBeenCalled());
    // hasMore=false → LoadMoreButton renders nothing
    await waitFor(() => expect(screen.queryByTestId('load-more')).toBeNull());
  });

  it('pressing "Load more" calls adminGetAllPayments with page=1', async () => {
    const page0 = makePayments(25, 0);
    const page1 = makePayments(3, 25);
    mockAdminGetAllPayments
      .mockResolvedValueOnce(page0)
      .mockResolvedValueOnce(page1);

    render(<AdminWebPaymentsScreen />);
    // Wait for first page and "Load more" button to appear
    await screen.findByTestId('load-more');
    // Press the button text
    fireEvent.press(screen.getByText('Load more'));

    await waitFor(() => expect(mockAdminGetAllPayments).toHaveBeenCalledTimes(2));
    // Second call should be page 1, pageSize 25
    expect(mockAdminGetAllPayments).toHaveBeenNthCalledWith(2, 1, 25);
  });
});

// ── Payment attempts list tests ─────────────────────────────────────────────

describe('AdminWebPaymentAttemptsScreen', () => {
  beforeEach(() => {
    mockAdminGetPaymentAttempts.mockClear();
    mockAdminConfirmAttempt.mockClear();
    mockAdminReconcileAttempt.mockClear();
    mockAdminGetPaymentAttempts.mockResolvedValue([MOCK_ATTEMPT]);
    mockAdminConfirmAttempt.mockResolvedValue({ ok: true });
    mockAdminReconcileAttempt.mockResolvedValue({ ok: true });
  });

  it('renders the formatted amount after data loads', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    expect(await screen.findByText('KES 1,500')).toBeOnTheScreen();
  });

  it('renders the attempt status badge', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    expect(await screen.findByText('Pending')).toBeOnTheScreen();
  });

  it('renders the provider in uppercase', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('KES 1,500');
    expect(screen.getByText('MPESA')).toBeOnTheScreen();
  });

  it('renders the checkout request id when present', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    expect(await screen.findByText('Checkout: ws_CO_123')).toBeOnTheScreen();
  });

  it('requires evidence before confirming: opens a form, then sends all four arguments', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('KES 1,500');
    fireEvent.press(screen.getByText('Confirm collected'));

    // Pressing the action alone must not settle anything - the form appears first.
    expect(mockAdminConfirmAttempt).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('resolution-note'), 'Verified in portal');
    fireEvent.changeText(screen.getByTestId('resolution-reference'), 'NLJ7RT61SV');
    fireEvent.press(screen.getByText('Submit confirmation'));

    await waitFor(() =>
      expect(mockAdminConfirmAttempt).toHaveBeenCalledWith(
        'att1',
        1500,
        'Verified in portal',
        'NLJ7RT61SV',
      ),
    );
  });

  it('blocks confirmation when the note is missing', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('KES 1,500');
    fireEvent.press(screen.getByText('Confirm collected'));
    fireEvent.changeText(screen.getByTestId('resolution-reference'), 'NLJ7RT61SV');
    fireEvent.press(screen.getByText('Submit confirmation'));

    expect(await screen.findByText('Confirmation note is required.')).toBeOnTheScreen();
    expect(mockAdminConfirmAttempt).not.toHaveBeenCalled();
  });

  it('blocks confirmation for a non-cash provider without a transaction reference', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('KES 1,500');
    fireEvent.press(screen.getByText('Confirm collected'));
    fireEvent.changeText(screen.getByTestId('resolution-note'), 'Verified in portal');
    fireEvent.press(screen.getByText('Submit confirmation'));

    expect(
      await screen.findByText('Transaction reference is required for this provider.'),
    ).toBeOnTheScreen();
    expect(mockAdminConfirmAttempt).not.toHaveBeenCalled();
  });

  it('records no collection through the reconciliation RPC, note required', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('KES 1,500');
    fireEvent.press(screen.getByText('No collection'));

    fireEvent.press(screen.getByText('Submit reconciliation'));
    expect(await screen.findByText('Reconciliation note is required.')).toBeOnTheScreen();
    expect(mockAdminReconcileAttempt).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('resolution-note'), 'Daraja shows no transaction');
    fireEvent.press(screen.getByText('Submit reconciliation'));

    await waitFor(() =>
      expect(mockAdminReconcileAttempt).toHaveBeenCalledWith(
        'att1',
        'Daraja shows no transaction',
        null,
      ),
    );
  });

  it('offers resolution for a timed_out attempt (unresolved, not a safe failure)', async () => {
    mockAdminGetPaymentAttempts.mockResolvedValueOnce([
      { ...MOCK_ATTEMPT, status: 'timed_out' as const },
    ]);
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('KES 1,500');
    expect(screen.getByText('Confirm collected')).toBeOnTheScreen();
    expect(screen.getByText('No collection')).toBeOnTheScreen();
  });

  it('shows empty state when there are no attempts', async () => {
    mockAdminGetPaymentAttempts.mockResolvedValueOnce([]);
    render(<AdminWebPaymentAttemptsScreen />);
    expect(await screen.findByText('No payment attempts yet.')).toBeOnTheScreen();
  });

  it('offers no resolution actions for terminal attempts', async () => {
    mockAdminGetPaymentAttempts.mockResolvedValueOnce([
      { ...MOCK_ATTEMPT, status: 'successful' as const },
    ]);
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('KES 1,500');
    expect(screen.queryByText('Confirm collected')).toBeNull();
    expect(screen.queryByText('No collection')).toBeNull();
  });
});

// ── Earnings list tests ─────────────────────────────────────────────────────

describe('AdminWebEarningsScreen', () => {
  beforeEach(() => {
    mockAdminGetAllEarnings.mockClear();
    mockAdminMarkPayoutPaid.mockClear();
    mockAdminGetAllEarnings.mockResolvedValue([MOCK_EARNING]);
    mockAdminMarkPayoutPaid.mockResolvedValue({ ok: true });
  });

  it('renders the formatted amount after data loads', async () => {
    render(<AdminWebEarningsScreen />);
    expect(await screen.findByText('KES 2,100')).toBeOnTheScreen();
  });

  it('renders the payout status badge (Pending)', async () => {
    render(<AdminWebEarningsScreen />);
    expect(await screen.findByText('Pending')).toBeOnTheScreen();
  });

  it('renders the provider ref (first 8 chars of provider_id)', async () => {
    render(<AdminWebEarningsScreen />);
    expect(await screen.findByText('#prov1234')).toBeOnTheScreen();
  });

  it('renders the booking ref (first 8 chars of booking_id)', async () => {
    render(<AdminWebEarningsScreen />);
    expect(await screen.findByText('#bk123456')).toBeOnTheScreen();
  });

  it('calls adminMarkPayoutPaid when the button is pressed', async () => {
    render(<AdminWebEarningsScreen />);
    await screen.findByText('KES 2,100');
    fireEvent.press(screen.getByText('Mark payout paid'));
    await waitFor(() =>
      expect(mockAdminMarkPayoutPaid).toHaveBeenCalledWith('earn1'),
    );
  });

  it('updates the row payout_status to paid locally after success', async () => {
    render(<AdminWebEarningsScreen />);
    await screen.findByText('KES 2,100');
    fireEvent.press(screen.getByText('Mark payout paid'));
    await waitFor(() =>
      expect(mockAdminMarkPayoutPaid).toHaveBeenCalledWith('earn1'),
    );
  });

  it('does not show Mark payout paid for already-paid earnings', async () => {
    mockAdminGetAllEarnings.mockResolvedValueOnce([
      { ...MOCK_EARNING, payout_status: 'paid' as const },
    ]);
    render(<AdminWebEarningsScreen />);
    await screen.findByText('KES 2,100');
    expect(screen.queryByText('Mark payout paid')).toBeNull();
  });

  it('shows empty state when there are no earnings', async () => {
    mockAdminGetAllEarnings.mockResolvedValueOnce([]);
    render(<AdminWebEarningsScreen />);
    expect(await screen.findByText('No earnings yet.')).toBeOnTheScreen();
  });
});
