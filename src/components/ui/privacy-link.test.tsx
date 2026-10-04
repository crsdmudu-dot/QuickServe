// privacy-link.test.tsx — the in-app link to the Privacy Policy on the website (D-12).
import { Linking, StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { PrivacyLink } from '@/components/ui/privacy-link';

const savedUrl = process.env.EXPO_PUBLIC_WEBSITE_URL;
let openURL: jest.SpyInstance;

beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
  // In the jest-expo environment Linking.openURL is already a mock, so spyOn returns that same mock and its call
  // count would carry over from the previous test without this.
  openURL.mockClear();
});
afterEach(() => {
  jest.restoreAllMocks();
  if (savedUrl === undefined) delete process.env.EXPO_PUBLIC_WEBSITE_URL;
  else process.env.EXPO_PUBLIC_WEBSITE_URL = savedUrl;
});

describe('PrivacyLink', () => {
  it('is not shown while the website address is not configured (never a broken link)', () => {
    delete process.env.EXPO_PUBLIC_WEBSITE_URL;
    render(<PrivacyLink />);
    expect(screen.queryByText('Privacy Policy')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('is not shown for an address that is not a plain https origin', () => {
    process.env.EXPO_PUBLIC_WEBSITE_URL = 'http://kwikserve.example';
    render(<PrivacyLink />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('opens the Privacy Policy page on the website', async () => {
    process.env.EXPO_PUBLIC_WEBSITE_URL = 'https://kwikserve.co.ke';
    render(<PrivacyLink />);
    fireEvent.press(screen.getByRole('link', { name: 'Privacy Policy' }));
    await waitFor(() => expect(openURL).toHaveBeenCalledTimes(1));
    expect(openURL).toHaveBeenCalledWith('https://kwikserve.co.ke/privacy/');
  });

  it('accepts a caller-supplied label and test id', () => {
    process.env.EXPO_PUBLIC_WEBSITE_URL = 'https://kwikserve.example';
    render(<PrivacyLink label="Read the Privacy Policy" testID="custom-privacy" />);
    expect(screen.getByRole('link', { name: 'Read the Privacy Policy' })).toBeOnTheScreen();
    expect(screen.getByTestId('custom-privacy')).toBeOnTheScreen();
  });

  it('survives a rejected openURL without throwing', async () => {
    process.env.EXPO_PUBLIC_WEBSITE_URL = 'https://kwikserve.example';
    openURL.mockRejectedValue(new Error('no browser'));
    render(<PrivacyLink />);
    expect(() => fireEvent.press(screen.getByRole('link'))).not.toThrow();
    await waitFor(() => expect(openURL).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Privacy Policy')).toBeOnTheScreen();
  });

  it('tells screen readers it opens the website, and gives at least the 44pt touch target', () => {
    process.env.EXPO_PUBLIC_WEBSITE_URL = 'https://kwikserve.example';
    render(<PrivacyLink />);
    const link = screen.getByRole('link');
    expect(link.props.accessibilityHint).toBe('Opens the KwikServe website');
    const style = StyleSheet.flatten(link.props.style) as { minHeight?: number };
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
  });
});
