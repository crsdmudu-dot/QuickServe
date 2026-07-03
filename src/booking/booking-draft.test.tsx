import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text, TouchableOpacity } from 'react-native';

import { BookingDraftProvider, useBookingDraft } from './booking-draft';
import type { ResolvedSchedule } from '@/lib/scheduling';

/** Probe renders current draft state and exposes action buttons. */
function Probe() {
  const draft = useBookingDraft();
  return (
    <>
      <Text testID="serviceId">{draft.serviceId ?? 'null'}</Text>
      <Text testID="address">{draft.address}</Text>
      <Text testID="scheduledFor">{draft.scheduledFor ?? 'null'}</Text>
      <Text testID="notes">{draft.notes}</Text>
      <Text testID="issuePhotos">{draft.issuePhotos.join(',')}</Text>
      <Text testID="scheduling_type">{draft.scheduling_type}</Text>
      <Text testID="time_window">{draft.time_window ?? 'null'}</Text>
      <Text testID="window_start">{draft.window_start ?? 'null'}</Text>
      <Text testID="window_end">{draft.window_end ?? 'null'}</Text>
      <Text testID="recurrence">{draft.recurrence}</Text>

      <TouchableOpacity testID="btn-start" onPress={() => draft.start('s1')} />
      <TouchableOpacity testID="btn-setAddress" onPress={() => draft.setAddress('123 Main St')} />
      <TouchableOpacity testID="btn-setScheduledFor" onPress={() => draft.setScheduledFor('2026-07-01T10:00:00Z')} />
      <TouchableOpacity testID="btn-setNotes" onPress={() => draft.setNotes('Ring doorbell')} />
      <TouchableOpacity testID="btn-addIssuePhoto" onPress={() => draft.addIssuePhoto('file://a')} />
      <TouchableOpacity testID="btn-removeIssuePhoto" onPress={() => draft.removeIssuePhoto('file://a')} />
      <TouchableOpacity testID="btn-reset" onPress={() => draft.reset()} />
      <TouchableOpacity
        testID="btn-setSchedule"
        onPress={() => {
          const resolved: ResolvedSchedule = {
            scheduled_for: '2026-07-05T08:00:00Z',
            scheduling_type: 'asap',
            time_window: 'morning',
            window_start: '2026-07-05T08:00:00Z',
            window_end: '2026-07-05T12:00:00Z',
            recurrence: 'weekly',
          };
          draft.setSchedule(resolved);
        }}
      />
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

  it('initialises with correct scheduling defaults', () => {
    renderProbe();
    expect(screen.getByTestId('scheduling_type').props.children).toBe('datetime');
    expect(screen.getByTestId('time_window').props.children).toBe('null');
    expect(screen.getByTestId('window_start').props.children).toBe('null');
    expect(screen.getByTestId('window_end').props.children).toBe('null');
    expect(screen.getByTestId('recurrence').props.children).toBe('one_time');
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

  it('setScheduledFor() sets scheduling_type=datetime and time_window=specific', () => {
    renderProbe();
    fireEvent.press(screen.getByTestId('btn-setScheduledFor'));
    expect(screen.getByTestId('scheduling_type').props.children).toBe('datetime');
    expect(screen.getByTestId('time_window').props.children).toBe('specific');
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

  it('addIssuePhoto() appends a URI to issuePhotos', () => {
    renderProbe();
    fireEvent.press(screen.getByTestId('btn-addIssuePhoto'));
    expect(screen.getByTestId('issuePhotos').props.children).toBe('file://a');
  });

  it('removeIssuePhoto() removes a URI from issuePhotos', () => {
    renderProbe();
    fireEvent.press(screen.getByTestId('btn-addIssuePhoto'));
    fireEvent.press(screen.getByTestId('btn-removeIssuePhoto'));
    expect(screen.getByTestId('issuePhotos').props.children).toBe('');
  });

  it('reset() clears issuePhotos', () => {
    renderProbe();
    fireEvent.press(screen.getByTestId('btn-addIssuePhoto'));
    fireEvent.press(screen.getByTestId('btn-reset'));
    expect(screen.getByTestId('issuePhotos').props.children).toBe('');
  });

  it('start() clears issuePhotos', () => {
    renderProbe();
    fireEvent.press(screen.getByTestId('btn-addIssuePhoto'));
    fireEvent.press(screen.getByTestId('btn-start'));
    expect(screen.getByTestId('issuePhotos').props.children).toBe('');
  });

  it('throws when used outside provider', () => {
    // Suppress the React error boundary console output.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useBookingDraft must be used within BookingDraftProvider');
    spy.mockRestore();
  });

  it('setSchedule() sets scheduledFor and all 5 scheduling fields', () => {
    renderProbe();
    fireEvent.press(screen.getByTestId('btn-setSchedule'));
    expect(screen.getByTestId('scheduledFor').props.children).toBe('2026-07-05T08:00:00Z');
    expect(screen.getByTestId('scheduling_type').props.children).toBe('asap');
    expect(screen.getByTestId('time_window').props.children).toBe('morning');
    expect(screen.getByTestId('window_start').props.children).toBe('2026-07-05T08:00:00Z');
    expect(screen.getByTestId('window_end').props.children).toBe('2026-07-05T12:00:00Z');
    expect(screen.getByTestId('recurrence').props.children).toBe('weekly');
  });

  it('reset() after setSchedule() restores scheduling defaults', () => {
    renderProbe();
    fireEvent.press(screen.getByTestId('btn-setSchedule'));
    fireEvent.press(screen.getByTestId('btn-reset'));
    expect(screen.getByTestId('scheduledFor').props.children).toBe('null');
    expect(screen.getByTestId('scheduling_type').props.children).toBe('datetime');
    expect(screen.getByTestId('time_window').props.children).toBe('null');
    expect(screen.getByTestId('window_start').props.children).toBe('null');
    expect(screen.getByTestId('window_end').props.children).toBe('null');
    expect(screen.getByTestId('recurrence').props.children).toBe('one_time');
  });
});
