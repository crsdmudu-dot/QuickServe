/**
 * Tests for src/app/admin/booking/[id].tsx
 *
 * Mocks expo-router, @/lib/bookings, and @/lib/providers so no network calls
 * are made. Uses findBy* for async data loads after getBookingById resolves.
 */

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'b1' }),
  router: { push: jest.fn(), replace: jest.fn() },
}));

const mockGetBookingById = jest.fn().mockResolvedValue({
  id: 'b1',
  service_id: 'house-cleaning',
  address: '123 Main St',
  scheduled_for: '2026-07-01T10:00:00Z',
  notes: 'Ring doorbell',
  status: 'pending' as const,
  customer_id: 'cust1',
  assigned_provider_name: null,
  assigned_provider_phone: null,
  assigned_provider_id: null,
  admin_notes: null,
  created_at: '2026-06-21T00:00:00Z',
  quoted_amount: null,
  provider_share: null,
  quote_status: 'pending' as const,
});

const mockUpdateBookingStatus = jest.fn().mockResolvedValue({ ok: true });
const mockAssignProvider = jest.fn().mockResolvedValue({ ok: true });
const mockUpdateAdminNotes = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/bookings', () => ({
  getBookingById: (...args: unknown[]) => mockGetBookingById(...args),
  updateBookingStatus: (...args: unknown[]) => mockUpdateBookingStatus(...args),
  assignProvider: (...args: unknown[]) => mockAssignProvider(...args),
  updateAdminNotes: (...args: unknown[]) => mockUpdateAdminNotes(...args),
}));

const mockGetApprovedProviders = jest.fn().mockResolvedValue([
  { id: 'p1', full_name: 'Jane', phone: '0700', approval_status: 'approved' },
]);

jest.mock('@/lib/providers', () => ({
  getApprovedProviders: (...args: unknown[]) => mockGetApprovedProviders(...args),
}));

const mockGetBookingPhotos = jest.fn().mockResolvedValue([
  {
    id: 'ph1',
    booking_id: 'b1',
    uploaded_by: 'u1',
    photo_url: 'bk1/a.jpg',
    photo_type: 'issue',
    caption: null,
    is_verified: false,
    created_at: '2026-06-21T00:00:00Z',
    signedUrl: 'https://x',
  },
]);
const mockDeleteBookingPhoto = jest.fn().mockResolvedValue({ ok: true });
const mockSetPhotoVerified = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/photos', () => ({
  getBookingPhotos: (...args: unknown[]) => mockGetBookingPhotos(...args),
  deleteBookingPhoto: (...args: unknown[]) => mockDeleteBookingPhoto(...args),
  setPhotoVerified: (...args: unknown[]) => mockSetPhotoVerified(...args),
}));

const mockGetBookingActivity = jest.fn().mockResolvedValue([
  {
    id: 'a1',
    booking_id: 'b1',
    actor_id: null,
    event_type: 'booking_created',
    message: 'Booking created.',
    metadata: null,
    created_at: '2026-07-01T10:00:00Z',
  },
]);

jest.mock('@/lib/activity', () => ({
  getBookingActivity: (...args: unknown[]) => mockGetBookingActivity(...args),
}));

jest.mock('@/lib/messages', () => ({
  getBookingMessages: jest.fn().mockResolvedValue([]),
  getChatPeerName: jest.fn().mockResolvedValue(null),
  sendBookingMessage: jest.fn(),
  labelSender: (s: string, b: { customer_id: string; assigned_provider_id: string | null }) =>
    s === b.customer_id ? 'Customer' : s === b.assigned_provider_id ? 'Provider' : 'Unknown',
}));

jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'admin' } } }),
}));

jest.mock('@/lib/quotes', () => ({
  setBookingQuote: jest.fn().mockResolvedValue({ ok: true }),
  computeQuickServeShare: (amount: number, providerShare: number) => amount - providerShare,
  validateQuoteInput: () => null,
  canEditQuote: () => true,
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AdminBookingDetailScreen from '@/app/admin/booking/[id]';

describe('AdminBookingDetailScreen', () => {
  beforeEach(() => {
    mockGetBookingById.mockClear();
    mockUpdateBookingStatus.mockClear();
    mockAssignProvider.mockClear();
    mockUpdateAdminNotes.mockClear();
    mockGetApprovedProviders.mockClear();
    mockGetBookingPhotos.mockClear();
    mockDeleteBookingPhoto.mockClear();
    mockSetPhotoVerified.mockClear();
    mockGetBookingActivity.mockClear();
  });

  it('renders service title, address, and status badge after data loads', async () => {
    render(<AdminBookingDetailScreen />);
    // Wait for booking to load
    expect(await screen.findByText('House Cleaning')).toBeOnTheScreen();
    expect(screen.getByText('123 Main St')).toBeOnTheScreen();
    // 'Pending' appears as the status badge AND as a picker button — both are on screen
    const pendingElements = screen.getAllByText('Pending');
    expect(pendingElements.length).toBeGreaterThan(0);
  });

  it('calls updateBookingStatus with correct args when a status button is pressed', async () => {
    render(<AdminBookingDetailScreen />);
    // Wait for data to load
    await screen.findByText('House Cleaning');
    // Press the "In progress" status button
    fireEvent.press(screen.getByText('In progress'));
    await waitFor(() =>
      expect(mockUpdateBookingStatus).toHaveBeenCalledWith('b1', 'in_progress'),
    );
  });

  it('Manual mode (default): calls assignProvider with name and phone when Assign is pressed', async () => {
    render(<AdminBookingDetailScreen />);
    await screen.findByText('House Cleaning');

    // Manual is the default mode — inputs should be visible
    const nameInput = screen.getByPlaceholderText('Full name');
    fireEvent.changeText(nameInput, 'Jane');
    const phoneInput = screen.getByPlaceholderText('Phone number');
    fireEvent.changeText(phoneInput, '0700');

    fireEvent.press(screen.getByText('Assign'));
    await waitFor(() =>
      expect(mockAssignProvider).toHaveBeenCalledWith('b1', { name: 'Jane', phone: '0700' }),
    );
  });

  it('In-app mode: shows approved provider and calls assignProvider with providerId when tapped', async () => {
    render(<AdminBookingDetailScreen />);
    await screen.findByText('House Cleaning');

    // Switch to In-app mode
    fireEvent.press(screen.getByText('In-app'));

    // The approved provider 'Jane' should appear
    expect(await screen.findByText('Jane')).toBeOnTheScreen();

    // Tap the provider card
    fireEvent.press(screen.getByText('Jane'));

    await waitFor(() =>
      expect(mockAssignProvider).toHaveBeenCalledWith('b1', {
        providerId: 'p1',
        name: 'Jane',
        phone: '0700',
      }),
    );
  });

  it('calls updateAdminNotes when Save notes is pressed', async () => {
    render(<AdminBookingDetailScreen />);
    await screen.findByText('House Cleaning');

    const notesInput = screen.getByPlaceholderText('Internal notes…');
    fireEvent.changeText(notesInput, 'call gate');

    fireEvent.press(screen.getByText('Save notes'));
    await waitFor(() =>
      expect(mockUpdateAdminNotes).toHaveBeenCalledWith('b1', 'call gate'),
    );
  });

  it('renders the photo image in the Photos section', async () => {
    render(<AdminBookingDetailScreen />);
    // Wait for booking + photos to load
    await screen.findByText('House Cleaning');
    // PhotoThumb renders an Image with testID="photo-image"
    expect(await screen.findByTestId('photo-image')).toBeOnTheScreen();
  });

  it('pressing Delete calls deleteBookingPhoto with the photo id and path', async () => {
    render(<AdminBookingDetailScreen />);
    await screen.findByText('House Cleaning');
    // Wait for the photo to appear
    await screen.findByTestId('photo-image');

    fireEvent.press(screen.getByText('Delete'));
    await waitFor(() =>
      expect(mockDeleteBookingPhoto).toHaveBeenCalledWith({
        id: 'ph1',
        photo_url: 'bk1/a.jpg',
      }),
    );
  });

  it('pressing Verify calls setPhotoVerified with id and true (toggling from false)', async () => {
    render(<AdminBookingDetailScreen />);
    await screen.findByText('House Cleaning');
    // Wait for the photo to appear
    await screen.findByTestId('photo-image');

    fireEvent.press(screen.getByText('Verify'));
    await waitFor(() =>
      expect(mockSetPhotoVerified).toHaveBeenCalledWith('ph1', true),
    );
  });

  it('renders the activity timeline with the booking_created event message', async () => {
    render(<AdminBookingDetailScreen />);
    // Wait for booking to load first
    await screen.findByText('House Cleaning');
    // Activity message should appear in the timeline
    expect(await screen.findByText('Booking created.')).toBeOnTheScreen();
  });

  it('renders the Conversation section heading', async () => {
    render(<AdminBookingDetailScreen />);
    await screen.findByText('House Cleaning');
    // ChatThread renders its own "Conversation" header in readonly mode.
    const conversationHeadings = await screen.findAllByText('Conversation');
    expect(conversationHeadings.length).toBeGreaterThan(0);
  });
});
