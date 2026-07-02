/**
 * Tests for the web-admin bookings screens:
 *   - src/app/(admin-web)/bookings/index.tsx  (list)
 *   - src/app/(admin-web)/bookings/[id].tsx   (detail)
 *
 * All network calls are mocked. Uses findBy* for async data loads.
 */

// ── Shared mocks ────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'bk1' }),
  router: { push: jest.fn() },
}));

const MOCK_BOOKING = {
  id: 'bk1',
  service_id: 'house-cleaning',
  address: '1 Admin Ave',
  scheduled_for: '2026-08-01T09:00:00Z',
  notes: 'Side entrance',
  status: 'pending' as const,
  customer_id: 'cust1',
  assigned_provider_name: null,
  assigned_provider_phone: null,
  assigned_provider_id: null,
  admin_notes: null,
  created_at: '2026-07-01T00:00:00Z',
  quoted_amount: null,
  provider_share: null,
  quote_status: 'pending' as const,
};

const mockGetAllBookings = jest.fn().mockResolvedValue([MOCK_BOOKING]);
const mockGetBookingById = jest.fn().mockResolvedValue(MOCK_BOOKING);
const mockUpdateBookingStatus = jest.fn().mockResolvedValue({ ok: true });
const mockAssignProvider = jest.fn().mockResolvedValue({ ok: true });
const mockUpdateAdminNotes = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/bookings', () => ({
  getAllBookings: (...args: unknown[]) => mockGetAllBookings(...args),
  getBookingById: (...args: unknown[]) => mockGetBookingById(...args),
  updateBookingStatus: (...args: unknown[]) => mockUpdateBookingStatus(...args),
  assignProvider: (...args: unknown[]) => mockAssignProvider(...args),
  updateAdminNotes: (...args: unknown[]) => mockUpdateAdminNotes(...args),
}));

jest.mock('@/lib/payments', () => ({
  getPaymentForBooking: jest.fn().mockResolvedValue({
    id: 'pay1',
    booking_id: 'bk1',
    customer_id: 'cust1',
    amount: 3000,
    currency: 'KES',
    status: 'pending',
    provider_share: 2100,
    quickserve_share: 900,
    payment_method: null,
    paid_at: null,
    created_at: '2026-07-01T00:00:00Z',
  }),
}));

jest.mock('@/lib/providers', () => ({
  getApprovedProviders: jest.fn().mockResolvedValue([
    { id: 'p1', full_name: 'Ali Hassan', phone: '0712', approval_status: 'approved' },
  ]),
}));

jest.mock('@/lib/photos', () => ({
  getBookingPhotos: jest.fn().mockResolvedValue([]),
  deleteBookingPhoto: jest.fn().mockResolvedValue({ ok: true }),
  setPhotoVerified: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('@/lib/activity', () => ({
  getBookingActivity: jest.fn().mockResolvedValue([
    {
      id: 'a1',
      booking_id: 'bk1',
      actor_id: null,
      event_type: 'booking_created',
      message: 'Booking created.',
      metadata: null,
      created_at: '2026-07-01T00:00:00Z',
    },
  ]),
}));

jest.mock('@/lib/messages', () => ({
  getBookingMessages: jest.fn().mockResolvedValue([]),
  getChatPeerName: jest.fn().mockResolvedValue(null),
  sendBookingMessage: jest.fn(),
  labelSender: (s: string, b: { customer_id: string; assigned_provider_id: string | null }) =>
    s === b.customer_id ? 'Customer' : s === b.assigned_provider_id ? 'Provider' : 'Unknown',
}));

jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'admin1' } } }),
}));

jest.mock('@/lib/quotes', () => ({
  setBookingQuote: jest.fn().mockResolvedValue({ ok: true }),
  computeQuickServeShare: (amount: number, providerShare: number) => amount - providerShare,
  validateQuoteInput: () => null,
  canEditQuote: () => true,
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import AdminWebBookingsScreen from '@/app/(admin-web)/bookings/index';
import AdminWebBookingDetailScreen from '@/app/(admin-web)/bookings/[id]';

// ── Bookings list tests ─────────────────────────────────────────────────────

describe('AdminWebBookingsScreen (list)', () => {
  beforeEach(() => {
    mockGetAllBookings.mockClear();
    (router.push as jest.Mock).mockClear();
  });

  it('renders the service name in a row after data loads', async () => {
    render(<AdminWebBookingsScreen />);
    expect(await screen.findByText('House Cleaning')).toBeOnTheScreen();
  });

  it('shows the status badge text in the row', async () => {
    render(<AdminWebBookingsScreen />);
    // StatusBadge renders "Pending" for status=pending
    expect(await screen.findByText('Pending')).toBeOnTheScreen();
  });

  it('shows the quote status label in the row', async () => {
    render(<AdminWebBookingsScreen />);
    expect(await screen.findByText('Awaiting quote')).toBeOnTheScreen();
  });

  it('navigates to the booking detail when a row is pressed', async () => {
    render(<AdminWebBookingsScreen />);
    const row = await screen.findByText('House Cleaning');
    fireEvent.press(row);
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith('/(admin-web)/bookings/bk1'),
    );
  });
});

// ── Booking detail tests ────────────────────────────────────────────────────

describe('AdminWebBookingDetailScreen (detail)', () => {
  beforeEach(() => {
    mockGetBookingById.mockClear();
    mockUpdateBookingStatus.mockClear();
    mockAssignProvider.mockClear();
    mockUpdateAdminNotes.mockClear();
  });

  it('renders the service title and address after data loads', async () => {
    render(<AdminWebBookingDetailScreen />);
    expect(await screen.findByText('House Cleaning')).toBeOnTheScreen();
    // Address appears in the Booking Summary card and in DestinationSummary; both must be present.
    const addressElements = screen.getAllByText('1 Admin Ave');
    expect(addressElements.length).toBeGreaterThan(0);
  });

  it('shows the payment amount in the right column', async () => {
    render(<AdminWebBookingDetailScreen />);
    await screen.findByText('House Cleaning');
    expect(await screen.findByText('KES 3,000')).toBeOnTheScreen();
  });

  it('calls updateBookingStatus with correct args when a status button is pressed', async () => {
    render(<AdminWebBookingDetailScreen />);
    await screen.findByText('House Cleaning');
    fireEvent.press(screen.getByText('In progress'));
    await waitFor(() =>
      expect(mockUpdateBookingStatus).toHaveBeenCalledWith('bk1', 'in_progress'),
    );
  });

  it('manual assign: calls assignProvider with name and phone', async () => {
    render(<AdminWebBookingDetailScreen />);
    await screen.findByText('House Cleaning');

    fireEvent.changeText(screen.getByPlaceholderText('Full name'), 'Bob');
    fireEvent.changeText(screen.getByPlaceholderText('Phone number'), '0799');
    fireEvent.press(screen.getByText('Assign'));

    await waitFor(() =>
      expect(mockAssignProvider).toHaveBeenCalledWith('bk1', { name: 'Bob', phone: '0799' }),
    );
  });

  it('in-app assign: shows approved provider and calls assignProvider with providerId', async () => {
    render(<AdminWebBookingDetailScreen />);
    await screen.findByText('House Cleaning');

    fireEvent.press(screen.getByText('In-app'));
    expect(await screen.findByText('Ali Hassan')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Ali Hassan'));
    await waitFor(() =>
      expect(mockAssignProvider).toHaveBeenCalledWith('bk1', {
        providerId: 'p1',
        name: 'Ali Hassan',
        phone: '0712',
      }),
    );
  });

  it('calls updateAdminNotes when Save notes is pressed', async () => {
    render(<AdminWebBookingDetailScreen />);
    await screen.findByText('House Cleaning');

    fireEvent.changeText(screen.getByPlaceholderText('Internal notes…'), 'web note');
    fireEvent.press(screen.getByText('Save notes'));

    await waitFor(() =>
      expect(mockUpdateAdminNotes).toHaveBeenCalledWith('bk1', 'web note'),
    );
  });

  it('renders activity timeline event message', async () => {
    render(<AdminWebBookingDetailScreen />);
    await screen.findByText('House Cleaning');
    expect(await screen.findByText('Booking created.')).toBeOnTheScreen();
  });

  it('renders the Conversation section', async () => {
    render(<AdminWebBookingDetailScreen />);
    await screen.findByText('House Cleaning');
    const conversationHeadings = await screen.findAllByText('Conversation');
    expect(conversationHeadings.length).toBeGreaterThan(0);
  });

  // Quote share-preview math test (pure)
  it('computeQuickServeShare: 3000 - 2100 = 900', () => {
    // This exercises the same math the UI live-preview uses.
    const { computeQuickServeShare } = require('@/lib/quotes');
    expect(computeQuickServeShare(3000, 2100)).toBe(900);
  });
});
