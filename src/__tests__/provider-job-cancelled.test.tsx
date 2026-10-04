/**
 * Update 74: the provider's job screen (src/app/provider/job/[id].tsx) after a customer cancels.
 *  - a cancelled job shows the banner and no status buttons;
 *  - the screen reloads the job when it regains focus (the first focus is skipped);
 *  - a status change refused by the terminal-state guard shows the plain message and reloads the job.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import ProviderJobDetailScreen from '@/app/provider/job/[id]';
import { PROVIDER_CANCELLED_BANNER, PROVIDER_STATUS_FINAL } from '@/constants/cancellation-copy';

const mockFocusCallbacks: (() => void | (() => void))[] = [];
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'j1' }),
  router: { push: jest.fn() },
  // Records the focus callback so the test can fire a second focus.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(() => {
      mockFocusCallbacks.push(cb);
      return cb() as void | (() => void);
    }, [cb]);
  },
}));
jest.mock('@/hooks/use-provider-location-sharing', () => ({
  useProviderLocationSharing: () => ({ sharing: false, permission: 'undetermined' }),
}));
jest.mock('@/services/services-provider', () => {
  const { mockServicesProviderModule } = jest.requireActual('../../test/mock-services');
  return mockServicesProviderModule();
});

const JOB = {
  id: 'j1',
  service_id: 'house-cleaning',
  address: '123 Main St',
  scheduled_for: '2026-07-01T10:00:00Z',
  notes: null,
  status: 'on_the_way',
  created_at: '2026-06-21T00:00:00Z',
  assigned_provider_name: 'Me',
  assigned_provider_phone: null,
  admin_notes: null,
  assigned_provider_id: 'prov',
  scheduling_type: 'tomorrow',
  time_window: null,
  window_start: null,
  window_end: null,
  recurrence: 'one_time',
};
const mockGetBookingById = jest.fn();
const mockUpdateBookingStatus = jest.fn();
jest.mock('@/lib/bookings', () => ({
  getBookingById: (...a: unknown[]) => mockGetBookingById(...a),
  updateBookingStatus: (...a: unknown[]) => mockUpdateBookingStatus(...a),
}));
jest.mock('@/lib/photos', () => ({ getBookingPhotos: jest.fn().mockResolvedValue([]), uploadBookingPhoto: jest.fn() }));
jest.mock('@/lib/activity', () => ({ getBookingActivity: jest.fn().mockResolvedValue([]) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockFocusCallbacks.length = 0;
});

describe('provider job screen and customer cancellation (Update 74)', () => {
  it('a cancelled job shows the banner and offers no status change', async () => {
    mockGetBookingById.mockResolvedValue({ ...JOB, status: 'cancelled' });
    render(<ProviderJobDetailScreen />);
    expect(await screen.findByText(PROVIDER_CANCELLED_BANNER)).toBeOnTheScreen();
    expect(screen.queryByText('In progress')).toBeNull();
    expect(screen.getByText('No further action')).toBeOnTheScreen();
  });

  it('regaining focus reloads the job, so a cancellation made meanwhile shows', async () => {
    mockGetBookingById.mockResolvedValueOnce(JOB).mockResolvedValueOnce({ ...JOB, status: 'cancelled' });
    render(<ProviderJobDetailScreen />);
    expect(await screen.findByText('In progress')).toBeOnTheScreen();
    expect(mockGetBookingById).toHaveBeenCalledTimes(1); // the first focus is skipped
    await act(async () => {
      mockFocusCallbacks[mockFocusCallbacks.length - 1]();
    });
    expect(await screen.findByText(PROVIDER_CANCELLED_BANNER)).toBeOnTheScreen();
    expect(mockGetBookingById).toHaveBeenCalledTimes(2);
  });

  it('a change refused because the booking was cancelled shows the plain message and reloads the job', async () => {
    mockGetBookingById.mockResolvedValueOnce(JOB).mockResolvedValueOnce({ ...JOB, status: 'cancelled' });
    mockUpdateBookingStatus.mockResolvedValue({ ok: false, error: PROVIDER_STATUS_FINAL, code: 'booking_final' });
    render(<ProviderJobDetailScreen />);
    const next = await screen.findByText('In progress');
    await act(async () => {
      fireEvent.press(next);
    });
    expect(await screen.findByText(PROVIDER_STATUS_FINAL)).toBeOnTheScreen();
    expect(await screen.findByText(PROVIDER_CANCELLED_BANNER)).toBeOnTheScreen();
  });
});
