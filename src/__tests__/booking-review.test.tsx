/**
 * Tests for src/app/booking/review.tsx
 *
 * We mock expo-router (push/replace), @/booking/booking-draft, @/lib/bookings
 * and @/lib/photos so no network is touched.
 *
 * Slice 20: mockDraft now includes the structured address fields, and the
 * createBooking assertion is updated additively to include them.
 *
 * Service Details V1.3: House Cleaning is a CONFIGURED service, so Review now fails closed
 * unless the draft carries a Service Details snapshot. mockDraft therefore includes a minimal
 * valid snapshot, and createBooking is asserted to receive it as service_details.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

// Mock ServicesProvider — review.tsx uses useServices() for getServiceBySlug
jest.mock('@/services/services-provider', () => {
  const { mockServicesProviderModule } = require('../../test/mock-services');
  return mockServicesProviderModule();
});

/**
 * A minimal but structurally valid ServiceDetailsSnapshot (V1.1 shape). Built by hand rather than
 * via buildServiceDetailsSnapshot so this test stays independent of the builder.
 */
const snapshot = {
  schema: 1,
  form_version: 1,
  service_slug: 'house-cleaning',
  service_title: 'House Cleaning',
  primary_kind: 'variant' as const,
  primary: {
    key: 'variant',
    question: 'What kind of cleaning do you need?',
    kind: 'single' as const,
    value: 'standard_clean',
    display: 'Standard cleaning',
  },
  answers: [],
  addons: [],
  items: null,
  flags: {},
};

const mockReset = jest.fn();
let mockDraft = {
  serviceId: 'house-cleaning',
  serviceDetails: snapshot as unknown as null,
  address: 'Nairobi',
  scheduledFor: '2026-07-01T10:00:00Z',
  notes: 'Gate code 12',
  issuePhotos: [] as string[],
  // Slice 20 structured address fields
  address_label: '',
  latitude: null as number | null,
  longitude: null as number | null,
  building_name: '',
  floor: '',
  door_number: '',
  landmark: '',
  access_notes: '',
};
jest.mock('@/booking/booking-draft', () => ({
  useBookingDraft: () => ({ ...mockDraft, reset: mockReset, ensureIdempotencyKey: () => 'idem-1' }),
}));

const mockCreateBooking = jest.fn();
const mockFindDup = jest.fn();
jest.mock('@/lib/bookings', () => ({
  createBooking: (...args: unknown[]) => mockCreateBooking(...args),
  findActiveDuplicateBooking: (...args: unknown[]) => mockFindDup(...args),
}));

const mockUploadBookingPhoto = jest.fn();
jest.mock('@/lib/photos', () => ({
  uploadBookingPhoto: (...args: unknown[]) => mockUploadBookingPhoto(...args),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import ReviewScreen from '@/app/booking/review';

describe('ReviewScreen', () => {
  beforeEach(() => {
    (router.replace as jest.Mock).mockClear();
    mockReset.mockClear();
    mockCreateBooking.mockReset();
    mockFindDup.mockReset();
    mockFindDup.mockResolvedValue(null); // default: no business duplicate
    mockUploadBookingPhoto.mockReset();
    mockDraft = {
      serviceId: 'house-cleaning',
      serviceDetails: snapshot as unknown as null,
      address: 'Nairobi',
      scheduledFor: '2026-07-01T10:00:00Z',
      notes: 'Gate code 12',
      issuePhotos: [],
      // Slice 20 structured address fields
      address_label: '',
      latitude: null,
      longitude: null,
      building_name: '',
      floor: '',
      door_number: '',
      landmark: '',
      access_notes: '',
    };
  });

  it('renders the service, address, a When label, and notes', () => {
    render(<ReviewScreen />);
    expect(screen.getByText('House Cleaning')).toBeOnTheScreen();
    // Slice 20: address now appears in both DestinationSummary and BookingSummaryCard.
    expect(screen.getAllByText('Nairobi').length).toBeGreaterThan(0);
    // Slice 24: the "Date & time" row is now "When" with a describeSchedule value.
    // We assert the label is present rather than the locale-formatted string.
    expect(screen.getByText('When')).toBeOnTheScreen();
    expect(screen.getByText('Gate code 12')).toBeOnTheScreen();
  });

  it('places the booking with the draft and navigates to success on ok (no photos)', async () => {
    mockCreateBooking.mockResolvedValue({ ok: true, id: 'bk1' });
    render(<ReviewScreen />);

    fireEvent.press(screen.getByText('Place Booking'));

    await waitFor(() =>
      expect(mockCreateBooking).toHaveBeenCalledWith({
        serviceId: 'house-cleaning',
        address: 'Nairobi',
        scheduledFor: '2026-07-01T10:00:00Z',
        notes: 'Gate code 12',
        // Slice 20 structured address fields
        address_label: '',
        latitude: undefined,
        longitude: undefined,
        building_name: '',
        floor: '',
        door_number: '',
        landmark: '',
        access_notes: '',
        // Slice 24 scheduling fields (undefined when draft has no scheduling props)
        scheduling_type: undefined,
        time_window: undefined,
        window_start: undefined,
        window_end: undefined,
        recurrence: undefined,
        // Service Details V1.3 — the frozen step-1 snapshot travels with the booking.
        service_details: snapshot,
        // Phase 4E.2 — submission idempotency key
        idempotencyKey: 'idem-1',
      }),
    );
    expect(mockUploadBookingPhoto).not.toHaveBeenCalled();
    expect(mockReset).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/booking/success', params: {} });
  });

  it('uploads issuePhotos and navigates to success without warning when all uploads ok', async () => {
    mockDraft.issuePhotos = ['file://a'];
    mockCreateBooking.mockResolvedValue({ ok: true, id: 'bk1' });
    mockUploadBookingPhoto.mockResolvedValue({ ok: true });
    render(<ReviewScreen />);

    fireEvent.press(screen.getByText('Place Booking'));

    await waitFor(() => expect(mockReset).toHaveBeenCalled());
    expect(mockUploadBookingPhoto).toHaveBeenCalledWith({
      bookingId: 'bk1',
      uri: 'file://a',
      photoType: 'issue',
    });
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/booking/success', params: {} });
  });

  it('navigates to success WITH photoWarning when uploadBookingPhoto fails (booking stays created)', async () => {
    mockDraft.issuePhotos = ['file://a'];
    mockCreateBooking.mockResolvedValue({ ok: true, id: 'bk1' });
    mockUploadBookingPhoto.mockResolvedValue({ ok: false });
    render(<ReviewScreen />);

    fireEvent.press(screen.getByText('Place Booking'));

    await waitFor(() => expect(mockReset).toHaveBeenCalled());
    expect(mockCreateBooking).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/booking/success',
      params: { photoWarning: '1' },
    });
  });

  it('shows an error and does not navigate when createBooking fails', async () => {
    mockDraft.issuePhotos = ['file://a'];
    mockCreateBooking.mockResolvedValue({
      ok: false,
      error: 'Could not create booking. Please try again.',
    });
    render(<ReviewScreen />);

    fireEvent.press(screen.getByText('Place Booking'));

    expect(
      await screen.findByText('Could not create booking. Please try again.'),
    ).toBeOnTheScreen();
    expect(mockUploadBookingPhoto).not.toHaveBeenCalled();
    expect(mockReset).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  // ── Business duplicate warning (advisory) ──────────────────────────────────

  it('WARNS instead of creating when a likely duplicate active booking exists', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockFindDup.mockResolvedValue({ id: 'existing-1' });
    render(<ReviewScreen />);

    fireEvent.press(screen.getByText('Place Booking'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    // No booking created while the warning is shown.
    expect(mockCreateBooking).not.toHaveBeenCalled();
    const [title, message, buttons] = alertSpy.mock.calls[0];
    expect(String(message)).toMatch(/already have an active .* booking at this address/i);
    expect((buttons as { text: string }[]).map((b) => b.text)).toEqual([
      'View existing booking',
      'Book another anyway',
    ]);
    alertSpy.mockRestore();
  });

  it('"View existing booking" navigates to the existing booking and does NOT create', async () => {
    let captured: { text: string; onPress?: () => void }[] = [];
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => { captured = b as never; });
    mockFindDup.mockResolvedValue({ id: 'existing-1' });
    render(<ReviewScreen />);
    fireEvent.press(screen.getByText('Place Booking'));
    await waitFor(() => expect(captured.length).toBe(2));

    captured.find((b) => b.text === 'View existing booking')!.onPress!();

    expect(router.push).toHaveBeenCalledWith('/booking/existing-1');
    expect(mockCreateBooking).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('"Book another anyway" creates a NEW booking (bypasses the duplicate check)', async () => {
    let captured: { text: string; onPress?: () => void }[] = [];
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => { captured = b as never; });
    mockFindDup.mockResolvedValue({ id: 'existing-1' });
    mockCreateBooking.mockResolvedValue({ ok: true, id: 'bk-new' });
    render(<ReviewScreen />);
    fireEvent.press(screen.getByText('Place Booking'));
    await waitFor(() => expect(captured.length).toBe(2));

    captured.find((b) => b.text === 'Book another anyway')!.onPress!();

    await waitFor(() => expect(mockCreateBooking).toHaveBeenCalledTimes(1));
    expect(mockCreateBooking).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'idem-1' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    alertSpy.mockRestore();
  });

  it('double-tap Place Booking fires only ONE createBooking (client re-entrancy guard)', async () => {
    let resolveCreate: (v: unknown) => void = () => {};
    mockCreateBooking.mockReturnValue(new Promise((r) => { resolveCreate = r; }));
    render(<ReviewScreen />);

    const btn = screen.getByText('Place Booking');
    fireEvent.press(btn);
    fireEvent.press(btn); // immediate second tap while the first is in flight

    // Only one submission was started.
    await waitFor(() => expect(mockCreateBooking).toHaveBeenCalledTimes(1));
    resolveCreate({ ok: true, id: 'bk1' });
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
  });

  // ── Service Details V1.3 — fail-closed at submission (requirement 41) ────────

  it('does NOT submit when a configured service has no Service Details, and says why', async () => {
    mockDraft = { ...mockDraft, serviceDetails: null };
    render(<ReviewScreen />);

    expect(screen.getByTestId('review-details-missing')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Place Booking'));
    await waitFor(() => expect(mockCreateBooking).not.toHaveBeenCalled());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('offers a route back to Service Details when the snapshot is missing', () => {
    mockDraft = { ...mockDraft, serviceDetails: null };
    render(<ReviewScreen />);

    fireEvent.press(screen.getByTestId('review-add-service-details'));
    expect(router.push).toHaveBeenCalledWith('/booking/service-details');
  });

  it('shows no missing-details banner once the snapshot is present', () => {
    render(<ReviewScreen />);
    expect(screen.queryByTestId('review-details-missing')).toBeNull();
  });
});
