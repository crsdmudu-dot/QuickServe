/**
 * Tests for SearchHistoryList and PopularSearches.
 *
 * SearchHistoryList: renders items as chips, clear fires, onSelect fires.
 * PopularSearches: renders POPULAR_SEARCHES chips, onSelect fires.
 */

import { render, screen, fireEvent } from '@testing-library/react-native';
import { POPULAR_SEARCHES } from '@/constants/discovery';
import { SearchHistoryList } from '@/components/ui/search-history-list';
import { PopularSearches } from '@/components/ui/popular-searches';

// ── SearchHistoryList ───────────────────────────────────────────────────────

describe('SearchHistoryList', () => {
  const ITEMS = ['Plumbing', 'House Cleaning', 'AC Repair'];

  it('renders nothing when items is empty', () => {
    const { toJSON } = render(
      <SearchHistoryList items={[]} onSelect={jest.fn()} onClear={jest.fn()} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders all recent search items', () => {
    render(<SearchHistoryList items={ITEMS} onSelect={jest.fn()} onClear={jest.fn()} />);
    expect(screen.getByText('Plumbing')).toBeOnTheScreen();
    expect(screen.getByText('House Cleaning')).toBeOnTheScreen();
    expect(screen.getByText('AC Repair')).toBeOnTheScreen();
  });

  it('shows "Recent searches" heading when items present', () => {
    render(<SearchHistoryList items={ITEMS} onSelect={jest.fn()} onClear={jest.fn()} />);
    expect(screen.getByText('Recent searches')).toBeOnTheScreen();
  });

  it('shows a Clear button', () => {
    render(<SearchHistoryList items={ITEMS} onSelect={jest.fn()} onClear={jest.fn()} />);
    expect(screen.getByText('Clear')).toBeOnTheScreen();
  });

  it('calls onClear when the Clear button is pressed', () => {
    const onClear = jest.fn();
    render(<SearchHistoryList items={ITEMS} onSelect={jest.fn()} onClear={onClear} />);
    fireEvent.press(screen.getByText('Clear'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect with the correct term when a chip is tapped', () => {
    const onSelect = jest.fn();
    render(<SearchHistoryList items={ITEMS} onSelect={onSelect} onClear={jest.fn()} />);
    fireEvent.press(screen.getByText('Plumbing'));
    expect(onSelect).toHaveBeenCalledWith('Plumbing');
  });

  it('calls onSelect with the correct term for any chip', () => {
    const onSelect = jest.fn();
    render(<SearchHistoryList items={ITEMS} onSelect={onSelect} onClear={jest.fn()} />);
    fireEvent.press(screen.getByText('AC Repair'));
    expect(onSelect).toHaveBeenCalledWith('AC Repair');
  });

  it('renders multiple chips (uses getAllByRole)', () => {
    render(<SearchHistoryList items={ITEMS} onSelect={jest.fn()} onClear={jest.fn()} />);
    // Each item chip + clear button = at least 4 buttons
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(ITEMS.length);
  });
});

// ── PopularSearches ─────────────────────────────────────────────────────────

describe('PopularSearches', () => {
  it('renders all POPULAR_SEARCHES terms', () => {
    render(<PopularSearches onSelect={jest.fn()} />);
    for (const term of POPULAR_SEARCHES) {
      expect(screen.getByText(term)).toBeOnTheScreen();
    }
  });

  it('renders the "Popular searches" heading', () => {
    render(<PopularSearches onSelect={jest.fn()} />);
    expect(screen.getByText('Popular searches')).toBeOnTheScreen();
  });

  it('calls onSelect with the correct term when a chip is tapped', () => {
    const onSelect = jest.fn();
    render(<PopularSearches onSelect={onSelect} />);
    fireEvent.press(screen.getByText('Cleaning'));
    expect(onSelect).toHaveBeenCalledWith('Cleaning');
  });

  it('calls onSelect with the correct term for multiple chips', () => {
    const onSelect = jest.fn();
    render(<PopularSearches onSelect={onSelect} />);
    fireEvent.press(screen.getByText('Massage'));
    expect(onSelect).toHaveBeenCalledWith('Massage');
  });

  it('renders all chips using getAllByRole', () => {
    render(<PopularSearches onSelect={jest.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(POPULAR_SEARCHES.length);
  });
});
