import { fireEvent, render, screen } from '@testing-library/react-native';

import WelcomeScreen from '@/app/(onboarding)/welcome';
import { ACCOUNT_BLOCKED_MESSAGE } from '@/lib/auth-errors';

// jest.mock calls are hoisted above the imports by babel-jest.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: jest.fn(),
  },
}));
let mockAuthError: string | null = null;
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ authError: mockAuthError }) }));

describe('WelcomeScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockAuthError = null;
  });
  it('renders brand + tagline and navigates on Get Started', () => {
    render(<WelcomeScreen />);
    expect(screen.getByText('KwikServe')).toBeOnTheScreen();
    expect(screen.getByText('Premium services, on demand.')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Get Started'));
    expect(mockPush).toHaveBeenCalledWith('/role-select');
  });
  it('pressing Log in navigates to login', () => {
    render(<WelcomeScreen />);
    fireEvent.press(screen.getByText('Log in'));
    expect(mockPush).toHaveBeenCalledWith('/signin');
  });
  it('shows the neutral notice when a suspension ended the session (F5.6)', () => {
    mockAuthError = ACCOUNT_BLOCKED_MESSAGE;
    render(<WelcomeScreen />);
    expect(screen.getByTestId('welcome-account-blocked')).toHaveTextContent(ACCOUNT_BLOCKED_MESSAGE);
    expect(screen.getByRole('alert')).toBeOnTheScreen();
  });
  it('does not show other sign-in errors (they belong to the sign-in screen)', () => {
    mockAuthError = 'Incorrect email or password.';
    render(<WelcomeScreen />);
    expect(screen.queryByTestId('welcome-account-blocked')).toBeNull();
    expect(screen.queryByText('Incorrect email or password.')).toBeNull();
  });
});
