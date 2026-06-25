import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { routeForNotificationData, registerForPushNotifications } from './push';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-notifications');
jest.mock('expo-device');
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        eas: { projectId: 'p1' },
      },
    },
  },
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockNotifications = Notifications as jest.Mocked<typeof Notifications>;
const { supabase } = jest.requireMock('@/lib/supabase') as {
  supabase: { functions: { invoke: jest.Mock } };
};

// ── routeForNotificationData ─────────────────────────────────────────────────

describe('routeForNotificationData', () => {
  it('returns route for a chat_message payload', () => {
    expect(
      routeForNotificationData({ type: 'chat_message', route: '/booking/chat/1' }),
    ).toBe('/booking/chat/1');
  });

  it('returns route for a booking_update payload', () => {
    expect(
      routeForNotificationData({ type: 'booking_update', route: '/customer/bookings/42' }),
    ).toBe('/customer/bookings/42');
  });

  it('returns null for an empty object', () => {
    expect(routeForNotificationData({})).toBeNull();
  });

  it('returns null for null input', () => {
    expect(routeForNotificationData(null)).toBeNull();
  });

  it('returns null for an empty route string', () => {
    expect(routeForNotificationData({ route: '' })).toBeNull();
  });
});

// ── registerForPushNotifications ─────────────────────────────────────────────

describe('registerForPushNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: real device, granted permission
    (Device as any).isDevice = true;
    (Device as any).deviceName = 'Test Phone';
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    mockNotifications.getExpoPushTokenAsync.mockResolvedValue({
      data: 'ExponentPushToken[x]',
      type: 'expo',
    } as any);
    supabase.functions.invoke.mockResolvedValue({ data: null, error: null });
  });

  it('returns null and does NOT call invoke when not a device', async () => {
    (Device as any).isDevice = false;
    const result = await registerForPushNotifications();
    expect(result).toBeNull();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('returns null and does NOT call invoke when permission denied', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' } as any);
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' } as any);
    const result = await registerForPushNotifications();
    expect(result).toBeNull();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('returns token and calls invoke with correct body when granted', async () => {
    const result = await registerForPushNotifications();
    expect(result).toBe('ExponentPushToken[x]');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('register-device', {
      body: {
        push_token: 'ExponentPushToken[x]',
        platform: Platform.OS,
        device_name: 'Test Phone',
      },
    });
  });

  it('returns null (graceful) when getExpoPushTokenAsync throws', async () => {
    mockNotifications.getExpoPushTokenAsync.mockRejectedValue(
      new Error('Not supported in Expo Go'),
    );
    const result = await registerForPushNotifications();
    expect(result).toBeNull();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('uses null for device_name when Device.deviceName is null', async () => {
    (Device as any).deviceName = null;
    const result = await registerForPushNotifications();
    expect(result).toBe('ExponentPushToken[x]');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('register-device', {
      body: {
        push_token: 'ExponentPushToken[x]',
        platform: Platform.OS,
        device_name: null,
      },
    });
  });
});
