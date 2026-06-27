import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { routeForNotificationData, registerForPushNotifications, setupNotificationResponseListener } from './push';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Provide an explicit factory so the mock namespace shape is fully controlled and
// Jest's dynamic-import interception resolves the same mock object (no real module
// side-effects that crash under Node / Expo Go).
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
}));

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

// Use requireMock so we always get the same object that dynamic import() resolves to.
const mockNotifications = jest.requireMock('expo-notifications') as {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  getExpoPushTokenAsync: jest.Mock;
  addNotificationResponseReceivedListener: jest.Mock;
};

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
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockNotifications.getExpoPushTokenAsync.mockResolvedValue({
      data: 'ExponentPushToken[x]',
      type: 'expo',
    });
    supabase.functions.invoke.mockResolvedValue({ data: null, error: null });
  });

  it('returns null and does NOT call invoke when not a device', async () => {
    (Device as any).isDevice = false;
    const result = await registerForPushNotifications();
    expect(result).toBeNull();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('returns null and does NOT call invoke when permission denied', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
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

// ── setupNotificationResponseListener ───────────────────────────────────────

describe('setupNotificationResponseListener', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls navigate with the resolved route when a notification response is received', async () => {
    const removeMock = jest.fn();
    let capturedHandler: ((response: any) => void) | undefined;

    mockNotifications.addNotificationResponseReceivedListener.mockImplementation((handler: any) => {
      capturedHandler = handler;
      return { remove: removeMock };
    });

    const navigate = jest.fn();
    setupNotificationResponseListener(navigate);

    // Flush the async IIFE: dynamic import() resolves as a microtask, then the
    // listener is registered. Two ticks of the microtask queue are sufficient.
    await Promise.resolve();
    await Promise.resolve();

    expect(capturedHandler).toBeDefined();

    // Simulate a notification tap with route data.
    capturedHandler!({
      notification: {
        request: {
          content: {
            data: { route: '/booking/1' },
          },
        },
      },
    });

    expect(navigate).toHaveBeenCalledWith('/booking/1');
  });

  it('calls sub.remove() when the returned unsubscribe is called', async () => {
    const removeMock = jest.fn();
    mockNotifications.addNotificationResponseReceivedListener.mockImplementation(() => ({
      remove: removeMock,
    }));

    const unsubscribe = setupNotificationResponseListener(jest.fn());

    // Wait for the async IIFE to complete and register the listener.
    await Promise.resolve();
    await Promise.resolve();

    unsubscribe();
    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  it('does not call navigate when route is missing from data', async () => {
    let capturedHandler: ((response: any) => void) | undefined;
    mockNotifications.addNotificationResponseReceivedListener.mockImplementation((handler: any) => {
      capturedHandler = handler;
      return { remove: jest.fn() };
    });

    const navigate = jest.fn();
    setupNotificationResponseListener(navigate);
    await Promise.resolve();
    await Promise.resolve();

    capturedHandler!({
      notification: { request: { content: { data: {} } } },
    });

    expect(navigate).not.toHaveBeenCalled();
  });
});
