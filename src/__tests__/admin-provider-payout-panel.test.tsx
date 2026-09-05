/**
 * admin-provider-payout-panel.test.tsx — Provider Payout V1 admin panel.
 *
 * Focus: the properties that protect money — idempotency-key lifecycle, the zero-outstanding
 * block, and wording that never implies KwikServe is initiating a transfer.
 */

// The real @/lib/earnings is loaded via requireActual for its pure helpers, and it imports the
// Supabase client, which throws without env. Stub the client — no query in this suite reaches it.
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

const mockAdminGetPayoutLedger = jest.fn();
const mockGetEarningDeductions = jest.fn().mockResolvedValue([]);
const mockGetEarningPayouts = jest.fn().mockResolvedValue([]);
const mockAdminRecordProviderPayout = jest.fn();
const mockAdminRecordProviderDeduction = jest.fn();
const mockAdminReverseProviderDeduction = jest.fn();

const actual = jest.requireActual('@/lib/earnings');

jest.mock('@/lib/earnings', () => ({
  // Pure helpers and closed lists are the real implementations — they are the contract under test.
  DEDUCTION_CATEGORIES: jest.requireActual('@/lib/earnings').DEDUCTION_CATEGORIES,
  PAYOUT_METHODS: jest.requireActual('@/lib/earnings').PAYOUT_METHODS,
  evidenceFieldFor: jest.requireActual('@/lib/earnings').evidenceFieldFor,
  isDeductionReversed: jest.requireActual('@/lib/earnings').isDeductionReversed,
  validateDeductionInput: jest.requireActual('@/lib/earnings').validateDeductionInput,
  validatePayoutInput: jest.requireActual('@/lib/earnings').validatePayoutInput,
  newPayoutIdempotencyKey: jest.requireActual('@/lib/earnings').newPayoutIdempotencyKey,
  adminGetPayoutLedger: (...a: unknown[]) => mockAdminGetPayoutLedger(...a),
  getEarningDeductions: (...a: unknown[]) => mockGetEarningDeductions(...a),
  getEarningPayouts: (...a: unknown[]) => mockGetEarningPayouts(...a),
  adminRecordProviderPayout: (...a: unknown[]) => mockAdminRecordProviderPayout(...a),
  adminRecordProviderDeduction: (...a: unknown[]) => mockAdminRecordProviderDeduction(...a),
  adminReverseProviderDeduction: (...a: unknown[]) => mockAdminReverseProviderDeduction(...a),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AdminProviderPayoutPanel } from '@/components/admin-web/admin-provider-payout-panel';

const LEDGER = {
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

beforeEach(() => {
  jest.clearAllMocks();
  mockAdminGetPayoutLedger.mockResolvedValue([LEDGER]);
  mockGetEarningDeductions.mockResolvedValue([]);
  mockGetEarningPayouts.mockResolvedValue([]);
});

/** Drive the payout form to the confirmation step with a valid cash payout. */
async function fillValidPayout() {
  fireEvent.changeText(await screen.findByTestId('payout-amount'), '500');
  fireEvent.press(screen.getByTestId('payout-method-cash'));
  fireEvent.changeText(screen.getByTestId('payout-note'), 'handed over in person');
  fireEvent.press(screen.getByTestId('payout-review'));
}

describe('AdminProviderPayoutPanel — wording', () => {
  it('says Record payout and never implies KwikServe sends the money', async () => {
    render(<AdminProviderPayoutPanel earningId="earn1" />);
    expect(await screen.findByText('Record a payout already made')).toBeOnTheScreen();
    for (const forbidden of ['Send payout', 'Pay provider now', 'Transfer funds', 'Mark payout paid']) {
      expect(screen.queryByText(forbidden)).toBeNull();
    }
  });
});

describe('AdminProviderPayoutPanel — zero outstanding', () => {
  it('offers no payout form when nothing is outstanding', async () => {
    mockAdminGetPayoutLedger.mockResolvedValue([
      { ...LEDGER, amount_disbursed: 2100, outstanding_provider_liability: 0, stored_payout_status: 'paid' as const },
    ]);
    render(<AdminProviderPayoutPanel earningId="earn1" />);
    expect(await screen.findByTestId('nothing-outstanding')).toBeOnTheScreen();
    expect(screen.queryByTestId('payout-amount')).toBeNull();
    expect(screen.queryByTestId('payout-review')).toBeNull();
  });

  it('offers no payout form for a fully-deducted earning even though status is pending', async () => {
    // net payable 0, nothing disbursed: the amounts are authoritative, not the status label.
    mockAdminGetPayoutLedger.mockResolvedValue([
      {
        ...LEDGER,
        deductions_total: 2100,
        net_provider_payable: 0,
        outstanding_provider_liability: 0,
        stored_payout_status: 'pending' as const,
      },
    ]);
    render(<AdminProviderPayoutPanel earningId="earn1" />);
    expect(await screen.findByTestId('nothing-outstanding')).toBeOnTheScreen();
    expect(screen.queryByTestId('payout-review')).toBeNull();
  });
});

describe('AdminProviderPayoutPanel — confirmation step', () => {
  it('requires an explicit confirmation before recording a financial event', async () => {
    render(<AdminProviderPayoutPanel earningId="earn1" />);
    await fillValidPayout();
    expect(await screen.findByTestId('payout-confirmation')).toBeOnTheScreen();
    expect(mockAdminRecordProviderPayout).not.toHaveBeenCalled();
  });
});

describe('AdminProviderPayoutPanel — idempotency lifecycle', () => {
  it('reuses the SAME key when the same submission is retried after a failure', async () => {
    mockAdminRecordProviderPayout.mockResolvedValue({ ok: false, error: 'Network timeout' });
    render(<AdminProviderPayoutPanel earningId="earn1" />);
    await fillValidPayout();

    fireEvent.press(await screen.findByTestId('payout-submit'));
    await waitFor(() => expect(mockAdminRecordProviderPayout).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByTestId('payout-submit'));
    await waitFor(() => expect(mockAdminRecordProviderPayout).toHaveBeenCalledTimes(2));

    const first = mockAdminRecordProviderPayout.mock.calls[0][0].idempotencyKey;
    const second = mockAdminRecordProviderPayout.mock.calls[1][0].idempotencyKey;
    expect(second).toBe(first);
  });

  it('issues a NEW key for a distinct payout after a successful submission', async () => {
    mockAdminRecordProviderPayout.mockResolvedValue({ ok: true, data: { payout_id: 'p1' } });
    render(<AdminProviderPayoutPanel earningId="earn1" />);

    await fillValidPayout();
    fireEvent.press(await screen.findByTestId('payout-submit'));
    await waitFor(() => expect(mockAdminRecordProviderPayout).toHaveBeenCalledTimes(1));

    // Form reset after success; record a second, distinct payout.
    await fillValidPayout();
    fireEvent.press(await screen.findByTestId('payout-submit'));
    await waitFor(() => expect(mockAdminRecordProviderPayout).toHaveBeenCalledTimes(2));

    const first = mockAdminRecordProviderPayout.mock.calls[0][0].idempotencyKey;
    const second = mockAdminRecordProviderPayout.mock.calls[1][0].idempotencyKey;
    expect(second).not.toBe(first);
  });
});

describe('AdminProviderPayoutPanel — validation before the RPC', () => {
  it('blocks an amount above outstanding without calling the RPC', async () => {
    render(<AdminProviderPayoutPanel earningId="earn1" />);
    fireEvent.changeText(await screen.findByTestId('payout-amount'), '9999');
    fireEvent.press(screen.getByTestId('payout-method-cash'));
    fireEvent.changeText(screen.getByTestId('payout-note'), 'n');
    fireEvent.press(screen.getByTestId('payout-review'));
    fireEvent.press(await screen.findByTestId('payout-submit'));
    await waitFor(() => expect(screen.getByTestId('payout-panel-error')).toBeOnTheScreen());
    expect(mockAdminRecordProviderPayout).not.toHaveBeenCalled();
  });

  it('requires a reference for an electronic method', async () => {
    render(<AdminProviderPayoutPanel earningId="earn1" />);
    fireEvent.changeText(await screen.findByTestId('payout-amount'), '100');
    fireEvent.press(screen.getByTestId('payout-method-mpesa_manual'));
    fireEvent.press(screen.getByTestId('payout-review'));
    fireEvent.press(await screen.findByTestId('payout-submit'));
    await waitFor(() => expect(screen.getByTestId('payout-panel-error')).toBeOnTheScreen());
    expect(mockAdminRecordProviderPayout).not.toHaveBeenCalled();
  });
});

describe('AdminProviderPayoutPanel — deductions', () => {
  it('offers only the four approved categories and no customer/platform category', async () => {
    render(<AdminProviderPayoutPanel earningId="earn1" />);
    for (const c of actual.DEDUCTION_CATEGORIES) {
      expect(await screen.findByTestId(`deduction-category-${c.value}`)).toBeOnTheScreen();
    }
    for (const forbidden of ['Commission', 'Platform fee', 'Wallet', 'Promo', 'Customer discount']) {
      expect(screen.queryByText(forbidden)).toBeNull();
    }
  });

  it('has no edit or delete control for deductions or payouts', async () => {
    render(<AdminProviderPayoutPanel earningId="earn1" />);
    await screen.findByTestId('admin-provider-payout-panel');
    for (const forbidden of ['Edit deduction', 'Delete deduction', 'Edit payout', 'Delete payout']) {
      expect(screen.queryByText(forbidden)).toBeNull();
    }
  });
});
