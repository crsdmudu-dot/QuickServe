/**
 * Tests for the web-admin customers and reviews screens:
 *   - src/app/(admin-web)/customers/index.tsx  (read-only list)
 *   - src/app/(admin-web)/reviews/index.tsx    (moderation with hide/unhide)
 *
 * All network calls are mocked. Uses findBy* for async data loads.
 */

// ── Shared mocks ────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

// ── Customer mocks ──────────────────────────────────────────────────────────

const MOCK_CUSTOMER = {
  id: 'cust-aaaa-1111',
  full_name: 'Alice Wanjiku',
  phone: '0712345678',
  created_at: '2026-01-15T00:00:00Z',
};

const MOCK_BOOKING = {
  id: 'bk1',
  service_id: 'house-cleaning',
  address: '1 Test Ave',
  scheduled_for: '2026-08-01T09:00:00Z',
  notes: null,
  status: 'pending' as const,
  customer_id: 'cust-aaaa-1111',
  assigned_provider_name: null,
  assigned_provider_phone: null,
  assigned_provider_id: null,
  admin_notes: null,
  created_at: '2026-07-01T00:00:00Z',
  quoted_amount: null,
  provider_share: null,
  quote_status: 'pending' as const,
};

const mockAdminGetAllCustomers = jest.fn().mockResolvedValue([MOCK_CUSTOMER]);
const mockGetAllBookings = jest.fn().mockResolvedValue([MOCK_BOOKING]);

jest.mock('@/lib/customers', () => ({
  adminGetAllCustomers: (...args: unknown[]) => mockAdminGetAllCustomers(...args),
}));

jest.mock('@/lib/bookings', () => ({
  getAllBookings: (...args: unknown[]) => mockGetAllBookings(...args),
}));

// ── Review mocks ────────────────────────────────────────────────────────────

const MOCK_REVIEW = {
  id: 'rev-bbbb-2222',
  booking_id: 'bk-12345678-full',
  customer_id: 'cust-12345678-full',
  provider_id: 'prov-1234567-full',
  rating: 4,
  comment: 'Great service!',
  is_hidden: false,
  created_at: '2026-06-01T00:00:00Z',
};

const mockAdminGetAllReviews = jest.fn().mockResolvedValue([MOCK_REVIEW]);
const mockSetReviewHidden = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/reviews', () => ({
  adminGetAllReviews: (...args: unknown[]) => mockAdminGetAllReviews(...args),
  setReviewHidden: (...args: unknown[]) => mockSetReviewHidden(...args),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import AdminWebCustomersScreen from '@/app/(admin-web)/customers/index';
import AdminWebReviewsScreen from '@/app/(admin-web)/reviews/index';

// ── Customers list tests ────────────────────────────────────────────────────

describe('AdminWebCustomersScreen (read-only list)', () => {
  beforeEach(() => {
    mockAdminGetAllCustomers.mockClear();
    mockGetAllBookings.mockClear();
    mockAdminGetAllCustomers.mockResolvedValue([MOCK_CUSTOMER]);
    mockGetAllBookings.mockResolvedValue([MOCK_BOOKING]);
  });

  it('renders the customer name after data loads', async () => {
    render(<AdminWebCustomersScreen />);
    expect(await screen.findByText('Alice Wanjiku')).toBeOnTheScreen();
  });

  it('renders the customer phone number', async () => {
    render(<AdminWebCustomersScreen />);
    await screen.findByText('Alice Wanjiku');
    expect(screen.getByText('0712345678')).toBeOnTheScreen();
  });

  it('renders the booking count (1 booking for this customer)', async () => {
    render(<AdminWebCustomersScreen />);
    await screen.findByText('Alice Wanjiku');
    // The bookings column shows the count as a number string
    expect(screen.getByText('1')).toBeOnTheScreen();
  });

  it('shows empty state when there are no customers', async () => {
    mockAdminGetAllCustomers.mockResolvedValueOnce([]);
    render(<AdminWebCustomersScreen />);
    expect(await screen.findByText('No customers yet.')).toBeOnTheScreen();
  });

  it('does NOT render any edit or delete action buttons (read-only)', async () => {
    render(<AdminWebCustomersScreen />);
    await screen.findByText('Alice Wanjiku');
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Delete')).toBeNull();
    expect(screen.queryByText('Remove')).toBeNull();
  });
});

// ── Reviews moderation tests ────────────────────────────────────────────────

describe('AdminWebReviewsScreen (moderation)', () => {
  beforeEach(() => {
    mockAdminGetAllReviews.mockClear();
    mockSetReviewHidden.mockClear();
    mockAdminGetAllReviews.mockResolvedValue([MOCK_REVIEW]);
    mockSetReviewHidden.mockResolvedValue({ ok: true });
  });

  it('renders a review row with the comment after data loads', async () => {
    render(<AdminWebReviewsScreen />);
    expect(await screen.findByText('Great service!')).toBeOnTheScreen();
  });

  it('renders the provider id ref (first 8 chars)', async () => {
    render(<AdminWebReviewsScreen />);
    await screen.findByText('Great service!');
    expect(screen.getByText('#prov-123')).toBeOnTheScreen();
  });

  it('renders the customer id ref (first 8 chars)', async () => {
    render(<AdminWebReviewsScreen />);
    await screen.findByText('Great service!');
    expect(screen.getByText('#cust-123')).toBeOnTheScreen();
  });

  it('renders the booking id ref (first 8 chars)', async () => {
    render(<AdminWebReviewsScreen />);
    await screen.findByText('Great service!');
    expect(screen.getByText('#bk-12345')).toBeOnTheScreen();
  });

  it('shows "Hide" button for a visible review', async () => {
    render(<AdminWebReviewsScreen />);
    expect(await screen.findByText('Hide')).toBeOnTheScreen();
  });

  it('calls setReviewHidden(id, true) when Hide is pressed', async () => {
    render(<AdminWebReviewsScreen />);
    await screen.findByText('Hide');
    fireEvent.press(screen.getByText('Hide'));
    await waitFor(() =>
      expect(mockSetReviewHidden).toHaveBeenCalledWith('rev-bbbb-2222', true),
    );
  });

  it('updates the row to show "Unhide" after a successful hide', async () => {
    render(<AdminWebReviewsScreen />);
    await screen.findByText('Hide');
    fireEvent.press(screen.getByText('Hide'));
    expect(await screen.findByText('Unhide')).toBeOnTheScreen();
  });

  it('shows "Unhide" button for a hidden review', async () => {
    mockAdminGetAllReviews.mockResolvedValueOnce([{ ...MOCK_REVIEW, is_hidden: true }]);
    render(<AdminWebReviewsScreen />);
    expect(await screen.findByText('Unhide')).toBeOnTheScreen();
  });

  it('calls setReviewHidden(id, false) when Unhide is pressed', async () => {
    mockAdminGetAllReviews.mockResolvedValueOnce([{ ...MOCK_REVIEW, is_hidden: true }]);
    render(<AdminWebReviewsScreen />);
    await screen.findByText('Unhide');
    fireEvent.press(screen.getByText('Unhide'));
    await waitFor(() =>
      expect(mockSetReviewHidden).toHaveBeenCalledWith('rev-bbbb-2222', false),
    );
  });

  it('shows empty state when there are no reviews', async () => {
    mockAdminGetAllReviews.mockResolvedValueOnce([]);
    render(<AdminWebReviewsScreen />);
    expect(await screen.findByText('No reviews yet.')).toBeOnTheScreen();
  });
});
