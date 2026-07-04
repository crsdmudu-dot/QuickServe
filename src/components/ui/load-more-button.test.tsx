/**
 * load-more-button.test.tsx
 *
 * Tests for the LoadMoreButton component.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { LoadMoreButton } from '@/components/ui/load-more-button';

describe('LoadMoreButton', () => {
  it('renders nothing when hasMore is false', () => {
    const { toJSON } = render(
      <LoadMoreButton onPress={jest.fn()} loading={false} hasMore={false} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders the "Load more" button when hasMore is true and not loading', () => {
    render(
      <LoadMoreButton onPress={jest.fn()} loading={false} hasMore={true} />,
    );
    expect(screen.getByText('Load more')).toBeOnTheScreen();
  });

  it('renders a spinner and no button text when loading is true', () => {
    render(
      <LoadMoreButton onPress={jest.fn()} loading={true} hasMore={true} />,
    );
    // When loading, shows spinner (no "Load more" text)
    expect(screen.queryByText('Load more')).toBeNull();
  });

  it('calls onPress when the button is pressed', () => {
    const onPress = jest.fn();
    render(
      <LoadMoreButton onPress={onPress} loading={false} hasMore={true} />,
    );
    fireEvent.press(screen.getByText('Load more'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('the container has testID="load-more" when hasMore is true', () => {
    render(
      <LoadMoreButton onPress={jest.fn()} loading={false} hasMore={true} />,
    );
    expect(screen.getByTestId('load-more')).toBeOnTheScreen();
  });
});
