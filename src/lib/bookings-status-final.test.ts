/**
 * Update 74: updateBookingStatus turns the terminal-state guard's refusal (hardening H1, provisional migration 0077,
 * 'booking_status_final') into a plain message and a code the provider screen reloads on; any other
 * error keeps the existing generic text.
 */
import { updateBookingStatus } from '@/lib/bookings';
import { PROVIDER_STATUS_FINAL } from '@/constants/cancellation-copy';

const mockEq = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ update: () => ({ eq: (...a: unknown[]) => mockEq(...a) }) }) },
}));

describe('updateBookingStatus and the terminal-state guard', () => {
  it('maps booking_status_final to the plain message and the booking_final code', async () => {
    mockEq.mockResolvedValueOnce({ error: { message: 'booking_status_final', code: 'P0001' } });
    await expect(updateBookingStatus('b1', 'in_progress')).resolves.toEqual({
      ok: false,
      error: PROVIDER_STATUS_FINAL,
      code: 'booking_final',
    });
  });

  it('keeps the generic text for any other error, and ok on success', async () => {
    mockEq.mockResolvedValueOnce({ error: { message: 'new row violates row-level security policy', code: '42501' } });
    await expect(updateBookingStatus('b1', 'in_progress')).resolves.toEqual({
      ok: false,
      error: 'Could not update booking. Please try again.',
    });
    mockEq.mockResolvedValueOnce({ error: null });
    await expect(updateBookingStatus('b1', 'in_progress')).resolves.toEqual({ ok: true });
  });
});
