import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockSignIn = jest.fn().mockResolvedValue(true);
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ signIn: mockSignIn, authError: null }) }));

import LoginScreen from '@/app/(onboarding)/login';

describe('LoginScreen', () => {
  beforeEach(() => {
    mockSignIn.mockClear();
  });

  it('shows validation errors and does not sign in when empty', () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByText('Continue'));
    expect(screen.getByText('Email is required')).toBeOnTheScreen();
    expect(screen.getByText('Password is required')).toBeOnTheScreen();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('signs in with email and password when valid', async () => {
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'a@b');
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'pw');
    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('a@b', 'pw'));
  });

  it('links to register', () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByText('Register'));
    const { router } = require('expo-router');
    expect(router.push).toHaveBeenCalledWith('/register');
  });
});
