import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSignIn = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a) } }));
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ signIn: mockSignIn, role: 'customer' }) }));

import LoginScreen from '@/app/(onboarding)/login';

describe('LoginScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockSignIn.mockClear();
  });

  it('shows validation errors and does not sign in when empty', () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByText('Continue'));
    expect(screen.getByText('Email is required')).toBeOnTheScreen();
    expect(screen.getByText('Password is required')).toBeOnTheScreen();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('signs in when valid', async () => {
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'a@b');
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'pw');
    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
  });

  it('links to register', () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByText('Register'));
    expect(mockPush).toHaveBeenCalledWith('/register');
  });
});
