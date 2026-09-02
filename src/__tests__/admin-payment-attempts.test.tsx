/**
 * Tests for src/app/admin/payment-attempts.tsx
 *
 * Mirrors customer-payments.test.tsx. Mocks expo-router and @/lib/attempts so
 * no network calls are made.  Uses findBy* to await state settle after
 * adminGetPaymentAttempts resolves.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

const mockAdminGetPaymentAttempts = jest.fn().mockResolvedValue([
  {
    id: 'a1',
    payment_id: 'pay123456',
    provider: 'mpesa' as const,
    phone: '254712345678',
    amount: 1500,
    status: 'pending' as const,
    external_reference: 'MOCK-x',
    raw_response: null,
    created_at: '2026-06-24T00:00:00Z',
    merchant_request_id: 'MR-1',
    checkout_request_id: 'ws_CO_123',
    result_code: null,
    result_desc: null,
    callback_received_at: null,
  },
]);

const mockAdminConfirmAttempt = jest.fn().mockResolvedValue({ ok: true });
const mockAdminReconcileAttempt = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/attempts', () => ({
  adminGetPaymentAttempts: (...args: unknown[]) => mockAdminGetPaymentAttempts(...args),
  adminConfirmAttempt: (...args: unknown[]) => mockAdminConfirmAttempt(...args),
  adminReconcileAttemptNoCollection: (...args: unknown[]) =>
    mockAdminReconcileAttempt(...args),
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import AdminPaymentAttemptsScreen from '@/app/admin/payment-attempts';

const MOCK_ATTEMPT = {
  id: 'a1',
  payment_id: 'pay123456',
  provider: 'mpesa' as const,
  phone: '254712345678',
  amount: 1500,
  status: 'pending' as const,
  external_reference: 'MOCK-x',
  raw_response: null,
  created_at: '2026-06-24T00:00:00Z',
  merchant_request_id: 'MR-1',
  checkout_request_id: 'ws_CO_123',
  result_code: null,
  result_desc: null,
  callback_received_at: null,
};

describe('AdminPaymentAttemptsScreen', () => {
  beforeEach(() => {
    mockAdminGetPaymentAttempts.mockClear();
    mockAdminConfirmAttempt.mockClear();
    mockAdminReconcileAttempt.mockClear();
    mockAdminGetPaymentAttempts.mockResolvedValue([MOCK_ATTEMPT]);
    mockAdminConfirmAttempt.mockResolvedValue({ ok: true });
    mockAdminReconcileAttempt.mockResolvedValue({ ok: true });
  });

  it('renders the formatted amount after attempts load', async () => {
    render(<AdminPaymentAttemptsScreen />);
    expect(await screen.findByText('KES 1,500')).toBeOnTheScreen();
  });

  it('renders the attempt status badge after attempts load', async () => {
    render(<AdminPaymentAttemptsScreen />);
    expect(await screen.findByText('Pending')).toBeOnTheScreen();
  });

  it('shows provider text in uppercase', async () => {
    render(<AdminPaymentAttemptsScreen />);
    // Provider is displayed as part of "MPESA · 254712345678"
    await screen.findByText('KES 1,500');
    expect(screen.getByText('MPESA · 254712345678')).toBeOnTheScreen();
  });

  it('opens an evidence form before confirming, then sends all four arguments', async () => {
    render(<AdminPaymentAttemptsScreen />);
    await screen.findByText('KES 1,500');
    fireEvent.press(screen.getByText('Confirm collected'));

    // The action alone must not settle anything (0045 removed the evidence-free path).
    expect(mockAdminConfirmAttempt).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('resolution-note'), 'Verified in portal');
    fireEvent.changeText(screen.getByTestId('resolution-reference'), 'NLJ7RT61SV');
    fireEvent.press(screen.getByText('Submit confirmation'));

    await waitFor(() =>
      expect(mockAdminConfirmAttempt).toHaveBeenCalledWith(
        'a1',
        1500,
        'Verified in portal',
        'NLJ7RT61SV',
      ),
    );
  });

  it('records no collection through the reconciliation RPC and requires a note', async () => {
    render(<AdminPaymentAttemptsScreen />);
    await screen.findByText('KES 1,500');
    fireEvent.press(screen.getByText('Record no collection'));

    fireEvent.press(screen.getByText('Submit reconciliation'));
    expect(await screen.findByText('Reconciliation note is required.')).toBeOnTheScreen();
    expect(mockAdminReconcileAttempt).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('resolution-note'), 'No transaction at provider');
    fireEvent.press(screen.getByText('Submit reconciliation'));

    await waitFor(() =>
      expect(mockAdminReconcileAttempt).toHaveBeenCalledWith(
        'a1',
        'No transaction at provider',
        null,
      ),
    );
  });

  it('shows empty state when there are no attempts', async () => {
    mockAdminGetPaymentAttempts.mockResolvedValueOnce([]);
    render(<AdminPaymentAttemptsScreen />);
    expect(await screen.findByText('No payment attempts')).toBeOnTheScreen();
  });

  it('renders the checkout request id when present', async () => {
    render(<AdminPaymentAttemptsScreen />);
    expect(await screen.findByText('Checkout: ws_CO_123')).toBeTruthy();
  });
});
