import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text, TouchableOpacity } from 'react-native';

import { BookingDraftProvider, useBookingDraft } from './booking-draft';

/** Probe renders current draft state and exposes action buttons. */
function Probe() {
  const draft = useBookingDraft();
  return (
    <>
      <Text testID="serviceId">{draft.serviceId ?? 'null'}</Text>
      <Text testID="address">{draft.address}</Text>
      <Text testID="scheduledFor">{draft.scheduledFor ?? 'null'}</Text>
      <Text testID="notes">{draft.notes}</Text>

      <TouchableOpacity testID="btn-start" onPress={() => draft.start('s1')} />
      <TouchableOpacity testID="btn-setAddress" onPress={() => draft.setAddress('123 Main St')} />
      <TouchableOpacity testID="btn-setScheduledFor" onPress={() => draft.setScheduledFor('2026-07-01T10:00:00Z')} />
      <TouchableOpacity testID="btn-setNotes" onPress={() => draft.setNotes('Ring doorbell')} />
      <TouchableOpacity testID="btn-reset" onPress={() => draft.reset()} />
    </>
  );
}

function renderProbe() {
  return render(
    <BookingDraftProvider>
      <Probe />
    </BookingDraftProvider>,
  );
}

describe('BookingDraftProvider', () => {
  it('initialises with empty draft', () => {
    renderProbe();
    expect(screen.getByTestId('serviceId').props.children).toBe('null');
    expect(screen.getByTestId('address').props.children).toBe('');
    expect(screen.getByTestId('scheduledFor').props.children).toBe('null');
    expect(screen.getByTestId('notes').props.children).toBe('');
  });

  it('start() sets serviceId and clears other fields', () => {
    renderProbe();
    // Set some fields first so we can verify they're cleared.
    fireEvent.press(screen.getByTestId('btn-setAddress'));
    fireEvent.press(screen.getByTestId('btn-setNotes'));
    // Now start a new booking.
    fireEvent.press(screen.getByTestId('btn-start'));
    expect(screen.getByTestId('serviceId').props.children).toBe('s1');
    expect(screen.getByTestId('address').props.children).toBe('');
    expect(screen.getByTestId('notes').props.children).toBe('');
  });

  it('setAddress() updates the address field', () => {
    renderProbe();
    fireEvent.press(screen.getByTestId('btn-setAddress'));
    expect(screen.getByTestId('address').props.children).toBe('123 Main St');
  });

  it('setScheduledFor() updates scheduledFor', () => {
    renderProbe();
    fireEvent.press(screen.getByTestId('btn-setScheduledFor'));
    expect(screen.getByTestId('scheduledFor').props.children).toBe('2026-07-01T10:00:00Z');
  });

  it('setNotes() updates notes', () => {
    renderProbe();
    fireEvent.press(screen.getByTestId('btn-setNotes'));
    expect(screen.getByTestId('notes').props.children).toBe('Ring doorbell');
  });

  it('reset() clears all fields', () => {
    renderProbe();
    fireEvent.press(screen.getByTestId('btn-start'));
    fireEvent.press(screen.getByTestId('btn-setAddress'));
    fireEvent.press(screen.getByTestId('btn-setNotes'));
    fireEvent.press(screen.getByTestId('btn-reset'));
    expect(screen.getByTestId('serviceId').props.children).toBe('null');
    expect(screen.getByTestId('address').props.children).toBe('');
    expect(screen.getByTestId('notes').props.children).toBe('');
  });

  it('throws when used outside provider', () => {
    // Suppress the React error boundary console output.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useBookingDraft must be used within BookingDraftProvider');
    spy.mockRestore();
  });
});
