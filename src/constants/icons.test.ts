// icons.test.ts — Tests for src/constants/icons.ts
// Verifies PREDEFINED_ICONS, iconGlyphByName, and isPredefinedIcon.

import { PREDEFINED_ICONS, iconGlyphByName, isPredefinedIcon } from '@/constants/icons';

describe('PREDEFINED_ICONS', () => {
  it('is non-empty', () => {
    expect(PREDEFINED_ICONS.length).toBeGreaterThan(0);
  });

  it('contains at least 19 entries (one per service)', () => {
    expect(PREDEFINED_ICONS.length).toBeGreaterThanOrEqual(19);
  });

  it('each entry has a non-empty name and glyph', () => {
    for (const icon of PREDEFINED_ICONS) {
      expect(typeof icon.name).toBe('string');
      expect(icon.name.trim().length).toBeGreaterThan(0);
      expect(typeof icon.glyph).toBe('string');
      expect(icon.glyph.trim().length).toBeGreaterThan(0);
    }
  });

  it('has unique names', () => {
    const names = PREDEFINED_ICONS.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('includes the 19 service glyphs used in constants/services.ts', () => {
    const serviceGlyphs = ['🧹','🔧','⚡','❄️','🎨','🐜','🛠️','🔌','📦','🚗','🛞','🚙','🛒','🍔','💊','📮','✂️','💄','💆'];
    const allGlyphs = new Set(PREDEFINED_ICONS.map((i) => i.glyph));
    for (const g of serviceGlyphs) {
      expect(allGlyphs.has(g)).toBe(true);
    }
  });

  it('includes a puzzle/fallback icon', () => {
    const puzzle = PREDEFINED_ICONS.find((i) => i.name === 'puzzle');
    expect(puzzle).toBeDefined();
    expect(puzzle?.glyph).toBe('🧩');
  });
});

describe('iconGlyphByName', () => {
  it('returns the glyph for a known name', () => {
    expect(iconGlyphByName('broom')).toBe('🧹');
    expect(iconGlyphByName('wrench')).toBe('🔧');
    expect(iconGlyphByName('scissors')).toBe('✂️');
  });

  it('returns the puzzle fallback for an unknown name', () => {
    expect(iconGlyphByName('nonexistent-icon')).toBe('🧩');
    expect(iconGlyphByName('')).toBe('🧩');
  });

  it('returns the puzzle glyph for the "puzzle" name', () => {
    expect(iconGlyphByName('puzzle')).toBe('🧩');
  });
});

describe('isPredefinedIcon', () => {
  it('returns true for a known icon name', () => {
    expect(isPredefinedIcon('broom')).toBe(true);
    expect(isPredefinedIcon('wrench')).toBe(true);
    expect(isPredefinedIcon('puzzle')).toBe(true);
  });

  it('returns true for a known icon glyph', () => {
    expect(isPredefinedIcon('🧹')).toBe(true);
    expect(isPredefinedIcon('🧩')).toBe(true);
    expect(isPredefinedIcon('⚡')).toBe(true);
  });

  it('returns false for an unknown name or glyph', () => {
    expect(isPredefinedIcon('unknown-icon')).toBe(false);
    expect(isPredefinedIcon('😃')).toBe(false);
    expect(isPredefinedIcon('')).toBe(false);
  });
});
