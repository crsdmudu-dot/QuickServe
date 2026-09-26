/**
 * Tests for src/components/ui/chat-thread.tsx
 *
 * Mocks @/auth/auth-context and @/lib/messages so no network calls are made.
 * Uses findBy* for async data loads (useEffect resolves after render).
 */

// ── Mocks (must appear before imports) ────────────────────────────────────

// The report panel (F5.1) imports @/lib/moderation, which creates the Supabase client. Mock it so
// this suite needs no Supabase env; the report flow itself is tested in report-form.test.tsx.
jest.mock('@/lib/moderation', () => ({
  REPORT_REASONS: [{ key: 'harassment', label: 'Harassment or bullying' }],
  REPORT_CONFIRMATION: 'Thanks for letting us know. Our team reviews every report within 24 hours.',
  reportContent: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('@/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } } }),
}));

jest.mock('@/lib/messages', () => ({
  getBookingMessages: jest.fn(),
  sendBookingMessage: jest.fn(),
  getChatPeerName: jest.fn(),
  labelSender: (
    s: string,
    b: { customer_id: string; assigned_provider_id: string | null },
  ) =>
    s === b.customer_id
      ? 'Customer'
      : s === b.assigned_provider_id
        ? 'Provider'
        : 'Unknown',
}));

// ── Imports ────────────────────────────────────────────────────────────────

import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChatThread } from '@/components/ui/chat-thread';
import {
  getBookingMessages,
  getChatPeerName,
  sendBookingMessage,
} from '@/lib/messages';

// ── Typed mock helpers ─────────────────────────────────────────────────────

const mockGetBookingMessages = getBookingMessages as jest.MockedFunction<
  typeof getBookingMessages
>;
const mockSendBookingMessage = sendBookingMessage as jest.MockedFunction<
  typeof sendBookingMessage
>;
const mockGetChatPeerName = getChatPeerName as jest.MockedFunction<
  typeof getChatPeerName
>;

// ── Shared fixture ─────────────────────────────────────────────────────────

const BASE_BOOKING = {
  customer_id: 'cust',
  assigned_provider_id: 'prov',
  status: 'in_progress',
};

const A_MESSAGE = {
  id: 'm1',
  sender_id: 'me',
  message_text: 'hi',
  created_at: new Date().toISOString(),
  booking_id: 'b1',
  read_at: null,
};

// ── Suite ──────────────────────────────────────────────────────────────────

describe('ChatThread', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: peer name resolves; no messages yet.
    mockGetChatPeerName.mockResolvedValue('Provider Name');
    mockGetBookingMessages.mockResolvedValue([]);
  });

  // ── 1. Participant: messages render ──────────────────────────────────────
  it('participant — renders a message from the server', async () => {
    mockGetBookingMessages.mockResolvedValue([A_MESSAGE]);

    render(
      <ChatThread
        bookingId="b1"
        booking={BASE_BOOKING}
        mode="participant"
      />,
    );

    expect(await screen.findByText('hi')).toBeOnTheScreen();
  });

  // ── 2. Empty state ───────────────────────────────────────────────────────
  it('participant — shows empty state when there are no messages', async () => {
    mockGetBookingMessages.mockResolvedValue([]);

    render(
      <ChatThread
        bookingId="b1"
        booking={BASE_BOOKING}
        mode="participant"
      />,
    );

    expect(await screen.findByText('No messages yet')).toBeOnTheScreen();
  });

  // ── 3. Send flow ─────────────────────────────────────────────────────────
  it('participant — sends a message and reloads the thread', async () => {
    // First load: empty; after send: one message.
    mockGetBookingMessages
      .mockResolvedValueOnce([]) // initial load
      .mockResolvedValueOnce([A_MESSAGE]); // reload after send

    mockSendBookingMessage.mockResolvedValue({ ok: true });

    render(
      <ChatThread
        bookingId="b1"
        booking={BASE_BOOKING}
        mode="participant"
      />,
    );

    // Wait for the empty state to confirm first load is done.
    await screen.findByText('No messages yet');

    // Type into the input and press Send.
    fireEvent.changeText(screen.getByPlaceholderText('Type a message…'), 'hello');
    fireEvent.press(screen.getByText('Send'));

    // Assert sendBookingMessage was called with the right args.
    expect(mockSendBookingMessage).toHaveBeenCalledWith('b1', 'hello');

    // After the reload the message appears.
    expect(await screen.findByText('hi')).toBeOnTheScreen();
  });

  // ── 4. Closed (terminal) booking ─────────────────────────────────────────
  it('participant + completed booking — hides send box and shows closed caption', async () => {
    mockGetBookingMessages.mockResolvedValue([]);

    render(
      <ChatThread
        bookingId="b1"
        booking={{ ...BASE_BOOKING, status: 'completed' }}
        mode="participant"
      />,
    );

    // Wait for component to finish loading.
    await screen.findByText('No messages yet');

    // Send button must NOT be present.
    expect(screen.queryByText('Send')).toBeNull();

    // Closed caption must be present.
    expect(
      await screen.findByText('This conversation is closed.'),
    ).toBeOnTheScreen();
  });

  // ── 5. Readonly (admin) mode ─────────────────────────────────────────────
  it('readonly — shows sender label and no Send button', async () => {
    const providerMessage = {
      id: 'm2',
      sender_id: 'prov',
      message_text: 'On my way',
      created_at: new Date().toISOString(),
      booking_id: 'b1',
      read_at: null,
    };

    mockGetBookingMessages.mockResolvedValue([providerMessage]);

    render(
      <ChatThread
        bookingId="b1"
        booking={BASE_BOOKING}
        mode="readonly"
      />,
    );

    // Sender label must be visible.
    expect(await screen.findByText('Provider')).toBeOnTheScreen();

    // Send button must NOT be present in readonly mode.
    expect(screen.queryByText('Send')).toBeNull();
  });
});

// ── Reporting (store-compliance F5.1) ────────────────────────────────────────

describe('ChatThread — reporting', () => {
  // Here the signed-in user ('me') is the booking's customer, so there is a counterpart to report.
  const MY_BOOKING = { customer_id: 'me', assigned_provider_id: 'prov', status: 'in_progress' };
  const PEER_MESSAGE = { ...A_MESSAGE, id: 'm2', sender_id: 'prov', message_text: 'rude words' };
  const { reportContent } = jest.requireMock('@/lib/moderation') as { reportContent: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetChatPeerName.mockResolvedValue('Provider Name');
    mockGetBookingMessages.mockResolvedValue([A_MESSAGE, PEER_MESSAGE]);
  });

  it('a participant can report the other person from the header', async () => {
    render(<ChatThread bookingId="b1" booking={MY_BOOKING} mode="participant" />);
    await screen.findByText('rude words');
    fireEvent.press(screen.getByTestId('chat-report-person'));
    expect(await screen.findByText('Report Provider Name')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('report-reason-harassment'));
    fireEvent.press(screen.getByTestId('report-send'));
    expect(await screen.findByTestId('report-form-sent')).toBeOnTheScreen();
    expect(reportContent).toHaveBeenCalledWith('user', 'prov', 'harassment');
  });

  it("long-pressing the other person's message opens a report for that message", async () => {
    render(<ChatThread bookingId="b1" booking={MY_BOOKING} mode="participant" />);
    await screen.findByText('rude words');
    expect(screen.getByText('Long-press a message to report it.')).toBeOnTheScreen();
    fireEvent(screen.getByTestId('message-m2'), 'longPress');
    expect(await screen.findByText('Report this message')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('report-reason-harassment'));
    fireEvent.press(screen.getByTestId('report-send'));
    await screen.findByTestId('report-form-sent');
    expect(reportContent).toHaveBeenCalledWith('message', 'm2', 'harassment');
  });

  it('your own messages cannot be long-pressed to report', async () => {
    render(<ChatThread bookingId="b1" booking={MY_BOOKING} mode="participant" />);
    await screen.findByText('hi');
    fireEvent(screen.getByTestId('message-m1'), 'longPress');
    expect(screen.queryByTestId('report-form')).toBeNull();
  });

  it('someone who is not in the booking gets no report action', async () => {
    render(<ChatThread bookingId="b1" booking={BASE_BOOKING} mode="participant" />);
    await screen.findByText('rude words');
    expect(screen.queryByTestId('chat-report-person')).toBeNull();
  });

  it('the admin viewer labels hidden messages and offers no report action', async () => {
    mockGetBookingMessages.mockResolvedValue([
      { ...PEER_MESSAGE, hidden_at: '2026-09-26T10:00:00Z', hidden_by: 'admin' },
    ]);
    render(<ChatThread bookingId="b1" booking={MY_BOOKING} mode="readonly" />);
    expect(await screen.findByText('Hidden by moderation')).toBeOnTheScreen();
    expect(screen.queryByTestId('chat-report-person')).toBeNull();
  });
});
