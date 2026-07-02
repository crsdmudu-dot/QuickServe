/**
 * Tests for SelectedAddressCard.
 *
 * Checks: address text is rendered, Change button fires onChange,
 * map Image appears when mapUrl is set, and is absent when mapUrl is absent/null.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { SelectedAddressCard } from '@/components/ui/selected-address-card';

describe('SelectedAddressCard', () => {
  const ADDRESS = '123 Main St, Dubai, UAE';
  const MAP_URL = 'https://maps.example.com/static?center=25.2,55.2&zoom=15';

  // ── 1. Renders the address text ──────────────────────────────────────────────

  it('renders the formatted address', () => {
    render(
      <SelectedAddressCard
        formattedAddress={ADDRESS}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText(ADDRESS)).toBeOnTheScreen();
  });

  // ── 2. Change button fires onChange ──────────────────────────────────────────

  it('fires onChange when Change is pressed', () => {
    const onChange = jest.fn();
    render(
      <SelectedAddressCard
        formattedAddress={ADDRESS}
        onChange={onChange}
      />,
    );
    fireEvent.press(screen.getByText('Change'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  // ── 3. Shows the map Image when mapUrl is a non-empty string ─────────────────

  it('renders a map Image when mapUrl is provided', () => {
    render(
      <SelectedAddressCard
        formattedAddress={ADDRESS}
        mapUrl={MAP_URL}
        onChange={jest.fn()}
      />,
    );
    const img = screen.getByTestId('selected-address-map');
    expect(img).toBeOnTheScreen();
    expect(img.props.source).toEqual({ uri: MAP_URL });
  });

  // ── 4. Does NOT show the map Image when mapUrl is absent ─────────────────────

  it('does not render a map Image when mapUrl is absent', () => {
    render(
      <SelectedAddressCard
        formattedAddress={ADDRESS}
        onChange={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('selected-address-map')).toBeNull();
  });

  // ── 5. Does NOT show the map Image when mapUrl is null ───────────────────────

  it('does not render a map Image when mapUrl is null', () => {
    render(
      <SelectedAddressCard
        formattedAddress={ADDRESS}
        mapUrl={null}
        onChange={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('selected-address-map')).toBeNull();
  });

  // ── 6. Does NOT show the map Image when mapUrl is an empty string ─────────────

  it('does not render a map Image when mapUrl is an empty string', () => {
    render(
      <SelectedAddressCard
        formattedAddress={ADDRESS}
        mapUrl=""
        onChange={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('selected-address-map')).toBeNull();
  });
});
