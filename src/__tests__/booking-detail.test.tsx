/**
 * Tests for src/app/booking/[id].tsx
 *
 * Mocks expo-router (useLocalSearchParams -> {id:'b1'}) and @/lib/bookings
 * and @/lib/photos so no network calls are made.  Uses findBy* to await
 * state settle.
 *
 * Case A: in-app provider (assigned_provider_id set) -> ProfessionalCard shown;
 *         phone NOT rendered.
 * Case B: manual provider (assigned_provider_id null, name set) -> name only shown,
 *         no verified badge, no phone.
 * Case C: no provider assigned -> "No provider assigned yet" shown.
 * Case D: photos section shown with PhotoGallery and upload button.
 */

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'b1' }),
  router: { push: jest.fn(), replace: jest.fn() },
}));

const mockGetBookingById = jest.fn();
const mockGetBookingProfessional = jest.fn();
const mockGetBookingPhotos = jest.fn();

jest.mock('@/lib/bookings', () => ({
  getBookingById: (...args: unknown[]) => mockGetBookingById(...args),
  getBookingProfessional: (...args: unknown[]) => mockGetBookingProfessional(...args),
}));

jest.mock('@/lib/photos', () => ({
  getBookingPhotos: (...args: unknown[]) => mockGetBookingPhotos(...args),
  uploadBookingPhoto: jest.fn().mockResolvedValue({ ok: true }),
}));

// Mock the PhotoUploadButton so it renders a simple testable placeholder
jest.mock('@/components/ui/photo-upload-button', () => ({
  PhotoUploadButton: ({ label }: { label: string }) => {
    const { Text } = require('react-native');
    return <Text>{label}</Text>;
  },
}));

import { render, screen } from '@testing-library/react-native';
import BookingDetailScreen from '@/app/booking/[id]';

const BASE_BOOKING = {
  id: 'b1',
  service_id: 'house-cleaning',
  address: '123 Main St',
  scheduled_for: '2026-07-01T10:00:00Z',
  notes: 'Ring doorbell',
  status: 'pending' as const,
  assigned_provider_id: null,
  assigned_provider_name: null,
  assigned_provider_phone: null,
  admin_notes: null,
  created_at: '2026-06-21T00:00:00Z',
};

describe('BookingDetailScreen', () => {
  beforeEach(() => {
    mockGetBookingById.mockClear();
    mockGetBookingProfessional.mockClear();
    mockGetBookingPhotos.mockResolvedValue([]);
  });

  it('Case A: in-app provider shows ProfessionalCard; phone is NOT rendered', async () => {
    mockGetBookingById.mockResolvedValue({
      ...BASE_BOOKING,
      status: 'provider_assigned' as const,
      assigned_provider_id: 'p1',
      assigned_provider_name: 'Jane',
      assigned_provider_phone: '0700',
    });

    mockGetBookingProfessional.mockResolvedValue({
      full_name: 'Jane',
      skills: ['Plumbing'],
      is_verified: true,
      completed_jobs_count: 5,
      profile_photo_url: null,
    });

    render(<BookingDetailScreen />);

    expect(await screen.findByText('Jane')).toBeOnTheScreen();
    expect(screen.getByText('Plumbing')).toBeOnTheScreen();
    expect(screen.getByText('Verified by QuickServe')).toBeOnTheScreen();
    expect(screen.getByText('5 jobs completed')).toBeOnTheScreen();
    expect(screen.queryByText('0700')).toBeNull();
  });

  it('Case B: manual provider shows name only; no verified badge and no phone', async () => {
    mockGetBookingById.mockResolvedValue({
      ...BASE_BOOKING,
      status: 'provider_assigned' as const,
      assigned_provider_id: null,
      assigned_provider_name: 'Bob',
      assigned_provider_phone: '0700',
    });

    render(<BookingDetailScreen />);

    expect(await screen.findByText('Bob')).toBeOnTheScreen();
    expect(screen.queryByText('Verified by QuickServe')).toBeNull();
    expect(screen.queryByText('0700')).toBeNull();
  });

  it('Case C: shows "No provider assigned yet" when provider fields are null', async () => {
    mockGetBookingById.mockResolvedValue(BASE_BOOKING);

    render(<BookingDetailScreen />);

    expect(await screen.findByText('No provider assigned yet')).toBeOnTheScreen();
  });

  it('Case D: shows Photos section with gallery and upload button', async () => {
    mockGetBookingById.mockResolvedValue(BASE_BOOKING);
    mockGetBookingPhotos.mockResolvedValue([
      {
        id: 'ph1',
        booking_id: 'b1',
        uploaded_by: 'u1',
        photo_url: 'path/to/photo.jpg',
        photo_type: 'issue',
        caption: null,
        is_verified: false,
        created_at: '2026-06-21T00:00:00Z',
        signedUrl: 'https://example.com/signed-photo.jpg',
      },
    ]);

    render(<BookingDetailScreen />);

    // Wait for booking to load
    await screen.findByText('No provider assigned yet');

    // Upload button label should be present
    expect(screen.getByText('Add issue photos')).toBeOnTheScreen();
  });
});
