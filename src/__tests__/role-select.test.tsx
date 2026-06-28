import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockSelectRole = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn() } }));
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ selectRole: mockSelectRole }) }));

import RoleSelectScreen from '@/app/(onboarding)/role-select';

describe('RoleSelectScreen', () => {
  beforeEach(() => { mockPush.mockClear(); mockSelectRole.mockClear(); });
  it('renders only the public signup roles (no Admin)', () => {
    render(<RoleSelectScreen />);
    expect(screen.getByText('Customer')).toBeOnTheScreen();
    expect(screen.getByText('Service Provider')).toBeOnTheScreen();
    // Admin is NOT publicly registrable from the mobile app.
    expect(screen.queryByText('Admin')).toBeNull();
  });
  it('selects a role and navigates to register', async () => {
    render(<RoleSelectScreen />);
    fireEvent.press(screen.getByText('Customer'));
    await waitFor(() => expect(mockSelectRole).toHaveBeenCalledWith('customer'));
    expect(mockPush).toHaveBeenCalledWith('/register');
  });
});
