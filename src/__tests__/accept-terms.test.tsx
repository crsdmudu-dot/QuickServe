/**
 * accept-terms.test.tsx — the one-time Terms prompt (F5.4, src/app/accept-terms.tsx).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import AcceptTermsScreen from '@/app/accept-terms';
import { TERMS_KEY_POINTS } from '@/constants/terms';
import { SUPPORT_EMAIL } from '@/lib/support';

// jest.mock calls are hoisted above the imports by babel-jest.
const mockAccept = jest.fn();
const mockSignOut = jest.fn();
const mockPush = jest.fn();
jest.mock('@/auth/terms-gate', () => ({ useTermsGate: () => ({ status: 'required', accept: mockAccept }) }));
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

const savedUrl = process.env.EXPO_PUBLIC_WEBSITE_URL;
beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_WEBSITE_URL;
});
afterAll(() => {
  if (savedUrl === undefined) delete process.env.EXPO_PUBLIC_WEBSITE_URL;
  else process.env.EXPO_PUBLIC_WEBSITE_URL = savedUrl;
});

describe('AcceptTermsScreen', () => {
  it('shows every key point and no link while the website address is not configured', () => {
    render(<AcceptTermsScreen />);
    expect(screen.getByText('Before you continue')).toBeOnTheScreen();
    for (const point of TERMS_KEY_POINTS) expect(screen.getByText(point)).toBeOnTheScreen();
    expect(screen.queryByText('Read the full Terms')).toBeNull();
    expect(screen.queryByText('Read the Privacy Policy')).toBeNull();
  });

  it('links to the full Terms once the website address is configured', () => {
    process.env.EXPO_PUBLIC_WEBSITE_URL = 'https://kwikserve.example';
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<AcceptTermsScreen />);
    expect(screen.getByRole('link', { name: 'Read the full Terms' })).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Read the full Terms'));
    expect(open).toHaveBeenCalledWith('https://kwikserve.example/terms');
    open.mockRestore();
  });

  // D-12: the Privacy Policy link sits beside the Terms link.
  it('links to the Privacy Policy beside the Terms once the website address is configured', () => {
    process.env.EXPO_PUBLIC_WEBSITE_URL = 'https://kwikserve.example';
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<AcceptTermsScreen />);
    expect(screen.getByRole('link', { name: 'Read the Privacy Policy' })).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('accept-terms-privacy-link'));
    expect(open).toHaveBeenCalledWith('https://kwikserve.example/privacy/');
    // Reading the policy is not agreeing to the Terms.
    expect(mockAccept).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('never traps someone who declines: account deletion and support stay reachable', () => {
    render(<AcceptTermsScreen />);
    const del = screen.getByTestId('accept-terms-delete-account');
    expect(del.props.accessibilityRole).toBe('link');
    fireEvent.press(del);
    expect(mockPush).toHaveBeenCalledWith('/account/delete');
    expect(mockAccept).not.toHaveBeenCalled();
    expect(screen.getByText(SUPPORT_EMAIL)).toBeOnTheScreen();
  });

  it('"I agree" records the acceptance', async () => {
    mockAccept.mockResolvedValue({ ok: true });
    render(<AcceptTermsScreen />);
    fireEvent.press(screen.getByTestId('accept-terms-agree'));
    await waitFor(() => expect(mockAccept).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the reason when recording fails, and stays on the screen', async () => {
    mockAccept.mockResolvedValue({ ok: false, error: 'Our Terms have been updated. Please update the app to continue.' });
    render(<AcceptTermsScreen />);
    fireEvent.press(screen.getByTestId('accept-terms-agree'));
    expect(await screen.findByText('Our Terms have been updated. Please update the app to continue.')).toBeOnTheScreen();
  });

  it('lets the person sign out instead', () => {
    render(<AcceptTermsScreen />);
    fireEvent.press(screen.getByTestId('accept-terms-sign-out'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
