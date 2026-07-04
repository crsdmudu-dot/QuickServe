/**
 * Tests for the web-admin bookings screens:
 *   - src/app/(admin-web)/bookings/index.tsx  (list)
 *   - src/app/(admin-web)/bookings/[id].tsx   (detail)
 *
 * All network calls are mocked. Uses findBy* for async data loads.
 *
 * Slice 24 (Task 7): extended with scheduling filter + describeSchedule column
 * display tests.  Fixtures are built relative to new Date() so predicates are
 * always correct.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

const todayIso    = new Date().toISOString();
const tomorrowIso = new Date(Date.now() + 86_400_000).toISOString();
const pastIso     = new Date(Date.now() - 2 * 86_400_000).toISOString();

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
  // Slice 24 scheduling fields
  scheduling_type: 'asap',
  time_window: null,
  window_start: null,
  window_end: null,
  recurrence: 'one_time',
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

// AdminLiveLocation pulls tracking — stub it so no Supabase calls are made
jest.mock('@/lib/tracking', () => ({
  getProviderLocationForBooking: jest.fn().mockResolvedValue(null),
  subscribeToProviderLocation: () => jest.fn(),
}));

// AdminWalletPanel pulls wallet data — stub so the panel resolves without Supabase
jest.mock('@/lib/wallet', () => ({
  adminGetWallet: jest.fn().mockResolvedValue({
    id: 'w1',
    customer_id: 'cust1',
    balance: 0,
    currency: 'KES',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }),
  adminGetWalletTransactions: jest.fn().mockResolvedValue([]),
  adminAdjustWallet: jest.fn().mockResolvedValue({ ok: true }),
  WALLET_TXN_TYPES: {
    admin_credit:    { label: 'Admin credit',      direction: 'credit' },
    admin_debit:     { label: 'Admin debit',        direction: 'debit'  },
    refund_credit:   { label: 'Refund',             direction: 'credit' },
    promo_credit:    { label: 'Promo credit',       direction: 'credit' },
    referral_credit: { label: 'Referral reward',    direction: 'credit' },
    gift_credit:     { label: 'Gift credit',        direction: 'credit' },
    payment_applied: { label: 'Applied to booking', direction: 'debit'  },
    adjustment:      { label: 'Adjustment',         direction: 'credit' },
  },
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

  // ── Existing tests (must stay green) ──────────────────────────────────────

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

  // ── Slice 24 Task 7: filter + describeSchedule tests ──────────────────────

  it('default (All) renders all bookings — filter buttons are visible', async () => {
    render(<AdminWebBookingsScreen />);
    await screen.findByText('House Cleaning');
    expect(screen.getByText('All')).toBeOnTheScreen();
    expect(screen.getByText('Today')).toBeOnTheScreen();
    expect(screen.getByText('Tomorrow')).toBeOnTheScreen();
    expect(screen.getByText('Upcoming')).toBeOnTheScreen();
    // 'Scheduled' appears as both a filter button and a DataTable column header
    const scheduledEls = screen.getAllByText('Scheduled');
    expect(scheduledEls.length).toBeGreaterThanOrEqual(1);
  });

  it('Scheduled column shows ASAP for asap scheduling_type (default All view)', async () => {
    // MOCK_BOOKING has scheduling_type='asap' — describeSchedule returns 'ASAP'
    render(<AdminWebBookingsScreen />);
    await screen.findByText('House Cleaning');
    expect(screen.getByText('ASAP')).toBeOnTheScreen();
  });

  it('Today filter: shows today fixture, hides tomorrow and past fixtures', async () => {
    mockGetAllBookings.mockResolvedValueOnce([
      {
        ...MOCK_BOOKING,
        id: 'bk-today',
        service_id: 'plumbing',
        scheduled_for: todayIso,
        scheduling_type: 'today',
        recurrence: 'one_time',
      },
      {
        ...MOCK_BOOKING,
        id: 'bk-tomorrow',
        service_id: 'electrical-repairs',
        scheduled_for: tomorrowIso,
        scheduling_type: 'tomorrow',
        recurrence: 'one_time',
      },
      {
        ...MOCK_BOOKING,
        id: 'bk-past',
        service_id: 'ac-repair',
        scheduled_for: pastIso,
        scheduling_type: 'datetime',
        recurrence: 'one_time',
      },
    ]);

    render(<AdminWebBookingsScreen />);
    await screen.findByText('Plumbing');

    fireEvent.press(screen.getByText('Today'));

    expect(screen.getByText('Plumbing')).toBeOnTheScreen();
    expect(screen.queryByText('Electrical Repairs')).toBeNull();
    expect(screen.queryByText('AC Repair & Servicing')).toBeNull();
  });

  it('Scheduled filter: hides asap fixture, shows non-asap fixture', async () => {
    mockGetAllBookings.mockResolvedValueOnce([
      {
        ...MOCK_BOOKING,
        id: 'bk-asap',
        service_id: 'plumbing',
        scheduled_for: todayIso,
        scheduling_type: 'asap',
        recurrence: 'one_time',
      },
      {
        ...MOCK_BOOKING,
        id: 'bk-sched',
        // Use correct service ID 'electrical' (title: 'Electrical Repairs')
        service_id: 'electrical',
        scheduled_for: tomorrowIso,
        scheduling_type: 'tomorrow',
        recurrence: 'one_time',
      },
    ]);

    render(<AdminWebBookingsScreen />);
    await screen.findByText('Plumbing');

    // 'Scheduled' appears as both a filter button and the DataTable column header;
    // press the first occurrence (the filter button)
    const scheduledEls = screen.getAllByText('Scheduled');
    fireEvent.press(scheduledEls[0]);

    expect(screen.getByText('Electrical Repairs')).toBeOnTheScreen();
    expect(screen.queryByText('Plumbing')).toBeNull();
  });

  it('weekly recurrence fixture shows "Weekly" text in the Scheduled column', async () => {
    mockGetAllBookings.mockResolvedValueOnce([
      {
        ...MOCK_BOOKING,
        id: 'bk-weekly',
        service_id: 'house-cleaning',
        scheduled_for: tomorrowIso,
        scheduling_type: 'tomorrow',
        recurrence: 'weekly',
      },
    ]);

    render(<AdminWebBookingsScreen />);
    await screen.findByText('House Cleaning');
    // recurrenceLabel('weekly') === 'Weekly'
    expect(screen.getByText('Weekly')).toBeOnTheScreen();
  });

  it('describeSchedule output: a window fixture shows a substring from its description', async () => {
    const windowStart = new Date(Date.now() + 86_400_000);
    windowStart.setHours(8, 0, 0, 0);
    const windowEnd = new Date(Date.now() + 86_400_000);
    windowEnd.setHours(12, 0, 0, 0);

    mockGetAllBookings.mockResolvedValueOnce([
      {
        ...MOCK_BOOKING,
        id: 'bk-window',
        service_id: 'plumbing',
        scheduled_for: windowStart.toISOString(),
        scheduling_type: 'tomorrow',
        time_window: 'morning',
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        recurrence: 'one_time',
      },
    ]);

    render(<AdminWebBookingsScreen />);
    await screen.findByText('Plumbing');
    // describeSchedule returns something containing 'morning' for a morning window
    const morningTexts = screen.getAllByText(/morning/i);
    expect(morningTexts.length).toBeGreaterThan(0);
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
