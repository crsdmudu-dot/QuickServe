/**
 * notifications.test.ts — Jest tests for the pure notification helpers.
 *
 * The module lives at supabase/functions/_shared/notifications.ts.
 * We import it via a relative path so Jest can resolve it without any
 * special module mapping (the file uses no Deno-only APIs).
 */
import {
  notificationsForBookingUpdate,
  notificationForPaymentPaid,
  notificationForChatMessage,
  buildExpoMessages,
  parsePushReceipts,
  isPushAllowed,
  specFromNotificationRow,
  type NotificationSpec,
} from '../../supabase/functions/_shared/notifications';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal booking record for notificationsForBookingUpdate tests. */
function makeRecord(overrides: Partial<{
  id: string;
  customer_id: string;
  assigned_provider_id: string | null;
  status: string;
  quote_status: string;
}> = {}) {
  return {
    id: 'bk1',
    customer_id: 'cust1',
    assigned_provider_id: 'prov1',
    status: 'pending',
    quote_status: 'none',
    ...overrides,
  };
}

function makeOld(overrides: Partial<{ status: string; quote_status: string }> = {}) {
  return { status: 'pending', quote_status: 'none', ...overrides };
}

// ─── notificationsForBookingUpdate ────────────────────────────────────────────

describe('notificationsForBookingUpdate', () => {
  describe('status transitions', () => {
    it('provider_assigned → notifies provider via booking_assigned', () => {
      const specs = notificationsForBookingUpdate(
        makeRecord({ status: 'provider_assigned', assigned_provider_id: 'prov1' }),
        makeOld({ status: 'pending' }),
      );
      expect(specs).toHaveLength(1);
      const spec = specs[0];
      expect(spec.recipientUserId).toBe('prov1');
      expect(spec.title).toBe('New job assigned');
      expect(spec.data.type).toBe('booking_assigned');
      expect(spec.data.route).toBe('/provider/job/bk1');
    });

    it('accepted → notifies customer via booking_accepted', () => {
      const specs = notificationsForBookingUpdate(
        makeRecord({ status: 'accepted' }),
        makeOld({ status: 'pending' }),
      );
      expect(specs).toHaveLength(1);
      const spec = specs[0];
      expect(spec.recipientUserId).toBe('cust1');
      expect(spec.title).toBe('Booking accepted');
      expect(spec.data.type).toBe('booking_accepted');
      expect(spec.data.route).toBe('/booking/bk1');
    });

    it('on_the_way → notifies customer', () => {
      const specs = notificationsForBookingUpdate(
        makeRecord({ status: 'on_the_way' }),
        makeOld({ status: 'accepted' }),
      );
      expect(specs).toHaveLength(1);
      const spec = specs[0];
      expect(spec.recipientUserId).toBe('cust1');
      expect(spec.title).toBe('Your provider is on the way');
      expect(spec.data.type).toBe('on_the_way');
      expect(spec.data.route).toBe('/booking/bk1');
    });

    it('in_progress → notifies customer', () => {
      const specs = notificationsForBookingUpdate(
        makeRecord({ status: 'in_progress' }),
        makeOld({ status: 'on_the_way' }),
      );
      expect(specs).toHaveLength(1);
      const spec = specs[0];
      expect(spec.recipientUserId).toBe('cust1');
      expect(spec.title).toBe('Work has started');
      expect(spec.data.type).toBe('in_progress');
      expect(spec.data.route).toBe('/booking/bk1');
    });

    it('completed → notifies customer', () => {
      const specs = notificationsForBookingUpdate(
        makeRecord({ status: 'completed' }),
        makeOld({ status: 'in_progress' }),
      );
      expect(specs).toHaveLength(1);
      const spec = specs[0];
      expect(spec.recipientUserId).toBe('cust1');
      expect(spec.title).toBe('Job completed');
      expect(spec.data.type).toBe('completed');
      expect(spec.data.route).toBe('/booking/bk1');
    });

    it('provider_assigned with null assigned_provider_id → []', () => {
      const specs = notificationsForBookingUpdate(
        makeRecord({ status: 'provider_assigned', assigned_provider_id: null }),
        makeOld({ status: 'pending' }),
      );
      expect(specs).toHaveLength(0);
    });

    it('unchanged status with no quote change → []', () => {
      const specs = notificationsForBookingUpdate(
        makeRecord({ status: 'accepted', quote_status: 'none' }),
        makeOld({ status: 'accepted', quote_status: 'none' }),
      );
      expect(specs).toHaveLength(0);
    });

    it('any other status → no status spec', () => {
      const specs = notificationsForBookingUpdate(
        makeRecord({ status: 'cancelled' }),
        makeOld({ status: 'pending' }),
      );
      expect(specs).toHaveLength(0);
    });
  });

  describe('quote_status transitions', () => {
    it('quote_status → "sent" only when it changed → fires quote spec', () => {
      const specs = notificationsForBookingUpdate(
        makeRecord({ status: 'accepted', quote_status: 'sent' }),
        makeOld({ status: 'accepted', quote_status: 'none' }),
      );
      expect(specs).toHaveLength(1);
      const spec = specs[0];
      expect(spec.recipientUserId).toBe('cust1');
      expect(spec.title).toBe('You have a new quote');
      expect(spec.body).toBe('Tap to review your quote.');
      expect(spec.data.type).toBe('quote_sent');
      expect(spec.data.route).toBe('/booking/bk1');
    });

    it('quote_status already "sent" (unchanged) → no quote spec', () => {
      const specs = notificationsForBookingUpdate(
        makeRecord({ status: 'accepted', quote_status: 'sent' }),
        makeOld({ status: 'accepted', quote_status: 'sent' }),
      );
      expect(specs).toHaveLength(0);
    });
  });

  describe('both status and quote changed', () => {
    it('status + quote both changed → returns 2 specs', () => {
      const specs = notificationsForBookingUpdate(
        makeRecord({ status: 'accepted', quote_status: 'sent' }),
        makeOld({ status: 'pending', quote_status: 'none' }),
      );
      expect(specs).toHaveLength(2);
      const types = specs.map((s) => s.data.type);
      expect(types).toContain('booking_accepted');
      expect(types).toContain('quote_sent');
    });
  });
});

// ─── notificationForPaymentPaid ───────────────────────────────────────────────

describe('notificationForPaymentPaid', () => {
  it('paid transition → returns payment_confirmed spec', () => {
    const spec = notificationForPaymentPaid(
      { booking_id: 'bk1', customer_id: 'cust1', status: 'paid' },
      { status: 'pending' },
    );
    expect(spec).not.toBeNull();
    expect(spec!.recipientUserId).toBe('cust1');
    expect(spec!.title).toBe('Payment confirmed');
    expect(spec!.body).toBe('Your payment has been confirmed.');
    expect(spec!.data.type).toBe('payment_confirmed');
    expect(spec!.data.route).toBe('/booking/bk1');
  });

  it('already paid (old.status="paid") → null', () => {
    const spec = notificationForPaymentPaid(
      { booking_id: 'bk1', customer_id: 'cust1', status: 'paid' },
      { status: 'paid' },
    );
    expect(spec).toBeNull();
  });

  it('not paid yet (status="pending") → null', () => {
    const spec = notificationForPaymentPaid(
      { booking_id: 'bk1', customer_id: 'cust1', status: 'pending' },
      { status: 'unpaid' },
    );
    expect(spec).toBeNull();
  });
});

// ─── notificationForChatMessage ───────────────────────────────────────────────

describe('notificationForChatMessage', () => {
  const booking = { customer_id: 'cust1', assigned_provider_id: 'prov1' };

  it('sender = customer → recipient = provider + /provider/job/chat/… route', () => {
    const spec = notificationForChatMessage(
      { booking_id: 'bk1', sender_id: 'cust1', message_text: 'Hello there' },
      booking,
    );
    expect(spec).not.toBeNull();
    expect(spec!.recipientUserId).toBe('prov1');
    expect(spec!.data.route).toBe('/provider/job/chat/bk1');
    expect(spec!.title).toBe('New message');
    expect(spec!.data.type).toBe('chat_message');
  });

  it('sender = provider → recipient = customer + /booking/chat/… route', () => {
    const spec = notificationForChatMessage(
      { booking_id: 'bk1', sender_id: 'prov1', message_text: 'On my way' },
      booking,
    );
    expect(spec).not.toBeNull();
    expect(spec!.recipientUserId).toBe('cust1');
    expect(spec!.data.route).toBe('/booking/chat/bk1');
    expect(spec!.title).toBe('New message');
    expect(spec!.data.type).toBe('chat_message');
  });

  it('null assigned_provider_id with customer sender → null', () => {
    const spec = notificationForChatMessage(
      { booking_id: 'bk1', sender_id: 'cust1', message_text: 'Hi' },
      { customer_id: 'cust1', assigned_provider_id: null },
    );
    expect(spec).toBeNull();
  });

  it('long message body is truncated to 80 chars + "…"', () => {
    const longMessage = 'A'.repeat(100);
    const spec = notificationForChatMessage(
      { booking_id: 'bk1', sender_id: 'prov1', message_text: longMessage },
      booking,
    );
    expect(spec).not.toBeNull();
    expect(spec!.body).toBe('A'.repeat(80) + '…');
  });

  it('message body exactly 80 chars is not truncated', () => {
    const exactMessage = 'B'.repeat(80);
    const spec = notificationForChatMessage(
      { booking_id: 'bk1', sender_id: 'prov1', message_text: exactMessage },
      booking,
    );
    expect(spec).not.toBeNull();
    expect(spec!.body).toBe(exactMessage);
    expect(spec!.body).not.toContain('…');
  });
});

// ─── buildExpoMessages ────────────────────────────────────────────────────────

describe('buildExpoMessages', () => {
  const spec: NotificationSpec = {
    recipientUserId: 'u1',
    title: 'Hello',
    body: 'World',
    data: { type: 'test_type', route: '/test' },
  };

  it('two tokens → two messages', () => {
    const messages = buildExpoMessages(['tok1', 'tok2'], spec);
    expect(messages).toHaveLength(2);
  });

  it('each message has sound: "default"', () => {
    const messages = buildExpoMessages(['tok1', 'tok2'], spec);
    for (const msg of messages) {
      expect(msg.sound).toBe('default');
    }
  });

  it('each message has the correct to, title, body, data fields', () => {
    const messages = buildExpoMessages(['tok1', 'tok2'], spec);
    expect(messages[0]).toMatchObject({
      to: 'tok1',
      title: 'Hello',
      body: 'World',
      data: { type: 'test_type', route: '/test' },
      sound: 'default',
    });
    expect(messages[1]).toMatchObject({
      to: 'tok2',
      title: 'Hello',
      body: 'World',
      data: { type: 'test_type', route: '/test' },
      sound: 'default',
    });
  });

  it('empty token list → empty array', () => {
    const messages = buildExpoMessages([], spec);
    expect(messages).toHaveLength(0);
  });
});

// ─── parsePushReceipts ────────────────────────────────────────────────────────

describe('parsePushReceipts', () => {
  it('mixed [ok, error:DeviceNotRegistered] → returns only the bad token', () => {
    const response = {
      data: [
        { status: 'ok' },
        { status: 'error', details: { error: 'DeviceNotRegistered' } },
      ],
    };
    const result = parsePushReceipts(response, ['tok1', 'tok2']);
    expect(result).toEqual(['tok2']);
  });

  it('all ok → returns []', () => {
    const response = {
      data: [{ status: 'ok' }, { status: 'ok' }],
    };
    const result = parsePushReceipts(response, ['tok1', 'tok2']);
    expect(result).toEqual([]);
  });

  it('error with different error type → not pruned', () => {
    const response = {
      data: [
        { status: 'error', details: { error: 'MessageTooBig' } },
      ],
    };
    const result = parsePushReceipts(response, ['tok1']);
    expect(result).toEqual([]);
  });

  it('malformed input (null) → []', () => {
    expect(parsePushReceipts(null, ['tok1'])).toEqual([]);
  });

  it('malformed input (no data field) → []', () => {
    expect(parsePushReceipts({}, ['tok1'])).toEqual([]);
  });

  it('malformed input (data is not array) → []', () => {
    expect(parsePushReceipts({ data: 'bad' }, ['tok1'])).toEqual([]);
  });

  it('entry with missing details → not pruned', () => {
    const response = {
      data: [
        { status: 'error' },
      ],
    };
    const result = parsePushReceipts(response, ['tok1']);
    expect(result).toEqual([]);
  });
});

// ─── isPushAllowed ────────────────────────────────────────────────────────────

describe('isPushAllowed', () => {
  it('push_enabled: false blocks every category', () => {
    const prefs = { push_enabled: false };
    for (const cat of ['chat', 'booking', 'payment', 'marketing', 'system']) {
      expect(isPushAllowed(prefs, cat)).toBe(false);
    }
  });

  it('booking_enabled:false → booking false, chat still true', () => {
    const prefs = { push_enabled: true, booking_enabled: false };
    expect(isPushAllowed(prefs, 'booking')).toBe(false);
    expect(isPushAllowed(prefs, 'chat')).toBe(true);
  });

  it('chat_enabled:false → chat false, payment still true', () => {
    const prefs = { push_enabled: true, chat_enabled: false };
    expect(isPushAllowed(prefs, 'chat')).toBe(false);
    expect(isPushAllowed(prefs, 'payment')).toBe(true);
  });

  it('payment_enabled:false → payment false, booking still true', () => {
    const prefs = { push_enabled: true, payment_enabled: false };
    expect(isPushAllowed(prefs, 'payment')).toBe(false);
    expect(isPushAllowed(prefs, 'booking')).toBe(true);
  });

  it('marketing_enabled:true explicitly → marketing allowed', () => {
    const prefs = { push_enabled: true, marketing_enabled: true };
    expect(isPushAllowed(prefs, 'marketing')).toBe(true);
  });

  it('marketing defaults OFF: {} → marketing false', () => {
    expect(isPushAllowed({}, 'marketing')).toBe(false);
  });

  it('marketing defaults OFF: null → marketing false', () => {
    expect(isPushAllowed(null, 'marketing')).toBe(false);
  });

  it('missing prefs (null) → booking/chat/payment true, system true, marketing false', () => {
    expect(isPushAllowed(null, 'booking')).toBe(true);
    expect(isPushAllowed(null, 'chat')).toBe(true);
    expect(isPushAllowed(null, 'payment')).toBe(true);
    expect(isPushAllowed(null, 'system')).toBe(true);
    expect(isPushAllowed(null, 'marketing')).toBe(false);
  });

  it('missing prefs (undefined) → booking/chat/payment true, system true, marketing false', () => {
    expect(isPushAllowed(undefined, 'booking')).toBe(true);
    expect(isPushAllowed(undefined, 'chat')).toBe(true);
    expect(isPushAllowed(undefined, 'payment')).toBe(true);
    expect(isPushAllowed(undefined, 'system')).toBe(true);
    expect(isPushAllowed(undefined, 'marketing')).toBe(false);
  });

  it('system → true when push_enabled (default)', () => {
    expect(isPushAllowed({ push_enabled: true }, 'system')).toBe(true);
  });

  it('system → false when push_enabled: false', () => {
    expect(isPushAllowed({ push_enabled: false }, 'system')).toBe(false);
  });

  it('unknown category → true when push_enabled', () => {
    expect(isPushAllowed({ push_enabled: true }, 'other')).toBe(true);
    expect(isPushAllowed(null, 'other')).toBe(true);
  });
});

// ─── specFromNotificationRow ──────────────────────────────────────────────────

describe('specFromNotificationRow', () => {
  it('maps user_id → recipientUserId, title, body', () => {
    const spec = specFromNotificationRow({
      user_id: 'u1',
      title: 'Hello',
      body: 'World',
      type: 'booking_update',
      route: '/booking/bk1',
    });
    expect(spec.recipientUserId).toBe('u1');
    expect(spec.title).toBe('Hello');
    expect(spec.body).toBe('World');
  });

  it('maps type and route into data', () => {
    const spec = specFromNotificationRow({
      user_id: 'u1',
      title: 'T',
      body: 'B',
      type: 'payment_confirmed',
      route: '/booking/bk2',
    });
    expect(spec.data.type).toBe('payment_confirmed');
    expect(spec.data.route).toBe('/booking/bk2');
  });

  it('route: null → data.route === ""', () => {
    const spec = specFromNotificationRow({
      user_id: 'u1',
      title: 'T',
      body: 'B',
      type: 'system',
      route: null,
    });
    expect(spec.data.route).toBe('');
  });

  it('type missing → data.type === "generic"', () => {
    const spec = specFromNotificationRow({
      user_id: 'u1',
      title: 'T',
      body: 'B',
    });
    expect(spec.data.type).toBe('generic');
  });

  it('type: null → data.type === "generic"', () => {
    const spec = specFromNotificationRow({
      user_id: 'u1',
      title: 'T',
      body: 'B',
      type: null,
    });
    expect(spec.data.type).toBe('generic');
  });
});
