// seo.test.ts — validates sitemap, robots, and page metadata exports.

import sitemap from '@/app/sitemap';
import robots from '@/app/robots';
import { metadata as pageMetadata } from '@/app/page';

// ---------------------------------------------------------------------------
// sitemap()
// ---------------------------------------------------------------------------
describe('sitemap()', () => {
  const entries = sitemap();

  it('returns exactly 12 entries', () => {
    expect(entries).toHaveLength(12);
  });

  it('includes https://quickserve.co.ke/ (home)', () => {
    const urls = entries.map((e) => e.url);
    expect(urls).toContain('https://quickserve.co.ke/');
  });

  it('includes https://quickserve.co.ke/services', () => {
    const urls = entries.map((e) => e.url);
    expect(urls).toContain('https://quickserve.co.ke/services');
  });

  it('home entry has priority 1', () => {
    const home = entries.find((e) => e.url === 'https://quickserve.co.ke/');
    expect(home?.priority).toBe(1.0);
  });

  it('all entries have a lastModified date', () => {
    for (const entry of entries) {
      expect(entry.lastModified).toBeInstanceOf(Date);
    }
  });
});

// ---------------------------------------------------------------------------
// robots()
// ---------------------------------------------------------------------------
describe('robots()', () => {
  const result = robots();

  it('allows "/" for all user agents', () => {
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const allowsAll = rules.some(
      (r) =>
        (r.userAgent === '*' || (Array.isArray(r.userAgent) && r.userAgent.includes('*'))) &&
        (r.allow === '/' || (Array.isArray(r.allow) && r.allow.includes('/'))),
    );
    expect(allowsAll).toBe(true);
  });

  it('sitemap points to https://quickserve.co.ke/sitemap.xml', () => {
    expect(result.sitemap).toBe('https://quickserve.co.ke/sitemap.xml');
  });

  it('host is https://quickserve.co.ke', () => {
    expect(result.host).toBe('https://quickserve.co.ke');
  });
});

// ---------------------------------------------------------------------------
// page metadata
// ---------------------------------------------------------------------------
describe('Home page metadata', () => {
  it('has a title set', () => {
    expect(pageMetadata.title).toBeTruthy();
  });

  it('has a description set', () => {
    expect(pageMetadata.description).toBeTruthy();
  });

  it('canonical URL is https://quickserve.co.ke/', () => {
    const alternates = pageMetadata.alternates as { canonical?: string };
    expect(alternates?.canonical).toBe('https://quickserve.co.ke/');
  });

  it('openGraph.url is set', () => {
    const og = pageMetadata.openGraph as { url?: string } | undefined;
    expect(og?.url).toBeTruthy();
  });

  it('twitter.card is set', () => {
    const twitter = pageMetadata.twitter as { card?: string } | undefined;
    expect(twitter?.card).toBeTruthy();
  });
});
