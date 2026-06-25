/**
 * notifications.ts — Pure notification routing helpers.
 *
 * PURE TypeScript — no network calls, no Deno-only APIs.
 * Uses only standard globals available in both Node and Deno.
 *
 * These helpers build notification specs and Expo push message objects.
 * They do NOT call fetch. The send-push Edge Function consumes these.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Describes a single push notification to be sent to one recipient. */
export type NotificationSpec = {
  recipientUserId: string;
  title: string;
  body: string;
  data: { type: string; route: string };
};

// ─── Booking update notifications ─────────────────────────────────────────────

/**
 * Derive 0–2 NotificationSpecs from a bookings AFTER UPDATE trigger.
 *
 * - Fires a STATUS spec only when `record.status` changed to a mapped value.
 * - Fires a QUOTE spec only when `record.quote_status` changed to `'sent'`.
 * - Skips any spec whose recipient id is null or empty.
 */
export function notificationsForBookingUpdate(
  record: {
    id: string;
    customer_id: string;
    assigned_provider_id: string | null;
    status: string;
    quote_status: string;
  },
  old: { status: string; quote_status: string },
): NotificationSpec[] {
  const specs: NotificationSpec[] = [];

  // ── Status spec ────────────────────────────────────────────────────────────
  if (record.status !== old.status) {
    const statusSpec = buildStatusSpec(record);
    if (statusSpec) {
      specs.push(statusSpec);
    }
  }

  // ── Quote spec ─────────────────────────────────────────────────────────────
  if (record.quote_status !== old.quote_status && record.quote_status === 'sent') {
    const recipient = record.customer_id;
    if (recipient) {
      specs.push({
        recipientUserId: recipient,
        title: 'You have a new quote',
        body: 'Tap to review your quote.',
        data: { type: 'quote_sent', route: `/booking/${record.id}` },
      });
    }
  }

  return specs;
}

/**
 * Build a status-change NotificationSpec for a booking, or null if the
 * status is unmapped or the recipient id is null/empty.
 */
function buildStatusSpec(record: {
  id: string;
  customer_id: string;
  assigned_provider_id: string | null;
  status: string;
}): NotificationSpec | null {
  switch (record.status) {
    case 'provider_assigned': {
      const recipient = record.assigned_provider_id;
      if (!recipient) return null;
      return {
        recipientUserId: recipient,
        title: 'New job assigned',
        body: 'You have been assigned a new job.',
        data: { type: 'booking_assigned', route: `/provider/job/${record.id}` },
      };
    }

    case 'accepted': {
      const recipient = record.customer_id;
      if (!recipient) return null;
      return {
        recipientUserId: recipient,
        title: 'Booking accepted',
        body: 'Your booking has been accepted.',
        data: { type: 'booking_accepted', route: `/booking/${record.id}` },
      };
    }

    case 'on_the_way': {
      const recipient = record.customer_id;
      if (!recipient) return null;
      return {
        recipientUserId: recipient,
        title: 'Your provider is on the way',
        body: 'Your provider is on the way.',
        data: { type: 'on_the_way', route: `/booking/${record.id}` },
      };
    }

    case 'in_progress': {
      const recipient = record.customer_id;
      if (!recipient) return null;
      return {
        recipientUserId: recipient,
        title: 'Work has started',
        body: 'Your provider has started the work.',
        data: { type: 'in_progress', route: `/booking/${record.id}` },
      };
    }

    case 'completed': {
      const recipient = record.customer_id;
      if (!recipient) return null;
      return {
        recipientUserId: recipient,
        title: 'Job completed',
        body: 'Your job has been completed.',
        data: { type: 'completed', route: `/booking/${record.id}` },
      };
    }

    default:
      return null;
  }
}

// ─── Payment paid notification ─────────────────────────────────────────────────

/**
 * Derive a NotificationSpec from a payments AFTER UPDATE trigger.
 *
 * Returns a spec when `record.status` becomes `'paid'` (was not `'paid'`),
 * otherwise returns null.
 */
export function notificationForPaymentPaid(
  record: { booking_id: string; customer_id: string; status: string },
  old: { status: string },
): NotificationSpec | null {
  if (record.status === 'paid' && old.status !== 'paid') {
    return {
      recipientUserId: record.customer_id,
      title: 'Payment confirmed',
      body: 'Your payment has been confirmed.',
      data: { type: 'payment_confirmed', route: `/booking/${record.booking_id}` },
    };
  }
  return null;
}

// ─── Chat message notification ─────────────────────────────────────────────────

/**
 * Derive a NotificationSpec from a booking_messages AFTER INSERT trigger.
 *
 * Notifies the participant who is NOT the sender.
 * - If the sender is the customer → notify the provider (assigned_provider_id).
 * - If the sender is the provider → notify the customer.
 * - Returns null when the recipient id is null or empty.
 *
 * Route:
 * - Customer recipient → `/booking/chat/${record.booking_id}`
 * - Provider recipient → `/provider/job/chat/${record.booking_id}`
 *
 * Body is trimmed to ≤80 characters; `'…'` is appended when truncated.
 */
export function notificationForChatMessage(
  record: { booking_id: string; sender_id: string; message_text: string },
  booking: { customer_id: string; assigned_provider_id: string | null },
): NotificationSpec | null {
  // Determine recipient: the participant who did NOT send the message.
  const isCustomerSender = booking.customer_id === record.sender_id;
  const recipient = isCustomerSender
    ? booking.assigned_provider_id
    : booking.customer_id;

  if (!recipient) return null;

  // Route depends on who receives the message.
  const recipientIsCustomer = !isCustomerSender;
  const route = recipientIsCustomer
    ? `/booking/chat/${record.booking_id}`
    : `/provider/job/chat/${record.booking_id}`;

  // Truncate body to 80 chars, append ellipsis when truncated.
  const rawBody = record.message_text;
  const body = rawBody.length > 80 ? rawBody.slice(0, 80) + '…' : rawBody;

  return {
    recipientUserId: recipient,
    title: 'New message',
    body,
    data: { type: 'chat_message', route },
  };
}

// ─── Expo push message builder ────────────────────────────────────────────────

/**
 * Build Expo push message objects for a spec across the recipient's tokens.
 *
 * Each returned message has `sound: 'default'` so the device plays a tone.
 */
export function buildExpoMessages(
  pushTokens: string[],
  spec: NotificationSpec,
): Array<{ to: string; title: string; body: string; data: NotificationSpec['data']; sound: 'default' }> {
  return pushTokens.map((token) => ({
    to: token,
    title: spec.title,
    body: spec.body,
    data: spec.data,
    sound: 'default' as const,
  }));
}

// ─── Expo push receipt parser ─────────────────────────────────────────────────

/**
 * Parse the Expo push response and return tokens that should be pruned.
 *
 * Expo responds `{ data: [ { status:'ok' } | { status:'error', details?: { error?: string } }, ... ] }`
 * aligned by index with `sentTokens`.
 *
 * Returns tokens where `data[i].status === 'error'` and
 * `details?.error === 'DeviceNotRegistered'`.
 *
 * Returns `[]` for any malformed / missing input (null-safe).
 */
export function parsePushReceipts(responseJson: unknown, sentTokens: string[]): string[] {
  if (responseJson === null || typeof responseJson !== 'object') return [];

  const obj = responseJson as Record<string, unknown>;
  const data = obj['data'];

  if (!Array.isArray(data)) return [];

  const pruned: string[] = [];

  for (let i = 0; i < data.length; i++) {
    const entry = data[i];
    if (entry === null || typeof entry !== 'object') continue;

    const e = entry as Record<string, unknown>;
    if (e['status'] !== 'error') continue;

    const details = e['details'];
    if (details === null || typeof details !== 'object') continue;

    const d = details as Record<string, unknown>;
    if (d['error'] === 'DeviceNotRegistered' && sentTokens[i] !== undefined) {
      pruned.push(sentTokens[i]);
    }
  }

  return pruned;
}
