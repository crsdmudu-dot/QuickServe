// content.test.ts — validates the static content data in content/site.ts.

import {
  SERVICE_CATEGORIES,
  NAV_LINKS,
  FOOTER_GROUPS,
  PRIMARY_CTA,
  PROVIDER_CTA,
  SECONDARY_CTA,
  DOWNLOAD_CTA,
  STAT_PLACEHOLDERS,
  FAQ_ITEMS,
} from '@/content/site';

// The 12 allowed marketing routes — no admin or app routes.
const ALLOWED_ROUTES = new Set([
  '/',
  '/services',
  '/how-it-works',
  '/why-quickserve',
  '/become-a-provider',
  '/pricing',
  '/faq',
  '/contact',
  '/support',
  '/download',
  '/privacy',
  '/terms',
]);

describe('SERVICE_CATEGORIES', () => {
  it('has exactly 19 entries', () => {
    expect(SERVICE_CATEGORIES).toHaveLength(19);
  });

  it('every entry has id, title, subtitle, and icon', () => {
    for (const cat of SERVICE_CATEGORIES) {
      expect(cat.id).toBeTruthy();
      expect(cat.title).toBeTruthy();
      expect(cat.subtitle).toBeTruthy();
      expect(cat.icon).toBeTruthy();
    }
  });
});

describe('NAV_LINKS hrefs', () => {
  it('every href is an allowed marketing route', () => {
    for (const link of NAV_LINKS) {
      expect(ALLOWED_ROUTES.has(link.href)).toBe(true);
    }
  });

  it('no href contains /admin or (admin-web)', () => {
    for (const link of NAV_LINKS) {
      expect(link.href).not.toMatch(/\/admin/);
      expect(link.href).not.toMatch(/\(admin-web\)/);
    }
  });
});

describe('FOOTER_GROUPS hrefs', () => {
  it('every href is an allowed marketing route', () => {
    for (const group of FOOTER_GROUPS) {
      for (const link of group.links) {
        expect(ALLOWED_ROUTES.has(link.href)).toBe(true);
      }
    }
  });

  it('no href contains /admin or (admin-web)', () => {
    for (const group of FOOTER_GROUPS) {
      for (const link of group.links) {
        expect(link.href).not.toMatch(/\/admin/);
        expect(link.href).not.toMatch(/\(admin-web\)/);
      }
    }
  });
});

describe('CTA hrefs', () => {
  it('all CTAs point to allowed marketing routes', () => {
    for (const cta of [PRIMARY_CTA, PROVIDER_CTA, SECONDARY_CTA, DOWNLOAD_CTA]) {
      expect(ALLOWED_ROUTES.has(cta.href)).toBe(true);
    }
  });

  it('no CTA href contains /admin or (admin-web)', () => {
    for (const cta of [PRIMARY_CTA, PROVIDER_CTA, SECONDARY_CTA, DOWNLOAD_CTA]) {
      expect(cta.href).not.toMatch(/\/admin/);
      expect(cta.href).not.toMatch(/\(admin-web\)/);
    }
  });
});

describe('STAT_PLACEHOLDERS', () => {
  it('is non-empty', () => {
    expect(STAT_PLACEHOLDERS.length).toBeGreaterThan(0);
  });
});

describe('FAQ_ITEMS', () => {
  it('has at least 6 entries', () => {
    expect(FAQ_ITEMS.length).toBeGreaterThanOrEqual(6);
  });

  it('every entry has a question and an answer', () => {
    for (const item of FAQ_ITEMS) {
      expect(item.question).toBeTruthy();
      expect(item.answer).toBeTruthy();
    }
  });
});
