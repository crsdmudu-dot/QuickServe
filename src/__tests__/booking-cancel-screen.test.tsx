/**
 * Tests for src/app/booking/cancel/[id].tsx (Update 74): steps 2 to 5 of the customer's cancellation.
 * The server call (src/lib/cancellation.ts) and the loaders are mocked; no network.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import CancelBookingScreen from '@/app/booking/cancel/[id]';
import {
  CANCEL_REASON_LABELS,
  CQ_NO_FEE,
  CQ_NO_PROVIDER,
  CQ_NOTHING_TO_PAY,
  ERR_NETWORK,
  ERR_PAYMENT_IN_PROGRESS,
  ERR_WORK_STARTED,
  RESULT_ALREADY_KWIKSERVE,
  RESULT_PROVIDER_MANUAL,
  RESULT_PROVIDER_TOLD,
  RESULT_TITLE,
  TRY_AGAIN,
} from '@/constants/cancellation-copy';

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'b1' }),
  router: {
    push: jest.fn(),
    replace: (...a: unknown[]) => mockReplace(...a),
    back: (...a: unknown[]) => mockBack(...a),
    canGoBack: () => true,
  },
}));
jest.mock('@/services/services-provider', () => {
  const { mockServicesProviderModule } = jest.requireActual('../../test/mock-services');
  return mockServicesProviderModule();
});

const BOOKING = {
  id: 'b1',
  customer_id: 'c1',
  service_id: 'plumbing',
  address: '1 Test Road',
  scheduled_for: '2026-10-05T09:00:00Z',
  notes: null,
  status: 'pending',
  quote_status: 'pending',
  quoted_amount: null,
  assigned_provider_id: null,
  assigned_provider_name: null,
  scheduling_type: 'asap',
  time_window: null,
  window_start: null,
  window_end: null,
  recurrence: 'one_time',
};
const mockGetBookingById = jest.fn();
jest.mock('@/lib/bookings', () => ({ getBookingById: (...a: unknown[]) => mockGetBookingById(...a) }));
const mockGetPaymentForBooking = jest.fn();
jest.mock('@/lib/payments', () => ({ getPaymentForBooking: (...a: unknown[]) => mockGetPaymentForBooking(...a) }));
const mockGetPaymentAttempts = jest.fn();
jest.mock('@/lib/attempts', () => ({ getPaymentAttempts: (...a: unknown[]) => mockGetPaymentAttempts(...a) }));
const mockCancelBooking = jest.fn();
jest.mock('@/lib/cancellation', () => ({ cancelBooking: (...a: unknown[]) => mockCancelBooking(...a) }));
let mockKeyCounter = 0;
jest.mock('@/lib/idempotency', () => ({ newIdempotencyKey: () => `key-${++mockKeyCounter}` }));

beforeEach(() => {
  jest.clearAllMocks();
  mockKeyCounter = 0;
  mockGetBookingById.mockResolvedValue(BOOKING);
  mockGetPaymentForBooking.mockResolvedValue(null);
  mockGetPaymentAttempts.mockResolvedValue([]);
});

describe('CancelBookingScreen — step 2 (the booking and what cancelling means)', () => {
  it('shows the booking and the consequence lines for a booking with no provider', async () => {
    render(<CancelBookingScreen />);
    expect(await screen.findByText('Cancel this booking?')).toBeOnTheScreen();
    expect(screen.getAllByText('1 Test Road').length).toBeGreaterThan(0);
    for (const line of [CQ_NO_PROVIDER, CQ_NOTHING_TO_PAY, CQ_NO_FEE]) expect(screen.getByText(line)).toBeOnTheScreen();
    expect(screen.queryByText(/refund/i)).toBeNull();
  });

  it('names a travelling provider and says they will be told', async () => {
    mockGetBookingById.mockResolvedValue({ ...BOOKING, status: 'on_the_way', assigned_provider_id: 'p1', assigned_provider_name: 'Test Provider' });
    render(<CancelBookingScreen />);
    expect(await screen.findByText('Provider: Test Provider')).toBeOnTheScreen();
    expect(screen.getByText(/Test Provider is already on the way/)).toBeOnTheScreen();
  });

  it('a booking where work has started goes straight to Get help (no Cancel button)', async () => {
    mockGetBookingById.mockResolvedValue({ ...BOOKING, status: 'in_progress', assigned_provider_id: 'p1' });
    render(<CancelBookingScreen />);
    expect(await screen.findByText(ERR_WORK_STARTED)).toBeOnTheScreen();
    expect(screen.queryByTestId('cancel-confirm')).toBeNull();
    fireEvent.press(screen.getByTestId('cancel-get-help'));
    expect(mockReplace).toHaveBeenCalledWith('/booking/help/b1');
  });

  it('an open M-PESA request goes to Get help and says not to pay again', async () => {
    mockGetPaymentForBooking.mockResolvedValue({ id: 'pay1', status: 'pending', wallet_applied: 0, promo_discount: 0 });
    mockGetPaymentAttempts.mockResolvedValue([{ status: 'pending' }]);
    render(<CancelBookingScreen />);
    expect(await screen.findByText(ERR_PAYMENT_IN_PROGRESS)).toBeOnTheScreen();
  });
});

describe('CancelBookingScreen — step 3 (optional reason)', () => {
  it('reasons are radio buttons with a checked state; tapping the chosen one clears it', async () => {
    render(<CancelBookingScreen />);
    const r = await screen.findByTestId('cancel-reason-plans_changed');
    expect(r.props.accessibilityRole).toBe('radio');
    expect(screen.getByText(CANCEL_REASON_LABELS.plans_changed)).toBeOnTheScreen();
    expect(r.props.accessibilityState).toMatchObject({ checked: false });
    fireEvent.press(r);
    expect(screen.getByTestId('cancel-reason-plans_changed').props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(screen.getByTestId('cancel-reason-plans_changed'));
    expect(screen.getByTestId('cancel-reason-plans_changed').props.accessibilityState).toMatchObject({ checked: false });
  });
});

describe('CancelBookingScreen — steps 4 and 5 (one confirmation, a clear result)', () => {
  it('confirming sends the chosen reason with one request key and shows the result', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    mockCancelBooking.mockResolvedValue({ kind: 'cancelled', providerNotified: true, manualProvider: false, paymentClosed: false });
    render(<CancelBookingScreen />);
    fireEvent.press(await screen.findByTestId('cancel-reason-booked_by_mistake'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('cancel-confirm'));
    });
    expect(mockCancelBooking).toHaveBeenCalledTimes(1);
    expect(mockCancelBooking).toHaveBeenCalledWith('b1', 'booked_by_mistake', 'key-1');
    expect(await screen.findByText(RESULT_TITLE)).toBeOnTheScreen();
    expect(screen.getByText(RESULT_PROVIDER_TOLD)).toBeOnTheScreen();
    expect(screen.queryByText(RESULT_PROVIDER_MANUAL)).toBeNull();
    expect(announce).toHaveBeenCalledWith(RESULT_TITLE);
    fireEvent.press(screen.getByTestId('cancel-back-to-booking'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('a provider we arranged by phone: the result says we will let them know', async () => {
    mockCancelBooking.mockResolvedValue({ kind: 'cancelled', providerNotified: false, manualProvider: true, paymentClosed: false });
    render(<CancelBookingScreen />);
    const confirmButton = await screen.findByTestId('cancel-confirm');
    await act(async () => {
      fireEvent.press(confirmButton);
    });
    expect(await screen.findByText(RESULT_PROVIDER_MANUAL)).toBeOnTheScreen();
    expect(screen.queryByText(RESULT_PROVIDER_TOLD)).toBeNull();
  });

  it('without a reason the reason is sent as null', async () => {
    mockCancelBooking.mockResolvedValue({ kind: 'cancelled', providerNotified: false, manualProvider: false, paymentClosed: false });
    render(<CancelBookingScreen />);
    const confirmButton = await screen.findByTestId('cancel-confirm');
    await act(async () => {
      fireEvent.press(confirmButton);
    });
    expect(mockCancelBooking).toHaveBeenCalledWith('b1', null, 'key-1');
  });

  it('a lost answer offers Try again, which reuses the SAME request key', async () => {
    mockCancelBooking.mockResolvedValueOnce({ kind: 'network' });
    mockCancelBooking.mockResolvedValueOnce({ kind: 'already_cancelled', by: 'you', sameRequest: true });
    render(<CancelBookingScreen />);
    const confirmButton = await screen.findByTestId('cancel-confirm');
    await act(async () => {
      fireEvent.press(confirmButton);
    });
    expect(await screen.findByText(ERR_NETWORK)).toBeOnTheScreen();
    expect(screen.getByText(TRY_AGAIN)).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByTestId('cancel-confirm'));
    });
    expect(mockCancelBooking.mock.calls.map((c) => c[2])).toEqual(['key-1', 'key-1']);
    expect(await screen.findByTestId('cancel-result')).toBeOnTheScreen();
  });

  it('the provider started work at the same moment: the server refusal is shown with Get help', async () => {
    mockCancelBooking.mockResolvedValue({ kind: 'refused', code: 'work_started' });
    render(<CancelBookingScreen />);
    const confirmButton = await screen.findByTestId('cancel-confirm');
    await act(async () => {
      fireEvent.press(confirmButton);
    });
    expect(await screen.findByText(ERR_WORK_STARTED)).toBeOnTheScreen();
    expect(screen.getByTestId('cancel-get-help')).toBeOnTheScreen();
  });

  it('cancelled by KwikServe already: says so', async () => {
    mockCancelBooking.mockResolvedValue({ kind: 'already_cancelled', by: 'kwikserve', sameRequest: false });
    render(<CancelBookingScreen />);
    const confirmButton = await screen.findByTestId('cancel-confirm');
    await act(async () => {
      fireEvent.press(confirmButton);
    });
    expect(await screen.findByText(RESULT_ALREADY_KWIKSERVE)).toBeOnTheScreen();
  });

  it('Keep booking goes back without calling the server', async () => {
    render(<CancelBookingScreen />);
    fireEvent.press(await screen.findByTestId('cancel-keep'));
    expect(mockBack).toHaveBeenCalled();
    expect(mockCancelBooking).not.toHaveBeenCalled();
  });

  it('a booking that cannot be loaded says so', async () => {
    mockGetBookingById.mockResolvedValue(null);
    render(<CancelBookingScreen />);
    expect(await screen.findByText("We couldn't find this booking.")).toBeOnTheScreen();
  });
});
