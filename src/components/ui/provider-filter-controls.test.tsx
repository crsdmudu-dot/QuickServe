/**
 * Tests for ProviderFilterControls.
 *
 * Verifies: toggle chips render, toggling one keeps others unchanged (combinable),
 * minRating selector emits the correct value.
 */

import { render, screen, fireEvent } from '@testing-library/react-native';
import type { ProviderFilters } from '@/constants/discovery';
import { ProviderFilterControls } from '@/components/ui/provider-filter-controls';

const EMPTY_FILTERS: ProviderFilters = {};

describe('ProviderFilterControls', () => {
  it('renders all boolean filter chips, with no "Verified only" chip (no badges at launch)', () => {
    render(<ProviderFilterControls value={EMPTY_FILTERS} onChange={jest.fn()} />);
    expect(screen.queryByText('Verified only')).toBeNull();
    expect(screen.getByText('Available now')).toBeOnTheScreen();
    expect(screen.getByText('Favorites')).toBeOnTheScreen();
    expect(screen.getByText('Recently used')).toBeOnTheScreen();
  });

  it('renders the minRating options', () => {
    render(<ProviderFilterControls value={EMPTY_FILTERS} onChange={jest.fn()} />);
    expect(screen.getByText('Any')).toBeOnTheScreen();
    expect(screen.getByText('3★')).toBeOnTheScreen();
    expect(screen.getByText('4.5★')).toBeOnTheScreen();
    expect(screen.getByText('5★')).toBeOnTheScreen();
  });

  it('toggling recentlyUsedOnly emits updated filters with only that key changed', () => {
    const onChange = jest.fn();
    const initial: ProviderFilters = { availableOnly: true };
    render(<ProviderFilterControls value={initial} onChange={onChange} />);
    fireEvent.press(screen.getByText('Recently used'));
    expect(onChange).toHaveBeenCalledWith({ availableOnly: true, recentlyUsedOnly: true });
  });

  it('toggling availableOnly from true emits false for that key only', () => {
    const onChange = jest.fn();
    const initial: ProviderFilters = { availableOnly: true, verifiedOnly: true };
    render(<ProviderFilterControls value={initial} onChange={onChange} />);
    fireEvent.press(screen.getByText('Available now'));
    expect(onChange).toHaveBeenCalledWith({ availableOnly: false, verifiedOnly: true });
  });

  it('toggling favoritesOnly emits updated filters with others unchanged', () => {
    const onChange = jest.fn();
    const initial: ProviderFilters = { verifiedOnly: true, availableOnly: false };
    render(<ProviderFilterControls value={initial} onChange={onChange} />);
    fireEvent.press(screen.getByText('Favorites'));
    expect(onChange).toHaveBeenCalledWith({
      verifiedOnly: true,
      availableOnly: false,
      favoritesOnly: true,
    });
  });

  it('selecting a minRating emits the correct numeric value', () => {
    const onChange = jest.fn();
    render(<ProviderFilterControls value={EMPTY_FILTERS} onChange={onChange} />);
    fireEvent.press(screen.getByText('4★'));
    expect(onChange).toHaveBeenCalledWith({ minRating: 4 });
  });

  it('selecting "Any" rating emits minRating: undefined', () => {
    const onChange = jest.fn();
    const initial: ProviderFilters = { minRating: 4 };
    render(<ProviderFilterControls value={initial} onChange={onChange} />);
    fireEvent.press(screen.getByText('Any'));
    expect(onChange).toHaveBeenCalledWith({ minRating: undefined });
  });

  it('marks availableOnly chip as selected when active', () => {
    render(<ProviderFilterControls value={{ availableOnly: true }} onChange={jest.fn()} />);
    const button = screen.getByRole('button', { name: 'Available now' });
    expect(button.props.accessibilityState?.selected).toBe(true);
  });

  it('marks availableOnly chip as not selected when inactive', () => {
    render(<ProviderFilterControls value={EMPTY_FILTERS} onChange={jest.fn()} />);
    const button = screen.getByRole('button', { name: 'Available now' });
    expect(button.props.accessibilityState?.selected).toBe(false);
  });
});
