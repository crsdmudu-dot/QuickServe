// recent-services.test.ts — Tests for src/lib/recent-services.ts
// Mocks @/lib/bookings so no Supabase calls are made.

import { getRecentlyUsedServices } from '@/lib/recent-services';
import type { Booking } from '@/lib/bookings';

// ── Mock @/lib/bookings ────────────────────────────────────────────────────

const mockGetCustomerBookings = jest.fn();

jest.mock('@/lib/bookings', () => ({
  getCustomerBookings: (...a: unknown[]) => mockGetCustomerBookings(...a),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a minimal Booking stub with just the fields we need. */
function makeBooking(service_id: string): Booking {
  return {
    id: `booking-${service_id}-${Math.random()}`,
    service_id,
    address: '123 Test St',
    scheduled_for: '2026-01-01T10:00:00Z',
    notes: null,
    status: 'pending',
    created_at: '2026-01-01T10:00:00Z',
    assigned_provider_name: null,
    assigned_provider_phone: null,
    admin_notes: null,
    assigned_provider_id: null,
    quoted_amount: null,
    provider_share: null,
    quote_status: 'pending',
    customer_id: 'customer-1',
    address_label: null,
    latitude: null,
    longitude: null,
    building_name: null,
    floor: null,
    door_number: null,
    landmark: null,
    access_notes: null,
    scheduling_type: 'datetime',
    time_window: null,
    window_start: null,
    window_end: null,
    recurrence: 'one_time',
  };
}

// ── getRecentlyUsedServices ────────────────────────────────────────────────

describe('getRecentlyUsedServices', () => {
  it('returns [] when bookings list is empty', async () => {
    mockGetCustomerBookings.mockResolvedValue([]);
    const result = await getRecentlyUsedServices();
    expect(result).toEqual([]);
  });

  it('returns [] when getCustomerBookings throws', async () => {
    mockGetCustomerBookings.mockRejectedValue(new Error('Network error'));
    const result = await getRecentlyUsedServices();
    expect(result).toEqual([]);
  });

  it('returns [] when getCustomerBookings returns null', async () => {
    mockGetCustomerBookings.mockResolvedValue(null);
    const result = await getRecentlyUsedServices();
    expect(result).toEqual([]);
  });

  it('maps a single booking service_id to its Service', async () => {
    mockGetCustomerBookings.mockResolvedValue([makeBooking('plumbing')]);
    const result = await getRecentlyUsedServices();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('plumbing');
    expect(result[0].title).toBe('Plumbing');
  });

  it('deduplicates service_ids and preserves newest-first order', async () => {
    mockGetCustomerBookings.mockResolvedValue([
      makeBooking('plumbing'),      // first (newest)
      makeBooking('house-cleaning'), // second
      makeBooking('plumbing'),      // duplicate — should be dropped
      makeBooking('massage'),       // third
    ]);
    const result = await getRecentlyUsedServices();
    const ids = result.map((s) => s.id);
    expect(ids).toEqual(['plumbing', 'house-cleaning', 'massage']);
  });

  it('drops unknown service_ids (ids not in SERVICES catalog)', async () => {
    mockGetCustomerBookings.mockResolvedValue([
      makeBooking('unknown-service-xyz'),
      makeBooking('plumbing'),
    ]);
    const result = await getRecentlyUsedServices();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('plumbing');
  });

  it('caps results at the default limit (6)', async () => {
    mockGetCustomerBookings.mockResolvedValue([
      makeBooking('plumbing'),
      makeBooking('house-cleaning'),
      makeBooking('electrical'),
      makeBooking('ac-repair'),
      makeBooking('painting'),
      makeBooking('pest-control'),
      makeBooking('handyman'),      // 7th — should be dropped
      makeBooking('mechanic'),      // 8th — should be dropped
    ]);
    const result = await getRecentlyUsedServices();
    expect(result).toHaveLength(6);
  });

  it('respects a custom limit', async () => {
    mockGetCustomerBookings.mockResolvedValue([
      makeBooking('plumbing'),
      makeBooking('house-cleaning'),
      makeBooking('electrical'),
    ]);
    const result = await getRecentlyUsedServices(2);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('plumbing');
    expect(result[1].id).toBe('house-cleaning');
  });

  it('does NOT call any write operations (read-only)', async () => {
    mockGetCustomerBookings.mockResolvedValue([makeBooking('plumbing')]);
    await getRecentlyUsedServices();
    // getCustomerBookings is called once and no other booking functions are called
    expect(mockGetCustomerBookings).toHaveBeenCalledTimes(1);
  });

  it('returns valid Service objects with required fields', async () => {
    mockGetCustomerBookings.mockResolvedValue([
      makeBooking('food-delivery'),
      makeBooking('massage'),
    ]);
    const result = await getRecentlyUsedServices();
    for (const svc of result) {
      expect(typeof svc.id).toBe('string');
      expect(typeof svc.title).toBe('string');
      expect(typeof svc.icon).toBe('string');
      expect(['home', 'auto', 'delivery', 'personal']).toContain(svc.category);
    }
  });
});
