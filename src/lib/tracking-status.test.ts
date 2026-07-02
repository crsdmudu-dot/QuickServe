/**
 * tracking-status.test.ts — Tests for the customer-facing tracking label helper.
 */
import { trackingLabel } from '@/lib/tracking-status';
import type { BookingStatus } from '@/constants/booking-status';

describe('trackingLabel', () => {
  // ─── on_the_way ─────────────────────────────────────────────────────────────

  describe('on_the_way', () => {
    it('0.05 km → "Arrived" (< 0.1 km threshold)', () => {
      expect(trackingLabel('on_the_way', 0.05)).toBe('Arrived');
    });

    it('0.0 km → "Arrived"', () => {
      expect(trackingLabel('on_the_way', 0)).toBe('Arrived');
    });

    it('0.09 km → "Arrived" (just under 0.1 km)', () => {
      expect(trackingLabel('on_the_way', 0.09)).toBe('Arrived');
    });

    it('0.1 km → "Nearby" (exactly 0.1, not < 0.1)', () => {
      expect(trackingLabel('on_the_way', 0.1)).toBe('Nearby');
    });

    it('0.3 km → "Nearby" (< 0.5 km threshold)', () => {
      expect(trackingLabel('on_the_way', 0.3)).toBe('Nearby');
    });

    it('0.49 km → "Nearby" (just under 0.5 km)', () => {
      expect(trackingLabel('on_the_way', 0.49)).toBe('Nearby');
    });

    it('0.5 km → "Heading to you" (exactly 0.5, not < 0.5)', () => {
      expect(trackingLabel('on_the_way', 0.5)).toBe('Heading to you');
    });

    it('2 km → "Heading to you"', () => {
      expect(trackingLabel('on_the_way', 2)).toBe('Heading to you');
    });

    it('undefined distance → "Heading to you"', () => {
      expect(trackingLabel('on_the_way', undefined)).toBe('Heading to you');
    });

    it('no distance argument → "Heading to you"', () => {
      expect(trackingLabel('on_the_way')).toBe('Heading to you');
    });
  });

  // ─── in_progress ────────────────────────────────────────────────────────────

  describe('in_progress', () => {
    it('→ "Work started"', () => {
      expect(trackingLabel('in_progress')).toBe('Work started');
    });

    it('ignores distanceKm', () => {
      expect(trackingLabel('in_progress', 0.5)).toBe('Work started');
    });
  });

  // ─── completed ───────────────────────────────────────────────────────────────

  describe('completed', () => {
    it('→ "Work completed"', () => {
      expect(trackingLabel('completed')).toBe('Work completed');
    });
  });

  // ─── statuses that return null ───────────────────────────────────────────────

  describe('statuses with no tracking label', () => {
    const noTrackingStatuses: BookingStatus[] = [
      'pending',
      'accepted',
      'provider_assigned',
      'cancelled',
    ];

    for (const status of noTrackingStatuses) {
      it(`${status} → null`, () => {
        expect(trackingLabel(status)).toBeNull();
      });
    }
  });
});
