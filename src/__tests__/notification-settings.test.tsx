/**
 * Tests for src/app/notification-settings.tsx
 *
 * Mocks @/lib/notifications and expo-router so no network calls are made.
 * Verifies that all 5 switches render with correct values from the mocked
 * preferences and that toggling a switch calls updateNotificationPreferences
 * with the correct key.
 */

const mockGetNotificationPreferences = jest.fn().mockResolvedValue({
  push_enabled: true,
  chat_enabled: true,
  booking_enabled: false,
  payment_enabled: true,
  marketing_enabled: false,
});

const mockUpdateNotificationPreferences = jest.fn().mockResolvedValue({ ok: true });

jest.mock('@/lib/notifications', () => ({
  getNotificationPreferences: (...args: unknown[]) =>
    mockGetNotificationPreferences(...args),
  updateNotificationPreferences: (...args: unknown[]) =>
    mockUpdateNotificationPreferences(...args),
  DEFAULT_NOTIFICATION_PREFERENCES: {
    push_enabled: true,
    chat_enabled: true,
    booking_enabled: true,
    payment_enabled: true,
    marketing_enabled: false,
  },
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import NotificationSettingsScreen from '@/app/notification-settings';

describe('NotificationSettingsScreen', () => {
  beforeEach(() => {
    mockGetNotificationPreferences.mockClear();
    mockUpdateNotificationPreferences.mockClear();
    (router.back as jest.Mock).mockClear();
    (router.push as jest.Mock).mockClear();
    // Restore resolved prefs fixture.
    mockGetNotificationPreferences.mockResolvedValue({
      push_enabled: true,
      chat_enabled: true,
      booking_enabled: false,
      payment_enabled: true,
      marketing_enabled: false,
    });
    mockUpdateNotificationPreferences.mockResolvedValue({ ok: true });
  });

  it('renders the title "Notification settings"', async () => {
    render(<NotificationSettingsScreen />);
    expect(await screen.findByText('Notification settings')).toBeOnTheScreen();
  });

  it('renders all 5 switches after preferences load', async () => {
    render(<NotificationSettingsScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('switch-push_enabled')).toBeOnTheScreen();
      expect(screen.getByTestId('switch-chat_enabled')).toBeOnTheScreen();
      expect(screen.getByTestId('switch-booking_enabled')).toBeOnTheScreen();
      expect(screen.getByTestId('switch-payment_enabled')).toBeOnTheScreen();
      expect(screen.getByTestId('switch-marketing_enabled')).toBeOnTheScreen();
    });
  });

  it('switch values match the mocked preferences', async () => {
    render(<NotificationSettingsScreen />);
    await waitFor(() => {
      // push_enabled = true
      expect(screen.getByTestId('switch-push_enabled').props.value).toBe(true);
      // chat_enabled = true
      expect(screen.getByTestId('switch-chat_enabled').props.value).toBe(true);
      // booking_enabled = false
      expect(screen.getByTestId('switch-booking_enabled').props.value).toBe(false);
      // payment_enabled = true
      expect(screen.getByTestId('switch-payment_enabled').props.value).toBe(true);
      // marketing_enabled = false
      expect(screen.getByTestId('switch-marketing_enabled').props.value).toBe(false);
    });
  });

  it('toggling marketing_enabled calls updateNotificationPreferences with { marketing_enabled: true }', async () => {
    render(<NotificationSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('switch-marketing_enabled')).toBeOnTheScreen());
    fireEvent(screen.getByTestId('switch-marketing_enabled'), 'valueChange', true);
    await waitFor(() =>
      expect(mockUpdateNotificationPreferences).toHaveBeenCalledWith({ marketing_enabled: true }),
    );
  });

  it('toggling push_enabled calls updateNotificationPreferences with { push_enabled: false }', async () => {
    render(<NotificationSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('switch-push_enabled')).toBeOnTheScreen());
    fireEvent(screen.getByTestId('switch-push_enabled'), 'valueChange', false);
    await waitFor(() =>
      expect(mockUpdateNotificationPreferences).toHaveBeenCalledWith({ push_enabled: false }),
    );
  });

  it('reverts switch and shows error when updateNotificationPreferences fails', async () => {
    mockUpdateNotificationPreferences.mockResolvedValueOnce({ ok: false });
    render(<NotificationSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('switch-booking_enabled')).toBeOnTheScreen());
    // booking_enabled starts as false; toggle to true then expect revert on failure
    fireEvent(screen.getByTestId('switch-booking_enabled'), 'valueChange', true);
    await waitFor(() =>
      expect(screen.getByText('Could not update preferences.')).toBeOnTheScreen(),
    );
    // After revert, switch is back to false
    await waitFor(() =>
      expect(screen.getByTestId('switch-booking_enabled').props.value).toBe(false),
    );
  });

  it('pressing "← Back" calls router.back()', async () => {
    render(<NotificationSettingsScreen />);
    fireEvent.press(await screen.findByText('← Back'));
    expect(router.back).toHaveBeenCalled();
  });
});
