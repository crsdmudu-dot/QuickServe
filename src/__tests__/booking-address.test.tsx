/**
 * Tests for src/app/booking/address.tsx
 *
 * We mock expo-router (to spy on push) and @/booking/booking-draft so we can
 * control the draft state without needing a real React context tree.
 *
 * Slice 20: we also mock @/lib/places so AddressSearch never hits the network,
 * and we expose the new draft setters (setLocation, setApartment) in the mock.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

// Slice 20: AddressSearch imports from @/lib/places — mock it so tests are offline.
jest.mock('@/lib/places', () => ({
  searchPlaces: jest.fn().mockResolvedValue([]),
  getPlaceDetails: jest.fn().mockResolvedValue(null),
}));

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

import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import AddressScreen from '@/app/booking/address';

describe('AddressScreen', () => {
  beforeEach(() => {
    (router.push as jest.Mock).mockClear();
    mockSetAddress.mockClear();
    mockSetLocation.mockClear();
    mockSetApartment.mockClear();
    mockAddress = '';
  });

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
});
