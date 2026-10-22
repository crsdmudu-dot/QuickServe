/**
 * Tests for src/components/customer/booking-cancel-actions.tsx (Update 74): the booking screen offers
 * Cancel booking, Get help with this booking, or Book again, from the booking it has loaded.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { BookingCancelActions } from '@/components/customer/booking-cancel-actions';
import { CANCEL_BUTTON, HELP_BUTTON, REBOOK_BUTTON } from '@/constants/cancellation-copy';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

const booking = (status: string, provider: string | null = null, name: string | null = null) => ({
  id: 'b1',
  status: status as never,
  assigned_provider_id: provider,
  assigned_provider_name: name,
  quote_status: 'pending',
});

beforeEach(() => mockPush.mockClear());

describe('BookingCancelActions', () => {
  it.each(['pending', 'accepted', 'provider_assigned', 'on_the_way'])('%s (in-app or no provider): Cancel booking', (status) => {
    render(<BookingCancelActions booking={status === 'pending' ? booking(status) : booking(status, 'p1', 'P')} payment={null} attempts={[]} />);
    fireEvent.press(screen.getByText(CANCEL_BUTTON));
    expect(mockPush).toHaveBeenCalledWith('/booking/cancel/b1');
    expect(screen.queryByText(HELP_BUTTON)).toBeNull();
  });

  it.each(['in_progress', 'completed'])('%s: Get help with this booking', (status) => {
    render(<BookingCancelActions booking={booking(status, 'p1', 'P')} payment={null} attempts={[]} />);
    fireEvent.press(screen.getByText(HELP_BUTTON));
    expect(mockPush).toHaveBeenCalledWith('/booking/help/b1');
    expect(screen.queryByText(CANCEL_BUTTON)).toBeNull();
  });

  it('a provider dispatched outside the app: Cancel booking, the same as any booking (owner item 3)', () => {
    render(<BookingCancelActions booking={booking('provider_assigned', null, 'Manual Provider')} payment={null} attempts={[]} />);
    expect(screen.getByTestId('booking-cancel')).toBeOnTheScreen();
    expect(screen.queryByTestId('booking-help')).toBeNull();
  });

  it('a provider dispatched outside the app, once an admin has recorded that work started: Get help', () => {
    render(<BookingCancelActions booking={booking('in_progress', null, 'Manual Provider')} payment={null} attempts={[]} />);
    expect(screen.getByTestId('booking-help')).toBeOnTheScreen();
    expect(screen.queryByTestId('booking-cancel')).toBeNull();
  });

  it('an open M-PESA request: Get help', () => {
    render(
      <BookingCancelActions
        booking={booking('on_the_way', 'p1', 'P')}
        payment={{ status: 'pending', wallet_applied: 0 }}
        attempts={[{ status: 'pending' }]}
      />,
    );
    expect(screen.getByTestId('booking-help')).toBeOnTheScreen();
  });

  it('a cancelled booking: Book again, and no cancel or help', () => {
    render(<BookingCancelActions booking={booking('cancelled', 'p1', 'P')} payment={null} attempts={[]} />);
    expect(screen.getByText(REBOOK_BUTTON)).toBeOnTheScreen();
    expect(screen.queryByText(CANCEL_BUTTON)).toBeNull();
    expect(screen.queryByText(HELP_BUTTON)).toBeNull();
  });

  it('the action is an accessible button named by its visible label', () => {
    render(<BookingCancelActions booking={booking('pending')} payment={null} attempts={[]} />);
    const button = screen.getByTestId('booking-cancel');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe(CANCEL_BUTTON);
  });
});
