import {
  NOTIFICATION_TYPES,
  NOTIFICATION_FILTERS,
  PREFERENCE_TOGGLES,
  CATEGORY_LABELS,
  PRIORITY_LEVELS,
  notificationMeta,
  filterMatches,
  resolveNotificationDeepLink,
  type NotificationCategory,
} from '@/constants/notifications';
import { type AppNotification } from '@/lib/notifications';

// ── Helper ─────────────────────────────────────────────────────────────────

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n1',
    user_id: 'u1',
    booking_id: null,
    title: 'Test',
    body: 'Body',
    is_read: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── NOTIFICATION_TYPES catalog ────────────────────────────────────────────

describe('NOTIFICATION_TYPES', () => {
  const existingTypes = [
    'booking_assigned',
    'booking_cancelled',
    'booking_received',
    'payment_received',
    'payment_confirmed',
    'provider_assigned',
    'chat',
    'generic',
  ];

  const slice36Types = [
    // customer
    'booking_accepted',
    'provider_arriving',
    'provider_arrived',
    'job_started',
    'job_completed',
    'review_reminder',
    'promotion_available',
    'wallet_credit',
    'refund_processed',
    'general_announcement',
    // provider
    'new_job',
    'customer_message',
    'payment_released',
    'quality_action',
    'conduct_reminder',
    'system_announcement',
    // admin
    'new_support_case',
    'new_dispute',
    'new_provider_signup',
    'booking_exception',
    'failed_payment',
    'system_alert',
  ];

  const validCategories: NotificationCategory[] = ['booking', 'payment', 'promotion', 'system', 'quality', 'chat'];
  const validPriorities = ['low', 'normal', 'high', 'urgent'];

  it('includes all 8 existing types', () => {
    for (const t of existingTypes) {
      expect(NOTIFICATION_TYPES).toHaveProperty(t);
    }
  });

  it('includes all Slice 36 new types', () => {
    for (const t of slice36Types) {
      expect(NOTIFICATION_TYPES).toHaveProperty(t);
    }
  });

  it('every entry has a valid category', () => {
    for (const [type, meta] of Object.entries(NOTIFICATION_TYPES)) {
      expect(validCategories).toContain(meta.category),
        `${type} has invalid category: ${meta.category}`;
    }
  });

  it('every entry has a valid defaultPriority', () => {
    for (const [type, meta] of Object.entries(NOTIFICATION_TYPES)) {
      expect(validPriorities).toContain(meta.defaultPriority),
        `${type} has invalid defaultPriority: ${meta.defaultPriority}`;
    }
  });

  it('every entry has a non-empty label and icon', () => {
    for (const [type, meta] of Object.entries(NOTIFICATION_TYPES)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.icon.length).toBeGreaterThan(0);
    }
  });

  it('booking_assigned has category booking', () => {
    expect(NOTIFICATION_TYPES['booking_assigned'].category).toBe('booking');
  });

  it('payment_received has category payment', () => {
    expect(NOTIFICATION_TYPES['payment_received'].category).toBe('payment');
  });

  it('chat has category chat', () => {
    expect(NOTIFICATION_TYPES['chat'].category).toBe('chat');
  });

  it('quality_action has category quality', () => {
    expect(NOTIFICATION_TYPES['quality_action'].category).toBe('quality');
  });

  it('promotion_available has category promotion', () => {
    expect(NOTIFICATION_TYPES['promotion_available'].category).toBe('promotion');
  });
});

// ── notificationMeta ──────────────────────────────────────────────────────

describe('notificationMeta', () => {
  it('returns correct entry for known type', () => {
    const meta = notificationMeta('booking_accepted');
    expect(meta.category).toBe('booking');
    expect(meta.label.length).toBeGreaterThan(0);
  });

  it('returns generic fallback for unknown type', () => {
    const meta = notificationMeta('totally_unknown_type_xyz');
    expect(meta.label).toBe('Notification');
    expect(meta.category).toBe('system');
    expect(meta.defaultPriority).toBe('normal');
  });

  it('never throws', () => {
    expect(() => notificationMeta('')).not.toThrow();
    expect(() => notificationMeta('anything')).not.toThrow();
  });
});

// ── NOTIFICATION_FILTERS ──────────────────────────────────────────────────

describe('NOTIFICATION_FILTERS', () => {
  it('has exactly 6 filters', () => {
    expect(NOTIFICATION_FILTERS).toHaveLength(6);
  });

  it('has the 6 expected filter ids', () => {
    const ids = NOTIFICATION_FILTERS.map((f) => f.id);
    expect(ids).toContain('all');
    expect(ids).toContain('unread');
    expect(ids).toContain('booking');
    expect(ids).toContain('payments');
    expect(ids).toContain('promotions');
    expect(ids).toContain('system');
  });

  it('every filter has a non-empty label', () => {
    for (const f of NOTIFICATION_FILTERS) {
      expect(f.label.length).toBeGreaterThan(0);
    }
  });
});

// ── PREFERENCE_TOGGLES ────────────────────────────────────────────────────

describe('PREFERENCE_TOGGLES', () => {
  it('has exactly 8 toggles', () => {
    expect(PREFERENCE_TOGGLES).toHaveLength(8);
  });

  it('email_enabled is futureReady', () => {
    const emailToggle = PREFERENCE_TOGGLES.find((t) => t.key === 'email_enabled');
    expect(emailToggle).toBeDefined();
    expect(emailToggle?.futureReady).toBe(true);
  });

  it('sms_enabled is futureReady', () => {
    const smsToggle = PREFERENCE_TOGGLES.find((t) => t.key === 'sms_enabled');
    expect(smsToggle).toBeDefined();
    expect(smsToggle?.futureReady).toBe(true);
  });

  it('booking_enabled is NOT futureReady', () => {
    const bookingToggle = PREFERENCE_TOGGLES.find((t) => t.key === 'booking_enabled');
    expect(bookingToggle).toBeDefined();
    expect(bookingToggle?.futureReady).toBeFalsy();
  });

  it('includes all 8 expected keys', () => {
    const keys = PREFERENCE_TOGGLES.map((t) => t.key);
    expect(keys).toContain('booking_enabled');
    expect(keys).toContain('payment_enabled');
    expect(keys).toContain('marketing_enabled');
    expect(keys).toContain('quality_enabled');
    expect(keys).toContain('system_enabled');
    expect(keys).toContain('push_enabled');
    expect(keys).toContain('email_enabled');
    expect(keys).toContain('sms_enabled');
  });
});

// ── CATEGORY_LABELS ────────────────────────────────────────────────────────

describe('CATEGORY_LABELS', () => {
  it('has entries for all 6 categories', () => {
    const categories: NotificationCategory[] = ['booking', 'payment', 'promotion', 'system', 'quality', 'chat'];
    for (const cat of categories) {
      expect(CATEGORY_LABELS[cat]).toBeDefined();
      expect(CATEGORY_LABELS[cat].length).toBeGreaterThan(0);
    }
  });
});

// ── PRIORITY_LEVELS ───────────────────────────────────────────────────────

describe('PRIORITY_LEVELS', () => {
  it('has 4 priority levels', () => {
    expect(PRIORITY_LEVELS).toHaveLength(4);
  });

  it('ids are low/normal/high/urgent in order', () => {
    expect(PRIORITY_LEVELS.map((p) => p.id)).toEqual(['low', 'normal', 'high', 'urgent']);
  });

  it('every entry has a color string', () => {
    for (const p of PRIORITY_LEVELS) {
      expect(typeof p.color).toBe('string');
      expect(p.color.startsWith('#')).toBe(true);
    }
  });
});

// ── filterMatches ──────────────────────────────────────────────────────────

describe('filterMatches', () => {
  it('all → always true', () => {
    expect(filterMatches(makeNotification({ is_read: true, category: 'system' }), 'all')).toBe(true);
    expect(filterMatches(makeNotification({ is_read: false, category: 'booking' }), 'all')).toBe(true);
  });

  it('unread → true only for unread', () => {
    expect(filterMatches(makeNotification({ is_read: false }), 'unread')).toBe(true);
    expect(filterMatches(makeNotification({ is_read: true }), 'unread')).toBe(false);
  });

  it('booking → true for booking category', () => {
    expect(filterMatches(makeNotification({ category: 'booking' }), 'booking')).toBe(true);
    expect(filterMatches(makeNotification({ category: 'payment' }), 'booking')).toBe(false);
  });

  it('payments → true for payment category', () => {
    expect(filterMatches(makeNotification({ category: 'payment' }), 'payments')).toBe(true);
    expect(filterMatches(makeNotification({ category: 'system' }), 'payments')).toBe(false);
  });

  it('promotions → true for promotion category', () => {
    expect(filterMatches(makeNotification({ category: 'promotion' }), 'promotions')).toBe(true);
    expect(filterMatches(makeNotification({ category: 'booking' }), 'promotions')).toBe(false);
  });

  it('system → true for system category', () => {
    expect(filterMatches(makeNotification({ category: 'system' }), 'system')).toBe(true);
    expect(filterMatches(makeNotification({ category: 'chat' }), 'system')).toBe(false);
  });

  it('falls back to type catalog when category absent', () => {
    // wallet_credit is in the 'payment' category in NOTIFICATION_TYPES
    const n = makeNotification({ type: 'wallet_credit' });
    expect(filterMatches(n, 'payments')).toBe(true);
    expect(filterMatches(n, 'booking')).toBe(false);
  });
});

// ── resolveNotificationDeepLink ───────────────────────────────────────────

describe('resolveNotificationDeepLink', () => {
  it('prefers n.route when present', () => {
    const n = makeNotification({ route: '/custom/route', type: 'booking_assigned', booking_id: '123' });
    expect(resolveNotificationDeepLink(n)).toBe('/custom/route');
  });

  it('booking types with booking_id → /booking/:id', () => {
    expect(resolveNotificationDeepLink(makeNotification({ type: 'booking_assigned', booking_id: 'b1' }))).toBe('/booking/b1');
    expect(resolveNotificationDeepLink(makeNotification({ type: 'booking_accepted', booking_id: 'b2' }))).toBe('/booking/b2');
    expect(resolveNotificationDeepLink(makeNotification({ type: 'new_job', booking_id: 'b3' }))).toBe('/booking/b3');
  });

  it('booking types without booking_id → null', () => {
    expect(resolveNotificationDeepLink(makeNotification({ type: 'booking_assigned' }))).toBeNull();
  });

  it('booking_id from metadata_json when booking_id col is null', () => {
    const n = makeNotification({ type: 'job_completed', booking_id: null, metadata_json: { booking_id: 'mb1' } });
    expect(resolveNotificationDeepLink(n)).toBe('/booking/mb1');
  });

  it('review_reminder → /booking/review', () => {
    expect(resolveNotificationDeepLink(makeNotification({ type: 'review_reminder' }))).toBe('/booking/review');
  });

  it('payment types → /wallet', () => {
    for (const type of ['payment_received', 'payment_confirmed', 'payment_released', 'wallet_credit', 'refund_processed', 'failed_payment']) {
      expect(resolveNotificationDeepLink(makeNotification({ type }))).toBe('/wallet');
    }
  });

  it('quality/conduct types → /provider/quality', () => {
    expect(resolveNotificationDeepLink(makeNotification({ type: 'quality_action' }))).toBe('/provider/quality');
    expect(resolveNotificationDeepLink(makeNotification({ type: 'conduct_reminder' }))).toBe('/provider/quality');
  });

  it('new_support_case / new_dispute with meta.id → /(admin-web)/operations/:id', () => {
    const n1 = makeNotification({ type: 'new_support_case', metadata_json: { id: 'op1' } });
    expect(resolveNotificationDeepLink(n1)).toBe('/(admin-web)/operations/op1');
    const n2 = makeNotification({ type: 'new_dispute', metadata_json: { id: 'op2' } });
    expect(resolveNotificationDeepLink(n2)).toBe('/(admin-web)/operations/op2');
  });

  it('new_support_case without meta.id → null', () => {
    expect(resolveNotificationDeepLink(makeNotification({ type: 'new_support_case' }))).toBeNull();
  });

  it('new_provider_signup with provider_id → /(admin-web)/provider-quality/:id', () => {
    const n = makeNotification({ type: 'new_provider_signup', metadata_json: { provider_id: 'prov1' } });
    expect(resolveNotificationDeepLink(n)).toBe('/(admin-web)/provider-quality/prov1');
  });

  it('promotion_available → /promotions', () => {
    expect(resolveNotificationDeepLink(makeNotification({ type: 'promotion_available' }))).toBe('/promotions');
  });

  it('unknown type → null', () => {
    expect(resolveNotificationDeepLink(makeNotification({ type: 'totally_unknown' }))).toBeNull();
  });

  it('no type, no route → null', () => {
    expect(resolveNotificationDeepLink(makeNotification())).toBeNull();
  });

  it('never throws', () => {
    expect(() => resolveNotificationDeepLink(makeNotification({ type: undefined }))).not.toThrow();
    expect(() => resolveNotificationDeepLink(makeNotification({ type: 'chat' }))).not.toThrow();
  });
});
