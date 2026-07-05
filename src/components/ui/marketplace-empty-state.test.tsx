/**
 * Tests for MarketplaceEmptyState.
 *
 * Verifies that each variant renders its expected copy, and that the action
 * button fires onAction when provided.
 */

import { render, screen, fireEvent } from '@testing-library/react-native';
import { MarketplaceEmptyState } from '@/components/ui/marketplace-empty-state';

describe('MarketplaceEmptyState', () => {
  it('renders search-empty variant copy', () => {
    render(<MarketplaceEmptyState variant="search-empty" />);
    expect(screen.getByText('Start your search')).toBeOnTheScreen();
    expect(screen.getByText(/Type a service name/)).toBeOnTheScreen();
  });

  it('renders no-results variant copy', () => {
    render(<MarketplaceEmptyState variant="no-results" />);
    expect(screen.getByText('No results found')).toBeOnTheScreen();
    expect(screen.getByText(/couldn't find/i)).toBeOnTheScreen();
  });

  it('renders no-favorites variant copy', () => {
    render(<MarketplaceEmptyState variant="no-favorites" />);
    expect(screen.getByText('No favorites yet')).toBeOnTheScreen();
    expect(screen.getByText(/Tap the heart/i)).toBeOnTheScreen();
  });

  it('renders no-providers variant copy', () => {
    render(<MarketplaceEmptyState variant="no-providers" />);
    expect(screen.getByText('No providers available')).toBeOnTheScreen();
    expect(screen.getByText(/no providers in this category/i)).toBeOnTheScreen();
  });

  it('renders the action button when actionLabel and onAction are provided', () => {
    render(
      <MarketplaceEmptyState
        variant="no-results"
        actionLabel="Try again"
        onAction={jest.fn()}
      />,
    );
    expect(screen.getByText('Try again')).toBeOnTheScreen();
  });

  it('fires onAction when the action button is pressed', () => {
    const onAction = jest.fn();
    render(
      <MarketplaceEmptyState
        variant="no-favorites"
        actionLabel="Browse providers"
        onAction={onAction}
      />,
    );
    fireEvent.press(screen.getByText('Browse providers'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('does NOT render an action button when actionLabel is omitted', () => {
    render(<MarketplaceEmptyState variant="search-empty" onAction={jest.fn()} />);
    // No button should be visible — action requires BOTH actionLabel and onAction
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does NOT render an action button when onAction is omitted', () => {
    render(<MarketplaceEmptyState variant="no-providers" actionLabel="Try again" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
