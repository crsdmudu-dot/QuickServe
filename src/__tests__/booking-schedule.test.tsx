/**
 * Tests for src/app/booking/schedule.tsx
 *
 * We mock expo-router (to spy on push) and @/booking/booking-draft.
 * The native DateTimePicker is never exercised in unit tests — we only test
 * the navigation / validation logic.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockSetScheduledFor = jest.fn();
let mockScheduledFor: string | null = null;
jest.mock('@/booking/booking-draft', () => ({
  useBookingDraft: () => ({
    scheduledFor: mockScheduledFor,
    setScheduledFor: mockSetScheduledFor,
  }),
}));

// Stub the native picker so tests don't blow up trying to render it.
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View };
});

import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import ScheduleScreen from '@/app/booking/schedule';

describe('ScheduleScreen', () => {
  beforeEach(() => {
    (router.push as jest.Mock).mockClear();
    mockSetScheduledFor.mockClear();
    mockScheduledFor = null;
  });

  it('shows an inline error and does NOT navigate when no date chosen', () => {
    render(<ScheduleScreen />);
    fireEvent.press(screen.getByText('Continue'));
    expect(screen.getByText('Please choose a date and time.')).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('navigates to /booking/notes when scheduledFor is set', () => {
    mockScheduledFor = new Date('2026-07-01T10:00:00Z').toISOString();
    render(<ScheduleScreen />);
    fireEvent.press(screen.getByText('Continue'));
    expect(router.push).toHaveBeenCalledWith('/booking/notes');
  });

  it('renders the formatted date when scheduledFor is set', () => {
    mockScheduledFor = new Date('2026-07-01T10:00:00Z').toISOString();
    render(<ScheduleScreen />);
    expect(
      screen.getByText(new Date(mockScheduledFor).toLocaleString()),
    ).toBeOnTheScreen();
  });
});
