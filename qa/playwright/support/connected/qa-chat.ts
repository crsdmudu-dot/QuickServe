import { type APIRequestContext } from '@playwright/test';
import { createCustomerBooking, assignProvider, type ProviderInfo } from './qa-bookings';
import { rpc } from './qa-payments';

/**
 * qa-chat.ts — connected chat/messaging primitives (Phase 2D).
 *
 * The chat "conversation" is the booking itself — there is no separate conversation
 * or participant table. `booking_messages` is participant-scoped (customer /
 * assigned provider / admin read; customer or assigned provider may send on an
 * ACTIVE booking with a provider assigned), immutable (no update/delete policy),
 * and message_text is length-constrained (1–2000 after trim). Cleanup reuses booking
 * teardown (messages cascade on booking delete).
 */

/** A booking assigned to a provider but NOT completed/cancelled — i.e. messageable. */
export async function makeActiveBooking(opts: {
  customerCtx: APIRequestContext;
  customerId: string;
  adminCtx: APIRequestContext;
  provider: ProviderInfo;
}): Promise<string> {
  const booking = await createCustomerBooking(opts.customerCtx, opts.customerId);
  await assignProvider(opts.adminCtx, booking.id, opts.provider); // status → 'provider_assigned' (active)
  return booking.id;
}

/** Send a message (raw) — returns HTTP status (for positive AND negative assertions). */
export async function sendMessageRaw(
  ctx: APIRequestContext,
  m: { booking_id: string; sender_id: string; message_text?: unknown },
): Promise<{ status: number; id: string | null; text: string }> {
  const data: Record<string, unknown> = { booking_id: m.booking_id, sender_id: m.sender_id };
  if (m.message_text !== undefined) data.message_text = m.message_text;
  const res = await ctx.post('/rest/v1/booking_messages', {
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    data,
  });
  const status = res.status();
  if (status === 201) {
    const arr = (await res.json()) as Record<string, unknown>[];
    return { status, id: (arr[0]?.id as string) ?? null, text: '' };
  }
  return { status, id: null, text: await res.text() };
}

/** Read a booking's messages visible to ctx, ordered by created_at (RLS applies). */
export async function getMessages(ctx: APIRequestContext, bookingId: string): Promise<Record<string, unknown>[]> {
  const res = await ctx.get(
    `/rest/v1/booking_messages?booking_id=eq.${bookingId}&select=id,booking_id,sender_id,message_text,created_at&order=created_at.asc`,
  );
  if (res.status() !== 200) throw new Error(`getMessages HTTP ${res.status()} — ${await res.text()}`);
  return (await res.json()) as Record<string, unknown>[];
}

/** Raw UPDATE on a message (to prove no update policy) — returns rows changed. */
export async function updateMessageRaw(ctx: APIRequestContext, id: string, text: string): Promise<{ status: number; changed: number }> {
  const res = await ctx.patch(`/rest/v1/booking_messages?id=eq.${id}`, {
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    data: { message_text: text },
  });
  const status = res.status();
  const changed = status === 200 ? ((await res.json()) as unknown[]).length : 0;
  return { status, changed };
}

/** Raw DELETE on a message (to prove no delete policy) — returns rows deleted. */
export async function deleteMessageRaw(ctx: APIRequestContext, id: string): Promise<{ status: number; deleted: number }> {
  const res = await ctx.delete(`/rest/v1/booking_messages?id=eq.${id}`, { headers: { Prefer: 'return=representation' } });
  const status = res.status();
  const deleted = status === 200 ? ((await res.json()) as unknown[]).length : 0;
  return { status, deleted };
}

/** The peer-name RPC (chat-support DB behavior): returns the other party's name for a participant. */
export async function chatPeerName(ctx: APIRequestContext, bookingId: string): Promise<unknown> {
  const r = await rpc(ctx, 'get_chat_peer_name', { p_booking_id: bookingId });
  return r.body;
}
