/**
 * Tests for MessageBubble — verifies text, label, alignment style, and timestamp.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { MessageBubble } from '@/components/ui/message-bubble';

// Fixed ISO timestamp used for deterministic time-string assertions.
const ISO = '2026-06-25T08:30:00Z';
const EXPECTED_TIME = new Date(ISO).toLocaleTimeString();

describe('MessageBubble', () => {
  it('renders the message text', () => {
    render(
      <MessageBubble text="Hello there" timestamp={ISO} align="right" />,
    );
    expect(screen.getByText('Hello there')).toBeOnTheScreen();
  });

  it('renders the timestamp as a localised time string', () => {
    render(
      <MessageBubble text="Hey" timestamp={ISO} align="left" />,
    );
    expect(screen.getByText(EXPECTED_TIME)).toBeOnTheScreen();
  });

  it('renders the label when provided', () => {
    render(
      <MessageBubble text="Hi" timestamp={ISO} align="left" label="Provider" />,
    );
    expect(screen.getByText('Provider')).toBeOnTheScreen();
  });

  it('does NOT render a label when the prop is omitted', () => {
    render(
      <MessageBubble text="Hi" timestamp={ISO} align="left" />,
    );
    expect(screen.queryByText('Provider')).toBeNull();
  });

  it('applies alignSelf flex-end for align="right"', () => {
    render(
      <MessageBubble text="Mine" timestamp={ISO} align="right" testID="bubble" />,
    );
    const bubble = screen.getByTestId('bubble');
    // The style array is flattened by RNTL — check that alignSelf is flex-end.
    const flat = Array.isArray(bubble.props.style)
      ? Object.assign({}, ...bubble.props.style.flat(Infinity).filter(Boolean))
      : bubble.props.style;
    expect(flat.alignSelf).toBe('flex-end');
  });

  it('applies alignSelf flex-start for align="left"', () => {
    render(
      <MessageBubble text="Theirs" timestamp={ISO} align="left" testID="bubble" />,
    );
    const bubble = screen.getByTestId('bubble');
    const flat = Array.isArray(bubble.props.style)
      ? Object.assign({}, ...bubble.props.style.flat(Infinity).filter(Boolean))
      : bubble.props.style;
    expect(flat.alignSelf).toBe('flex-start');
  });
});

describe('MessageBubble — report and moderation props (F5.1)', () => {
  // RNTL's fireEvent also finds handlers on composite parents, so calling the handler alone would
  // pass even if the bubble ignored the prop. The host element must itself be the long-press target.
  it('with onLongPress the bubble itself is a long-press target that calls it', () => {
    const onLongPress = jest.fn();
    render(<MessageBubble text="Rude" timestamp={ISO} align="left" testID="b" onLongPress={onLongPress} />);
    const host = screen.getByTestId('b');
    expect(host.props.accessibilityHint).toBe('Long-press to report this message');
    fireEvent(host, 'longPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('shows a note under the text when given one', () => {
    render(<MessageBubble text="Rude" timestamp={ISO} align="left" note="Hidden by moderation" />);
    expect(screen.getByText('Hidden by moderation')).toBeOnTheScreen();
  });

  it('without onLongPress the bubble is a plain view with no report hint', () => {
    render(<MessageBubble text="Plain" timestamp={ISO} align="left" testID="b" />);
    expect(screen.getByTestId('b').props.accessibilityHint).toBeUndefined();
  });
});
