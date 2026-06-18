import { Colors, Radii, Shadows, Typography } from '@/constants/theme';

describe('design tokens', () => {
  it('exposes the QuickServe brand palette (light)', () => {
    expect(Colors.light.primary).toBe('#00875A');
    expect(Colors.light.primaryDark).toBe('#006B47');
    expect(Colors.light.primaryTint).toBe('#E7F7F0');
    expect(Colors.light.ink).toBe('#0E1116');
    expect(Colors.light.background).toBe('#FFFFFF');
    expect(Colors.light.border).toBe('#ECEEF1');
  });

  it('defines the same keys for dark mode', () => {
    expect(Object.keys(Colors.dark).sort()).toEqual(Object.keys(Colors.light).sort());
  });

  it('exposes radii and typography scales', () => {
    expect(Radii.lg).toBe(16);
    expect(Radii.pill).toBe(999);
    expect(Typography.display.fontSize).toBe(32);
    expect(Typography.body.fontSize).toBe(16);
    expect(Shadows.card.borderRadius).toBeUndefined();
    expect(Shadows.card.shadowOpacity).toBe(0.06);
  });
});
