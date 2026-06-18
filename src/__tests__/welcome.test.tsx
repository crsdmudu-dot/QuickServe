import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: jest.fn(),
  },
}));

import WelcomeScreen from '@/app/(onboarding)/welcome';

describe('WelcomeScreen', () => {
  beforeEach(() => mockPush.mockClear());
  it('renders brand + tagline and navigates on Get Started', () => {
    render(<WelcomeScreen />);
    expect(screen.getByText('QuickServe')).toBeOnTheScreen();
    expect(screen.getByText('Premium services, on demand.')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Get Started'));
    expect(mockPush).toHaveBeenCalledWith('/role-select');
  });
});
