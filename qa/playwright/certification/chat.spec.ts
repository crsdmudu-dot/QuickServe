import { test, expect, type APIRequestContext } from '@playwright/test';
import { certificationConfigured, certificationSkipReason } from '../support/connected/qa-accounts';
import { anonContext, authedContextWithUser } from '../support/connected/qa-client';
import {
  createCustomerBooking,
  assignProvider,
  setBookingStatus,
  readBookingNotifications,
  deleteBookingsByIds,
} from '../support/connected/qa-bookings';
import {
  makeActiveBooking,
  sendMessageRaw,
  getMessages,
  updateMessageRaw,
  deleteMessageRaw,
  chatPeerName,
} from '../support/connected/qa-chat';

/**
 * Phase 2D — Chat & Messaging (CONNECTED).
 *
 * The booking IS the conversation (no separate conversation/participant tables).
 * Exercises the REAL booking_messages RLS + constraints of the dedicated QA project:
 * participant send/read, admin read-only, unrelated/anon denial, sender-spoof denial,
 * message-length integrity, the active-booking + assigned-provider gates, ordering,
 * duplicate (no-dedup) behavior, booking isolation, the absence of update/delete, the
 * message→notification async path, and the peer-name RPC. Every booking (cascading its
 * messages + notifications) is deleted in afterAll. Chromium-only; gated on
 * certificationConfigured() (never production).
 *
 * Scope: connected database/RLS validation only — NOT realtime websocket delivery
 * (booking_messages is not in the realtime publication), push notifications, typing
 * indicators, read receipts (read_at is reserved/unused), or the UI chat flow.
 */
const P1 = { name: 'QA Provider One', phone: '+254700000001' };

test.describe('Phase 2D — Chat & Messaging', { tag: ['@certification', '@connected'] }, () => {
  let customerCtx: APIRequestContext;
  let customerId: string;
  let provider1Ctx: APIRequestContext;
  let provider1Id: string;
  let provider2Ctx: APIRequestContext;
  let provider2Id: string;
  let adminCtx: APIRequestContext;
  const bookingIds: string[] = [];

  test.beforeAll(async ({}, testInfo) => {
    if (!certificationConfigured() || testInfo.project.name !== 'chromium') return;
    const c = await authedContextWithUser('customer');
    customerCtx = c.ctx;
    customerId = c.userId;
    const p1 = await authedContextWithUser('provider1');
    provider1Ctx = p1.ctx;
    provider1Id = p1.userId;
    const p2 = await authedContextWithUser('provider2');
    provider2Ctx = p2.ctx;
    provider2Id = p2.userId;
    adminCtx = await authedContextWithUser('admin').then((a) => a.ctx);
  });

  test.afterAll(async () => {
    if (bookingIds.length) await deleteBookingsByIds(bookingIds);
    await customerCtx?.dispose();
    await provider1Ctx?.dispose();
    await provider2Ctx?.dispose();
    await adminCtx?.dispose();
  });

  test.beforeEach(({}, testInfo) => {
    test.skip(!certificationConfigured(), certificationSkipReason());
    test.skip(testInfo.project.name !== 'chromium', 'Connected coverage is Chromium-only.');
  });

  /** A messageable booking (assigned to provider1, active); tracked for cleanup. */
  async function active() {
    const id = await makeActiveBooking({ customerCtx, customerId, adminCtx, provider: { providerId: provider1Id, ...P1 } });
    bookingIds.push(id);
    return id;
  }

  // ── Message creation + persistence ────────────────────────────────────────

  test('creation: a customer and the assigned provider can message on an active booking', { tag: ['@p1'] }, async () => {
    const bookingId = await active();
    const c = await sendMessageRaw(customerCtx, { booking_id: bookingId, sender_id: customerId, message_text: 'Hello from customer' });
    expect(c.status, 'customer message accepted').toBe(201);
    const p = await sendMessageRaw(provider1Ctx, { booking_id: bookingId, sender_id: provider1Id, message_text: 'Reply from provider' });
    expect(p.status, 'provider message accepted').toBe(201);

    const msgs = await getMessages(adminCtx, bookingId);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].sender_id).toBe(customerId);
    expect(msgs[0].booking_id).toBe(bookingId);
    expect(msgs[0].created_at, 'timestamp persisted').toBeTruthy();
    expect(msgs[1].sender_id).toBe(provider1Id);
  });

  // ── Authorization / RLS ───────────────────────────────────────────────────

  test('authorization: both participants and admin can read the thread', { tag: ['@p1', '@security'] }, async () => {
    const bookingId = await active();
    await sendMessageRaw(customerCtx, { booking_id: bookingId, sender_id: customerId, message_text: 'visible?' });
    expect(await getMessages(customerCtx, bookingId), 'customer reads').toHaveLength(1);
    expect(await getMessages(provider1Ctx, bookingId), 'assigned provider reads').toHaveLength(1);
    expect(await getMessages(adminCtx, bookingId), 'admin reads').toHaveLength(1);
  });

  test('authorization: admin cannot send, and an unrelated provider can neither send nor read', { tag: ['@p1', '@security'] }, async () => {
    const bookingId = await active();
    await sendMessageRaw(customerCtx, { booking_id: bookingId, sender_id: customerId, message_text: 'hi' });
    // Admin is a reader, not a chat participant for insert.
    expect((await sendMessageRaw(adminCtx, { booking_id: bookingId, sender_id: customerId, message_text: 'admin msg' })).status, 'admin send denied').not.toBe(201);
    // Unrelated provider (not assigned): no send, no read.
    expect((await sendMessageRaw(provider2Ctx, { booking_id: bookingId, sender_id: provider2Id, message_text: 'intruder' })).status, 'unrelated send denied').not.toBe(201);
    expect(await getMessages(provider2Ctx, bookingId), 'unrelated read empty').toHaveLength(0);
  });

  test('authorization: an anonymous user can neither send nor read', { tag: ['@p1', '@security'] }, async () => {
    const bookingId = await active();
    await sendMessageRaw(customerCtx, { booking_id: bookingId, sender_id: customerId, message_text: 'hi' });
    const anon = await anonContext();
    try {
      const send = await anon.post('/rest/v1/booking_messages', {
        headers: { 'Content-Type': 'application/json' },
        data: { booking_id: bookingId, sender_id: customerId, message_text: 'anon' },
      });
      expect([401, 403]).toContain(send.status());
      const read = await anon.get(`/rest/v1/booking_messages?booking_id=eq.${bookingId}&select=id`);
      expect(await read.json()).toEqual([]);
    } finally {
      await anon.dispose();
    }
  });

  test('authorization: a sender cannot spoof another user as the message author', { tag: ['@p1', '@security'] }, async () => {
    const bookingId = await active();
    // Customer tries to post as the provider (sender_id != auth.uid()).
    const r = await sendMessageRaw(customerCtx, { booking_id: bookingId, sender_id: provider1Id, message_text: 'spoofed' });
    expect(r.status, 'sender spoofing denied').not.toBe(201);
  });

  // ── Message integrity ─────────────────────────────────────────────────────

  test('integrity: empty, whitespace-only, oversized, and missing text are rejected; a 2000-char message is accepted', { tag: ['@p1', '@security'] }, async () => {
    const bookingId = await active();
    for (const bad of ['', '   ', 'x'.repeat(2001)]) {
      expect((await sendMessageRaw(customerCtx, { booking_id: bookingId, sender_id: customerId, message_text: bad })).status, `rejected: ${bad.length} chars`).not.toBe(201);
    }
    // Missing message_text entirely.
    expect((await sendMessageRaw(customerCtx, { booking_id: bookingId, sender_id: customerId })).status, 'missing text rejected').not.toBe(201);
    // Boundary: exactly 2000 chars is accepted.
    expect((await sendMessageRaw(customerCtx, { booking_id: bookingId, sender_id: customerId, message_text: 'y'.repeat(2000) })).status, '2000 chars accepted').toBe(201);
  });

  // ── Booking-state gates ───────────────────────────────────────────────────

  test('gate: a completed booking is not messageable', { tag: ['@p1', '@security'] }, async () => {
    const bookingId = await active();
    for (const s of ['on_the_way', 'in_progress', 'completed']) await setBookingStatus(provider1Ctx, bookingId, s);
    const r = await sendMessageRaw(customerCtx, { booking_id: bookingId, sender_id: customerId, message_text: 'after completion' });
    expect(r.status, 'messaging denied on completed booking').not.toBe(201);
  });

  test('gate: a booking with no assigned provider is not messageable', { tag: ['@p1', '@security'] }, async () => {
    const booking = await createCustomerBooking(customerCtx, customerId);
    bookingIds.push(booking.id);
    const r = await sendMessageRaw(customerCtx, { booking_id: booking.id, sender_id: customerId, message_text: 'no provider yet' });
    expect(r.status, 'messaging denied without an assigned provider').not.toBe(201);
  });

  // ── Ordering, duplicates, isolation ───────────────────────────────────────

  test('ordering: messages are returned in created_at order', { tag: ['@p1', '@integrity'] }, async () => {
    const bookingId = await active();
    for (const [ctx, sid, txt] of [
      [customerCtx, customerId, 'first'],
      [provider1Ctx, provider1Id, 'second'],
      [customerCtx, customerId, 'third'],
    ] as const) {
      expect((await sendMessageRaw(ctx, { booking_id: bookingId, sender_id: sid, message_text: txt })).status).toBe(201);
    }
    const msgs = await getMessages(customerCtx, bookingId);
    expect(msgs.map((m) => m.message_text)).toEqual(['first', 'second', 'third']);
  });

  test('duplicates: identical messages are stored as distinct rows (no false dedup)', { tag: ['@p1', '@integrity'] }, async () => {
    const bookingId = await active();
    await sendMessageRaw(customerCtx, { booking_id: bookingId, sender_id: customerId, message_text: 'same text' });
    await sendMessageRaw(customerCtx, { booking_id: bookingId, sender_id: customerId, message_text: 'same text' });
    const msgs = await getMessages(customerCtx, bookingId);
    expect(msgs.filter((m) => m.message_text === 'same text'), 'two distinct rows').toHaveLength(2);
    expect(msgs[0].id).not.toBe(msgs[1].id);
  });

  test('isolation: messages never cross booking boundaries', { tag: ['@p1', '@security'] }, async () => {
    const a = await active();
    const b = await active();
    await sendMessageRaw(customerCtx, { booking_id: a, sender_id: customerId, message_text: 'in A' });
    const inB = await getMessages(customerCtx, b);
    expect(inB, "B's thread does not contain A's message").toHaveLength(0);
  });

  // ── Update / delete (unsupported) ─────────────────────────────────────────

  test('immutability: messages cannot be updated or deleted by any user', { tag: ['@p1', '@integrity'] }, async () => {
    const bookingId = await active();
    const sent = await sendMessageRaw(customerCtx, { booking_id: bookingId, sender_id: customerId, message_text: 'permanent' });
    const id = sent.id as string;
    expect((await updateMessageRaw(customerCtx, id, 'edited')).changed, 'no update policy').toBe(0);
    expect((await deleteMessageRaw(customerCtx, id)).deleted, 'customer cannot delete').toBe(0);
    expect((await deleteMessageRaw(adminCtx, id)).deleted, 'admin cannot delete (no delete policy)').toBe(0);
    expect(await getMessages(customerCtx, bookingId), 'message persists unchanged').toHaveLength(1);
    expect((await getMessages(customerCtx, bookingId))[0].message_text).toBe('permanent');
  });

  // ── Async signaling + peer-name RPC (chat-support DB behavior) ─────────────

  test('async signaling: a message creates a chat notification for the peer', { tag: ['@p1'] }, async () => {
    const bookingId = await active();
    await sendMessageRaw(customerCtx, { booking_id: bookingId, sender_id: customerId, message_text: 'ping' });
    // tg_notify_chat_message notifies the recipient (the provider); provider reads own notifications.
    const notifs = await readBookingNotifications(provider1Ctx, bookingId);
    expect(notifs.some((n) => n.type === 'chat_message'), 'peer got a chat_message notification').toBe(true);
  });

  test('peer name: the RPC returns a peer for a participant and null for a non-participant', { tag: ['@p1', '@security'] }, async () => {
    const bookingId = await active();
    expect(await chatPeerName(customerCtx, bookingId), 'customer sees provider peer').toBeTruthy();
    expect(await chatPeerName(provider1Ctx, bookingId), 'provider sees customer peer').toBeTruthy();
    expect(await chatPeerName(provider2Ctx, bookingId), 'non-participant gets null').toBeNull();
  });
});
