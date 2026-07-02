/**
 * Tests for ApartmentDetailsForm.
 *
 * Verifies that editing each controlled Input fires onChange with only
 * the changed field (partial update pattern).
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { ApartmentDetailsForm } from '@/components/ui/apartment-details-form';

describe('ApartmentDetailsForm', () => {
  const EMPTY_VALUE = {
    building_name: '',
    floor: '',
    door_number: '',
    landmark: '',
    access_notes: '',
  };

  // ── 1. Building name ─────────────────────────────────────────────────────────

  it('fires onChange with building_name when that field is edited', () => {
    const onChange = jest.fn();
    render(<ApartmentDetailsForm value={EMPTY_VALUE} onChange={onChange} />);

    fireEvent.changeText(screen.getByPlaceholderText('e.g. Green Tower'), 'Blue Towers');
    expect(onChange).toHaveBeenCalledWith({ building_name: 'Blue Towers' });
  });

  // ── 2. Floor ─────────────────────────────────────────────────────────────────

  it('fires onChange with floor when that field is edited', () => {
    const onChange = jest.fn();
    render(<ApartmentDetailsForm value={EMPTY_VALUE} onChange={onChange} />);

    fireEvent.changeText(screen.getByPlaceholderText('e.g. 3'), '5');
    expect(onChange).toHaveBeenCalledWith({ floor: '5' });
  });

  // ── 3. Door / Unit number ────────────────────────────────────────────────────

  it('fires onChange with door_number when that field is edited', () => {
    const onChange = jest.fn();
    render(<ApartmentDetailsForm value={EMPTY_VALUE} onChange={onChange} />);

    fireEvent.changeText(screen.getByPlaceholderText('e.g. Apt 12B'), 'Apt 7A');
    expect(onChange).toHaveBeenCalledWith({ door_number: 'Apt 7A' });
  });

  // ── 4. Landmark ──────────────────────────────────────────────────────────────

  it('fires onChange with landmark when that field is edited', () => {
    const onChange = jest.fn();
    render(<ApartmentDetailsForm value={EMPTY_VALUE} onChange={onChange} />);

    fireEvent.changeText(screen.getByPlaceholderText('e.g. Near the main gate'), 'By the fountain');
    expect(onChange).toHaveBeenCalledWith({ landmark: 'By the fountain' });
  });

  // ── 5. Access notes ──────────────────────────────────────────────────────────

  it('fires onChange with access_notes when that field is edited', () => {
    const onChange = jest.fn();
    render(<ApartmentDetailsForm value={EMPTY_VALUE} onChange={onChange} />);

    fireEvent.changeText(
      screen.getByPlaceholderText('e.g. Ring bell twice, door code is 1234'),
      'Call when downstairs',
    );
    expect(onChange).toHaveBeenCalledWith({ access_notes: 'Call when downstairs' });
  });

  // ── 6. Renders all field labels ──────────────────────────────────────────────

  it('renders all five field labels', () => {
    render(<ApartmentDetailsForm value={EMPTY_VALUE} onChange={jest.fn()} />);
    expect(screen.getByText('Building name')).toBeOnTheScreen();
    expect(screen.getByText('Floor')).toBeOnTheScreen();
    expect(screen.getByText('Door / Unit number')).toBeOnTheScreen();
    expect(screen.getByText('Landmark')).toBeOnTheScreen();
    expect(screen.getByText('Access notes')).toBeOnTheScreen();
  });
});
