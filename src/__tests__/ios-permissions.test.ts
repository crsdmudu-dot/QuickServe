/**
 * ios-permissions.test.ts — the iOS capability matrix is locked:
 * only Photos + Location are declared; Camera/Mic/Contacts/Bluetooth/
 * Calendars/Motion stay absent; Notifications stay system-managed.
 */
import * as fs from 'fs';
import * as path from 'path';

const APP_JSON = path.resolve(__dirname, '../../app.json');
let expo: any;
let raw: string;

beforeAll(() => {
  raw = fs.readFileSync(APP_JSON, 'utf-8');
  expo = JSON.parse(raw).expo;
});

function pluginOpts(name: string): any {
  const entry = (expo.plugins as any[]).find(
    (p) => p === name || (Array.isArray(p) && p[0] === name),
  );
  return entry ? (Array.isArray(entry) ? entry[1] : {}) : undefined;
}

describe('declared capabilities (used)', () => {
  test('Photos: expo-image-picker with photosPermission', () => {
    expect(pluginOpts('expo-image-picker').photosPermission.length).toBeGreaterThan(0);
  });
  test('Location: expo-location with when-in-use only (no Always/background)', () => {
    const opts = pluginOpts('expo-location');
    expect(opts.locationWhenInUsePermission.length).toBeGreaterThan(0);
    expect(opts.locationAlwaysPermission).toBeUndefined();
    expect(opts.locationAlwaysAndWhenInUsePermission).toBeUndefined();
    expect(opts.isIosBackgroundLocationEnabled).not.toBe(true);
  });
  test('Notifications: expo-notifications present and system-managed (no usage string)', () => {
    const entry = (expo.plugins as any[]).find(
      (p) => p === 'expo-notifications' || (Array.isArray(p) && p[0] === 'expo-notifications'),
    );
    expect(entry).toBeDefined();
    expect(raw).not.toContain('NSUserNotificationsUsageDescription');
  });
});

describe('absent capabilities (must not be introduced)', () => {
  const forbidden = [
    'NSCameraUsageDescription', 'cameraPermission', 'expo-camera',
    'NSMicrophoneUsageDescription', 'microphonePermission',
    'NSContactsUsageDescription', 'expo-contacts',
    'NSBluetoothAlwaysUsageDescription', 'NSBluetoothPeripheralUsageDescription',
    'NSCalendarsUsageDescription', 'expo-calendar',
    'NSMotionUsageDescription', 'expo-sensors',
  ];
  test.each(forbidden)('app.json does not declare %s', (token) => {
    expect(raw).not.toContain(token);
  });
});
