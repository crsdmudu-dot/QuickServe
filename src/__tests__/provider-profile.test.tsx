/**
 * Tests for src/app/provider/(tabs)/profile.tsx
 *
 * Mocks expo-router, @/auth/auth-context, and @/lib/providers so no network
 * calls are made. Uses findBy* for async data loads.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockGetProviderProfile = jest.fn().mockResolvedValue({
  id: 'p1',
  full_name: 'Jane Smith',
  phone: '0700000000',
  approval_status: 'approved' as const,
  profile_photo_url: null,
  bio: 'Experienced plumber',
  years_experience: 8,
  skills: ['Plumbing', 'Tiling'],
  is_verified: true,
  completed_jobs_count: 5,
  average_rating: 4.8,
  availability_status: 'available' as const,
});

const mockUpdateMyProviderProfile = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/providers', () => ({
  getProviderProfile: (...args: unknown[]) => mockGetProviderProfile(...args),
  updateMyProviderProfile: (...args: unknown[]) => mockUpdateMyProviderProfile(...args),
}));

const mockSignOut = jest.fn().mockResolvedValue(undefined);

// approvalStatus is controlled per describe block via this variable.
let mockApprovalStatus: string = 'approved';

jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({
    approvalStatus: mockApprovalStatus,
    session: { user: { id: 'p1' } },
    signOut: mockSignOut,
  }),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ProviderProfileScreen from '@/app/provider/(tabs)/profile';

describe('ProviderProfileScreen — approved', () => {
  beforeEach(() => {
    mockApprovalStatus = 'approved';
    mockGetProviderProfile.mockClear();
    mockUpdateMyProviderProfile.mockClear();
    mockSignOut.mockClear();
  });

  it('shows name, verified badge and completed jobs count after data loads', async () => {
    render(<ProviderProfileScreen />);
    // Wait for profile to load
    expect(await screen.findByText('Jane Smith')).toBeOnTheScreen();
    expect(screen.getByText('Verified by QuickServe')).toBeOnTheScreen();
    expect(screen.getByText(/5/)).toBeOnTheScreen();
  });

  it('toggles availability and calls updateMyProviderProfile with unavailable', async () => {
    render(<ProviderProfileScreen />);
    // Wait for profile to load so availability state is initialised.
    await screen.findByText('Jane Smith');
    // The toggle button starts as 'Available' (profile.availability_status = 'available').
    const toggleBtn = await screen.findByText('Available');
    fireEvent.press(toggleBtn);
    // Wait for the async update to complete before asserting.
    await waitFor(() =>
      expect(mockUpdateMyProviderProfile).toHaveBeenCalledWith({
        availability_status: 'unavailable',
      }),
    );
  });
});

describe('ProviderProfileScreen — pending', () => {
  beforeEach(() => {
    mockApprovalStatus = 'pending';
  });

  it('shows "Awaiting approval" gate screen', () => {
    render(<ProviderProfileScreen />);
    expect(screen.getByText('Awaiting approval')).toBeOnTheScreen();
  });
});
