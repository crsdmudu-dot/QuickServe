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

/**
 * Base review — rating:4, has categories/tags/recommend.
 * Used for most existing tests.
 */
const MOCK_REVIEW = {
  id: 'rev-bbbb-2222',
  booking_id: 'bk-12345678-full',
  customer_id: 'cust-12345678-full',
  provider_id: 'prov-1234567-full',
  rating: 4,
  comment: 'Great service!',
  is_hidden: false,
  created_at: '2026-06-01T00:00:00Z',
  quality_rating: 4,
  punctuality_rating: 5,
  communication_rating: null,
  professionalism_rating: null,
  value_rating: null,
  would_recommend: true,
  tags: ['on_time', 'friendly'],
};

/**
 * Low-rated review — rating:1, used to test the "Low-rated only" filter.
 * Private feedback "be careful" is returned for this review's id.
 */
const MOCK_REVIEW_LOW = {
  id: 'rev-cccc-3333',
  booking_id: 'bk-99999999-full',
  customer_id: 'cust-88888888-full',
  provider_id: 'prov-7777777-full',
  rating: 1,
  comment: 'Terrible!',
  is_hidden: false,
  created_at: '2026-06-02T00:00:00Z',
  quality_rating: 1,
  punctuality_rating: null,
  communication_rating: null,
  professionalism_rating: null,
  value_rating: null,
  would_recommend: false,
  tags: ['late'],
};

const mockAdminGetAllReviews = jest
  .fn()
  .mockResolvedValue([MOCK_REVIEW, MOCK_REVIEW_LOW]);

const mockSetReviewHidden = jest.fn().mockResolvedValue({ ok: true });

const mockGetReviewPrivateFeedback = jest.fn().mockImplementation((id: string) => {
  // Return private feedback only for the low-rated review
  if (id === 'rev-cccc-3333') return Promise.resolve({ feedback: 'be careful' });
  return Promise.resolve(null);
});

jest.mock('@/lib/reviews', () => ({
  adminGetAllReviews: (...args: unknown[]) => mockAdminGetAllReviews(...args),
  setReviewHidden: (...args: unknown[]) => mockSetReviewHidden(...args),
  getReviewPrivateFeedback: (...args: unknown[]) => mockGetReviewPrivateFeedback(...args),
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

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

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

  // ── Slice 31 Task 5: Create case context-link ─────────────────────────────

  it('renders a "Create case" button in the operations column', async () => {
    render(<AdminWebCustomersScreen />);
    await screen.findByText('Alice Wanjiku');
    expect(screen.getByText('Create case')).toBeOnTheScreen();
  });

  it('pressing "Create case" navigates to operations/new with the customer id', async () => {
    (router.push as jest.Mock).mockClear();
    render(<AdminWebCustomersScreen />);
    await screen.findByText('Alice Wanjiku');
    fireEvent.press(screen.getByText('Create case'));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        '/(admin-web)/operations/new?customer_id=cust-aaaa-1111',
      ),
    );
  });
});

// ── Reviews moderation tests ────────────────────────────────────────────────

describe('AdminWebReviewsScreen (moderation)', () => {
  beforeEach(() => {
    mockAdminGetAllReviews.mockClear();
    mockSetReviewHidden.mockClear();
    mockGetReviewPrivateFeedback.mockClear();
    mockAdminGetAllReviews.mockResolvedValue([MOCK_REVIEW, MOCK_REVIEW_LOW]);
    mockSetReviewHidden.mockResolvedValue({ ok: true });
    mockGetReviewPrivateFeedback.mockImplementation((id: string) => {
      if (id === 'rev-cccc-3333') return Promise.resolve({ feedback: 'be careful' });
      return Promise.resolve(null);
    });
  });

  // ── Existing assertions (kept green) ───────────────────────────────────────

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
    // Both reviews are visible, so we'll have at least one Hide button
    const hideButtons = await screen.findAllByText('Hide');
    expect(hideButtons.length).toBeGreaterThan(0);
  });

  it('calls setReviewHidden(id, true) when Hide is pressed', async () => {
    mockAdminGetAllReviews.mockResolvedValue([MOCK_REVIEW]);
    render(<AdminWebReviewsScreen />);
    await screen.findByText('Hide');
    fireEvent.press(screen.getByText('Hide'));
    await waitFor(() =>
      expect(mockSetReviewHidden).toHaveBeenCalledWith('rev-bbbb-2222', true),
    );
  });

  it('updates the row to show "Unhide" after a successful hide', async () => {
    mockAdminGetAllReviews.mockResolvedValue([MOCK_REVIEW]);
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

  // ── New Slice 25 assertions ────────────────────────────────────────────────

  it('renders private feedback "be careful" for the low-rated review', async () => {
    render(<AdminWebReviewsScreen />);
    // Wait for data to load and private feedback to be prefetched
    await waitFor(() => expect(screen.getByText('be careful')).toBeOnTheScreen());
  });

  it('renders tags for a review (on_time → "On time", friendly → "Friendly")', async () => {
    render(<AdminWebReviewsScreen />);
    await screen.findByText('Great service!');
    // MOCK_REVIEW has tags ['on_time', 'friendly'] → "On time, Friendly"
    expect(screen.getByText('On time, Friendly')).toBeOnTheScreen();
  });

  it('renders 👍 for would_recommend:true', async () => {
    render(<AdminWebReviewsScreen />);
    await screen.findByText('Great service!');
    // MOCK_REVIEW has would_recommend:true
    expect(screen.getByText('👍')).toBeOnTheScreen();
  });

  it('renders 👎 for would_recommend:false', async () => {
    render(<AdminWebReviewsScreen />);
    // MOCK_REVIEW_LOW has would_recommend:false
    await screen.findByText('Terrible!');
    expect(screen.getByText('👎')).toBeOnTheScreen();
  });

  it('renders category ratings for a review (Q4 · P5)', async () => {
    render(<AdminWebReviewsScreen />);
    await screen.findByText('Great service!');
    // MOCK_REVIEW has quality_rating:4, punctuality_rating:5
    expect(screen.getByText('Q4 · P5')).toBeOnTheScreen();
  });

  it('toggles Low-rated only: shows rating<=2 row and hides rating:5 row', async () => {
    // Add a rating:5 review to make the filter effect obvious
    const MOCK_REVIEW_HIGH = {
      ...MOCK_REVIEW,
      id: 'rev-dddd-4444',
      rating: 5,
      comment: 'Perfect job!',
      quality_rating: 5,
      punctuality_rating: 5,
    };
    mockAdminGetAllReviews.mockResolvedValueOnce([MOCK_REVIEW_HIGH, MOCK_REVIEW_LOW]);
    render(<AdminWebReviewsScreen />);

    // Wait for initial load — both rows visible
    await screen.findByText('Perfect job!');
    expect(screen.getByText('Terrible!')).toBeOnTheScreen();

    // Press the Low-rated only toggle
    fireEvent.press(screen.getByText('Low-rated only'));

    // After toggle: rating:1 row visible, rating:5 row hidden
    await waitFor(() => {
      expect(screen.getByText('Terrible!')).toBeOnTheScreen();
      expect(screen.queryByText('Perfect job!')).toBeNull();
    });
  });

  it('toggling back to "All ratings" shows all rows again', async () => {
    const MOCK_REVIEW_HIGH = {
      ...MOCK_REVIEW,
      id: 'rev-dddd-4444',
      rating: 5,
      comment: 'Perfect job!',
      quality_rating: 5,
      punctuality_rating: 5,
    };
    mockAdminGetAllReviews.mockResolvedValueOnce([MOCK_REVIEW_HIGH, MOCK_REVIEW_LOW]);
    render(<AdminWebReviewsScreen />);

    await screen.findByText('Perfect job!');

    // Toggle on
    fireEvent.press(screen.getByText('Low-rated only'));
    await waitFor(() => expect(screen.queryByText('Perfect job!')).toBeNull());

    // Toggle off — button label changes to "All ratings"
    fireEvent.press(screen.getByText('All ratings'));
    await waitFor(() => {
      expect(screen.getByText('Perfect job!')).toBeOnTheScreen();
      expect(screen.getByText('Terrible!')).toBeOnTheScreen();
    });
  });

  it('Hide/Unhide still calls setReviewHidden correctly with new columns present', async () => {
    mockAdminGetAllReviews.mockResolvedValue([MOCK_REVIEW]);
    render(<AdminWebReviewsScreen />);
    await screen.findByText('Hide');
    fireEvent.press(screen.getByText('Hide'));
    await waitFor(() =>
      expect(mockSetReviewHidden).toHaveBeenCalledWith('rev-bbbb-2222', true),
    );
  });
});
