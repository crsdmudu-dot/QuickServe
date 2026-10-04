/**
 * Tests for src/lib/blocks.ts: RPC names and arguments, fixed user-facing errors, and the
 * "a failed chat check does not claim chat is blocked" rule (the server enforces blocks anyway).
 */
import { SUPPORT_EMAIL, SUPPORT_NAME } from '@/lib/support';

const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

import {
  adminBlockedProviderIds,
  blockUser,
  CHAT_BLOCKED_NOTICE,
  getMyBlockedUsers,
  isBookingChatBlocked,
  unblockUser,
} from '@/lib/blocks';

const DB_ERROR = { data: null, error: { message: 'permission denied for table user_blocks', code: '42501' } };

describe('blocks wrappers', () => {
  beforeEach(() => mockRpc.mockReset());

  it('blockUser and unblockUser send the person id', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(blockUser('u1')).resolves.toEqual({ ok: true });
    await expect(unblockUser('u1')).resolves.toEqual({ ok: true });
    expect(mockRpc.mock.calls).toEqual([
      ['block_user', { p_user_id: 'u1' }],
      ['unblock_user', { p_user_id: 'u1' }],
    ]);
  });

  it('errors are fixed text, never the database message', async () => {
    mockRpc.mockResolvedValue(DB_ERROR);
    for (const r of [await blockUser('u1'), await unblockUser('u1')]) {
      expect(r.ok).toBe(false);
      expect(r.error).not.toMatch(/permission|user_blocks|42501/);
    }
  });

  it('getMyBlockedUsers returns the rows, and throws on error for the Retry state', async () => {
    const rows = [{ user_id: 'u1', display_name: 'Asha', role: 'customer', blocked_at: '2026-09-26T10:00:00Z' }];
    mockRpc.mockResolvedValueOnce({ data: rows, error: null });
    await expect(getMyBlockedUsers()).resolves.toEqual(rows);
    expect(mockRpc).toHaveBeenCalledWith('get_my_blocked_users');
    mockRpc.mockResolvedValueOnce(DB_ERROR);
    await expect(getMyBlockedUsers()).rejects.toThrow('Could not load blocked people.');
  });

  it('isBookingChatBlocked is true only for a real true answer', async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(isBookingChatBlocked('b1')).resolves.toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('booking_chat_blocked', { p_booking_id: 'b1' });
    mockRpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(isBookingChatBlocked('b1')).resolves.toBe(false);
    // A failed check (e.g. offline) must not tell the user chat is unavailable.
    mockRpc.mockResolvedValueOnce(DB_ERROR);
    await expect(isBookingChatBlocked('b1')).resolves.toBe(false);
  });

  it('adminBlockedProviderIds returns ids, or [] on error', async () => {
    mockRpc.mockResolvedValueOnce({ data: ['p1', 'p2'], error: null });
    await expect(adminBlockedProviderIds('c1')).resolves.toEqual(['p1', 'p2']);
    expect(mockRpc).toHaveBeenCalledWith('admin_blocked_provider_ids', { p_customer_id: 'c1' });
    mockRpc.mockResolvedValueOnce(DB_ERROR);
    await expect(adminBlockedProviderIds('c1')).resolves.toEqual([]);
  });
});

// D-12 / C-05 (O-72-1, the owner's wording of 2026-10-02 11:16, still pending the owner's signed approval): there is
// no cancel button in the app at any stage (O-CANCEL1), so the blocked-chat notice must not suggest one. It says how
// to request cancellation by email, and must never imply that the email itself cancels the booking.
describe('CHAT_BLOCKED_NOTICE', () => {
  it("is the owner's 11:16 wording (O-72-1)", () => {
    expect(CHAT_BLOCKED_NOTICE).toBe(
      "Chat isn't available for this booking. To request cancellation, email KwikServe Support at support@kwikserve.co.ke.",
    );
  });

  it('does not suggest an in-app cancel', () => {
    expect(CHAT_BLOCKED_NOTICE).not.toMatch(/still cancel|cancel the booking|cancel button|tap cancel/i);
  });

  it('presents the email as a request for cancellation', () => {
    expect(CHAT_BLOCKED_NOTICE).toMatch(/request cancellation/i);
  });

  it('does not imply that the email itself cancels the booking', () => {
    expect(CHAT_BLOCKED_NOTICE).not.toMatch(/\bto cancel\b|will be cancell?ed|cancels (your|the) booking|is cancell?ed/i);
  });

  it('names the support mailbox exactly as the rest of the app does', () => {
    expect(CHAT_BLOCKED_NOTICE).toContain(SUPPORT_NAME);
    expect(CHAT_BLOCKED_NOTICE).toContain(SUPPORT_EMAIL);
  });
});
