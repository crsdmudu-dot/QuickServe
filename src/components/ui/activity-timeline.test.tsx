// activity-timeline.test.tsx — Tests for ActivityTimeline component.
import { render, screen } from '@testing-library/react-native';
import { ActivityTimeline } from '@/components/ui/activity-timeline';
import { type BookingActivity } from '@/lib/activity';

const sampleEvent: BookingActivity = {
  id: 'a1',
  booking_id: 'bk1',
  actor_id: null,
  event_type: 'booking_created',
  message: 'Booking created.',
  metadata: null,
  created_at: '2026-07-01T10:00:00Z',
};

describe('ActivityTimeline', () => {
  it('shows event message when events are provided', () => {
    render(<ActivityTimeline events={[sampleEvent]} />);
    expect(screen.getByText('Booking created.')).toBeOnTheScreen();
  });

  it('shows "No activity yet" when events array is empty', () => {
    render(<ActivityTimeline events={[]} />);
    expect(screen.getByText('No activity yet')).toBeOnTheScreen();
  });

  it('renders the icon for a known event_type', () => {
    render(<ActivityTimeline events={[sampleEvent]} />);
    expect(screen.getByText('📝')).toBeOnTheScreen();
  });

  it('renders the fallback icon for an unknown event_type', () => {
    render(<ActivityTimeline events={[{ ...sampleEvent, event_type: 'unknown_event' }]} />);
    expect(screen.getByText('•')).toBeOnTheScreen();
  });

  it('renders multiple events', () => {
    const second: BookingActivity = {
      ...sampleEvent,
      id: 'a2',
      event_type: 'completed',
      message: 'Job completed.',
    };
    render(<ActivityTimeline events={[sampleEvent, second]} />);
    expect(screen.getByText('Booking created.')).toBeOnTheScreen();
    expect(screen.getByText('Job completed.')).toBeOnTheScreen();
  });
});
