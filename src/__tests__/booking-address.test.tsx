/**
 * Tests for src/app/booking/address.tsx
 *
 * We mock expo-router (to spy on push) and @/booking/booking-draft so we can
 * control the draft state without needing a real React context tree.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockSetAddress = jest.fn();
let mockAddress = '';
jest.mock('@/booking/booking-draft', () => ({
  useBookingDraft: () => ({
    address: mockAddress,
    setAddress: mockSetAddress,
  }),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import AddressScreen from '@/app/booking/address';

describe('AddressScreen', () => {
  beforeEach(() => {
    (router.push as jest.Mock).mockClear();
    mockSetAddress.mockClear();
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

  it('calls setAddress when the user types', () => {
    render(<AddressScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('123 Main St, City'), '456 Oak Ave');
    expect(mockSetAddress).toHaveBeenCalledWith('456 Oak Ave');
  });
});
