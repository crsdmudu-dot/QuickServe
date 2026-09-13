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

// ── 0053 review mock (the web attempts screen reads the review RPC, not the raw table) ──────
const MOCK_REVIEW_ROW = {
  attempt_id: 'a1',
  payment_id: 'pay123456-0000-0000-0000-000000000000',
  booking_id: 'bk123456-0000-0000-0000-000000000000',
  status: 'timed_out' as const,
  amount: 1500,
  created_at: '2026-06-24T00:00:00Z',
  age_seconds: 900,
  callback_received_at: null,
  result_code: null,
  result_desc: null,
  checkout_request_id: 'ws_CO_123',
  merchant_request_id: 'MR-1',
  has_collected_amount: false,
  has_settlement_reference: false,
  discrepancy_count: 0,
  latest_discrepancy_type: null,
  payment_status: 'pending',
  blocks_retry: true,
  needs_operator: true,
  resolved_at: null,
  resolved_by_present: false,
  resolution_note: null,
  resolution_reference: null,
  category: 'reconcile' as const,
  urgency: 'due' as const,
  phone_masked: '***678',
};
const mockAdminGetMpesaAttemptReview = jest.fn().mockResolvedValue([MOCK_REVIEW_ROW]);
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/mpesa-ops', () => {
  const actual = jest.requireActual('@/lib/mpesa-ops');
  return {
    ...actual,
    adminGetMpesaAttemptReview: (...a: unknown[]) => mockAdminGetMpesaAttemptReview(...a),
    adminGetMpesaCallbackEvents: jest.fn().mockResolvedValue([]),
    adminReviewMpesaCallbackEvent: jest.fn().mockResolvedValue({ ok: true }),
  };
});

// ── Earnings mocks ──────────────────────────────────────────────────────────

const MOCK_LEDGER = {
  earning_id: 'earn1',
  booking_id: 'bk123456-0000-0000-0000-000000000000',
  provider_id: 'prov1234-0000-0000-0000-000000000000',
  provider_entitlement: 2100,
  deductions_total: 0,
  net_provider_payable: 2100,
  amount_disbursed: 0,
  outstanding_provider_liability: 2100,
  stored_payout_status: 'pending' as const,
  derived_payout_status: 'pending' as const,
};

const mockAdminGetPayoutLedger = jest.fn().mockResolvedValue([MOCK_LEDGER]);

jest.mock('@/lib/earnings', () => ({
  adminGetPayoutLedger: (...args: unknown[]) => mockAdminGetPayoutLedger(...args),
}));

jest.mock('@/components/admin-web/admin-provider-payout-panel', () => ({
  AdminProviderPayoutPanel: () => null,
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

describe('AdminWebPaymentAttemptsScreen (reconciliation queue, 0053 review RPC)', () => {
  // Behavioural coverage of the queue, the two-step confirmation and the evidence rules lives in
  // admin-web-payment-attempts-review.test.tsx. This block keeps the screen's basic contract:
  // it renders review rows, offers the two protected actions only for resolvable statuses, and
  // never exposes a raw MSISDN.
  beforeEach(() => {
    mockAdminGetMpesaAttemptReview.mockClear();
    mockAdminGetMpesaAttemptReview.mockResolvedValue([MOCK_REVIEW_ROW]);
  });

  it('renders the formatted amount and the masked phone after data loads', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    expect(await screen.findByText('KES 1,500')).toBeOnTheScreen();
    expect(screen.getByText('***678')).toBeOnTheScreen();
    expect(screen.queryByText(/254712345678/)).toBeNull();
  });

  it('offers resolution for a timed_out attempt (unresolved, not a safe failure)', async () => {
    render(<AdminWebPaymentAttemptsScreen />);
    await screen.findByText('KES 1,500');
    expect(screen.getByTestId('confirm-a1')).toBeOnTheScreen();
    expect(screen.getByTestId('nocollect-a1')).toBeOnTheScreen();
    expect(screen.getByText('Reconciliation required')).toBeOnTheScreen();
  });

  it('offers no resolution actions for terminal attempts', async () => {
    mockAdminGetMpesaAttemptReview.mockResolvedValueOnce([
      { ...MOCK_REVIEW_ROW, attempt_id: 'a2', status: 'failed' as const, category: 'failed' as const, urgency: 'normal' as const, blocks_retry: false, needs_operator: false },
    ]);
    render(<AdminWebPaymentAttemptsScreen />);
    fireEvent.press(await screen.findByText('Show all'));
    await screen.findByText('Provider reported failure');
    expect(screen.queryByTestId('confirm-a2')).toBeNull();
    expect(screen.queryByTestId('nocollect-a2')).toBeNull();
  });

  it('shows the needs-attention empty state when nothing requires an operator', async () => {
    mockAdminGetMpesaAttemptReview.mockResolvedValueOnce([]);
    render(<AdminWebPaymentAttemptsScreen />);
    expect(await screen.findByText('Nothing needs an operator right now.')).toBeOnTheScreen();
  });
});

describe('AdminWebEarningsScreen', () => {
  beforeEach(() => {
    mockAdminGetPayoutLedger.mockClear();
    mockAdminGetPayoutLedger.mockResolvedValue([MOCK_LEDGER]);
  });

  it('renders the provider entitlement after data loads', async () => {
    render(<AdminWebEarningsScreen />);
    expect(await screen.findAllByText('KES 2,100')).not.toHaveLength(0);
  });

  it('renders the payout status badge (Pending)', async () => {
    render(<AdminWebEarningsScreen />);
    expect(await screen.findByText('Pending')).toBeOnTheScreen();
  });

  it('supports the partially_paid status introduced by Provider Payout V1', async () => {
    // Amounts are authoritative: a partial payout leaves a real remaining liability.
    mockAdminGetPayoutLedger.mockResolvedValueOnce([
      {
        ...MOCK_LEDGER,
        amount_disbursed: 500,
        outstanding_provider_liability: 1600,
        stored_payout_status: 'partially_paid' as const,
        derived_payout_status: 'partially_paid' as const,
      },
    ]);
    render(<AdminWebEarningsScreen />);
    expect(await screen.findByText('Partially paid')).toBeOnTheScreen();
  });

  it('renders the provider ref (first 8 chars of provider_id)', async () => {
    render(<AdminWebEarningsScreen />);
    expect(await screen.findByText('#prov1234')).toBeOnTheScreen();
  });

  it('never badges a zero-liability earning as Pending, even when the stored status lags', async () => {
    // Certified Production shape: provider_share 0 → earning amount 0, column default 'pending'.
    mockAdminGetPayoutLedger.mockResolvedValueOnce([
      {
        ...MOCK_LEDGER,
        provider_entitlement: 0,
        net_provider_payable: 0,
        outstanding_provider_liability: 0,
        stored_payout_status: 'pending' as const,
        derived_payout_status: 'pending' as const,
      },
    ]);
    render(<AdminWebEarningsScreen />);
    expect(await screen.findByText('Paid')).toBeOnTheScreen();
    expect(screen.queryByText('Pending')).toBeNull();
    expect(screen.queryByText('Record payout')).toBeNull();
  });

  it('never badges a fully-deducted earning as Pending', async () => {
    mockAdminGetPayoutLedger.mockResolvedValueOnce([
      {
        ...MOCK_LEDGER,
        deductions_total: 2100,
        net_provider_payable: 0,
        outstanding_provider_liability: 0,
        stored_payout_status: 'pending' as const,
        derived_payout_status: 'pending' as const,
      },
    ]);
    render(<AdminWebEarningsScreen />);
    expect(await screen.findByText('Paid')).toBeOnTheScreen();
    expect(screen.queryByText('Pending')).toBeNull();
  });

  it('renders the booking ref (first 8 chars of booking_id)', async () => {
    render(<AdminWebEarningsScreen />);
    expect(await screen.findByText('#bk123456')).toBeOnTheScreen();
  });

  it('offers Record payout, never wording that implies KwikServe sends the money', async () => {
    render(<AdminWebEarningsScreen />);
    expect(await screen.findByText('Record payout')).toBeOnTheScreen();
    expect(screen.queryByText('Mark payout paid')).toBeNull();
    expect(screen.queryByText('Send payout')).toBeNull();
    expect(screen.queryByText('Pay provider now')).toBeNull();
    expect(screen.queryByText('Transfer funds')).toBeNull();
  });

  it('does not offer payout recording when nothing is outstanding', async () => {
    mockAdminGetPayoutLedger.mockResolvedValueOnce([
      {
        ...MOCK_LEDGER,
        amount_disbursed: 2100,
        outstanding_provider_liability: 0,
        stored_payout_status: 'paid' as const,
      },
    ]);
    render(<AdminWebEarningsScreen />);
    expect(await screen.findByText('View ledger')).toBeOnTheScreen();
    expect(screen.queryByText('Record payout')).toBeNull();
  });

  it('shows empty state when there are no earnings', async () => {
    mockAdminGetPayoutLedger.mockResolvedValueOnce([]);
    render(<AdminWebEarningsScreen />);
    expect(await screen.findByText('No earnings yet.')).toBeOnTheScreen();
  });
});

// ── Desktop layout polish ─────────────────────────────────────────────────────
// Flattens nested style arrays without touching StyleSheet (keeps this suite free of require())
const flatStyle = (s: unknown): Record<string, unknown> =>
  Array.isArray(s) ? Object.assign({}, ...s.map(flatStyle)) : s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
describe('admin payments / attempts / earnings — desktop layout', () => {
  it('payments: in-row status actions and Create case use the compact size', async () => {
    render(<AdminWebPaymentsScreen />);
    await screen.findByText('KES 3,000');
    const inRow = screen.queryAllByRole('button', { name: /^(Pending|Paid|Cancelled|Failed|Refunded|Create case)$/ });
    expect(inRow.length).toBeGreaterThan(0);
    for (const b of inRow) expect(b).toHaveStyle({ height: 36 });
  });
  it('earnings: the row action is compact and its column fits it', async () => {
    render(<AdminWebEarningsScreen />);
    const btn = (await screen.findAllByRole('button', { name: /^(Record payout|View ledger)$/ }))[0];
    expect(btn).toHaveStyle({ height: 36 });
    let node: any = screen.getByText('Actions');
    let width: unknown;
    for (let i = 0; i < 6 && node && width === undefined; i++) { width = flatStyle(node.props?.style).width; node = node.parent; }
    expect(width).toBe(140);
  });
});

// ── Split column distribution (final admin UI pass) ───────────────────────────
describe('AdminWebPaymentsScreen — Split column', () => {
  it('lets Split absorb the free table width over a 220px floor while the other columns stay fixed', async () => {
    render(<AdminWebPaymentsScreen />);
    await screen.findByText('KES 3,000');
    const cellStyleOf = (label: string): Record<string, unknown> => {
      let node: any = screen.getAllByText(label).at(-1);
      for (let i = 0; i < 6 && node; i++) { const st = flatStyle(node.props?.style); if (st.flexBasis !== undefined || st.width !== undefined) return st; node = node.parent; }
      return {};
    };
    const split = cellStyleOf('Split');
    expect(split.width).toBeUndefined();
    expect(split.flexGrow).toBeGreaterThan(0);
    expect(split.flexShrink).toBe(0);
    expect(split.flexBasis).toBe(220);
    expect(split.minWidth).toBe(220);
    for (const h of ['Amount', 'Status', 'Method', 'Booking', 'Date', 'Override', 'Operations']) expect(typeof cellStyleOf(h).width).toBe('number');
  });
});
