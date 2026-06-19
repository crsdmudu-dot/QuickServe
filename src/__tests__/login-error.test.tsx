import { render, screen } from '@testing-library/react-native';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({ signIn: jest.fn().mockResolvedValue(false), authError: 'Incorrect email or password.' }),
}));

import LoginScreen from '@/app/(onboarding)/login';

it('renders authError message when present', () => {
  render(<LoginScreen />);
  expect(screen.getByText('Incorrect email or password.')).toBeOnTheScreen();
});
