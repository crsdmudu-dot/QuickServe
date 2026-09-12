/**
 * Tests for src/app/provider/job/[id].tsx
 *
 * Mocks expo-router, @/lib/bookings, @/lib/photos so no network calls are made.
 * Uses findBy* for async data loads after getBookingById resolves.
 */

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'j1' }),
  router: { push: jest.fn() },
  // useFocusEffect: no-op in tests — the sharing hook is fully mocked, so focused value is irrelevant.
  useFocusEffect: jest.fn(),
}));

// Mock the sharing hook so no expo-location runs in tests.
jest.mock('@/hooks/use-provider-location-sharing', () => ({
  useProviderLocationSharing: () => ({ sharing: false, permission: 'undetermined' }),
}));

// Mock ServicesProvider — provider/job/[id].tsx uses useServices() for getServiceBySlug
jest.mock('@/services/services-provider', () => {
  const { mockServicesProviderModule } = require('../../test/mock-services');
  return mockServicesProviderModule();
});

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
    scheduling_type: 'tomorrow',
    time_window: null,
    window_start: null,
    window_end: null,
    recurrence: 'one_time',
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

  // ── Scheduling display tests ──────────────────────────────────────────

  it('shows ASAP badge when scheduling_type is asap', async () => {
    mockGetBookingById.mockResolvedValueOnce({
      id: 'j1',
      service_id: 'house-cleaning',
      address: '123 Main St',
      scheduled_for: '2026-07-01T10:00:00Z',
      notes: null,
      status: 'provider_assigned',
      created_at: '2026-06-21T00:00:00Z',
      assigned_provider_name: null,
      assigned_provider_phone: null,
      admin_notes: null,
      assigned_provider_id: null,
      scheduling_type: 'asap',
      time_window: null,
      window_start: null,
      window_end: null,
      recurrence: 'one_time',
    });
    render(<ProviderJobDetailScreen />);
    await screen.findByText('House Cleaning');
    expect(screen.getByTestId('asap-badge')).toBeOnTheScreen();
  });

  it('shows time window text when time_window is set', async () => {
    mockGetBookingById.mockResolvedValueOnce({
      id: 'j1',
      service_id: 'house-cleaning',
      address: '123 Main St',
      scheduled_for: '2026-07-01T10:00:00Z',
      notes: null,
      status: 'provider_assigned',
      created_at: '2026-06-21T00:00:00Z',
      assigned_provider_name: null,
      assigned_provider_phone: null,
      admin_notes: null,
      assigned_provider_id: null,
      scheduling_type: 'tomorrow',
      time_window: 'morning',
      window_start: '2026-07-02T08:00:00Z',
      window_end: '2026-07-02T12:00:00Z',
      recurrence: 'one_time',
    });
    render(<ProviderJobDetailScreen />);
    await screen.findByText('House Cleaning');
    // The "When" text should include "morning" when time_window is 'morning'
    expect(screen.getByText(/morning/)).toBeOnTheScreen();
  });

  it('shows recurring badge when recurrence is not one_time', async () => {
    mockGetBookingById.mockResolvedValueOnce({
      id: 'j1',
      service_id: 'house-cleaning',
      address: '123 Main St',
      scheduled_for: '2026-07-01T10:00:00Z',
      notes: null,
      status: 'provider_assigned',
      created_at: '2026-06-21T00:00:00Z',
      assigned_provider_name: null,
      assigned_provider_phone: null,
      admin_notes: null,
      assigned_provider_id: null,
      scheduling_type: 'tomorrow',
      time_window: null,
      window_start: null,
      window_end: null,
      recurrence: 'weekly',
    });
    render(<ProviderJobDetailScreen />);
    await screen.findByText('House Cleaning');
    expect(screen.getByTestId('recurring-badge')).toBeOnTheScreen();
  });

  it('does not show recurring badge when recurrence is one_time', async () => {
    mockGetBookingById.mockResolvedValueOnce({
      id: 'j1',
      service_id: 'house-cleaning',
      address: '123 Main St',
      scheduled_for: '2026-07-01T10:00:00Z',
      notes: null,
      status: 'provider_assigned',
      created_at: '2026-06-21T00:00:00Z',
      assigned_provider_name: null,
      assigned_provider_phone: null,
      admin_notes: null,
      assigned_provider_id: null,
      scheduling_type: 'tomorrow',
      time_window: null,
      window_start: null,
      window_end: null,
      recurrence: 'one_time',
    });
    render(<ProviderJobDetailScreen />);
    await screen.findByText('House Cleaning');
    expect(screen.queryByTestId('recurring-badge')).toBeNull();
  });

  // ── Service Details V1.4 — the request the provider must fulfil ───────────

  describe('Service Details', () => {
    /** Base booking fields shared by the fixtures below. */
    const BASE = {
      id: 'j1',
      address: '123 Main St',
      scheduled_for: '2026-07-01T10:00:00Z',
      notes: null,
      status: 'provider_assigned',
      created_at: '2026-06-21T00:00:00Z',
      assigned_provider_name: null,
      assigned_provider_phone: null,
      admin_notes: null,
      assigned_provider_id: null,
      scheduling_type: 'tomorrow',
      time_window: null,
      window_start: null,
      window_end: null,
      recurrence: 'one_time',
    };

    it('shows the structured request with the operationally relevant answers', async () => {
      mockGetBookingById.mockResolvedValueOnce({
        ...BASE,
        service_id: 'house-cleaning',
        service_details: {
          schema: 1,
          form_version: 1,
          service_slug: 'house-cleaning',
          service_title: 'House Cleaning',
          primary_kind: 'variant',
          primary: {
            key: 'variant',
            question: 'What kind of cleaning do you need?',
            kind: 'single',
            value: 'deep_clean',
            display: 'Deep cleaning',
          },
          answers: [
            { key: 'scope', question: 'Scope', kind: 'single', value: 'whole_home', display: 'Whole home' },
            { key: 'bedrooms', question: 'Bedrooms', kind: 'number', value: 4, display: '4' },
            { key: 'bathrooms', question: 'Bathrooms', kind: 'number', value: 3, display: '3' },
            { key: 'supplies', question: 'Provider brings supplies', kind: 'boolean', value: true, display: 'Yes' },
          ],
          addons: [],
          items: null,
          flags: { priority: true },
        },
      });

      render(<ProviderJobDetailScreen />);

      expect(await screen.findByText('Service Details')).toBeOnTheScreen();
      expect(screen.getByText('Deep cleaning')).toBeOnTheScreen();
      expect(screen.getByText('Whole home')).toBeOnTheScreen();
      expect(screen.getByText('Bedrooms')).toBeOnTheScreen();
      expect(screen.getByText('4')).toBeOnTheScreen();
      expect(screen.getByText('Bathrooms')).toBeOnTheScreen();
      expect(screen.getByText('Yes')).toBeOnTheScreen();
      // Priority is operational information the provider acts on.
      expect(screen.getByText('Priority attention')).toBeOnTheScreen();
    });

    it('shows the grocery item list, quantities, brands and the maximum goods budget', async () => {
      mockGetBookingById.mockResolvedValueOnce({
        ...BASE,
        service_id: 'grocery-delivery',
        service_details: {
          schema: 1,
          form_version: 1,
          service_slug: 'grocery-delivery',
          service_title: 'Grocery Delivery',
          primary_kind: 'variant',
          primary: {
            key: 'variant',
            question: 'How would you like to shop?',
            kind: 'single',
            value: 'shop_for_me',
            display: 'Shop for me',
          },
          answers: [],
          addons: [],
          items: {
            kind: 'grocery',
            goods_budget: { currency: 'KES', max_goods_amount: 5000 },
            substitution: { value: 'ask_first', display: 'Contact me before substituting' },
            lines: [
              { line_id: 'l1', name: 'Milk', qty: 2, unit: 'bottles', brand: 'Brookside', note: null },
              { line_id: 'l2', name: 'Rice', qty: 5, unit: 'kg', brand: null, note: null },
            ],
          },
          flags: {},
        },
      });

      render(<ProviderJobDetailScreen />);

      expect(await screen.findByText('Requested items')).toBeOnTheScreen();
      expect(screen.getByText('Milk')).toBeOnTheScreen();
      expect(screen.getByText('2 bottles')).toBeOnTheScreen();
      expect(screen.getByText('Brand: Brookside')).toBeOnTheScreen();
      expect(screen.getByText('Rice')).toBeOnTheScreen();
      expect(screen.getByText('5 kg')).toBeOnTheScreen();
      expect(screen.getByText('Maximum goods budget')).toBeOnTheScreen();
      expect(screen.getByText('KES 5,000')).toBeOnTheScreen();
      expect(screen.getByText('Contact me before substituting')).toBeOnTheScreen();
    });

    it('gives the provider no way to edit the request, and writes nothing by rendering it', async () => {
      mockGetBookingById.mockResolvedValueOnce({
        ...BASE,
        service_id: 'house-cleaning',
        service_details: {
          schema: 1,
          form_version: 1,
          service_slug: 'house-cleaning',
          service_title: 'House Cleaning',
          primary_kind: 'variant',
          primary: {
            key: 'variant',
            question: 'What kind of cleaning do you need?',
            kind: 'single',
            value: 'deep_clean',
            display: 'Deep cleaning',
          },
          answers: [],
          addons: [],
          items: null,
          flags: {},
        },
      });

      render(<ProviderJobDetailScreen />);

      await screen.findByText('Service Details');
      expect(screen.queryByTestId('service-details-edit')).toBeNull();
      expect(screen.queryByText('Edit service details')).toBeNull();
      // Rendering the snapshot never triggers a booking write.
      expect(mockUpdateBookingStatus).not.toHaveBeenCalled();
    });

    it('renders a legacy booking (no snapshot) safely with a plain explanation', async () => {
      // The default mock booking predates Service Details.
      render(<ProviderJobDetailScreen />);

      expect(await screen.findByTestId('service-details-summary-empty')).toBeOnTheScreen();
      expect(
        screen.getByText('Service details were not captured for this booking.'),
      ).toBeOnTheScreen();
      // The rest of the job screen is unaffected.
      expect(screen.getByText('Destination')).toBeOnTheScreen();
    });
  });
});
