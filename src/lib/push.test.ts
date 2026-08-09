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
  getLastNotificationResponseAsync: jest.fn(),
}));

// AsyncStorage — used by the cold-start stale-response guard in push.ts.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
  },
}));

jest.mock('expo-device');
// The factory is hoisted by Jest before module scope runs, so we embed the object
// directly inside the factory. We then access it via jest.requireMock() below so
// individual tests can mutate appOwnership to simulate Expo Go.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        eas: { projectId: 'p1' },
      },
    },
    appOwnership: undefined as string | undefined,
    executionEnvironment: undefined as string | undefined,
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
  getLastNotificationResponseAsync: jest.Mock;
};

const mockAsyncStorage = (jest.requireMock('@react-native-async-storage/async-storage') as {
  default: { getItem: jest.Mock; setItem: jest.Mock };
}).default;

// Flush the async IIFE (dynamic import + getLastNotificationResponseAsync +
// AsyncStorage reads all resolve as microtasks) fully.
const flush = () => new Promise((r) => setTimeout(r, 0));

const { supabase } = jest.requireMock('@/lib/supabase') as {
  supabase: { functions: { invoke: jest.Mock } };
};

// Mutable Constants mock — lets tests set appOwnership = 'expo' to simulate Expo Go.
const mockConstants = jest.requireMock('expo-constants').default as {
  expoConfig: { extra: { eas: { projectId: string } } };
  appOwnership: string | undefined;
  executionEnvironment: string | undefined;
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
    // Default: real device, granted permission, NOT Expo Go
    mockConstants.appOwnership = undefined;
    mockConstants.executionEnvironment = undefined;
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

  it('Expo Go → register no-ops: returns null without calling getExpoPushTokenAsync or invoke', async () => {
    mockConstants.appOwnership = 'expo';
    const result = await registerForPushNotifications();
    expect(result).toBeNull();
    expect(mockNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
});

// ── setupNotificationResponseListener ───────────────────────────────────────

describe('setupNotificationResponseListener', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: NOT Expo Go
    mockConstants.appOwnership = undefined;
    mockConstants.executionEnvironment = undefined;
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

  it('Expo Go → listener no-ops: returns a no-op function, never calls addNotificationResponseReceivedListener', async () => {
    mockConstants.appOwnership = 'expo';
    const navigate = jest.fn();
    const unsubscribe = setupNotificationResponseListener(navigate);

    // Flush microtask queue — no async IIFE runs in Expo Go path
    await Promise.resolve();
    await Promise.resolve();

    expect(mockNotifications.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });
});

// ── setupNotificationResponseListener — cold start (Phase 4E.1) ──────────────

describe('setupNotificationResponseListener — cold start', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConstants.appOwnership = undefined;
    mockConstants.executionEnvironment = undefined;
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(undefined);
    mockNotifications.addNotificationResponseReceivedListener.mockReturnValue({ remove: jest.fn() });
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = (id: string | undefined, route: string | undefined): any => ({
    notification: { request: { identifier: id, content: { data: route === undefined ? {} : { route } } } },
  });

  it('navigates from the notification that cold-started the app (launch response)', async () => {
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(response('n1', '/booking/1'));
    const navigate = jest.fn();
    setupNotificationResponseListener(navigate);
    await flush();
    expect(navigate).toHaveBeenCalledWith('/booking/1');
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('push:lastColdStartResponseId', 'n1');
  });

  it('does not navigate twice when the cold-start response is also replayed to the live listener', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let liveHandler: ((r: any) => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockNotifications.addNotificationResponseReceivedListener.mockImplementation((h: any) => {
      liveHandler = h;
      return { remove: jest.fn() };
    });
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(response('n1', '/booking/1'));
    const navigate = jest.fn();
    setupNotificationResponseListener(navigate);
    await flush();
    // OS replays the SAME launch response to the live listener.
    liveHandler!(response('n1', '/booking/1'));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/booking/1');
  });

  it('ignores a cold-start response with a missing route (no navigation)', async () => {
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(response('n1', undefined));
    const navigate = jest.fn();
    setupNotificationResponseListener(navigate);
    await flush();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not re-navigate a STALE launch response already consumed in a prior session', async () => {
    mockAsyncStorage.getItem.mockResolvedValue('n1'); // persisted from a previous session
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(response('n1', '/booking/1'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let liveHandler: ((r: any) => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockNotifications.addNotificationResponseReceivedListener.mockImplementation((h: any) => {
      liveHandler = h;
      return { remove: jest.fn() };
    });
    const navigate = jest.fn();
    setupNotificationResponseListener(navigate);
    await flush();
    expect(navigate).not.toHaveBeenCalled();
    expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
    // The live listener must not re-navigate the same stale id either (no loop).
    liveHandler!(response('n1', '/booking/1'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('still routes fresh warm/background taps through the live listener', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let liveHandler: ((r: any) => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockNotifications.addNotificationResponseReceivedListener.mockImplementation((h: any) => {
      liveHandler = h;
      return { remove: jest.fn() };
    });
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(undefined); // no cold start
    const navigate = jest.fn();
    setupNotificationResponseListener(navigate);
    await flush();
    liveHandler!(response('n2', '/booking/2'));
    expect(navigate).toHaveBeenCalledWith('/booking/2');
  });
});
