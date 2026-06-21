/**
 * Tests for src/app/booking/success.tsx
 *
 * We mock expo-router to spy on replace.
 */

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import SuccessScreen from '@/app/booking/success';

describe('SuccessScreen', () => {
  beforeEach(() => {
    (router.replace as jest.Mock).mockClear();
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
});
