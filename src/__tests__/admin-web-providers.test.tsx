/**
 * Tests for the web-admin providers screens:
 *   - src/app/(admin-web)/providers/index.tsx  (list)
 *   - src/app/(admin-web)/providers/[id].tsx   (detail)
 *
 * All network calls are mocked. Uses findBy* for async data loads.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'prov1' }),
  router: { push: jest.fn() },
}));

const MOCK_PENDING: import('@/lib/providers').ProviderProfile = {
  id: 'prov1',
  full_name: 'Jane Doe',
  phone: '0712345678',
  approval_status: 'pending',
  profile_photo_url: null,
  bio: null,
  years_experience: null,
  skills: null,
  is_verified: false,
  completed_jobs_count: 0,
  average_rating: null,
  review_count: 0,
  availability_status: 'available',
};

const MOCK_APPROVED: import('@/lib/providers').ProviderProfile = {
  id: 'prov2',
  full_name: 'John Smith',
  phone: '0798765432',
  approval_status: 'approved',
  profile_photo_url: null,
  bio: 'Experienced plumber',
  years_experience: 5,
  skills: ['Plumbing'],
  is_verified: true,
  completed_jobs_count: 12,
  average_rating: 4.5,
  review_count: 8,
  availability_status: 'available',
};

const mockGetPendingProviders = jest.fn().mockResolvedValue([MOCK_PENDING]);
const mockGetApprovedProviders = jest.fn().mockResolvedValue([MOCK_APPROVED]);
const mockSetProviderApproval = jest.fn().mockResolvedValue({ ok: true });
const mockGetProviderProfile = jest.fn().mockResolvedValue(MOCK_PENDING);
const mockAdminUpdateProviderProfile = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/providers', () => ({
  getPendingProviders: (...args: unknown[]) => mockGetPendingProviders(...args),
  getApprovedProviders: (...args: unknown[]) => mockGetApprovedProviders(...args),
  setProviderApproval: (...args: unknown[]) => mockSetProviderApproval(...args),
  getProviderProfile: (...args: unknown[]) => mockGetProviderProfile(...args),
  adminUpdateProviderProfile: (...args: unknown[]) => mockAdminUpdateProviderProfile(...args),
}));

const mockGetProviderReviews = jest.fn().mockResolvedValue([
  {
    id: 'rev1',
    booking_id: 'bk1',
    customer_id: 'cust1',
    provider_id: 'prov1',
    rating: 4,
    comment: 'Great service!',
    is_hidden: false,
    created_at: '2026-06-01T00:00:00Z',
  },
]);
const mockSetReviewHidden = jest.fn().mockResolvedValue({ ok: true });
const mockGetProviderRatingBreakdown = jest.fn().mockResolvedValue({
  overall_avg: 4.5,
  review_count: 8,
  recommend_pct: 88,
  quality_avg: 4.6,
  punctuality_avg: 4.2,
  communication_avg: 4.8,
  professionalism_avg: 4.5,
  value_avg: 4.1,
  top_tags: ['on_time', 'friendly'],
});

jest.mock('@/lib/reviews', () => ({
  getProviderReviews: (...args: unknown[]) => mockGetProviderReviews(...args),
  setReviewHidden: (...args: unknown[]) => mockSetReviewHidden(...args),
  getProviderRatingBreakdown: (...args: unknown[]) => mockGetProviderRatingBreakdown(...args),
  REVIEW_TAGS: [
    { key: 'on_time',            label: 'On time',            sentiment: 'positive' },
    { key: 'friendly',           label: 'Friendly',           sentiment: 'positive' },
    { key: 'clean_work',         label: 'Clean work',         sentiment: 'positive' },
    { key: 'good_communication', label: 'Good communication', sentiment: 'positive' },
    { key: 'fair_price',         label: 'Fair price',         sentiment: 'positive' },
    { key: 'late',               label: 'Late',               sentiment: 'negative' },
    { key: 'messy',              label: 'Messy',              sentiment: 'negative' },
    { key: 'poor_communication', label: 'Poor communication', sentiment: 'negative' },
    { key: 'overpriced',         label: 'Overpriced',         sentiment: 'negative' },
  ],
}));

const mockAdminGetProviderEarnings = jest.fn().mockResolvedValue([
  {
    id: 'earn1',
    provider_id: 'prov1',
    booking_id: 'bk1',
    amount: 2100,
    payout_status: 'pending',
    created_at: '2026-06-01T00:00:00Z',
  },
]);
const mockAdminMarkPayoutPaid = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/earnings', () => ({
  adminGetProviderEarnings: (...args: unknown[]) => mockAdminGetProviderEarnings(...args),
  adminMarkPayoutPaid: (...args: unknown[]) => mockAdminMarkPayoutPaid(...args),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import AdminWebProvidersScreen from '@/app/(admin-web)/providers/index';
import AdminWebProviderDetailScreen from '@/app/(admin-web)/providers/[id]';

// ── Providers list tests ────────────────────────────────────────────────────

describe('AdminWebProvidersScreen (list)', () => {
  beforeEach(() => {
    mockGetPendingProviders.mockClear();
    mockGetApprovedProviders.mockClear();
    mockSetProviderApproval.mockClear();
    (router.push as jest.Mock).mockClear();
  });

  it('renders a pending provider row with name', async () => {
    render(<AdminWebProvidersScreen />);
    expect(await screen.findByText('Jane Doe')).toBeOnTheScreen();
  });

  it('renders an approved provider row with name', async () => {
    render(<AdminWebProvidersScreen />);
    expect(await screen.findByText('John Smith')).toBeOnTheScreen();
  });

  it('shows Approve and Reject buttons only for pending providers', async () => {
    render(<AdminWebProvidersScreen />);
    await screen.findByText('Jane Doe');
    expect(screen.getByText('Approve')).toBeOnTheScreen();
    expect(screen.getByText('Reject')).toBeOnTheScreen();
  });

  it('calls setProviderApproval with approved when Approve is pressed', async () => {
    render(<AdminWebProvidersScreen />);
    await screen.findByText('Jane Doe');
    fireEvent.press(screen.getByText('Approve'));
    await waitFor(() =>
      expect(mockSetProviderApproval).toHaveBeenCalledWith('prov1', 'approved'),
    );
  });

  it('calls setProviderApproval with rejected when Reject is pressed', async () => {
    render(<AdminWebProvidersScreen />);
    await screen.findByText('Jane Doe');
    fireEvent.press(screen.getByText('Reject'));
    await waitFor(() =>
      expect(mockSetProviderApproval).toHaveBeenCalledWith('prov1', 'rejected'),
    );
  });

  it('navigates to provider detail when a row is pressed', async () => {
    render(<AdminWebProvidersScreen />);
    const row = await screen.findByText('Jane Doe');
    fireEvent.press(row);
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith('/(admin-web)/providers/prov1'),
    );
  });
});

// ── Provider detail tests ───────────────────────────────────────────────────

describe('AdminWebProviderDetailScreen (detail)', () => {
  beforeEach(() => {
    mockGetProviderProfile.mockClear();
    mockSetProviderApproval.mockClear();
    mockAdminUpdateProviderProfile.mockClear();
    mockGetProviderReviews.mockClear();
    mockSetReviewHidden.mockClear();
    mockAdminGetProviderEarnings.mockClear();
    mockAdminMarkPayoutPaid.mockClear();
    mockGetProviderRatingBreakdown.mockClear();
  });

  it('renders provider name after profile loads', async () => {
    render(<AdminWebProviderDetailScreen />);
    expect(await screen.findByText('Jane Doe')).toBeOnTheScreen();
  });

  it('shows the review comment in the reviews list', async () => {
    render(<AdminWebProviderDetailScreen />);
    await screen.findByText('Jane Doe');
    expect(await screen.findByText('Great service!')).toBeOnTheScreen();
  });

  it('calls setReviewHidden when Hide is pressed', async () => {
    render(<AdminWebProviderDetailScreen />);
    await screen.findByText('Great service!');
    fireEvent.press(screen.getByText('Hide'));
    await waitFor(() =>
      expect(mockSetReviewHidden).toHaveBeenCalledWith('rev1', true),
    );
  });

  it('shows the earning amount in KES', async () => {
    render(<AdminWebProviderDetailScreen />);
    await screen.findByText('Jane Doe');
    expect(await screen.findByText('KES 2,100')).toBeOnTheScreen();
  });

  it('calls adminMarkPayoutPaid when Mark payout paid is pressed', async () => {
    render(<AdminWebProviderDetailScreen />);
    await screen.findByText('KES 2,100');
    fireEvent.press(screen.getByText('Mark payout paid'));
    await waitFor(() =>
      expect(mockAdminMarkPayoutPaid).toHaveBeenCalledWith('earn1'),
    );
  });

  it('calls setProviderApproval with approved when Approve is pressed', async () => {
    render(<AdminWebProviderDetailScreen />);
    await screen.findByText('Jane Doe');
    fireEvent.press(screen.getByText('Approve'));
    await waitFor(() =>
      expect(mockSetProviderApproval).toHaveBeenCalledWith('prov1', 'approved'),
    );
  });

  it('calls adminUpdateProviderProfile with is_verified toggled when Verify is pressed', async () => {
    render(<AdminWebProviderDetailScreen />);
    await screen.findByText('Jane Doe');
    // Profile has is_verified: false, so button says "Verify"
    fireEvent.press(screen.getByText('Verify'));
    await waitFor(() =>
      expect(mockAdminUpdateProviderProfile).toHaveBeenCalledWith('prov1', { is_verified: true }),
    );
  });

  it('renders the rating breakdown section with recommend % and strength chips', async () => {
    render(<AdminWebProviderDetailScreen />);
    await screen.findByText('Jane Doe');
    // The breakdown component renders "88% would recommend" and tag chips.
    expect(await screen.findByText(/88%\s*would recommend/)).toBeOnTheScreen();
    expect(await screen.findByText('On time')).toBeOnTheScreen();
    // A category label from the breakdown bars
    expect(await screen.findByText('Quality')).toBeOnTheScreen();
  });
});
