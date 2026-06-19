import { render, screen } from '@testing-library/react-native';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({
    signUp: jest.fn().mockResolvedValue(false),
    authError: 'An account with this email already exists.',
  }),
}));

import RegisterScreen from '@/app/(onboarding)/register';

it('renders authError message when present', () => {
  render(<RegisterScreen />);
  expect(screen.getByText('An account with this email already exists.')).toBeOnTheScreen();
});
