/**
 * Tests for src/app/booking/cancel/index.tsx (Update 74, OD-74-8 DEFAULT): choosing a booking to cancel
 * from the Terms screen. Only bookings the app expects can be cancelled are listed.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import ChooseBookingToCancelScreen from '@/app/booking/cancel/index';
import { LIST_EMPTY, LIST_OPEN } from '@/constants/cancellation-copy';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: (...a: unknown[]) => mockBack(...a), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('@/services/services-provider', () => {
  const { mockServicesProviderModule } = jest.requireActual('../../test/mock-services');
  return mockServicesProviderModule();
});
const mockGetCustomerBookings = jest.fn();
jest.mock('@/lib/bookings', () => ({ getCustomerBookings: (...a: unknown[]) => mockGetCustomerBookings(...a) }));

const row = (id: string, status: string, provider: string | null = null, name: string | null = null) => ({
  id,
  status,
  service_id: 'plumbing',
  scheduled_for: '2026-10-05T09:00:00Z',
  assigned_provider_id: provider,
  assigned_provider_name: name,
  quote_status: 'pending',
});

beforeEach(() => jest.clearAllMocks());

describe('ChooseBookingToCancelScreen', () => {
  it('lists only cancellable bookings (a manually dispatched one too) and opens the confirmation for the chosen one', async () => {
    mockGetCustomerBookings.mockResolvedValue([
      row('b-ok', 'pending'),
      row('b-started', 'in_progress', 'p1', 'P'),
      row('b-done', 'completed', 'p1', 'P'),
      row('b-gone', 'cancelled'),
      row('b-manual', 'provider_assigned', null, 'Manual'),
    ]);
    render(<ChooseBookingToCancelScreen />);
    fireEvent.press(await screen.findByTestId('cancel-list-open-b-ok'));
    expect(mockPush).toHaveBeenCalledWith('/booking/cancel/b-ok');
    // pending and the manually dispatched booking (owner item 3); not work started, completed or cancelled.
    expect(screen.getAllByText(LIST_OPEN)).toHaveLength(2);
    expect(screen.getByTestId('cancel-list-open-b-manual')).toBeOnTheScreen();
  });

  it('says so when nothing can be cancelled, and Back works', async () => {
    mockGetCustomerBookings.mockResolvedValue([row('b-done', 'completed', 'p1', 'P')]);
    render(<ChooseBookingToCancelScreen />);
    expect(await screen.findByText(LIST_EMPTY)).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('cancel-list-back'));
    expect(mockBack).toHaveBeenCalled();
  });
});
