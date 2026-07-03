/**
 * Tests for SavedAddressPicker.
 *
 * Mocks @/lib/saved-addresses so no Supabase calls are made.
 * Uses waitFor to handle the async getMySavedAddresses resolution inside
 * the component's useEffect — mirrors the tracking-map.test.tsx pattern.
 */

// ── Mocks (must appear before imports) ────────────────────────────────────────

jest.mock('@/lib/saved-addresses', () => ({
  getMySavedAddresses: jest.fn(),
}));

// Prevent Skeleton shimmer animation from running in tests.
jest.mock('@/constants/motion', () => ({
  prefersReducedMotion: jest.fn().mockResolvedValue(true),
  Durations: { fast: 150, base: 250, slow: 400 },
  Easings: {},
  Springs: {
    gentle: { damping: 18, stiffness: 160 },
    snappy: { damping: 14, stiffness: 220 },
  },
}));

// ── Imports ────────────────────────────────────────────────────────────────────

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SavedAddressPicker } from '@/components/ui/saved-address-picker';
import { getMySavedAddresses } from '@/lib/saved-addresses';
import { type SavedAddress } from '@/lib/saved-addresses';

// ── Typed mock helper ─────────────────────────────────────────────────────────

const mockGetMySavedAddresses = getMySavedAddresses as jest.MockedFunction<
  typeof getMySavedAddresses
>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ADDR_1: SavedAddress = {
  id: 'addr-1',
  customer_id: 'cust-1',
  label_type: 'home',
  nickname: 'Home Sweet Home',
  address: '12 Marina Walk, Dubai, UAE',
  address_label: 'Marina Walk',
  latitude: 25.08,
  longitude: 55.14,
  building_name: null,
  floor: null,
  door_number: null,
  landmark: null,
  access_notes: null,
  is_default: true,
  last_used_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const ADDR_2: SavedAddress = {
  id: 'addr-2',
  customer_id: 'cust-1',
  label_type: 'work',
  nickname: 'Office',
  address: 'DIFC Gate Building, Dubai, UAE',
  address_label: 'DIFC Gate',
  latitude: 25.21,
  longitude: 55.28,
  building_name: null,
  floor: null,
  door_number: null,
  landmark: null,
  access_notes: null,
  is_default: false,
  last_used_at: null,
  created_at: '2026-01-02T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('SavedAddressPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── 1. Non-empty list: renders both addresses ─────────────────────────────

  it('renders all address cards after the async load resolves', async () => {
    mockGetMySavedAddresses.mockResolvedValue([ADDR_1, ADDR_2]);

    render(<SavedAddressPicker onSelect={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Home Sweet Home')).toBeOnTheScreen();
      expect(screen.getByText('Office')).toBeOnTheScreen();
    });
  });

  // ── 2. Non-empty list: tapping a card calls onSelect with that address ────

  it('calls onSelect with the correct address when a card is tapped', async () => {
    mockGetMySavedAddresses.mockResolvedValue([ADDR_1, ADDR_2]);

    const onSelect = jest.fn();
    render(<SavedAddressPicker onSelect={onSelect} />);

    await waitFor(() => {
      expect(screen.getByText('Home Sweet Home')).toBeOnTheScreen();
    });

    // The first address card is ADDR_1 (default first from lib ordering).
    // Each card is wrapped in a Pressable with testID="saved-address-select" when onSelect is wired.
    const selectTargets = screen.getAllByTestId('saved-address-select');
    fireEvent.press(selectTargets[0]);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(ADDR_1);
  });

  // ── 3. Tapping the second card calls onSelect with the second address ─────

  it('calls onSelect with the second address when the second card is tapped', async () => {
    mockGetMySavedAddresses.mockResolvedValue([ADDR_1, ADDR_2]);

    const onSelect = jest.fn();
    render(<SavedAddressPicker onSelect={onSelect} />);

    await waitFor(() => {
      expect(screen.getByText('Office')).toBeOnTheScreen();
    });

    const selectTargets = screen.getAllByTestId('saved-address-select');
    fireEvent.press(selectTargets[1]);

    expect(onSelect).toHaveBeenCalledWith(ADDR_2);
  });

  // ── 4. Empty list: renders EmptyState title ───────────────────────────────

  it('renders the empty-state title when the list is empty', async () => {
    mockGetMySavedAddresses.mockResolvedValue([]);

    render(<SavedAddressPicker onSelect={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('No saved addresses yet')).toBeOnTheScreen();
    });
  });

  // ── 5. onUseNew provided — "Use a new address" button renders + fires ─────

  it('renders and fires "Use a new address" when onUseNew is provided (non-empty list)', async () => {
    mockGetMySavedAddresses.mockResolvedValue([ADDR_1]);

    const onUseNew = jest.fn();
    render(<SavedAddressPicker onSelect={jest.fn()} onUseNew={onUseNew} />);

    await waitFor(() => {
      expect(screen.getByText('Use a new address')).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByText('Use a new address'));
    expect(onUseNew).toHaveBeenCalledTimes(1);
  });

  it('renders the "Use a new address" button in the empty state when onUseNew is provided', async () => {
    mockGetMySavedAddresses.mockResolvedValue([]);

    const onUseNew = jest.fn();
    render(<SavedAddressPicker onSelect={jest.fn()} onUseNew={onUseNew} />);

    await waitFor(() => {
      expect(screen.getByText('Use a new address')).toBeOnTheScreen();
    });

    fireEvent.press(screen.getByText('Use a new address'));
    expect(onUseNew).toHaveBeenCalledTimes(1);
  });

  // ── 6. onUseNew not provided — button absent ───────────────────────────────

  it('does NOT render "Use a new address" when onUseNew is not provided', async () => {
    mockGetMySavedAddresses.mockResolvedValue([ADDR_1]);

    render(<SavedAddressPicker onSelect={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Home Sweet Home')).toBeOnTheScreen();
    });

    expect(screen.queryByText('Use a new address')).toBeNull();
  });
});
