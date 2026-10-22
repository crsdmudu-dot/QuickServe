/**
 * Update 74 (owner decision 2026-10-03, item 6): the customer's My Bookings list and the provider's jobs list
 * reload when the tab regains focus, so a cancellation made elsewhere shows its new status. The first focus
 * is the mount (which already loads), so it does not load twice.
 */
import { act, render, screen, waitFor } from '@testing-library/react-native';
import CustomerBookingsScreen from '@/app/(customer)/bookings';
import ProviderHomeScreen from '@/app/provider/(tabs)/index';

const mockFocusCallbacks: (() => void)[] = [];
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    mockFocusCallbacks.push(cb);
  },
}));

jest.mock('@/services/services-provider', () => {
  const { mockServicesProviderModule } = jest.requireActual('../../test/mock-services');
  return mockServicesProviderModule();
});

const booking = (status: string) => ({
  id: 'b1',
  service_id: 'house-cleaning',
  address: '123 Main St',
  scheduled_for: '2026-07-01T10:00:00Z',
  notes: null,
  status,
  assigned_provider_id: 'p1',
  assigned_provider_name: 'Test Provider',
  assigned_provider_phone: null,
  admin_notes: null,
  created_at: '2026-06-21T00:00:00Z',
});
const mockGetCustomerBookings = jest.fn();
const mockGetProviderJobs = jest.fn();
jest.mock('@/lib/bookings', () => ({
  getCustomerBookings: (...args: unknown[]) => mockGetCustomerBookings(...args),
  getProviderJobs: (...args: unknown[]) => mockGetProviderJobs(...args),
}));
jest.mock('@/lib/notifications', () => ({ getUnreadNotificationCount: jest.fn().mockResolvedValue(0) }));
jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({ approvalStatus: 'approved', signOut: jest.fn() }),
}));

/** Calls the newest focus callback, as expo-router does when the screen regains focus. */
async function refocus() {
  await act(async () => {
    mockFocusCallbacks[mockFocusCallbacks.length - 1]();
  });
}

beforeEach(() => {
  mockFocusCallbacks.length = 0;
  jest.clearAllMocks();
});

describe('booking lists reload on focus', () => {
  it('My Bookings: the first focus does not reload; a later focus shows the cancelled status', async () => {
    mockGetCustomerBookings.mockResolvedValueOnce([booking('on_the_way')]).mockResolvedValueOnce([booking('cancelled')]);
    render(<CustomerBookingsScreen />);
    await waitFor(() => expect(mockGetCustomerBookings).toHaveBeenCalledTimes(1));
    await refocus();
    expect(mockGetCustomerBookings).toHaveBeenCalledTimes(1);
    await refocus();
    await waitFor(() => expect(mockGetCustomerBookings).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Cancelled')).toBeOnTheScreen();
  });

  it('the provider jobs list: a later focus reloads the jobs', async () => {
    mockGetProviderJobs.mockResolvedValue([booking('provider_assigned')]);
    render(<ProviderHomeScreen />);
    await waitFor(() => expect(mockGetProviderJobs).toHaveBeenCalledTimes(1));
    await refocus();
    expect(mockGetProviderJobs).toHaveBeenCalledTimes(1);
    await refocus();
    await waitFor(() => expect(mockGetProviderJobs).toHaveBeenCalledTimes(2));
  });
});
