import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockSignIn = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-router', () => ({ router: { push: mockPush, replace: jest.fn() } }));
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ signIn: mockSignIn }) }));

import RegisterScreen from '@/app/(onboarding)/register';

describe('RegisterScreen', () => {
  beforeEach(() => { mockPush.mockClear(); mockSignIn.mockClear(); });
  it('shows required errors (incl. phone) and does not sign in when empty', () => {
    render(<RegisterScreen />);
    fireEvent.press(screen.getByText('Create account'));
    expect(screen.getByText('Full name is required')).toBeOnTheScreen();
    expect(screen.getByText('Phone number is required')).toBeOnTheScreen();
    expect(mockSignIn).not.toHaveBeenCalled();
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
    expect(mockSignIn).not.toHaveBeenCalled();
  });
  it('signs in when valid', async () => {
    render(<RegisterScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Full name'), 'A');
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'a@b');
    fireEvent.changeText(screen.getByPlaceholderText('07xx xxx xxx'), '0700');
    fireEvent.changeText(screen.getByPlaceholderText('Create a password'), 'pw');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm password'), 'pw');
    fireEvent.press(screen.getByText('Create account'));
    await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
  });
});
