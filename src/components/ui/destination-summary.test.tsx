/**
 * Tests for DestinationSummary.
 *
 * Verifies that a structured DestinationInput renders the label as a heading
 * and each detail line as a secondary caption, and that old/minimal bookings
 * (address only, no structured fields) fall back gracefully with no detail lines.
 */

import { render, screen } from '@testing-library/react-native';
import { DestinationSummary } from '@/components/ui/destination-summary';
import type { DestinationInput } from '@/lib/address-format';

describe('DestinationSummary', () => {
  // ── 1. Structured input: primary = label + all detail lines ──────────────────

  it('renders the address_label as primary and all non-empty structured lines', () => {
    const input: DestinationInput = {
      address: '123 Main St, Dubai, UAE',
      address_label: 'Home',
      building_name: 'Green Tower',
      floor: '4',
      door_number: 'Apt 9',
      landmark: 'Near the park',
      access_notes: 'Ring bell twice',
    };

    render(<DestinationSummary input={input} />);

    // Primary heading = address_label
    expect(screen.getByText('Home')).toBeOnTheScreen();

    // Detail lines (formatDestination format: "Prefix: value")
    expect(screen.getByText('Building: Green Tower')).toBeOnTheScreen();
    expect(screen.getByText('Floor: 4')).toBeOnTheScreen();
    expect(screen.getByText('Door/Unit: Apt 9')).toBeOnTheScreen();
    expect(screen.getByText('Landmark: Near the park')).toBeOnTheScreen();
    expect(screen.getByText('Access: Ring bell twice')).toBeOnTheScreen();
  });

  // ── 2. Fallback (address only): primary = address, no detail lines ────────────

  it('falls back to address as primary and renders no detail lines when structured fields are absent', () => {
    const input: DestinationInput = {
      address: '456 Elm St, Abu Dhabi, UAE',
    };

    render(<DestinationSummary input={input} />);

    // Primary heading = raw address
    expect(screen.getByText('456 Elm St, Abu Dhabi, UAE')).toBeOnTheScreen();

    // None of the detail prefixes should appear.
    expect(screen.queryByText(/^Building:/)).toBeNull();
    expect(screen.queryByText(/^Floor:/)).toBeNull();
    expect(screen.queryByText(/^Door\/Unit:/)).toBeNull();
    expect(screen.queryByText(/^Landmark:/)).toBeNull();
    expect(screen.queryByText(/^Access:/)).toBeNull();
  });

  // ── 3. Partial structured fields: only non-empty lines appear ─────────────────

  it('only renders detail lines for fields that have values', () => {
    const input: DestinationInput = {
      address: '789 Oak Ave, Sharjah, UAE',
      address_label: 'Office',
      building_name: 'Business Hub',
      floor: '',        // empty — should NOT appear
      door_number: 'Suite 301',
      landmark: null,   // null — should NOT appear
      access_notes: undefined, // undefined — should NOT appear
    };

    render(<DestinationSummary input={input} />);

    expect(screen.getByText('Office')).toBeOnTheScreen();
    expect(screen.getByText('Building: Business Hub')).toBeOnTheScreen();
    expect(screen.getByText('Door/Unit: Suite 301')).toBeOnTheScreen();

    expect(screen.queryByText(/^Floor:/)).toBeNull();
    expect(screen.queryByText(/^Landmark:/)).toBeNull();
    expect(screen.queryByText(/^Access:/)).toBeNull();
  });
});
