import { Linking, Text } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ErrorBoundary } from '@/components/error-boundary';
import { SUPPORT_EMAIL } from '@/lib/support';

// Mock monitoring so no real Sentry import runs in this test.
jest.mock('@/lib/monitoring', () => ({
  reportError: jest.fn(),
  initMonitoring: jest.fn(),
  _resetMonitoringForTest: jest.fn(),
}));

// Module-level flag: controls whether Bomb throws on its next render.
let shouldBombThrow = true;

function Bomb() {
  if (shouldBombThrow) throw new Error('Test explosion');
  return null;
}

describe('ErrorBoundary', () => {
  it('renders children normally when no error', () => {
    render(
      <ErrorBoundary>
        <Text>Hello world</Text>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Hello world')).toBeOnTheScreen();
  });

  it('renders the fallback when a child throws', () => {
    // Silence the console.error that ErrorBoundary + React itself emit for the thrown error.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      shouldBombThrow = true;
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>,
      );
      expect(screen.getByText('Something went wrong')).toBeOnTheScreen();
    } finally {
      spy.mockRestore();
    }
  });

  it('resets and re-renders children after pressing "Try again"', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      shouldBombThrow = true;
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>,
      );
      expect(screen.getByText('Something went wrong')).toBeOnTheScreen();

      // Let Bomb render without throwing on the retry pass.
      shouldBombThrow = false;
      fireEvent.press(screen.getByText('Try again'));

      expect(screen.queryByText('Something went wrong')).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  // The fallback replaces the whole screen, so "Try again" was the only way out of it. A user whose
  // retry keeps failing had no route to help at all.
  it('offers the support address alongside "Try again"', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      shouldBombThrow = true;
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>,
      );
      expect(screen.getByText('Try again')).toBeOnTheScreen();
      expect(screen.getByText(SUPPORT_EMAIL)).toBeOnTheScreen();
    } finally {
      spy.mockRestore();
    }
  });

  it('opens the bare support mailto from the fallback, carrying nothing about the error', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    try {
      shouldBombThrow = true;
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>,
      );
      fireEvent.press(screen.getByRole('link'));
      await waitFor(() => expect(openURL).toHaveBeenCalledTimes(1));
      const url = openURL.mock.calls[0][0] as string;
      expect(url).toBe('mailto:support@hiredcorp.co.ke');
      expect(url).not.toMatch(/Test explosion|componentStack|[?#&]/);
    } finally {
      openURL.mockRestore();
      spy.mockRestore();
    }
  });
});
