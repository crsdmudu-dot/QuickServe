/**
 * Update 74 (OD-74-8 DEFAULT): the Terms screen offers a customer "Cancel a booking", as it offers account
 * deletion, so declining new Terms never traps an existing booking. Providers do not see it.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import AcceptTermsScreen from '@/app/accept-terms';
import { TERMS_SCREEN_CANCEL_LINK } from '@/constants/cancellation-copy';

const mockPush = jest.fn();
let mockRole: string | null = 'customer';
jest.mock('@/auth/terms-gate', () => ({ useTermsGate: () => ({ status: 'required', accept: jest.fn() }) }));
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ signOut: jest.fn(), role: mockRole }) }));
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

beforeEach(() => jest.clearAllMocks());

describe('AcceptTermsScreen — Cancel a booking (Update 74)', () => {
  it('a customer can open the list of bookings to cancel', () => {
    mockRole = 'customer';
    render(<AcceptTermsScreen />);
    const link = screen.getByTestId('accept-terms-cancel-booking');
    expect(link).toHaveTextContent(TERMS_SCREEN_CANCEL_LINK);
    expect(link.props.accessibilityRole).toBe('link');
    fireEvent.press(link);
    expect(mockPush).toHaveBeenCalledWith('/booking/cancel');
  });

  it('a provider does not see it; deletion stays for everyone', () => {
    mockRole = 'provider';
    render(<AcceptTermsScreen />);
    expect(screen.queryByTestId('accept-terms-cancel-booking')).toBeNull();
    expect(screen.getByTestId('accept-terms-delete-account')).toBeOnTheScreen();
  });
});
