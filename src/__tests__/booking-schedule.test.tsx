/**
 * Tests for src/app/booking/schedule.tsx (Slice 24 rework)
 *
 * All options write to LOCAL screen state; Continue builds one ScheduleInput,
 * calls resolveSchedule(), then setSchedule(), then navigates.
 *
 * Mock strategy:
 * - expo-router: spy on router.push
 * - @/booking/booking-draft: expose { scheduledFor, setScheduledFor, setSchedule }
 * - @react-native-community/datetimepicker: default = View (iOS inline); DateTimePickerAndroid.open = spy
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockSetSchedule = jest.fn();
const mockSetScheduledFor = jest.fn();
let mockScheduledFor: string | null = null;

jest.mock('@/booking/booking-draft', () => ({
  useBookingDraft: () => ({
    scheduledFor: mockScheduledFor,
    setScheduledFor: mockSetScheduledFor,
    setSchedule: mockSetSchedule,
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
    mockSetSchedule.mockClear();
    mockSetScheduledFor.mockClear();
    mockAndroidOpen.mockReset();
    mockScheduledFor = null;
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  // ── Core guarantee 1: ASAP default → Continue → navigate ─────────────────

  it('ASAP is the default — Continue calls setSchedule with scheduling_type=asap and navigates', () => {
    render(<ScheduleScreen />);
    fireEvent.press(screen.getByText('Continue'));

    expect(mockSetSchedule).toHaveBeenCalledTimes(1);
    const resolved = mockSetSchedule.mock.calls[0][0];
    expect(resolved.scheduling_type).toBe('asap');
    expect(router.push).toHaveBeenCalledWith('/booking/notes');
  });

  // ── Core guarantee 2: Choose date & time with nothing picked → error + no nav

  it('shows error and does NOT navigate when "Choose date & time" selected but nothing picked', () => {
    render(<ScheduleScreen />);
    fireEvent.press(screen.getByText('Choose date & time'));
    fireEvent.press(screen.getByText('Continue'));

    expect(screen.getByText('Please choose a date and time.')).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
    expect(mockSetSchedule).not.toHaveBeenCalled();
  });

  // ── New behavior: Tomorrow + Morning → setSchedule with tomorrow/morning ───

  it('Tomorrow + Morning → setSchedule called with scheduling_type=tomorrow, time_window=morning, then navigate', () => {
    render(<ScheduleScreen />);
    fireEvent.press(screen.getByText('Tomorrow'));
    fireEvent.press(screen.getByText('Morning'));
    fireEvent.press(screen.getByText('Continue'));

    expect(mockSetSchedule).toHaveBeenCalledTimes(1);
    const resolved = mockSetSchedule.mock.calls[0][0];
    expect(resolved.scheduling_type).toBe('tomorrow');
    expect(resolved.time_window).toBe('morning');
    expect(router.push).toHaveBeenCalledWith('/booking/notes');
  });

  // ── New behavior: Quick preset "Tomorrow morning" → navigate ──────────────

  it('Quick preset "Tomorrow morning" → Continue resolves tomorrow/morning → navigate', () => {
    render(<ScheduleScreen />);
    // Tap the quick preset button
    fireEvent.press(screen.getByText('Tomorrow morning'));
    fireEvent.press(screen.getByText('Continue'));

    expect(mockSetSchedule).toHaveBeenCalledTimes(1);
    const resolved = mockSetSchedule.mock.calls[0][0];
    expect(resolved.scheduling_type).toBe('tomorrow');
    expect(resolved.time_window).toBe('morning');
    expect(router.push).toHaveBeenCalledWith('/booking/notes');
  });

  // ── New behavior: Recurrence — Weekly with ASAP → recurrence=weekly ───────

  it('selecting "Weekly" recurrence with ASAP → resolved recurrence is "weekly"', () => {
    render(<ScheduleScreen />);
    fireEvent.press(screen.getByText('Weekly'));
    fireEvent.press(screen.getByText('Continue'));

    expect(mockSetSchedule).toHaveBeenCalledTimes(1);
    const resolved = mockSetSchedule.mock.calls[0][0];
    expect(resolved.recurrence).toBe('weekly');
    expect(router.push).toHaveBeenCalledWith('/booking/notes');
  });

  // ── Manual picker path (Android): date→time two-step via onValueChange ────

  it('Android: "Choose date & time" → pick button → DateTimePickerAndroid date→time → setSchedule with specific datetime', () => {
    Platform.OS = 'android';

    // First open() = date dialog, second = time dialog. Drive each callback.
    mockAndroidOpen
      .mockImplementationOnce((props) => props.onValueChange({}, new Date(2026, 6, 1))) // Jul 1 2026
      .mockImplementationOnce((props) =>
        props.onValueChange({}, new Date(2026, 0, 1, 14, 30)), // time 14:30
      );

    render(<ScheduleScreen />);
    fireEvent.press(screen.getByText('Choose date & time'));
    // After selecting 'datetime', button shows 'Pick date & time'
    fireEvent.press(screen.getByText('Pick date & time'));

    // Two calls: first date, then time
    expect(mockAndroidOpen).toHaveBeenCalledTimes(2);
    expect(mockAndroidOpen.mock.calls[0][0].mode).toBe('date');
    expect(mockAndroidOpen.mock.calls[1][0].mode).toBe('time');

    // The picker uses onValueChange (not the deprecated onChange)
    expect(typeof mockAndroidOpen.mock.calls[0][0].onValueChange).toBe('function');
    expect(mockAndroidOpen.mock.calls[0][0].onChange).toBeUndefined();

    // Now Continue → setSchedule called with the combined datetime
    fireEvent.press(screen.getByText('Continue'));

    expect(mockSetSchedule).toHaveBeenCalledTimes(1);
    const resolved = mockSetSchedule.mock.calls[0][0];
    expect(resolved.scheduling_type).toBe('datetime');
    // The scheduled_for should encode Jul 1 2026 at 14:30
    const saved = new Date(resolved.scheduled_for);
    expect(saved.getFullYear()).toBe(2026);
    expect(saved.getMonth()).toBe(6); // July (0-indexed)
    expect(saved.getDate()).toBe(1);
    expect(saved.getHours()).toBe(14);
    expect(saved.getMinutes()).toBe(30);

    expect(router.push).toHaveBeenCalledWith('/booking/notes');
  });

  // ── Gating: Today + Specific time with no time picked → error + no nav ────

  it('Today + Specific time but no time picked → error + no navigation', () => {
    render(<ScheduleScreen />);
    fireEvent.press(screen.getByText('Today'));
    fireEvent.press(screen.getByText('Specific time'));
    fireEvent.press(screen.getByText('Continue'));

    expect(screen.getByText('Please choose a date and time.')).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
    expect(mockSetSchedule).not.toHaveBeenCalled();
  });

  // ── Choose date without picking a date → error ────────────────────────────

  it('"Choose date" type with no date picked → error and no navigation', () => {
    render(<ScheduleScreen />);
    fireEvent.press(screen.getByText('Choose date'));
    fireEvent.press(screen.getByText('Morning')); // window is set but no pickedDate
    fireEvent.press(screen.getByText('Continue'));

    expect(screen.getByText('Please choose a date and time.')).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
  });

  // ── Quick preset "Next available" (asap) → always valid ──────────────────

  it('Quick preset "Next available" → ASAP → always valid → navigate', () => {
    render(<ScheduleScreen />);
    // First select something other than ASAP
    fireEvent.press(screen.getByText('Tomorrow'));
    // Then press the preset
    fireEvent.press(screen.getByText('Next available'));
    fireEvent.press(screen.getByText('Continue'));

    expect(mockSetSchedule).toHaveBeenCalledTimes(1);
    const resolved = mockSetSchedule.mock.calls[0][0];
    expect(resolved.scheduling_type).toBe('asap');
    expect(router.push).toHaveBeenCalledWith('/booking/notes');
  });

  // ── ASAP recurrence default is one_time ───────────────────────────────────

  it('default ASAP with no recurrence change → recurrence=one_time', () => {
    render(<ScheduleScreen />);
    fireEvent.press(screen.getByText('Continue'));

    const resolved = mockSetSchedule.mock.calls[0][0];
    expect(resolved.recurrence).toBe('one_time');
  });

  // ── Step indicator and title rendered ─────────────────────────────────────

  it('renders step indicator and title', () => {
    render(<ScheduleScreen />);
    expect(screen.getByText('Step 2 of 4')).toBeOnTheScreen();
    expect(screen.getByText('When do you need it?')).toBeOnTheScreen();
  });
});
