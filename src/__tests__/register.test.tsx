import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

const mockSignUp = jest.fn().mockResolvedValue(true);
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
const mockResendConfirmation = jest.fn();
const mockClearPendingConfirmation = jest.fn();
let mockPendingEmail: string | null = null;
jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({
    signUp: mockSignUp,
    authError: null,
    pendingConfirmationEmail: mockPendingEmail,
    resendConfirmation: (...a: unknown[]) => mockResendConfirmation(...a),
    clearPendingConfirmation: (...a: unknown[]) => mockClearPendingConfirmation(...a),
  }),
}));

import RegisterScreen from '@/app/(onboarding)/register';

describe('RegisterScreen', () => {
  beforeEach(() => { mockSignUp.mockClear(); mockResendConfirmation.mockReset(); mockPendingEmail = null; });

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
    fireEvent.changeText(screen.getByPlaceholderText('Create a password'), 'longenough');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm password'), 'longenough');
    fireEvent.press(screen.getByText('Create account'));
    await waitFor(() =>
      expect(mockSignUp).toHaveBeenCalledWith({ fullName: 'A', email: 'a@b', phone: '0700', password: 'longenough' }),
    );
  });
});

describe('RegisterScreen — password policy and email confirmation', () => {
  beforeEach(() => { mockSignUp.mockClear(); mockResendConfirmation.mockReset(); mockPendingEmail = null; });

  it('applies the shared password policy (minimum 8 characters) before signing up', () => {
    render(<RegisterScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Full name'), 'A');
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'a@b');
    fireEvent.changeText(screen.getByPlaceholderText('07xx xxx xxx'), '0700');
    fireEvent.changeText(screen.getByPlaceholderText('Create a password'), 'pw');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm password'), 'pw');
    fireEvent.press(screen.getByText('Create account'));
    expect(screen.getByText('Password must be at least 8 characters')).toBeOnTheScreen();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('shows a clear "Check your email" state when sign-up is awaiting confirmation, with an explicit neutral resend', async () => {
    mockPendingEmail = 'a@b';
    mockResendConfirmation.mockResolvedValue('sent');
    render(<RegisterScreen />);
    expect(screen.getByText('Check your email')).toBeOnTheScreen();
    expect(screen.queryByPlaceholderText('Create a password')).toBeNull();
    expect(mockResendConfirmation).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Resend email'));
    await waitFor(() => expect(mockResendConfirmation).toHaveBeenCalledWith('a@b'));
    expect(await screen.findByText("If an account exists for that email, we've sent a new confirmation link.")).toBeOnTheScreen();
  });

  it('lets the user return to sign in from the confirmation state', () => {
    mockPendingEmail = 'a@b';
    render(<RegisterScreen />);
    fireEvent.press(screen.getByText('Back to sign in'));
    expect(mockClearPendingConfirmation).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/signin');
  });
});
