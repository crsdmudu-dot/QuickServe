/**
 * Tests for ProviderSortControls.
 *
 * Verifies: all sort options render, selecting a chip emits the correct key.
 */

import { render, screen, fireEvent } from '@testing-library/react-native';
import { PROVIDER_SORTS, type ProviderSortKey } from '@/constants/discovery';
import { ProviderSortControls } from '@/components/ui/provider-sort-controls';

describe('ProviderSortControls', () => {
  it('renders all sort option labels', () => {
    render(<ProviderSortControls value="highest_rated" onChange={jest.fn()} />);
    for (const sort of PROVIDER_SORTS) {
      expect(screen.getByText(sort.label)).toBeOnTheScreen();
    }
  });

  it('calls onChange with the correct sort key when a chip is pressed', () => {
    const onChange = jest.fn();
    render(<ProviderSortControls value="highest_rated" onChange={onChange} />);
    // Tap "Most jobs completed"
    fireEvent.press(screen.getByText('Most jobs completed'));
    expect(onChange).toHaveBeenCalledWith('most_jobs');
  });

  it('calls onChange with the correct key for each sort option', () => {
    const onChange = jest.fn();
    render(<ProviderSortControls value="highest_rated" onChange={onChange} />);
    const sortPairs: { label: string; id: ProviderSortKey }[] = [
      { label: 'Highest rated', id: 'highest_rated' },
      { label: 'Most jobs completed', id: 'most_jobs' },
      { label: 'Fastest response', id: 'fastest_response' },
      { label: 'Recently active', id: 'recently_active' },
      { label: 'Alphabetical', id: 'alphabetical' },
    ];
    for (const { label, id } of sortPairs) {
      fireEvent.press(screen.getByText(label));
      expect(onChange).toHaveBeenCalledWith(id);
    }
  });

  it('marks the currently selected sort as selected', () => {
    render(<ProviderSortControls value="alphabetical" onChange={jest.fn()} />);
    const button = screen.getByRole('button', { name: 'Alphabetical' });
    expect(button.props.accessibilityState?.selected).toBe(true);
  });

  it('marks non-selected sorts as not selected', () => {
    render(<ProviderSortControls value="alphabetical" onChange={jest.fn()} />);
    const button = screen.getByRole('button', { name: 'Highest rated' });
    expect(button.props.accessibilityState?.selected).toBe(false);
  });
});
