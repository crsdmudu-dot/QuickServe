/**
 * Tests for src/app/booking/schedule.tsx
 *
 * We mock expo-router (to spy on push) and @/booking/booking-draft.  The native
 * picker is mocked: the default export is a plain View (iOS inline picker) and
 * DateTimePickerAndroid.open is a spy we can drive to simulate the Android
 * date -> time flow.
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

const mockAndroidOpen = jest.fn();
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: View,
    DateTimePickerAndroid: {
      open: (...args: unknown[]) => mockAndroidOpen(...args),
      dismiss: jest.fn(),
    },
  };
});

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import ScheduleScreen from '@/app/booking/schedule';

const originalOS = Platform.OS;

describe('ScheduleScreen', () => {
  beforeEach(() => {
    (router.push as jest.Mock).mockClear();
    mockSetScheduledFor.mockClear();
    mockAndroidOpen.mockReset();
    mockScheduledFor = null;
  });

  afterEach(() => {
    Platform.OS = originalOS;
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

  it('opens the Android date then time dialogs and saves the combined value', () => {
    Platform.OS = 'android';
    // First open() = date dialog, second = time dialog. Drive each callback.
    mockAndroidOpen
      .mockImplementationOnce((props) => props.onValueChange({}, new Date(2026, 6, 1)))
      .mockImplementationOnce((props) =>
        props.onValueChange({}, new Date(2026, 0, 1, 14, 30)),
      );

    render(<ScheduleScreen />);
    fireEvent.press(screen.getByText('Pick date & time'));

    expect(mockAndroidOpen).toHaveBeenCalledTimes(2);
    expect(mockAndroidOpen.mock.calls[0][0].mode).toBe('date');
    expect(mockAndroidOpen.mock.calls[1][0].mode).toBe('time');

    // Combined value keeps the picked day (Jul 1 2026) with the picked time (14:30).
    expect(mockSetScheduledFor).toHaveBeenCalledTimes(1);
    const saved = new Date(mockSetScheduledFor.mock.calls[0][0] as string);
    expect(saved.getFullYear()).toBe(2026);
    expect(saved.getMonth()).toBe(6);
    expect(saved.getDate()).toBe(1);
    expect(saved.getHours()).toBe(14);
    expect(saved.getMinutes()).toBe(30);
  });

  it('uses onValueChange (not the deprecated onChange) for the Android picker', () => {
    Platform.OS = 'android';
    mockAndroidOpen.mockImplementation(() => {});
    render(<ScheduleScreen />);
    fireEvent.press(screen.getByText('Pick date & time'));

    const args = mockAndroidOpen.mock.calls[0][0];
    expect(typeof args.onValueChange).toBe('function');
    expect(args.onChange).toBeUndefined();
  });
});
