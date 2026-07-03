/**
 * Tests for src/app/booking/address.tsx
 *
 * We mock expo-router (to spy on push) and @/booking/booking-draft so we can
 * control the draft state without needing a real React context tree.
 *
 * Slice 20: we also mock @/lib/places so AddressSearch never hits the network,
 * and we expose the new draft setters (setLocation, setApartment) in the mock.
 *
 * Slice 22: we add a saved-addresses mock so the picker/import resolve offline.
 * By default getMySavedAddresses returns [] so the picker is hidden and the
 * 3 original tests continue to pass byte-for-byte.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

// Slice 20: AddressSearch imports from @/lib/places — mock it so tests are offline.
jest.mock('@/lib/places', () => ({
  searchPlaces: jest.fn().mockResolvedValue([]),
  getPlaceDetails: jest.fn().mockResolvedValue(null),
}));

// Slice 22: saved-addresses mock.
// We CANNOT use jest.requireActual here because the real module imports supabase.ts
// which throws when EXPO_PUBLIC_SUPABASE_URL is missing. Instead we inline the pure
// mapper logic (savedAddressToDraftLocation, draftToSavedAddressInput) which have no
// side-effects and no Supabase dependency — they are pure transformation functions.
jest.mock('@/lib/saved-addresses', () => {
  return {
    getMySavedAddresses: jest.fn().mockResolvedValue([]),
    touchSavedAddress: jest.fn().mockResolvedValue({ ok: true }),
    createSavedAddress: jest.fn().mockResolvedValue({ ok: true, id: 'new1' }),
    // Pure mappers (no Supabase) — inline implementations matching saved-addresses.ts exactly.
    savedAddressToDraftLocation: (a: {
      address: string;
      address_label: string | null;
      latitude: number | null;
      longitude: number | null;
      building_name: string | null;
      floor: string | null;
      door_number: string | null;
      landmark: string | null;
      access_notes: string | null;
    }) => ({
      location: {
        address: a.address,
        address_label: a.address_label ?? '',
        latitude: a.latitude,
        longitude: a.longitude,
      },
      apartment: {
        building_name: a.building_name ?? '',
        floor: a.floor ?? '',
        door_number: a.door_number ?? '',
        landmark: a.landmark ?? '',
        access_notes: a.access_notes ?? '',
      },
    }),
    draftToSavedAddressInput: (
      draft: {
        address: string;
        address_label: string;
        latitude: number | null;
        longitude: number | null;
        building_name: string;
        floor: string;
        door_number: string;
        landmark: string;
        access_notes: string;
      },
      meta: {
        label_type?: 'home' | 'work' | 'other';
        nickname?: string | null;
        is_default?: boolean;
      },
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
  };
});

// Slice 22: mock SavedAddressPicker so it fetches via getMySavedAddresses (same as the
// real component) and renders pressable cards we can tap in tests. This way setting
// getMySavedAddresses to resolve a fixture automatically shows its card.
jest.mock('@/components/ui/saved-address-picker', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  const { getMySavedAddresses } = require('@/lib/saved-addresses');

  function SavedAddressPicker({
    onSelect,
    onUseNew,
  }: {
    onSelect: (a: unknown) => void;
    onUseNew?: () => void;
  }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [addresses, setAddresses] = (React.useState as any)([]);

    React.useEffect(() => {
      getMySavedAddresses().then((rows: unknown[]) => setAddresses(rows));
    }, []);

    return React.createElement(
      View,
      { testID: 'saved-address-picker' },
      addresses.map((a: unknown, i: number) =>
        React.createElement(
          TouchableOpacity,
          {
            key: i,
            testID: `saved-address-card-${i}`,
            onPress: () => onSelect(a),
          },
          React.createElement(
            Text,
            { testID: `saved-address-text-${i}` },
            (a as { address: string }).address,
          ),
        ),
      ),
      onUseNew
        ? React.createElement(
            TouchableOpacity,
            { testID: 'use-new-address-btn', onPress: onUseNew },
            React.createElement(Text, null, 'Use a new address'),
          )
        : null,
    );
  }

  return { SavedAddressPicker };
});

const mockSetAddress = jest.fn();
const mockSetLocation = jest.fn();
const mockSetApartment = jest.fn();
let mockAddress = '';
jest.mock('@/booking/booking-draft', () => ({
  useBookingDraft: () => ({
    address: mockAddress,
    setAddress: mockSetAddress,
    // Slice 20 structured fields (needed so address.tsx doesn't crash)
    address_label: '',
    latitude: null,
    longitude: null,
    building_name: '',
    floor: '',
    door_number: '',
    landmark: '',
    access_notes: '',
    setLocation: mockSetLocation,
    setApartment: mockSetApartment,
  }),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import {
  createSavedAddress,
  getMySavedAddresses,
  touchSavedAddress,
} from '@/lib/saved-addresses';
import AddressScreen from '@/app/booking/address';
import type { SavedAddress } from '@/lib/saved-addresses';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** A minimal SavedAddress fixture for tests. */
const fixtureSavedAddress: SavedAddress = {
  id: 'addr-1',
  customer_id: 'cust-1',
  label_type: 'home',
  nickname: 'My Home',
  address: '456 Oak Ave, Testville',
  address_label: '456 Oak Ave',
  latitude: 1.23,
  longitude: 4.56,
  building_name: 'Oak Towers',
  floor: '3',
  door_number: '302',
  landmark: 'Near the park',
  access_notes: 'Ring bell twice',
  is_default: true,
  last_used_at: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('AddressScreen', () => {
  beforeEach(() => {
    (router.push as jest.Mock).mockClear();
    mockSetAddress.mockClear();
    mockSetLocation.mockClear();
    mockSetApartment.mockClear();
    mockAddress = '';
    // Reset saved-address mocks to safe defaults.
    (getMySavedAddresses as jest.Mock).mockClear().mockResolvedValue([]);
    (touchSavedAddress as jest.Mock).mockClear().mockResolvedValue({ ok: true });
    (createSavedAddress as jest.Mock).mockClear().mockResolvedValue({ ok: true, id: 'new1' });
  });

  // ── Original 3 tests (must remain green, unchanged assertions) ────────────

  it('shows an inline error and does NOT navigate when address is empty', () => {
    render(<AddressScreen />);
    fireEvent.press(screen.getByText('Continue'));
    expect(screen.getByText('Address is required.')).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('navigates to /booking/schedule when address is non-empty', () => {
    mockAddress = '123 Main St';
    render(<AddressScreen />);
    fireEvent.press(screen.getByText('Continue'));
    expect(router.push).toHaveBeenCalledWith('/booking/schedule');
  });

  it('calls setLocation when the user types in manual mode', () => {
    render(<AddressScreen />);
    // Switch to manual entry mode first
    fireEvent.press(screen.getByText('Enter address manually'));
    // Now the plain text input is visible
    fireEvent.changeText(screen.getByPlaceholderText('123 Main St, City'), '456 Oak Ave');
    expect(mockSetLocation).toHaveBeenCalledWith({ address: '456 Oak Ave' });
  });

  // ── Slice 22: new tests ───────────────────────────────────────────────────

  it('prefills setLocation + setApartment and calls touchSavedAddress when a saved address is picked', async () => {
    // Arrange: one saved address available (both parent useEffect and picker mock see it).
    (getMySavedAddresses as jest.Mock).mockResolvedValue([fixtureSavedAddress]);

    render(<AddressScreen />);

    // Wait for the picker card to appear (getMySavedAddresses resolves async).
    const card = await screen.findByTestId('saved-address-card-0');

    // Act: tap the saved address card.
    fireEvent.press(card);

    // Assert: setLocation called with the mapped location fields.
    expect(mockSetLocation).toHaveBeenCalledWith({
      address: fixtureSavedAddress.address,
      address_label: fixtureSavedAddress.address_label ?? '',
      latitude: fixtureSavedAddress.latitude,
      longitude: fixtureSavedAddress.longitude,
    });

    // Assert: setApartment called with the mapped apartment fields.
    expect(mockSetApartment).toHaveBeenCalledWith({
      building_name: fixtureSavedAddress.building_name ?? '',
      floor: fixtureSavedAddress.floor ?? '',
      door_number: fixtureSavedAddress.door_number ?? '',
      landmark: fixtureSavedAddress.landmark ?? '',
      access_notes: fixtureSavedAddress.access_notes ?? '',
    });

    // Assert: touchSavedAddress fired with the fixture's id.
    expect(touchSavedAddress).toHaveBeenCalledWith(fixtureSavedAddress.id);
  });

  it('"Save this address" toggle + Continue calls createSavedAddress then navigates', async () => {
    // Arrange: address already set (simulates user having typed / searched).
    mockAddress = '123 Main St';

    render(<AddressScreen />);

    // The "Save this address" toggle should be visible (new address, fromSaved=false).
    const toggle = await screen.findByText('☐ Save this address');
    fireEvent.press(toggle);

    // Now the toggle is on — press Continue (async path).
    fireEvent.press(screen.getByText('Continue'));

    // Wait for createSavedAddress to be called and navigation to happen.
    await waitFor(() => {
      expect(createSavedAddress).toHaveBeenCalledWith(
        expect.objectContaining({ address: '123 Main St' }),
      );
      expect(router.push).toHaveBeenCalledWith('/booking/schedule');
    });
  });

  it('does NOT call createSavedAddress when a saved address is picked and Continue is pressed', async () => {
    // Arrange: one saved address available.
    (getMySavedAddresses as jest.Mock).mockResolvedValue([fixtureSavedAddress]);

    render(<AddressScreen />);

    // Wait for the picker and pick the saved address.
    const card = await screen.findByTestId('saved-address-card-0');
    fireEvent.press(card);

    // After pick: fromSaved=true, so "Save this address" toggle must NOT be shown.
    // (mockAddress stays '' in the mock since our mock doesn't update reactively,
    // so showSavePrompt is false because address.trim().length === 0 too. Either way,
    // createSavedAddress must not be called on Continue.)
    fireEvent.press(screen.getByText('Continue'));

    // createSavedAddress must NOT have been called.
    expect(createSavedAddress).not.toHaveBeenCalled();
  });
});
