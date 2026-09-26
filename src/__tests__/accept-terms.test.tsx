/**
 * accept-terms.test.tsx — the one-time Terms prompt (F5.4, src/app/accept-terms.tsx).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import AcceptTermsScreen from '@/app/accept-terms';
import { TERMS_KEY_POINTS } from '@/constants/terms';

// jest.mock calls are hoisted above the imports by babel-jest.
const mockAccept = jest.fn();
const mockSignOut = jest.fn();
jest.mock('@/auth/terms-gate', () => ({ useTermsGate: () => ({ status: 'required', accept: mockAccept }) }));
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));

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
  });

  it('links to the full Terms once the website address is configured', () => {
    process.env.EXPO_PUBLIC_WEBSITE_URL = 'https://kwikserve.example';
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<AcceptTermsScreen />);
    fireEvent.press(screen.getByText('Read the full Terms'));
    expect(open).toHaveBeenCalledWith('https://kwikserve.example/terms');
    open.mockRestore();
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
