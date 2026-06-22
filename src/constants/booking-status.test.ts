import { PROVIDER_NEXT_STATUSES } from '@/constants/booking-status';
describe('PROVIDER_NEXT_STATUSES (forward-only)', () => {
  it('advances one step along the provider chain', () => {
    expect(PROVIDER_NEXT_STATUSES.provider_assigned).toEqual(['on_the_way']);
    expect(PROVIDER_NEXT_STATUSES.on_the_way).toEqual(['in_progress']);
    expect(PROVIDER_NEXT_STATUSES.in_progress).toEqual(['completed']);
  });
  it('offers no action on terminal/non-provider statuses', () => {
    expect(PROVIDER_NEXT_STATUSES.completed).toEqual([]);
    expect(PROVIDER_NEXT_STATUSES.cancelled).toEqual([]);
    expect(PROVIDER_NEXT_STATUSES.pending).toEqual([]);
  });
});
