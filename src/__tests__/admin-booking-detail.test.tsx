/**
 * Tests for src/app/admin/booking/[id].tsx
 *
 * Mocks expo-router, @/lib/bookings so no network calls are made.
 * Uses findBy* for async data loads after getBookingById resolves.
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

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AdminBookingDetailScreen from '@/app/admin/booking/[id]';

describe('AdminBookingDetailScreen', () => {
  beforeEach(() => {
    mockGetBookingById.mockClear();
    mockUpdateBookingStatus.mockClear();
    mockAssignProvider.mockClear();
    mockUpdateAdminNotes.mockClear();
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

  it('calls assignProvider with name and phone when Assign is pressed', async () => {
    render(<AdminBookingDetailScreen />);
    await screen.findByText('House Cleaning');

    const nameInput = screen.getByPlaceholderText('Full name');
    fireEvent.changeText(nameInput, 'Jane');
    const phoneInput = screen.getByPlaceholderText('Phone number');
    fireEvent.changeText(phoneInput, '0700');

    fireEvent.press(screen.getByText('Assign'));
    await waitFor(() =>
      expect(mockAssignProvider).toHaveBeenCalledWith('b1', { name: 'Jane', phone: '0700' }),
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
