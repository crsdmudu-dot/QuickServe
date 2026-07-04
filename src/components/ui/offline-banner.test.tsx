/**
 * offline-banner.test.tsx
 *
 * Tests for the OfflineBanner component.
 * Mocks @react-native-community/netinfo so no native module is required.
 */

import { render, screen, act } from '@testing-library/react-native';

// Mock NetInfo before anything imports it
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
  addEventListener: jest.fn(() => () => {}),
}));

import NetInfo from '@react-native-community/netinfo';
import { OfflineBanner } from '@/components/ui/offline-banner';

const mockNetInfo = NetInfo as unknown as {
  fetch: jest.Mock;
  addEventListener: jest.Mock;
};

describe('OfflineBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: online
    mockNetInfo.fetch.mockResolvedValue({ isConnected: true });
    mockNetInfo.addEventListener.mockImplementation(() => () => {});
  });

  it('renders null (no offline-banner testID) when online', () => {
    render(<OfflineBanner />);
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('renders the offline-banner when offline (addEventListener emits false)', async () => {
    let capturedCallback: ((state: { isConnected: boolean | null }) => void) | undefined;

    mockNetInfo.fetch.mockResolvedValue({ isConnected: false });
    mockNetInfo.addEventListener.mockImplementation(
      (cb: (state: { isConnected: boolean | null }) => void) => {
        capturedCallback = cb;
        return () => {};
      },
    );

    render(<OfflineBanner />);

    await act(async () => {
      // Emit offline state through the event listener
      capturedCallback?.({ isConnected: false });
    });

    expect(screen.getByTestId('offline-banner')).toBeOnTheScreen();
  });

  it('shows offline text content when offline', async () => {
    let capturedCallback: ((state: { isConnected: boolean | null }) => void) | undefined;

    mockNetInfo.fetch.mockResolvedValue({ isConnected: false });
    mockNetInfo.addEventListener.mockImplementation(
      (cb: (state: { isConnected: boolean | null }) => void) => {
        capturedCallback = cb;
        return () => {};
      },
    );

    render(<OfflineBanner />);

    await act(async () => {
      capturedCallback?.({ isConnected: false });
    });

    expect(
      screen.getByText("You're offline — some data may be out of date."),
    ).toBeOnTheScreen();
  });
});
