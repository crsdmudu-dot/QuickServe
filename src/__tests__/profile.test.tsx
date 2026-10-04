/**
 * Tests for src/app/(customer)/profile.tsx
 *
 * Verifies:
 *   - Existing 4 entries still render (Wallet / Saved addresses / Notification settings / Sign out)
 *   - ProfileCompletionCard is rendered
 *   - "Preferences" link navigates to /preferences
 *   - "Trust & Safety" link navigates to /trust
 *   - the Privacy Policy link opens the website page (D-12), only when the website address is configured
 */

import { Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockSignOut = jest.fn().mockResolvedValue(undefined);
const mockSession = { user: { id: 'user-1' } };

jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({ signOut: mockSignOut, session: mockSession }),
}));

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

// Supabase profiles read — return a profile with full_name + phone
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: { full_name: 'Test User', phone: '0700000000' }, error: null }),
        }),
      }),
    }),
  },
}));

// Saved addresses — one default
jest.mock('@/lib/saved-addresses', () => ({
  getMySavedAddresses: jest.fn().mockResolvedValue([
    { id: 'a1', is_default: true, address: '123 Test St', label_type: 'home', nickname: null,
      customer_id: 'user-1', address_label: null, latitude: null, longitude: null,
      building_name: null, floor: null, door_number: null, landmark: null,
      access_notes: null, last_used_at: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
  ]),
}));

// ProfileCompletionCard — render a testID so we can assert it's mounted
jest.mock('@/components/customer/profile-completion-card', () => ({
  ProfileCompletionCard: ({ completion }: { completion: { percent: number } }) => {
    const { View } = require('react-native');
    return <View testID="profile-completion-card" accessibilityLabel={`${completion.percent}%`} />;
  },
}));

import { router } from 'expo-router';
import ProfileScreen from '@/app/(customer)/profile';

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ProfileScreen', () => {
  beforeEach(() => {
    mockSignOut.mockClear();
    (router.push as jest.Mock).mockClear();
  });

  it('renders the profile heading', async () => {
    render(<ProfileScreen />);
    await waitFor(() => expect(screen.getByText('Profile')).toBeOnTheScreen());
  });

  it('renders ProfileCompletionCard after loading', async () => {
    render(<ProfileScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('profile-completion-card')).toBeOnTheScreen(),
    );
  });

  it('signs out when "Sign out / Switch role" is pressed', async () => {
    render(<ProfileScreen />);
    await waitFor(() => expect(screen.getByText('Sign out / Switch role')).toBeOnTheScreen());
    fireEvent.press(screen.getByText('Sign out / Switch role'));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });

  it('navigates to /wallet when "Wallet" is pressed', async () => {
    render(<ProfileScreen />);
    await waitFor(() => expect(screen.getByText('Wallet')).toBeOnTheScreen());
    fireEvent.press(screen.getByText('Wallet'));
    expect(router.push).toHaveBeenCalledWith('/wallet');
  });

  it('navigates to /blocked-users when "Blocked people" is pressed (F5.2)', async () => {
    render(<ProfileScreen />);
    await waitFor(() => expect(screen.getByText('Blocked people')).toBeOnTheScreen());
    fireEvent.press(screen.getByText('Blocked people'));
    expect(router.push).toHaveBeenCalledWith('/blocked-users');
  });

  it('navigates to /saved-addresses when "Saved addresses" is pressed', async () => {
    render(<ProfileScreen />);
    await waitFor(() => expect(screen.getByText('Saved addresses')).toBeOnTheScreen());
    fireEvent.press(screen.getByText('Saved addresses'));
    expect(router.push).toHaveBeenCalledWith('/saved-addresses');
  });

  it('navigates to /notification-settings when "Notification settings" is pressed', async () => {
    render(<ProfileScreen />);
    await waitFor(() =>
      expect(screen.getByText('Notification settings')).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByText('Notification settings'));
    expect(router.push).toHaveBeenCalledWith('/notification-settings');
  });

  it('navigates to /preferences when "Preferences" is pressed', async () => {
    render(<ProfileScreen />);
    await waitFor(() => expect(screen.getByText('Preferences')).toBeOnTheScreen());
    fireEvent.press(screen.getByText('Preferences'));
    expect(router.push).toHaveBeenCalledWith('/preferences');
  });

  it('navigates to /trust when "Trust & Safety" is pressed', async () => {
    render(<ProfileScreen />);
    await waitFor(() => expect(screen.getByText('Trust & Safety')).toBeOnTheScreen());
    fireEvent.press(screen.getByText('Trust & Safety'));
    expect(router.push).toHaveBeenCalledWith('/trust');
  });
});

// D-12: the Privacy Policy is reachable from the Profile screen (App Store 5.1.1(i), Google Play User Data).
describe('ProfileScreen — Privacy Policy link', () => {
  const savedUrl = process.env.EXPO_PUBLIC_WEBSITE_URL;
  afterEach(() => {
    if (savedUrl === undefined) delete process.env.EXPO_PUBLIC_WEBSITE_URL;
    else process.env.EXPO_PUBLIC_WEBSITE_URL = savedUrl;
  });

  it('opens the Privacy Policy on the website once the website address is configured', async () => {
    process.env.EXPO_PUBLIC_WEBSITE_URL = 'https://kwikserve.example';
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<ProfileScreen />);
    await waitFor(() => expect(screen.getByTestId('profile-completion-card')).toBeOnTheScreen());
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('profile-privacy-link'));
    expect(open).toHaveBeenCalledWith('https://kwikserve.example/privacy/');
    open.mockRestore();
  });

  it('shows no Privacy Policy link while the website address is not configured', async () => {
    delete process.env.EXPO_PUBLIC_WEBSITE_URL;
    render(<ProfileScreen />);
    await waitFor(() => expect(screen.getByTestId('profile-completion-card')).toBeOnTheScreen());
    expect(screen.queryByTestId('profile-privacy-link')).toBeNull();
  });
});
