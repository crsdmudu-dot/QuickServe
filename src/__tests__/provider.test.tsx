/**
 * Tests for src/app/provider/index.tsx
 *
 * Mocks expo-router, @/auth/auth-context and @/lib/bookings so no network
 * calls are made. Uses findBy* for async data loads.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockGetProviderJobs = jest.fn().mockResolvedValue([
  {
    id: 'j1',
    service_id: 'house-cleaning',
    status: 'provider_assigned' as const,
    scheduled_for: '2026-07-01T10:00:00Z',
    address: '123 Main St',
    notes: null,
    created_at: '2026-06-21T00:00:00Z',
    assigned_provider_name: null,
    assigned_provider_phone: null,
    admin_notes: null,
    assigned_provider_id: null,
  },
]);

jest.mock('@/lib/bookings', () => ({
  getProviderJobs: (...args: unknown[]) => mockGetProviderJobs(...args),
}));

const mockSignOut = jest.fn().mockResolvedValue(undefined);

// approvalStatus is controlled per test via this variable.
let mockApprovalStatus: string | null = 'approved';

jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({ approvalStatus: mockApprovalStatus, signOut: mockSignOut }),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import ProviderHomeScreen from '@/app/provider/index';

describe('ProviderHomeScreen', () => {
  beforeEach(() => {
    (router.push as jest.Mock).mockClear();
    mockSignOut.mockClear();
    mockGetProviderJobs.mockClear();
  });

  it('shows "Awaiting approval" when approvalStatus is pending', () => {
    mockApprovalStatus = 'pending';
    render(<ProviderHomeScreen />);
    expect(screen.getByText('Awaiting approval')).toBeOnTheScreen();
  });

  it('shows "Application declined" when approvalStatus is rejected', () => {
    mockApprovalStatus = 'rejected';
    render(<ProviderHomeScreen />);
    expect(screen.getByText('Application declined')).toBeOnTheScreen();
  });

  it('shows job status label and navigates on press when approved', async () => {
    mockApprovalStatus = 'approved';
    render(<ProviderHomeScreen />);
    // Wait for jobs to load
    await screen.findByText('House Cleaning');
    // The status badge renders STATUS_LABELS['provider_assigned'] = 'Provider assigned'
    expect(screen.getByText('Provider assigned')).toBeOnTheScreen();
    // Press the job row
    fireEvent.press(screen.getByText('House Cleaning'));
    expect(router.push).toHaveBeenCalledWith('/provider/job/j1');
  });
});
