/**
 * forgot-password.test.tsx — shared customer/provider forgot-password screen.
 * Neutral responses (no account enumeration), explicit submission only, no mutation on render.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import ForgotPasswordScreen from '@/app/(onboarding)/forgot-password';

const mockRequestPasswordReset = jest.fn();
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({ requestPasswordReset: (...a: unknown[]) => mockRequestPasswordReset(...a) }),
}));


const NEUTRAL = "If an account exists for that email, we've sent a password reset link.";

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    mockRequestPasswordReset.mockReset();
  });

  it('renders the request form and performs no auth request on render', () => {
    render(<ForgotPasswordScreen />);
    expect(screen.getByText('Forgot your password?')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('you@example.com')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeOnTheScreen();
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });

  it('validates the email before sending', () => {
    render(<ForgotPasswordScreen />);
    fireEvent.press(screen.getByText('Send reset link'));
    expect(screen.getByText('Email is required')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'not-an-email');
    fireEvent.press(screen.getByText('Send reset link'));
    expect(screen.getByText('Enter a valid email')).toBeOnTheScreen();
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });

  it('shows the same neutral confirmation for any account after explicit submission', async () => {
    mockRequestPasswordReset.mockResolvedValue('sent');
    render(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'someone@example.com');
    fireEvent.press(screen.getByText('Send reset link'));
    await waitFor(() => expect(mockRequestPasswordReset).toHaveBeenCalledWith('someone@example.com'));
    expect(await screen.findByText(NEUTRAL)).toBeOnTheScreen();
    // the form is replaced by the confirmation; there is no "account not found" wording anywhere
    expect(screen.queryByText(/not found|no account|does not exist/i)).toBeNull();
  });

  it('shows a generic retry message for transport failures without revealing account existence', async () => {
    mockRequestPasswordReset.mockResolvedValue('retry');
    render(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'someone@example.com');
    fireEvent.press(screen.getByText('Send reset link'));
    expect(await screen.findByText("We couldn't send the email right now. Please try again.")).toBeOnTheScreen();
    expect(screen.queryByText(/not found|no account|does not exist/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeOnTheScreen(); // still retryable
  });

  it('disables the button while the request is in flight', async () => {
    let resolve: (v: 'sent') => void = () => {};
    mockRequestPasswordReset.mockReturnValue(new Promise<'sent'>((r) => { resolve = r; }));
    render(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'someone@example.com');
    fireEvent.press(screen.getByText('Send reset link'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send reset link' })).toBeDisabled());
    resolve('sent');
    expect(await screen.findByText(NEUTRAL)).toBeOnTheScreen();
  });

  it('links back to sign in', () => {
    render(<ForgotPasswordScreen />);
    fireEvent.press(screen.getByText('Back to sign in'));
    expect(router.replace).toHaveBeenCalledWith('/signin');
  });
});

describe('ForgotPasswordScreen — platform gating', () => {
  it('on web it shows a mobile-app notice and never sends a reset request', () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    try {
      render(<ForgotPasswordScreen />);
      expect(screen.getByText('Password reset is available in the KwikServe mobile app.')).toBeOnTheScreen();
      expect(screen.queryByPlaceholderText('you@example.com')).toBeNull();
      expect(mockRequestPasswordReset).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });
});

describe('ForgotPasswordScreen — outcome states (copy is centralised and non-sensitive)', () => {
  async function submitWith(outcome: string) {
    mockRequestPasswordReset.mockResolvedValue(outcome);
    render(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'someone@example.com');
    fireEvent.press(screen.getByText('Send reset link'));
    await waitFor(() => expect(mockRequestPasswordReset).toHaveBeenCalled());
  }

  it('rate-limited: neutral confirmation plus the generic delay hint', async () => {
    await submitWith('sent-rate-limited');
    expect(await screen.findByText(NEUTRAL)).toBeOnTheScreen();
    expect(screen.getByText("If it doesn't arrive, wait a minute before trying again.")).toBeOnTheScreen();
  });

  it('delivery failure (redirect/configuration/unexpected): does not claim an email was sent', async () => {
    await submitWith('delivery-failed');
    expect(await screen.findByText("We couldn't send the email. Please try again later or contact support.")).toBeOnTheScreen();
    expect(screen.queryByText(NEUTRAL)).toBeNull();
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeOnTheScreen();
  });

  it('invalid request: safe validation message, no success claim, no enumeration', async () => {
    await submitWith('invalid-request');
    expect(await screen.findByText('Please check the email address and try again.')).toBeOnTheScreen();
    expect(screen.queryByText(NEUTRAL)).toBeNull();
    expect(screen.queryByText(/not found|no account|does not exist/i)).toBeNull();
  });

  it('never renders raw Auth details: only allow-listed copy reaches the screen', async () => {
    // the screen receives outcomes, never error objects — an unexpected outcome falls back safely
    await submitWith('something-unexpected');
    expect(await screen.findByText("We couldn't send the email. Please try again later or contact support.")).toBeOnTheScreen();
    expect(screen.queryByText(/redirect|status|supabase|AuthApiError|code/i)).toBeNull();
  });
});
