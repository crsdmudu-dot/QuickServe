// publish-config.test.ts — the publication settings of commit A (PM stage 127 W4/W5; owner build basis 2026-10-04):
//   - D3 option 1: public/_headers sends nosniff, strict-origin-when-cross-origin and DENY, no X-Robots-Tag, no HSTS;
//   - D7 (a): wrangler.jsonc turns Workers observability off and carries no DRAFT note;
//   - D5 (a), provisional: wrangler.jsonc serves the apex and www, and says the www route is provisional;
//   - D8 (a): the site is indexable (robots allow everything; no page metadata says noindex).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import robots from '@/app/robots';
import { metadata as layoutMeta } from '@/app/layout';
import { metadata as termsMeta } from '@/app/terms/page';
import { metadata as privacyMeta } from '@/app/privacy/page';
import { metadata as deleteMeta } from '@/app/delete-account/page';
import { metadata as supportMeta } from '@/app/support/page';
import { metadata as faqMeta } from '@/app/faq/page';

const ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** The headers file as { pattern: { name(lower-case): value } }, following Cloudflare's format. */
function parseHeaders(text: string): Record<string, Record<string, string>> {
  const rules: Record<string, Record<string, string>> = {};
  let current: Record<string, string> | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      current = rules[raw.trim()] = rules[raw.trim()] ?? {};
      continue;
    }
    const at = raw.indexOf(':');
    if (!current || at < 0) throw new Error(`unexpected _headers line: ${raw}`);
    current[raw.slice(0, at).trim().toLowerCase()] = raw.slice(at + 1).trim();
  }
  return rules;
}

/** wrangler.jsonc without its comments (strings here contain no "//"). */
function readWrangler(): Record<string, unknown> {
  const text = read('wrangler.jsonc');
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
}

describe('public/_headers (D3 option 1)', () => {
  const text = read('public/_headers');
  const rules = parseHeaders(text);

  it('has one rule, for every path', () => {
    expect(Object.keys(rules)).toEqual(['/*']);
  });

  it('sends the three required security headers with the exact values', () => {
    expect(rules['/*']['x-content-type-options']).toBe('nosniff');
    expect(rules['/*']['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(rules['/*']['x-frame-options']).toBe('DENY');
  });

  it('sends nothing else but the optional Permissions-Policy', () => {
    expect(Object.keys(rules['/*']).sort()).toEqual(['permissions-policy', 'referrer-policy', 'x-content-type-options', 'x-frame-options']);
  });

  it('has no X-Robots-Tag and no HSTS anywhere (D8 (a); HSTS is a separate zone decision)', () => {
    const active = text.split(/\r?\n/).filter((l) => !l.trim().startsWith('#')).join('\n');
    expect(active).not.toMatch(/x-robots-tag/i);
    expect(active).not.toMatch(/strict-transport-security/i);
    expect(active).not.toMatch(/noindex/i);
  });
});

describe('wrangler.jsonc (W5; D7 (a); D5 (a) provisional)', () => {
  const text = read('wrangler.jsonc');
  const config = readWrangler();

  it('is the separate assets-only kwikserve-website Worker', () => {
    expect(config.name).toBe('kwikserve-website');
    expect(config.assets).toEqual({ directory: './out', not_found_handling: '404-page', html_handling: 'auto-trailing-slash' });
    for (const key of ['main', 'vars', 'kv_namespaces', 'd1_databases', 'r2_buckets', 'services', 'durable_objects']) expect(config).not.toHaveProperty(key);
  });

  it('turns Workers observability off (D7 (a))', () => {
    expect(config.observability).toEqual({ enabled: false });
  });

  it('carries no DRAFT note', () => {
    expect(text).not.toMatch(/DRAFT/);
  });

  it('serves the apex and www as custom domains, the www route marked provisional (D5 (a))', () => {
    expect(config.routes).toEqual([
      { pattern: 'kwikserve.co.ke', custom_domain: true },
      { pattern: 'www.kwikserve.co.ke', custom_domain: true },
    ]);
    expect(text).toMatch(/PROVISIONAL[^\n]*D5/);
  });

  it('is reachable only on its own hostnames', () => {
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
  });
});

describe('the site is indexable (D8 (a))', () => {
  it('robots.txt allows every path and names the sitemap', () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    expect(rules).toEqual([{ userAgent: '*', allow: '/' }]);
    expect(rules.some((x) => 'disallow' in x)).toBe(false);
    expect(r.sitemap).toBe('https://kwikserve.co.ke/sitemap.xml');
  });

  it.each([
    ['layout', layoutMeta],
    ['terms', termsMeta],
    ['privacy', privacyMeta],
    ['delete-account', deleteMeta],
    ['support', supportMeta],
    ['faq', faqMeta],
  ])('%s metadata sets no robots directive', (_name, meta) => {
    expect(meta).not.toHaveProperty('robots');
  });

  it.each([
    ['terms', termsMeta, 'https://kwikserve.co.ke/terms'],
    ['privacy', privacyMeta, 'https://kwikserve.co.ke/privacy'],
    ['delete-account', deleteMeta, 'https://kwikserve.co.ke/delete-account'],
    ['support', supportMeta, 'https://kwikserve.co.ke/support'],
    ['faq', faqMeta, 'https://kwikserve.co.ke/faq'],
  ])('%s has its canonical URL on kwikserve.co.ke', (_name, meta, url) => {
    expect((meta.alternates as { canonical: string }).canonical).toBe(url);
  });
});
