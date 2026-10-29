import {
  SERVICES,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  getServicesByCategory,
  getPopularServices,
  type ServiceCategory,
} from '@/constants/services';

const VALID: ServiceCategory[] = ['home', 'auto', 'delivery', 'personal'];

describe('service catalog', () => {
  it('contains all 19 services', () => {
    expect(SERVICES).toHaveLength(19);
  });
  it('has unique ids', () => {
    const ids = SERVICES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('only uses valid categories', () => {
    for (const s of SERVICES) expect(VALID).toContain(s.category);
  });
  it('places Movers & Packers under home', () => {
    const movers = SERVICES.find((s) => s.id === 'movers-packers');
    expect(movers?.category).toBe('home');
  });
  it('groups services by category in order', () => {
    expect(CATEGORY_ORDER).toEqual(['home', 'auto', 'delivery', 'personal']);
    expect(getServicesByCategory('home')).toHaveLength(9);
    expect(getServicesByCategory('auto')).toHaveLength(3);
    expect(getServicesByCategory('delivery')).toHaveLength(4);
    expect(getServicesByCategory('personal')).toHaveLength(3);
  });
  it('carries no promotional badges (owner decision OD-S5-17)', () => {
    expect(SERVICES.filter((s) => s.badge !== undefined)).toEqual([]);
    expect(getPopularServices()).toEqual([]);
  });
  it('makes no time, speed, 24/7, availability, safety or freshness claim in any subtitle', () => {
    const claim = /24\s*\/\s*7|\bfast\b|\bquick|\binstant|\bminutes?\b|\bhours?\b|\bguarantee|\bon[\s-]demand\b|\bsafe|\bfresh/i;
    expect(SERVICES.filter((s) => claim.test(s.subtitle ?? ''))).toEqual([]);
  });
  it('labels every category', () => {
    for (const c of CATEGORY_ORDER) expect(CATEGORY_LABELS[c]).toBeTruthy();
  });
});
