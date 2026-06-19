import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockSignOut = jest.fn().mockResolvedValue(undefined);
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));

import AdminScreen from '@/app/(admin)/admin';

describe('AdminScreen', () => {
  beforeEach(() => mockSignOut.mockClear());
  it('renders placeholder and signs out', async () => {
    render(<AdminScreen />);
    expect(screen.getByText('Admin dashboard coming soon')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Sign out / Switch role'));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });
});
