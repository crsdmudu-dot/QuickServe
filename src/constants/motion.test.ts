import { Durations, Springs } from '@/constants/motion';

describe('motion tokens', () => {
  it('exports the correct duration values', () => {
    expect(Durations.fast).toBe(150);
    expect(Durations.base).toBe(250);
    expect(Durations.slow).toBe(400);
  });

  it('exports spring presets with expected shape', () => {
    expect(typeof Springs.gentle.damping).toBe('number');
    expect(typeof Springs.gentle.stiffness).toBe('number');
    expect(typeof Springs.snappy.damping).toBe('number');
    expect(typeof Springs.snappy.stiffness).toBe('number');
  });

  it('gentle spring is less stiff than snappy', () => {
    expect(Springs.gentle.stiffness).toBeLessThan(Springs.snappy.stiffness);
  });
});
