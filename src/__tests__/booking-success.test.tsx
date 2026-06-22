/**
 * Tests for src/app/booking/success.tsx
 *
 * We mock expo-router to spy on replace and control useLocalSearchParams.
 */

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import SuccessScreen from '@/app/booking/success';

describe('SuccessScreen', () => {
  beforeEach(() => {
    (router.replace as jest.Mock).mockClear();
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
  });

  it('renders the success message', () => {
    render(<SuccessScreen />);
    expect(screen.getByText('Booking created successfully')).toBeOnTheScreen();
  });

  it('navigates home when Back to Home is pressed', () => {
    render(<SuccessScreen />);
    fireEvent.press(screen.getByText('Back to Home'));
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('shows photo warning when photoWarning param is "1"', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ photoWarning: '1' });
    render(<SuccessScreen />);
    expect(
      screen.getByText(
        /some photos couldn/,
      ),
    ).toBeOnTheScreen();
  });

  it('does NOT show photo warning when photoWarning param is absent', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    render(<SuccessScreen />);
    expect(screen.queryByText(/some photos couldn/)).toBeNull();
  });
});
