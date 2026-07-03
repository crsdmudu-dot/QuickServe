/**
 * Tests for src/app/saved-addresses.tsx — Manage Saved Addresses screen.
 *
 * Mocks: @/lib/saved-addresses (CRUD/RPC fns are jest.fns; pure mappers use
 * requireActual so real mapping runs), expo-router, @/lib/places (so
 * AddressSearch never hits the network).
 */

// ── expo-router ──────────────────────────────────────────────────────────────
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

// ── @/lib/places — keep AddressSearch offline ────────────────────────────────
jest.mock('@/lib/places', () => ({
  searchPlaces: jest.fn().mockResolvedValue([]),
  getPlaceDetails: jest.fn().mockResolvedValue(null),
}));

// ── @/lib/saved-addresses — CRUD/RPC as jest.fns; pure mappers inlined ───────
// We do NOT use jest.requireActual because that pulls in supabase.ts (which
// requires env vars at module load time and throws in the test environment).
// Instead, we provide the pure mapping functions inline — they have no deps.
const mockGetMySavedAddresses = jest.fn();
const mockCreateSavedAddress = jest.fn();
const mockUpdateSavedAddress = jest.fn();
const mockDeleteSavedAddress = jest.fn();
const mockSetDefaultSavedAddress = jest.fn();
const mockTouchSavedAddress = jest.fn();

jest.mock('@/lib/saved-addresses', () => {
  return {
    getMySavedAddresses: (...args: unknown[]) => mockGetMySavedAddresses(...args),
    createSavedAddress: (...args: unknown[]) => mockCreateSavedAddress(...args),
    updateSavedAddress: (...args: unknown[]) => mockUpdateSavedAddress(...args),
    deleteSavedAddress: (...args: unknown[]) => mockDeleteSavedAddress(...args),
    setDefaultSavedAddress: (...args: unknown[]) => mockSetDefaultSavedAddress(...args),
    touchSavedAddress: (...args: unknown[]) => mockTouchSavedAddress(...args),
    // Pure mapper — inlined to avoid loading supabase.ts
    draftToSavedAddressInput: (
      draft: {
        address: string; address_label: string; latitude: number | null; longitude: number | null;
        building_name: string; floor: string; door_number: string; landmark: string; access_notes: string;
      },
      meta: { label_type?: string; nickname?: string | null; is_default?: boolean },
    ) => ({
      address: draft.address,
      address_label: draft.address_label !== '' ? draft.address_label : null,
      latitude: draft.latitude,
      longitude: draft.longitude,
      building_name: draft.building_name !== '' ? draft.building_name : null,
      floor: draft.floor !== '' ? draft.floor : null,
      door_number: draft.door_number !== '' ? draft.door_number : null,
      landmark: draft.landmark !== '' ? draft.landmark : null,
      access_notes: draft.access_notes !== '' ? draft.access_notes : null,
      nickname: (meta.nickname ?? '') !== '' ? meta.nickname : null,
      label_type: meta.label_type ?? 'other',
      is_default: meta.is_default ?? false,
    }),
    // savedAddressToDraftLocation — not needed by the screen under test
    savedAddressToDraftLocation: jest.fn(),
  };
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

import type { SavedAddress } from '@/lib/saved-addresses';

const FIXTURE_HOME: SavedAddress = {
  id: 'addr-home-1',
  customer_id: 'cust-1',
  label_type: 'home',
  nickname: 'My House',
  address: '10 Riverside Lane, Nairobi',
  address_label: 'Riverside Lane',
  latitude: -1.28,
  longitude: 36.82,
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

const FIXTURE_WORK: SavedAddress = {
  id: 'addr-work-2',
  customer_id: 'cust-1',
  label_type: 'work',
  nickname: 'Office',
  address: '5 Business Park, Westlands',
  address_label: 'Business Park',
  latitude: -1.27,
  longitude: 36.81,
  building_name: 'Westlands Tower',
  floor: '4',
  door_number: '401',
  landmark: null,
  access_notes: null,
  is_default: false,
  last_used_at: null,
  created_at: '2026-01-02T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
};

// ── Imports (AFTER all mocks) ─────────────────────────────────────────────────

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SavedAddressesScreen from '@/app/saved-addresses';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Default: return both fixtures; individual tests can override
  mockGetMySavedAddresses.mockResolvedValue([FIXTURE_HOME, FIXTURE_WORK]);
  mockCreateSavedAddress.mockResolvedValue({ ok: true, id: 'new-addr-3' });
  mockUpdateSavedAddress.mockResolvedValue({ ok: true });
  mockDeleteSavedAddress.mockResolvedValue({ ok: true });
  mockSetDefaultSavedAddress.mockResolvedValue({ ok: true });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SavedAddressesScreen', () => {
  it('renders both fixture address rows after loading', async () => {
    render(<SavedAddressesScreen />);

    // Both nickname texts should appear after the async load resolves
    await waitFor(() => {
      expect(screen.getByText('My House')).toBeOnTheScreen();
      expect(screen.getByText('Office')).toBeOnTheScreen();
    });

    // The address_label (primary display text) should also be visible
    // formatDestination uses address_label as primary when set
    expect(screen.getByText('Riverside Lane')).toBeOnTheScreen();
    expect(screen.getByText('Business Park')).toBeOnTheScreen();
  });

  it('calls setDefaultSavedAddress with the correct id when "Set default" is pressed', async () => {
    render(<SavedAddressesScreen />);

    await waitFor(() => screen.getByText('Office'));

    // FIXTURE_WORK is not default, so the "Set default" button should appear for it
    fireEvent.press(screen.getByText('Set default'));
    expect(mockSetDefaultSavedAddress).toHaveBeenCalledWith('addr-work-2');
  });

  it('shows inline delete confirmation and calls deleteSavedAddress on confirm', async () => {
    // Use only one fixture to avoid ambiguity when counting Delete buttons
    mockGetMySavedAddresses.mockResolvedValue([FIXTURE_HOME]);
    render(<SavedAddressesScreen />);
    await waitFor(() => screen.getByText('My House'));

    // Press the card's Delete button — only one in the list
    fireEvent.press(screen.getByText('Delete'));

    // Inline confirmation should appear
    expect(screen.getByText('Delete this address?')).toBeOnTheScreen();

    // Now there are two "Delete" texts: the card button and the confirm button.
    // The confirm button is the second one (index 1).
    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.press(deleteButtons[1]);

    await waitFor(() => expect(mockDeleteSavedAddress).toHaveBeenCalledWith('addr-home-1'));
  });

  it('calls createSavedAddress with the manual address text on Add (manual, no default)', async () => {
    render(<SavedAddressesScreen />);
    await waitFor(() => screen.getByText('My House'));

    // Open the add form
    fireEvent.press(screen.getByText('Add address'));

    // Switch to manual entry
    fireEvent.press(screen.getByText('Enter address manually'));

    // Type an address
    fireEvent.changeText(
      screen.getByPlaceholderText('123 Main St, City'),
      'New Test Address, Nairobi',
    );

    // Press Save
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => expect(mockCreateSavedAddress).toHaveBeenCalled());

    // Verify the saved input carries the typed address
    const calledInput = mockCreateSavedAddress.mock.calls[0][0] as { address: string };
    expect(calledInput.address).toBe('New Test Address, Nairobi');

    // Default toggle was not pressed — setDefaultSavedAddress should NOT be called
    expect(mockSetDefaultSavedAddress).not.toHaveBeenCalled();
  });

  it('calls updateSavedAddress with the row id when editing and saving', async () => {
    render(<SavedAddressesScreen />);
    await waitFor(() => screen.getByText('My House'));

    // Press Edit on the first card (FIXTURE_HOME). Both cards have an "Edit" button.
    const editButtons = screen.getAllByText('Edit');
    fireEvent.press(editButtons[0]);

    // The form should be in edit mode with the prefilled address
    expect(screen.getByText('Edit address')).toBeOnTheScreen();
    // The address text should be prefilled (visible as the existing selected card)
    expect(screen.getByText('10 Riverside Lane, Nairobi')).toBeOnTheScreen();

    // Press Save without changing anything
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => expect(mockUpdateSavedAddress).toHaveBeenCalled());
    const calledId = mockUpdateSavedAddress.mock.calls[0][0] as string;
    expect(calledId).toBe('addr-home-1');
  });
});
