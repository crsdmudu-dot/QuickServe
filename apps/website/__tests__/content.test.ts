// content.test.ts — validates the static content data in content/site.ts.

import {
  SERVICE_CATEGORIES,
  NAV_LINKS,
  FOOTER_GROUPS,
  PRIMARY_CTA,
  PROVIDER_CTA,
  SECONDARY_CTA,
  DOWNLOAD_CTA,
  FAQ_PREVIEW_QUESTIONS,
  SEO_PHRASES,
} from '@/content/site';

// The 13 allowed marketing routes — no admin or app routes.
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
  '/delete-account',
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

  // Google Play's account-deletion policy requires a public, signed-out request page. It must be
  // discoverable from every marketing page, so it lives in the Legal footer group.
  it('the Legal group links to the public account-deletion page', () => {
    const legal = FOOTER_GROUPS.find((g) => g.title === 'Legal');
    expect(legal).toBeDefined();
    expect(legal?.links.map((l) => l.href)).toEqual(
      expect.arrayContaining(['/privacy', '/terms', '/delete-account']),
    );
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

describe('placeholder social proof', () => {
  it('exports no placeholder stats or testimonials (stage-04 F2-2 / M6)', async () => {
    const content = await import('@/content/site');
    expect('STAT_PLACEHOLDERS' in content).toBe(false);
    expect('TESTIMONIAL_PLACEHOLDERS' in content).toBe(false);
  });
});

describe('FAQ_PREVIEW_QUESTIONS (the Home page preview; the FAQ page renders content/faq.md)', () => {
  it('holds exactly the 4 questions the Home page lists', () => {
    expect(FAQ_PREVIEW_QUESTIONS).toHaveLength(4);
  });

  it('holds questions only, no answers (F-127c-2: the answers live only in the approved FAQ text)', () => {
    for (const question of FAQ_PREVIEW_QUESTIONS) {
      expect(typeof question).toBe('string');
      expect(question).toMatch(/^[^.?!]+\?$/);
    }
  });

  it('carries no provider review or approval claim (D10 (b), H-93-1)', () => {
    for (const question of FAQ_PREVIEW_QUESTIONS) {
      expect(question).not.toMatch(/approved by our team|reviewed and approved|are providers checked/i);
    }
  });
});

describe('SEO_PHRASES', () => {
  it('makes no provider-trust claim in search snippets (D10 (b) class, F-127c-4)', () => {
    expect(SEO_PHRASES).toContain('Plumbers Nairobi');
    for (const phrase of SEO_PHRASES) expect(phrase).not.toMatch(/trusted/i);
  });
});
