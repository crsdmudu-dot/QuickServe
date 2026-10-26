/**
 * Update 74 (PM stage 95 (c)): the blocked-chat notice depends on who reads it.
 *  - provider (and every build without in-app cancellation): the owner's 11:16 wording, unchanged; an
 *    email is a REQUEST, never an automatic cancellation;
 *  - customer (DRAFT): points to Cancel booking / Get help on the booking screen, email for anything else.
 * The notice must match the cancellation path this release offers.
 */
import { render, screen } from '@testing-library/react-native';

import { ChatThread } from '@/components/ui/chat-thread';
import {
  CHAT_BLOCKED_NOTICE,
  CHAT_BLOCKED_NOTICE_CUSTOMER,
  CHAT_BLOCKED_NOTICE_PROVIDER,
} from '@/lib/blocks';
import { SUPPORT_EMAIL, SUPPORT_NAME } from '@/lib/support';

const OWNER_1116 =
  "Chat isn't available for this booking. To request cancellation, email KwikServe Support at support@kwikserve.co.ke.";
const IMPLIES_AUTOMATIC = /\bto cancel\b|will be cancell?ed|cancels (your|the) booking|is cancell?ed/i;

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

describe('the notice texts', () => {
  it("the provider text is exactly the owner's 11:16 wording, a request and never an automatic cancellation", () => {
    expect(CHAT_BLOCKED_NOTICE_PROVIDER).toBe(OWNER_1116);
    expect(CHAT_BLOCKED_NOTICE_PROVIDER).toMatch(/request cancellation/i);
    expect(CHAT_BLOCKED_NOTICE_PROVIDER).not.toMatch(IMPLIES_AUTOMATIC);
    expect(CHAT_BLOCKED_NOTICE_PROVIDER).not.toMatch(/Cancel booking|still cancel|cancel the booking|cancel button|tap cancel/i);
    expect(CHAT_BLOCKED_NOTICE).toBe(CHAT_BLOCKED_NOTICE_PROVIDER);
  });

  it('the customer text points to the in-app paths and keeps email for anything else', () => {
    expect(CHAT_BLOCKED_NOTICE_CUSTOMER).toContain('Cancel booking');
    expect(CHAT_BLOCKED_NOTICE_CUSTOMER).toContain('Get help with this booking');
    expect(CHAT_BLOCKED_NOTICE_CUSTOMER).not.toMatch(IMPLIES_AUTOMATIC);
    expect(CHAT_BLOCKED_NOTICE_CUSTOMER).not.toMatch(/You can still cancel the booking/);
  });

  it('both name KwikServe Support and the support address exactly', () => {
    for (const text of [CHAT_BLOCKED_NOTICE_CUSTOMER, CHAT_BLOCKED_NOTICE_PROVIDER]) {
      expect(text).toContain(`${SUPPORT_NAME} at ${SUPPORT_EMAIL}`);
    }
  });
});

// The thread chooses the notice by reader. The real constants are used (no mock of @/lib/blocks texts);
// jest.mock calls are hoisted above the imports by babel-jest.
jest.mock('@/lib/blocks', () => {
  const actual = jest.requireActual('@/lib/blocks');
  return { ...actual, isBookingChatBlocked: jest.fn().mockResolvedValue(true), blockUser: jest.fn() };
});
jest.mock('@/lib/moderation', () => ({ REPORT_REASONS: [], REPORT_CONFIRMATION: '', reportContent: jest.fn() }));
jest.mock('@/lib/messages', () => ({
  getBookingMessages: jest.fn().mockResolvedValue([]),
  getChatPeerName: jest.fn().mockResolvedValue('Peer'),
  sendBookingMessage: jest.fn(),
  labelSender: () => 'Customer',
}));
let mockUserId = 'cust';
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ session: { user: { id: mockUserId } } }) }));

describe('ChatThread chooses the notice by reader', () => {
  const BOOKING = { customer_id: 'cust', assigned_provider_id: 'prov', status: 'on_the_way' };

  it('the booking customer sees the customer notice', async () => {
    mockUserId = 'cust';
    render(<ChatThread bookingId="b1" booking={BOOKING} mode="participant" />);
    expect(await screen.findByTestId('chat-blocked-notice')).toHaveTextContent(CHAT_BLOCKED_NOTICE_CUSTOMER);
  });

  it('the assigned provider sees the provider notice', async () => {
    mockUserId = 'prov';
    render(<ChatThread bookingId="b1" booking={BOOKING} mode="participant" />);
    expect(await screen.findByTestId('chat-blocked-notice')).toHaveTextContent(CHAT_BLOCKED_NOTICE_PROVIDER);
  });
});
