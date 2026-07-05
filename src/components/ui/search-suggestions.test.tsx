/**
 * Tests for SearchSuggestions.
 *
 * searchSuggestions is mocked so tests are deterministic (don't depend on SERVICES data).
 */

import { render, screen, fireEvent } from '@testing-library/react-native';

// Mock lib/search so we control what searchSuggestions returns
jest.mock('@/lib/search', () => ({
  searchSuggestions: jest.fn((query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    if (q === 'clean') return ['House Cleaning', 'Pest Control'];
    if (q === 'xyz_no_match') return [];
    return ['House Cleaning'];
  }),
}));

import { SearchSuggestions } from '@/components/ui/search-suggestions';

describe('SearchSuggestions', () => {
  it('renders nothing when query is empty', () => {
    const { toJSON } = render(<SearchSuggestions query="" onSelect={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing when query is whitespace only', () => {
    const { toJSON } = render(<SearchSuggestions query="   " onSelect={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing when there are no matching suggestions', () => {
    const { toJSON } = render(
      <SearchSuggestions query="xyz_no_match" onSelect={jest.fn()} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders suggestions for a matching query', () => {
    render(<SearchSuggestions query="clean" onSelect={jest.fn()} />);
    expect(screen.getByText('House Cleaning')).toBeOnTheScreen();
    expect(screen.getByText('Pest Control')).toBeOnTheScreen();
  });

  it('calls onSelect with the tapped suggestion', () => {
    const onSelect = jest.fn();
    render(<SearchSuggestions query="clean" onSelect={onSelect} />);
    fireEvent.press(screen.getByText('House Cleaning'));
    expect(onSelect).toHaveBeenCalledWith('House Cleaning');
  });

  it('calls onSelect with the correct term for the second suggestion', () => {
    const onSelect = jest.fn();
    render(<SearchSuggestions query="clean" onSelect={onSelect} />);
    fireEvent.press(screen.getByText('Pest Control'));
    expect(onSelect).toHaveBeenCalledWith('Pest Control');
  });

  it('renders multiple suggestion rows for a broad query', () => {
    render(<SearchSuggestions query="clean" onSelect={jest.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });
});
