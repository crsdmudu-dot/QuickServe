import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockSignOut = jest.fn().mockResolvedValue(undefined);
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));

import ProfileScreen from '@/app/(customer)/profile';

describe('ProfileScreen', () => {
  beforeEach(() => mockSignOut.mockClear());
  it('renders and signs out', async () => {
    render(<ProfileScreen />);
    expect(screen.getByText('Profile')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Sign out / Switch role'));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });
});
