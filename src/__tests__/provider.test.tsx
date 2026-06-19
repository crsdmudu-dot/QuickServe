import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockSignOut = jest.fn().mockResolvedValue(undefined);
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));

import ProviderScreen from '@/app/(provider)/provider';

describe('ProviderScreen', () => {
  beforeEach(() => mockSignOut.mockClear());
  it('renders placeholder and signs out', async () => {
    render(<ProviderScreen />);
    expect(screen.getByText('Provider app coming soon')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Sign out / Switch role'));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });
});
