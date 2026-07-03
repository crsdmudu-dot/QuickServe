import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockSignOut = jest.fn().mockResolvedValue(undefined);
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { router } from 'expo-router';
import ProfileScreen from '@/app/(customer)/profile';

describe('ProfileScreen', () => {
  beforeEach(() => {
    mockSignOut.mockClear();
    (router.push as jest.Mock).mockClear();
  });

  it('renders and signs out', async () => {
    render(<ProfileScreen />);
    expect(screen.getByText('Profile')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Sign out / Switch role'));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });

  it('navigates to /saved-addresses when "Saved addresses" is pressed', () => {
    render(<ProfileScreen />);
    fireEvent.press(screen.getByText('Saved addresses'));
    expect(router.push).toHaveBeenCalledWith('/saved-addresses');
  });
});
