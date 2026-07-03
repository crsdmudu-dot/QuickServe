/**
 * Tests for SavedAddressCard.
 *
 * SavedAddressCard is a pure presentational component — no mocks needed.
 * Tests verify title resolution, address formatting, default badge, and
 * conditional action affordances.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { SavedAddressCard } from '@/components/ui/saved-address-card';
import { type SavedAddress } from '@/lib/saved-addresses';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A home address with nickname, not default, no last_used_at */
const BASE: SavedAddress = {
  id: 'addr-1',
  customer_id: 'cust-1',
  label_type: 'home',
  nickname: 'My Home',
  address: '45 Palm Avenue, Dubai, UAE',
  address_label: 'Home Address',
  latitude: 25.2048,
  longitude: 55.2708,
  building_name: 'Palm Tower',
  floor: '3',
  door_number: '301',
  landmark: 'Near the mall',
  access_notes: null,
  is_default: false,
  last_used_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const DEFAULT_ADDR: SavedAddress = {
  ...BASE,
  id: 'addr-2',
  is_default: true,
};

const NO_NICKNAME: SavedAddress = {
  ...BASE,
  id: 'addr-3',
  nickname: null,
  label_type: 'work',
};

const WITH_LAST_USED: SavedAddress = {
  ...BASE,
  id: 'addr-4',
  last_used_at: '2026-05-15T10:00:00Z',
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('SavedAddressCard', () => {
  // ── 1. Title resolution ─────────────────────────────────────────────────────

  it('renders the nickname as title when nickname is non-empty', () => {
    render(<SavedAddressCard address={BASE} />);
    expect(screen.getByText('My Home')).toBeOnTheScreen();
  });

  it('renders the label text as title when nickname is null', () => {
    render(<SavedAddressCard address={NO_NICKNAME} />);
    // label_type is 'work' → title should be 'Work'; it appears twice (header label + title),
    // so we just assert at least one instance is on screen.
    expect(screen.getAllByText('Work').length).toBeGreaterThanOrEqual(1);
  });

  // ── 2. Address block (formatDestination) ────────────────────────────────────

  it('renders the formatted primary address text', () => {
    render(<SavedAddressCard address={BASE} />);
    // address_label is set → primary is the label
    expect(screen.getByText('Home Address')).toBeOnTheScreen();
  });

  it('falls back to address text when address_label is null', () => {
    const a: SavedAddress = { ...BASE, address_label: null };
    render(<SavedAddressCard address={a} />);
    expect(screen.getByText('45 Palm Avenue, Dubai, UAE')).toBeOnTheScreen();
  });

  // ── 3. Default badge ────────────────────────────────────────────────────────

  it('renders the Default badge when is_default is true', () => {
    render(<SavedAddressCard address={DEFAULT_ADDR} />);
    expect(screen.getByTestId('default-badge')).toBeOnTheScreen();
  });

  it('does NOT render the Default badge when is_default is false', () => {
    render(<SavedAddressCard address={BASE} />);
    expect(screen.queryByTestId('default-badge')).toBeNull();
  });

  // ── 4. Last-used caption ────────────────────────────────────────────────────

  it('renders a "Last used" caption when last_used_at is set', () => {
    render(<SavedAddressCard address={WITH_LAST_USED} />);
    expect(screen.getByText(/Last used/)).toBeOnTheScreen();
  });

  it('omits the "Last used" caption when last_used_at is null', () => {
    render(<SavedAddressCard address={BASE} />);
    expect(screen.queryByText(/Last used/)).toBeNull();
  });

  // ── 5. onSelect ─────────────────────────────────────────────────────────────

  it('renders the select target and fires onSelect when pressed', () => {
    const onSelect = jest.fn();
    render(<SavedAddressCard address={BASE} onSelect={onSelect} />);
    fireEvent.press(screen.getByTestId('saved-address-select'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('does NOT render a select target when onSelect is not provided', () => {
    render(<SavedAddressCard address={BASE} />);
    expect(screen.queryByTestId('saved-address-select')).toBeNull();
  });

  // ── 6. Action buttons — all handlers provided ────────────────────────────────

  it('renders Edit, Delete and "Set default" when all handlers are passed (non-default addr)', () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const onSetDefault = jest.fn();

    render(
      <SavedAddressCard
        address={BASE}
        onEdit={onEdit}
        onDelete={onDelete}
        onSetDefault={onSetDefault}
      />,
    );

    expect(screen.getByText('Edit')).toBeOnTheScreen();
    expect(screen.getByText('Delete')).toBeOnTheScreen();
    expect(screen.getByText('Set default')).toBeOnTheScreen();
  });

  it('fires onEdit when Edit is pressed', () => {
    const onEdit = jest.fn();
    render(<SavedAddressCard address={BASE} onEdit={onEdit} />);
    fireEvent.press(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('fires onDelete when Delete is pressed', () => {
    const onDelete = jest.fn();
    render(<SavedAddressCard address={BASE} onDelete={onDelete} />);
    fireEvent.press(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('fires onSetDefault when "Set default" is pressed', () => {
    const onSetDefault = jest.fn();
    render(<SavedAddressCard address={BASE} onSetDefault={onSetDefault} />);
    fireEvent.press(screen.getByText('Set default'));
    expect(onSetDefault).toHaveBeenCalledTimes(1);
  });

  // ── 7. "Set default" hidden when already default ────────────────────────────

  it('hides "Set default" when the address is already the default', () => {
    const onSetDefault = jest.fn();
    render(
      <SavedAddressCard
        address={DEFAULT_ADDR}
        onSetDefault={onSetDefault}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
      />,
    );
    expect(screen.queryByText('Set default')).toBeNull();
    // Edit and Delete are still there
    expect(screen.getByText('Edit')).toBeOnTheScreen();
    expect(screen.getByText('Delete')).toBeOnTheScreen();
  });

  // ── 8. No action buttons when no handlers passed ─────────────────────────────

  it('renders no action buttons when no handlers are provided', () => {
    render(<SavedAddressCard address={BASE} />);
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Delete')).toBeNull();
    expect(screen.queryByText('Set default')).toBeNull();
  });
});
