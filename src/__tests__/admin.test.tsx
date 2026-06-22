/**
 * Tests for src/app/admin/index.tsx
 *
 * Mocks expo-router, @/lib/bookings, @/lib/providers and @/auth/auth-context
 * so no network calls are made.  Uses findBy* for async data loads.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

jest.mock('@/lib/bookings', () => ({
  getAllBookings: jest.fn().mockResolvedValue([
    {
      id: 'b1',
      service_id: 'house-cleaning',
      status: 'pending',
      scheduled_for: '2026-07-01T10:00:00Z',
      address: '123 Main St',
      notes: null,
      created_at: '2026-06-21T00:00:00Z',
      assigned_provider_name: null,
      assigned_provider_phone: null,
      admin_notes: null,
    },
  ]),
}));

const mockSetProviderApproval = jest.fn().mockResolvedValue({ ok: true });
jest.mock('@/lib/providers', () => ({
  getPendingProviders: jest.fn().mockResolvedValue([
    { id: 'p1', full_name: 'Jane', phone: '0700', approval_status: 'pending' },
  ]),
  setProviderApproval: (...args: unknown[]) => mockSetProviderApproval(...args),
}));

jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({ signOut: jest.fn() }),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import AdminScreen from '@/app/admin/index';

describe('AdminScreen', () => {
  beforeEach(() => {
    (router.push as jest.Mock).mockClear();
    mockSetProviderApproval.mockClear();
  });

  it('shows the booking status label after data loads', async () => {
    render(<AdminScreen />);
    // Wait for bookings to load then check STATUS_LABELS['pending'] = 'Pending'
    await screen.findByText('House Cleaning');
    await waitFor(() => expect(screen.getByText('Pending')).toBeOnTheScreen());
  });

  it('navigates to booking detail when a booking row is pressed', async () => {
    render(<AdminScreen />);
    const row = await screen.findByText('House Cleaning');
    fireEvent.press(row);
    expect(router.push).toHaveBeenCalledWith('/admin/booking/b1');
  });

  it('shows provider name after switching to Providers tab', async () => {
    render(<AdminScreen />);
    // Wait for initial render to settle
    await screen.findByText('House Cleaning');
    fireEvent.press(screen.getByText('Providers'));
    expect(await screen.findByText('Jane')).toBeOnTheScreen();
  });

  it('calls setProviderApproval with approved when Approve is pressed', async () => {
    render(<AdminScreen />);
    fireEvent.press(await screen.findByText('Providers'));
    fireEvent.press(await screen.findByText('Approve'));
    expect(mockSetProviderApproval).toHaveBeenCalledWith('p1', 'approved');
  });

  it('navigates to provider detail when a provider card is pressed', async () => {
    render(<AdminScreen />);
    fireEvent.press(await screen.findByText('Providers'));
    // Wait for provider name to appear then press the card (press the name text inside the card)
    const providerName = await screen.findByText('Jane');
    fireEvent.press(providerName);
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith('/admin/provider/p1'),
    );
  });
});
