/**
 * Keyboard handling on the two chat screens (customer and provider).
 *
 * The message box sits at the bottom of a chat, so each chat screen wraps ChatThread in the keyboard
 * library's KeyboardAvoidingView: when the keyboard opens, the view adds bottom padding equal to the
 * keyboard's height ("padding") and measures its own position below the header ("automaticOffset").
 *
 * In tests the library's own mock renders KeyboardAvoidingView as a plain View (see test/setup.ts),
 * so these tests check the wiring: the wrapper is there, with the right settings, around the chat.
 * ChatThread itself is replaced by a stub so no chat data or network is needed.
 */

// ── Mocks (must appear before imports) ────────────────────────────────────

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'b1' }),
}));

const mockGetBookingById = jest.fn();
jest.mock('@/lib/bookings', () => ({
  getBookingById: (...args: unknown[]) => mockGetBookingById(...args),
}));

jest.mock('@/components/ui/chat-thread', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    ChatThread: ({ mode }: { mode: string }) =>
      React.createElement(Text, { testID: 'chat-thread-stub' }, `chat:${mode}`),
  };
});

// ── Imports ────────────────────────────────────────────────────────────────

import { render, screen, within } from '@testing-library/react-native';

import CustomerChatScreen from '@/app/booking/chat/[id]';
import ProviderChatScreen from '@/app/provider/job/chat/[id]';

// ── Suite ──────────────────────────────────────────────────────────────────

const SCREENS = [
  ['customer chat (booking/chat/[id])', CustomerChatScreen],
  ['provider chat (provider/job/chat/[id])', ProviderChatScreen],
] as const;

describe.each(SCREENS)('%s — keyboard', (_name, Screen) => {
  beforeEach(() => {
    mockGetBookingById.mockResolvedValue({
      id: 'b1',
      customer_id: 'cust',
      assigned_provider_id: 'prov',
      status: 'in_progress',
    });
  });

  it('wraps the chat so the message box moves up with the keyboard (padding, measured offset)', async () => {
    render(<Screen />);
    const wrapper = await screen.findByTestId('chat-keyboard-avoiding');
    expect(wrapper.props.behavior).toBe('padding');
    expect(wrapper.props.automaticOffset).toBe(true);
    // The chat itself (participant mode) is inside the wrapper.
    expect(within(wrapper).getByTestId('chat-thread-stub')).toHaveTextContent('chat:participant');
  });

  it('shows the loading text (no wrapper yet) until the booking has loaded', () => {
    mockGetBookingById.mockReturnValue(new Promise(() => {}));
    render(<Screen />);
    expect(screen.getByText('Loading…')).toBeOnTheScreen();
    expect(screen.queryByTestId('chat-keyboard-avoiding')).toBeNull();
  });
});
