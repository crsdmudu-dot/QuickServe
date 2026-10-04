/**
 * Tests for src/app/booking/help/[id].tsx (Update 74): "Get help with this booking".
 */
import { render, screen } from '@testing-library/react-native';

import BookingHelpScreen from '@/app/booking/help/[id]';
import {
  HELP_COMPLETED,
  HELP_GENERAL,
  HELP_MONEY,
  HELP_REFUND_PARAGRAPH,
  HELP_REQUEST_NOTE,
  HELP_WORK_STARTED,
} from '@/constants/cancellation-copy';
import { SUPPORT_EMAIL } from '@/lib/support';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'abcdef12-0000-4000-8000-000000000001' }),
  router: { push: jest.fn(), replace: jest.fn() },
}));

const base = {
  id: 'abcdef12-0000-4000-8000-000000000001',
  status: 'in_progress',
  assigned_provider_id: 'p1',
  assigned_provider_name: 'Test Provider',
  quote_status: 'accepted',
};
const mockGetBookingById = jest.fn();
jest.mock('@/lib/bookings', () => ({ getBookingById: (...a: unknown[]) => mockGetBookingById(...a) }));
const mockGetPaymentForBooking = jest.fn();
jest.mock('@/lib/payments', () => ({ getPaymentForBooking: (...a: unknown[]) => mockGetPaymentForBooking(...a) }));
const mockGetPaymentAttempts = jest.fn();
jest.mock('@/lib/attempts', () => ({ getPaymentAttempts: (...a: unknown[]) => mockGetPaymentAttempts(...a) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPaymentForBooking.mockResolvedValue(null);
  mockGetPaymentAttempts.mockResolvedValue([]);
});

describe('BookingHelpScreen', () => {
  it('work started: explains, shows the reference and the support email, offers chat, no refund paragraph', async () => {
    mockGetBookingById.mockResolvedValue(base);
    render(<BookingHelpScreen />);
    expect(await screen.findByText(HELP_WORK_STARTED)).toBeOnTheScreen();
    expect(screen.getByTestId('help-reference')).toHaveTextContent('Booking reference: #ABCDEF12');
    expect(screen.getByText(SUPPORT_EMAIL)).toBeOnTheScreen();
    expect(screen.getByText('Chat with provider')).toBeOnTheScreen();
    expect(screen.queryByTestId('help-refund')).toBeNull();
    expect(screen.getByText(HELP_REQUEST_NOTE)).toBeOnTheScreen();
  });

  it('completed: the refund paragraph (R1b, manual, no promise) and no chat', async () => {
    mockGetBookingById.mockResolvedValue({ ...base, status: 'completed' });
    render(<BookingHelpScreen />);
    expect(await screen.findByText(HELP_COMPLETED)).toBeOnTheScreen();
    expect(screen.getByText(HELP_REFUND_PARAGRAPH)).toBeOnTheScreen();
    expect(screen.queryByText('Chat with provider')).toBeNull();
  });

  it('a provider we arranged ourselves has no special text: the same rules as any booking (owner item 3)', async () => {
    mockGetBookingById.mockResolvedValue({ ...base, status: 'provider_assigned', assigned_provider_id: null });
    render(<BookingHelpScreen />);
    expect(await screen.findByText(HELP_GENERAL)).toBeOnTheScreen();
    expect(screen.queryByText(/arranged .* ourselves/i)).toBeNull();
  });

  it('a provider we arranged ourselves, once an admin has recorded that work started', async () => {
    mockGetBookingById.mockResolvedValue({ ...base, status: 'in_progress', assigned_provider_id: null });
    render(<BookingHelpScreen />);
    expect(await screen.findByText(HELP_WORK_STARTED)).toBeOnTheScreen();
  });

  it('money on the booking', async () => {
    mockGetBookingById.mockResolvedValue({ ...base, status: 'on_the_way' });
    mockGetPaymentForBooking.mockResolvedValue({ id: 'pay1', status: 'pending', wallet_applied: 100 });
    render(<BookingHelpScreen />);
    expect(await screen.findByText(HELP_MONEY)).toBeOnTheScreen();
    expect(screen.getByText(HELP_REFUND_PARAGRAPH)).toBeOnTheScreen();
  });

  it('no text promises an automatic or timed refund', async () => {
    mockGetBookingById.mockResolvedValue({ ...base, status: 'completed' });
    render(<BookingHelpScreen />);
    await screen.findByText(HELP_COMPLETED);
    expect(screen.queryByText(/automatic|within \d|guarantee/i)).toBeNull();
  });
});
