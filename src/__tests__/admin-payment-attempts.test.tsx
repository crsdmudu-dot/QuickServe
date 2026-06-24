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
  },
]);

const mockAdminConfirmAttempt = jest.fn().mockResolvedValue({ ok: true });
const mockAdminCancelAttempt = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/attempts', () => ({
  adminGetPaymentAttempts: (...args: unknown[]) => mockAdminGetPaymentAttempts(...args),
  adminConfirmAttempt: (...args: unknown[]) => mockAdminConfirmAttempt(...args),
  adminCancelAttempt: (...args: unknown[]) => mockAdminCancelAttempt(...args),
}));

import { render, screen, fireEvent } from '@testing-library/react-native';
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
};

describe('AdminPaymentAttemptsScreen', () => {
  beforeEach(() => {
    mockAdminGetPaymentAttempts.mockClear();
    mockAdminConfirmAttempt.mockClear();
    mockAdminCancelAttempt.mockClear();
    mockAdminGetPaymentAttempts.mockResolvedValue([MOCK_ATTEMPT]);
    mockAdminConfirmAttempt.mockResolvedValue({ ok: true });
    mockAdminCancelAttempt.mockResolvedValue({ ok: true });
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

  it('pressing Confirm calls adminConfirmAttempt with the attempt id', async () => {
    render(<AdminPaymentAttemptsScreen />);
    await screen.findByText('KES 1,500');
    fireEvent.press(screen.getByText('Confirm'));
    expect(mockAdminConfirmAttempt).toHaveBeenCalledWith('a1');
  });

  it('shows empty state when there are no attempts', async () => {
    mockAdminGetPaymentAttempts.mockResolvedValueOnce([]);
    render(<AdminPaymentAttemptsScreen />);
    expect(await screen.findByText('No payment attempts')).toBeOnTheScreen();
  });
});
