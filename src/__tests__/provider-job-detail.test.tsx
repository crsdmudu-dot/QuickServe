/**
 * Tests for src/app/provider/job/[id].tsx
 *
 * Mocks expo-router, @/lib/bookings, @/lib/photos so no network calls are made.
 * Uses findBy* for async data loads after getBookingById resolves.
 */

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'j1' }),
  router: { push: jest.fn() },
}));

// booking state is controlled per test via this variable.
let mockBookingStatus: string = 'provider_assigned';

const mockGetBookingById = jest.fn().mockImplementation(() =>
  Promise.resolve({
    id: 'j1',
    service_id: 'house-cleaning',
    address: '123 Main St',
    scheduled_for: '2026-07-01T10:00:00Z',
    notes: null,
    status: mockBookingStatus,
    created_at: '2026-06-21T00:00:00Z',
    assigned_provider_name: null,
    assigned_provider_phone: null,
    admin_notes: null,
    assigned_provider_id: null,
  }),
);

const mockUpdateBookingStatus = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/bookings', () => ({
  getBookingById: (...args: unknown[]) => mockGetBookingById(...args),
  updateBookingStatus: (...args: unknown[]) => mockUpdateBookingStatus(...args),
}));

// Mock photos lib — default: one 'before' photo with a signedUrl.
const mockGetBookingPhotos = jest.fn().mockResolvedValue([
  {
    id: 'ph1',
    booking_id: 'j1',
    uploaded_by: 'u1',
    photo_url: 'path/to/before.jpg',
    photo_type: 'before',
    caption: null,
    is_verified: false,
    created_at: '2026-06-21T00:00:00Z',
    signedUrl: 'https://example.com/signed-before.jpg',
  },
]);
const mockUploadBookingPhoto = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/photos', () => ({
  getBookingPhotos: (...args: unknown[]) => mockGetBookingPhotos(...args),
  uploadBookingPhoto: (...args: unknown[]) => mockUploadBookingPhoto(...args),
}));

// Mock activity lib — default: one provider_assigned event.
const mockGetBookingActivity = jest.fn().mockResolvedValue([
  {
    id: 'a1',
    booking_id: 'bk1',
    actor_id: null,
    event_type: 'provider_assigned',
    message: 'A professional has been assigned to your booking.',
    metadata: null,
    created_at: '2026-07-01T10:00:00Z',
  },
]);

jest.mock('@/lib/activity', () => ({
  getBookingActivity: (...args: unknown[]) => mockGetBookingActivity(...args),
}));

// Mock expo-image-picker — permission granted, returns one asset URI.
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///test-image.jpg' }],
  }),
}));

import * as ImagePicker from 'expo-image-picker';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ProviderJobDetailScreen from '@/app/provider/job/[id]';

describe('ProviderJobDetailScreen', () => {
  beforeEach(() => {
    mockGetBookingById.mockClear();
    mockUpdateBookingStatus.mockClear();
    mockGetBookingPhotos.mockClear();
    mockUploadBookingPhoto.mockClear();
    mockGetBookingActivity.mockClear();
    // Restore default photo mock (one before photo)
    mockGetBookingPhotos.mockResolvedValue([
      {
        id: 'ph1',
        booking_id: 'j1',
        uploaded_by: 'u1',
        photo_url: 'path/to/before.jpg',
        photo_type: 'before',
        caption: null,
        is_verified: false,
        created_at: '2026-06-21T00:00:00Z',
        signedUrl: 'https://example.com/signed-before.jpg',
      },
    ]);
  });

  // ── Existing forward-only status tests ──────────────────────────────────

  it('shows only "On the way" button for provider_assigned status', async () => {
    mockBookingStatus = 'provider_assigned';
    render(<ProviderJobDetailScreen />);
    // Wait for booking to load
    await screen.findByText('House Cleaning');
    // Only the next-step button should be visible
    expect(screen.getByText('On the way')).toBeOnTheScreen();
    // Should not show In progress (that comes after on_the_way)
    expect(screen.queryByText('In progress')).toBeNull();
  });

  it('calls updateBookingStatus with on_the_way when the button is pressed', async () => {
    mockBookingStatus = 'provider_assigned';
    render(<ProviderJobDetailScreen />);
    await screen.findByText('House Cleaning');
    fireEvent.press(screen.getByText('On the way'));
    await waitFor(() =>
      expect(mockUpdateBookingStatus).toHaveBeenCalledWith('j1', 'on_the_way'),
    );
  });

  it('shows "No further action" and no action button when status is completed', async () => {
    mockBookingStatus = 'completed';
    render(<ProviderJobDetailScreen />);
    await screen.findByText('House Cleaning');
    expect(screen.getByText('No further action')).toBeOnTheScreen();
    // No action buttons should be present
    expect(screen.queryByText('On the way')).toBeNull();
    expect(screen.queryByText('In progress')).toBeNull();
  });

  // ── Photo section tests ─────────────────────────────────────────────────

  it('renders the before photo image (testID photo-image)', async () => {
    mockBookingStatus = 'provider_assigned';
    render(<ProviderJobDetailScreen />);
    await screen.findByText('House Cleaning');
    // The photo-thumb renders an <Image testID="photo-image"> when signedUrl is set
    const photoImage = await screen.findByTestId('photo-image');
    expect(photoImage).toBeOnTheScreen();
  });

  it('calls uploadBookingPhoto with photoType "before" when "Add before photo" is pressed', async () => {
    mockBookingStatus = 'provider_assigned';
    render(<ProviderJobDetailScreen />);
    await screen.findByText('House Cleaning');

    fireEvent.press(screen.getByText('Add before photo'));

    await waitFor(() =>
      expect(mockUploadBookingPhoto).toHaveBeenCalledWith(
        expect.objectContaining({ photoType: 'before' }),
      ),
    );
  });

  it('calls uploadBookingPhoto with photoType "after" when "Add after / completion photo" is pressed', async () => {
    mockBookingStatus = 'provider_assigned';
    render(<ProviderJobDetailScreen />);
    await screen.findByText('House Cleaning');

    fireEvent.press(screen.getByText('Add after / completion photo'));

    await waitFor(() =>
      expect(mockUploadBookingPhoto).toHaveBeenCalledWith(
        expect.objectContaining({ photoType: 'after' }),
      ),
    );
  });

  it('does NOT render any delete or verify controls (no renderActions)', async () => {
    mockBookingStatus = 'provider_assigned';
    render(<ProviderJobDetailScreen />);
    await screen.findByText('House Cleaning');
    // Verify Verified badge is absent (no admin actions)
    expect(screen.queryByText('✓ Verified')).toBeNull();
    // No delete button
    expect(screen.queryByText('Delete')).toBeNull();
  });

  // ── Activity timeline tests ─────────────────────────────────────────────

  it('renders the activity event message from getBookingActivity', async () => {
    mockBookingStatus = 'provider_assigned';
    render(<ProviderJobDetailScreen />);
    await screen.findByText('House Cleaning');
    const activityMsg = await screen.findByText(
      'A professional has been assigned to your booking.',
    );
    expect(activityMsg).toBeOnTheScreen();
  });
});
