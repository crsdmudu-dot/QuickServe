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
  assigned_provider_name: null,
  assigned_provider_phone: null,
  assigned_provider_id: null,
  admin_notes: null,
  created_at: '2026-06-21T00:00:00Z',
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

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AdminBookingDetailScreen from '@/app/admin/booking/[id]';

describe('AdminBookingDetailScreen', () => {
  beforeEach(() => {
    mockGetBookingById.mockClear();
    mockUpdateBookingStatus.mockClear();
    mockAssignProvider.mockClear();
    mockUpdateAdminNotes.mockClear();
    mockGetApprovedProviders.mockClear();
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
});
