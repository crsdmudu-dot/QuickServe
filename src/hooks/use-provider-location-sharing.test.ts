import { renderHook, waitFor, act } from '@testing-library/react-native';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Capture the position callback so tests can invoke it directly
let _capturedPositionCb: ((pos: { coords: { latitude: number; longitude: number; heading: number | null; speed: number | null } }) => void) | null = null;
const mockRemove = jest.fn();

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  watchPositionAsync: jest.fn().mockImplementation(
    (_opts: unknown, cb: (pos: { coords: { latitude: number; longitude: number; heading: number | null; speed: number | null } }) => void) => {
      _capturedPositionCb = cb;
      return Promise.resolve({ remove: mockRemove });
    },
  ),
}));

jest.mock('@/lib/tracking', () => ({
  upsertProviderLocation: jest.fn().mockResolvedValue({ ok: true }),
  clearProviderLocation: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'prov1' } } }),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────

import * as Location from 'expo-location';
import { upsertProviderLocation, clearProviderLocation } from '@/lib/tracking';
import { useProviderLocationSharing } from '@/hooks/use-provider-location-sharing';
import type { BookingStatus } from '@/constants/booking-status';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeBooking(
  status: BookingStatus,
  assignedProviderId: string | null = 'prov1',
  id = 'booking-1',
) {
  return { id, status, assigned_provider_id: assignedProviderId };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useProviderLocationSharing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _capturedPositionCb = null;
    // Reset to default granted behaviour
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.watchPositionAsync as jest.Mock).mockImplementation(
      (_opts: unknown, cb: (pos: { coords: { latitude: number; longitude: number; heading: number | null; speed: number | null } }) => void) => {
        _capturedPositionCb = cb;
        return Promise.resolve({ remove: mockRemove });
      },
    );
  });

  it('starts watching and sets sharing=true when focused + on_the_way + assigned to current user', async () => {
    const booking = makeBooking('on_the_way');
    const { result } = renderHook(() => useProviderLocationSharing(booking, true));

    await waitFor(() => expect(result.current.sharing).toBe(true));

    expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
    expect(result.current.permission).toBe('granted');
  });

  it('calls upsertProviderLocation when position callback is invoked', async () => {
    const booking = makeBooking('on_the_way');
    renderHook(() => useProviderLocationSharing(booking, true));

    await waitFor(() => expect(_capturedPositionCb).not.toBeNull());

    // Simulate a GPS position update
    act(() => {
      _capturedPositionCb!({
        coords: { latitude: 1.23, longitude: 4.56, heading: 90, speed: 10 },
      });
    });

    await waitFor(() => expect(upsertProviderLocation).toHaveBeenCalledWith('booking-1', {
      latitude: 1.23,
      longitude: 4.56,
      heading: 90,
      speed: 10,
    }));
  });

  it('does NOT watch and sharing stays false when NOT the assigned provider', async () => {
    const booking = makeBooking('on_the_way', 'other');
    const { result } = renderHook(() => useProviderLocationSharing(booking, true));

    // Give the async effect time to settle
    await waitFor(() => {
      expect(result.current.sharing).toBe(false);
    });

    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
    expect(upsertProviderLocation).not.toHaveBeenCalled();
  });

  it('does NOT watch when status is pending (not an active status)', async () => {
    const booking = makeBooking('pending');
    const { result } = renderHook(() => useProviderLocationSharing(booking, true));

    await waitFor(() => expect(result.current.sharing).toBe(false));
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  });

  it('does NOT watch when status is completed', async () => {
    const booking = makeBooking('completed');
    const { result } = renderHook(() => useProviderLocationSharing(booking, true));

    await waitFor(() => expect(result.current.sharing).toBe(false));
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  });

  it('does NOT watch when isFocused is false', async () => {
    const booking = makeBooking('on_the_way');
    const { result } = renderHook(() => useProviderLocationSharing(booking, false));

    await waitFor(() => expect(result.current.sharing).toBe(false));
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  });

  it('sets permission=denied and sharing=false when permission is denied', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

    const booking = makeBooking('on_the_way');
    const { result } = renderHook(() => useProviderLocationSharing(booking, true));

    await waitFor(() => expect(result.current.permission).toBe('denied'));

    expect(result.current.sharing).toBe(false);
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
    expect(upsertProviderLocation).not.toHaveBeenCalled();
  });

  it('calls clearProviderLocation when status transitions to completed', async () => {
    // Start with on_the_way
    const bookingV1 = makeBooking('on_the_way');
    const { rerender } = renderHook(
      ({ booking }: { booking: { id: string; status: BookingStatus; assigned_provider_id: string | null } }) =>
        useProviderLocationSharing(booking, true),
      { initialProps: { booking: bookingV1 } },
    );

    // Wait for the watcher to be active
    await waitFor(() => expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1));

    // Transition to completed
    const bookingV2 = makeBooking('completed');
    rerender({ booking: bookingV2 });

    await waitFor(() => expect(clearProviderLocation).toHaveBeenCalledWith('booking-1'));
  });

  it('does not crash when booking is null', async () => {
    const { result } = renderHook(() => useProviderLocationSharing(null, true));
    await waitFor(() => expect(result.current.sharing).toBe(false));
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  });

  it('starts watching with in_progress status', async () => {
    const booking = makeBooking('in_progress');
    const { result } = renderHook(() => useProviderLocationSharing(booking, true));

    await waitFor(() => expect(result.current.sharing).toBe(true));
    expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
  });
});
