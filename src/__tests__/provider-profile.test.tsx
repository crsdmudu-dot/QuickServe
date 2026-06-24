/**
 * Tests for src/app/provider/(tabs)/profile.tsx
 *
 * Mocks expo-router, @/auth/auth-context, @/lib/providers, and @/lib/reviews
 * so no network calls are made. Uses findBy* for async data loads.
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
  average_rating: 4.5,
  review_count: 2,
  availability_status: 'available' as const,
});

const mockUpdateMyProviderProfile = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/providers', () => ({
  getProviderProfile: (...args: unknown[]) => mockGetProviderProfile(...args),
  updateMyProviderProfile: (...args: unknown[]) => mockUpdateMyProviderProfile(...args),
}));

const mockGetProviderReviews = jest.fn().mockResolvedValue([
  {
    id: 'r1',
    rating: 5,
    comment: 'Great',
    created_at: '2026-07-01T10:00:00Z',
    booking_id: 'bk1',
    customer_id: 'c1',
    provider_id: 'p1',
    is_hidden: false,
  },
]);

jest.mock('@/lib/reviews', () => ({
  getProviderReviews: (...args: unknown[]) => mockGetProviderReviews(...args),
}));

const mockGetProviderEarningsSummary = jest
  .fn()
  .mockResolvedValue({ pending: 0, paid: 0 });
const mockGetMyEarnings = jest.fn().mockResolvedValue([]);

jest.mock('@/lib/earnings', () => ({
  getProviderEarningsSummary: (...args: unknown[]) => mockGetProviderEarningsSummary(...args),
  getMyEarnings: (...args: unknown[]) => mockGetMyEarnings(...args),
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
    mockGetProviderReviews.mockClear();
    mockSignOut.mockClear();
    mockGetProviderEarningsSummary.mockClear();
    mockGetMyEarnings.mockClear();
    // Restore default empty responses for earnings.
    mockGetProviderEarningsSummary.mockResolvedValue({ pending: 0, paid: 0 });
    mockGetMyEarnings.mockResolvedValue([]);
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

  it('shows review count "(2)" and review comment "Great" in the Ratings section', async () => {
    render(<ProviderProfileScreen />);
    // Wait for profile to load first, then reviews appear.
    await screen.findByText('Jane Smith');
    // The count label rendered by RatingStars is "(2)".
    expect(await screen.findByText('(2)')).toBeOnTheScreen();
    // The review comment from the ReviewCard.
    expect(await screen.findByText('Great')).toBeOnTheScreen();
  });

  it('shows earnings summary with pending and paid totals in the Earnings section', async () => {
    // Override defaults so this test has non-zero earnings data.
    mockGetProviderEarningsSummary.mockResolvedValue({ pending: 2100, paid: 5000 });
    mockGetMyEarnings.mockResolvedValue([
      {
        id: 'e1',
        provider_id: 'p1',
        booking_id: 'bk1',
        amount: 2100,
        payout_status: 'pending' as const,
        created_at: '2026-06-01T10:00:00Z',
      },
    ]);

    render(<ProviderProfileScreen />);
    // Wait for profile to load first (mirrors existing approved-profile pattern).
    await screen.findByText('Jane Smith');
    // Earnings summary card should show formatted KES amounts.
    expect(await screen.findByText('Pending: KES 2,100')).toBeOnTheScreen();
    expect(await screen.findByText('Paid: KES 5,000')).toBeOnTheScreen();
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
