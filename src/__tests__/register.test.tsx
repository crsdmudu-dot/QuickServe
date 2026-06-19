import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockSignUp = jest.fn().mockResolvedValue(true);
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ signUp: mockSignUp, authError: null }) }));

import RegisterScreen from '@/app/(onboarding)/register';

describe('RegisterScreen', () => {
  beforeEach(() => { mockSignUp.mockClear(); });

  it('shows required errors (incl. phone) and does not sign up when empty', () => {
    render(<RegisterScreen />);
    fireEvent.press(screen.getByText('Create account'));
    expect(screen.getByText('Full name is required')).toBeOnTheScreen();
    expect(screen.getByText('Phone number is required')).toBeOnTheScreen();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('flags password mismatch', () => {
    render(<RegisterScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Full name'), 'A');
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'a@b');
    fireEvent.changeText(screen.getByPlaceholderText('07xx xxx xxx'), '0700');
    fireEvent.changeText(screen.getByPlaceholderText('Create a password'), 'pw');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm password'), 'nope');
    fireEvent.press(screen.getByText('Create account'));
    expect(screen.getByText('Passwords do not match')).toBeOnTheScreen();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('calls signUp with correct values when valid', async () => {
    render(<RegisterScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Full name'), 'A');
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'a@b');
    fireEvent.changeText(screen.getByPlaceholderText('07xx xxx xxx'), '0700');
    fireEvent.changeText(screen.getByPlaceholderText('Create a password'), 'pw');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm password'), 'pw');
    fireEvent.press(screen.getByText('Create account'));
    await waitFor(() =>
      expect(mockSignUp).toHaveBeenCalledWith({ fullName: 'A', email: 'a@b', phone: '0700', password: 'pw' }),
    );
  });
});
