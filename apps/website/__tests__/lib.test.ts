// lib.test.ts — validates the SEO/JSON-LD helpers in lib/site.ts.

import { buildMetadata, organizationJsonLd, websiteJsonLd } from '@/lib/site';

describe('buildMetadata', () => {
  const meta = buildMetadata({
    title: 'Browse Services',
    description: 'Find the right service for you.',
    path: '/services',
  });

  it('sets title', () => {
    expect(meta.title).toBe('Browse Services');
  });

  it('sets description', () => {
    expect(meta.description).toBe('Find the right service for you.');
  });

  it('sets alternates.canonical to SITE_URL + path', () => {
    expect((meta.alternates as { canonical: string }).canonical).toBe(
      'https://quickserve.co.ke/services',
    );
  });

  it('sets openGraph.url to SITE_URL + path', () => {
    const og = meta.openGraph as { url: string };
    expect(og.url).toBe('https://quickserve.co.ke/services');
  });

  it('sets openGraph.siteName to QuickServe', () => {
    const og = meta.openGraph as { siteName: string };
    expect(og.siteName).toBe('QuickServe');
  });

  it('accepts an optional ogImage', () => {
    const metaWithImage = buildMetadata({
      title: 'Test',
      description: 'Test',
      path: '/test',
      ogImage: 'https://quickserve.co.ke/og-test.png',
    });
    const og = metaWithImage.openGraph as { images: string[] };
    expect(og.images[0]).toBe('https://quickserve.co.ke/og-test.png');
  });
});

describe('organizationJsonLd', () => {
  const ld = organizationJsonLd();

  it('@type is Organization', () => {
    expect(ld['@type']).toBe('Organization');
  });

  it('@context is https://schema.org', () => {
    expect(ld['@context']).toBe('https://schema.org');
  });

  it('url is the site URL', () => {
    expect(ld['url']).toBe('https://quickserve.co.ke');
  });

  it('name is QuickServe', () => {
    expect(ld['name']).toBe('QuickServe');
  });
});

describe('websiteJsonLd', () => {
  const ld = websiteJsonLd();

  it('@type is WebSite', () => {
    expect(ld['@type']).toBe('WebSite');
  });

  it('url is the site URL', () => {
    expect(ld['url']).toBe('https://quickserve.co.ke');
  });
});
