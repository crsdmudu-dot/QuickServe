import { Platform } from 'react-native';
import { buildDirectionsUrl } from './maps';

describe('buildDirectionsUrl', () => {
  const original = Platform.OS;
  afterEach(() => { (Platform as any).OS = original; });

  test('iOS uses https Apple Maps', () => {
    (Platform as any).OS = 'ios';
    expect(buildDirectionsUrl(1.23, 4.56)).toBe('https://maps.apple.com/?daddr=1.23,4.56');
  });

  test('Android uses google.navigation (unchanged)', () => {
    (Platform as any).OS = 'android';
    expect(buildDirectionsUrl(1.23, 4.56)).toBe('google.navigation:q=1.23,4.56');
  });

  test('other platforms use the Google Maps directions URL', () => {
    (Platform as any).OS = 'web';
    expect(buildDirectionsUrl(1.23, 4.56)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=1.23,4.56',
    );
  });
});
