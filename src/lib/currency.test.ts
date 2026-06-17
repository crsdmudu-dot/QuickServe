import { formatKes } from '@/lib/currency';

describe('formatKes', () => {
  it('groups thousands with commas', () => {
    expect(formatKes(1500)).toBe('KES 1,500');
    expect(formatKes(1200000)).toBe('KES 1,200,000');
  });
  it('handles values below 1000', () => {
    expect(formatKes(900)).toBe('KES 900');
  });
  it('rounds to whole shillings', () => {
    expect(formatKes(1499.6)).toBe('KES 1,500');
  });
});
