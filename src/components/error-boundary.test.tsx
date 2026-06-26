import { Text } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ErrorBoundary } from '@/components/error-boundary';

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
});
