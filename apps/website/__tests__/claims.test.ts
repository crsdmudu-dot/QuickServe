// claims.test.ts — the website makes no claim the product or the owner's decisions cannot back.
//
// Lead-PM stage 04 F2-2 and the M6 list: the owner declined background-check, identity- and skill-verification
// claims, payment is M-PESA only (no cards), there is no in-app cancel or reschedule, and placeholder figures,
// testimonials and social handles must not be published. Apple 2.3.1(a) forbids misleading marketing "whether within or
// outside of the App Store".
// The W-PR build basis (owner, 2026-10-04 17:52; PM stage 127) adds two rules:
//   - D10 (b), H-93-1: the trust sentence "reviewed and approved by our team (before they can take jobs)" and its
//     variants are removed everywhere, until the dispatch rule is adopted and enforced and an approval lists the sentence;
//   - D9 (a): no speed promise; the "in Minutes" headings are reworded.
// PM stage 127c (line review of PR #36) adds "in seconds" to the speed rule (F-127c-3), and rules for the provider-trust
// SEO phrase, the promise of work to recruits and the absolute quality claim it had removed (F-127c-4 to F-127c-6).
//
// Scope: every website source file except the approved texts in content/ (content/*.md and the approval record
// content/terms-release.json). Their wording is the owner's approved text, governed by the Terms release gate
// (scripts/check-terms-release.ts) and the release checker, not by this marketing guard. The five pages that render
// them (app/terms, app/privacy, app/delete-account, app/support, app/faq) have no wording of their own and ARE scanned.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WEBSITE_ROOT = join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.next', 'out', '.git', 'public', '__tests__']);
const isApprovedText = (rel: string) => /^content\/[^/]+\.md$/.test(rel) || rel === 'content/terms-release.json';

function marketingSources(dir: string = WEBSITE_ROOT): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...marketingSources(full));
    else if (/\.(ts|tsx|js|jsx|json|md)$/.test(entry)) {
      const rel = full.slice(WEBSITE_ROOT.length + 1).replace(/\\/g, '/');
      if (!isApprovedText(rel)) found.push(full);
    }
  }
  return found;
}

/** Claims that must not appear anywhere in the marketing source (case-insensitive). */
const FORBIDDEN: [string, RegExp][] = [
  ['background-check claim', /background[- ]checked|background check before/i],
  ['identity/skill verification claim', /identity[- ](and skill[- ])?verified|skill[- ]verified|skill-assessed|identity verification/i],
  ['"vetted" claim', /\bvetted\b/i],
  ['team-approval trust claim (D10 (b), H-93-1)', /approved by our team|reviewed and approved|our team has approved|\bapproved (?:professionals?|providers?|pros)\b/i],
  ['provider-verification claim', /provider verification|verified (?:professionals?|providers?|pros)\b/i],
  ['provider-trust claim (D10 (b) class, F-127c-4)', /trusted (?:plumbers?|electricians?|professionals?|providers?|pros)\b/i],
  ['promise of work to providers (F-127c-5)', /steady stream/i],
  ['absolute quality claim (F-127c-6)', /raise the bar/i],
  ['guarantee claim', /guaranteed quality|we're not done until/i],
  ['superlative', /most trusted/i],
  ['card payment claim', /m-?pesa (or|and) card|multiple payment options|card payments/i],
  ['in-app cancel claim', /cancel or reschedule from inside the app/i],
  ['24/7 claim', /24\/7/],
  ['unproven scale claim', /thousands of|hundreds of/i],
  ['speed promise', /under a minute|within minutes|in under 5 minutes|\bin minutes\b|\bin seconds\b|within seconds|get paid fast/i],
  ['web booking claim', /via the web today/i],
  ['placeholder content', /PLACEHOLDER|illustrative|lorem ipsum/i],
  ['old domain', /quickserve\.co\.ke|hello@quickserve|hiredcorp\.co\.ke|quickserve\.app/i],
  ['social handle', /twitter\.com|facebook\.com|instagram\.com/i],
];

describe('marketing claims', () => {
  const files = marketingSources();
  const rels = files.map((f) => f.slice(WEBSITE_ROOT.length + 1).replace(/\\/g, '/'));

  it('scans the marketing source and the five content-rendered pages, but not the approved texts', () => {
    expect(rels).toEqual(
      expect.arrayContaining([
        'content/site.ts',
        'lib/site.ts',
        'app/page.tsx',
        'app/support/page.tsx',
        'app/terms/page.tsx',
        'app/faq/page.tsx',
        'content/legal-pages.ts',
      ]),
    );
    expect(rels.filter(isApprovedText)).toEqual([]);
  });

  it.each(FORBIDDEN)('contains no %s', (_name, pattern) => {
    const hits = files
      .filter((file) => pattern.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(WEBSITE_ROOT.length + 1).replace(/\\/g, '/'));
    expect(hits).toEqual([]);
  });

  it('the guard itself fires on the declined wording (negative control)', () => {
    const declined =
      'Every provider is background-checked and skill-verified. We support M-Pesa and card. ' +
      'Book a professional reviewed and approved by our team. Apply in Minutes.';
    const fired = FORBIDDEN.filter(([, pattern]) => pattern.test(declined)).map(([name]) => name);
    expect(fired).toEqual(
      expect.arrayContaining([
        'background-check claim',
        'identity/skill verification claim',
        'card payment claim',
        'team-approval trust claim (D10 (b), H-93-1)',
        'speed promise',
      ]),
    );
  });

  it('the rules added by PM stage 127c fire on the wording they replace (negative control)', () => {
    const rule = (name: string) => FORBIDDEN.find(([n]) => n === name)![1];
    expect(rule('speed promise').test('Book in seconds')).toBe(true);
    expect(rule('speed promise').test('Booked within seconds')).toBe(true);
    expect(rule('provider-trust claim (D10 (b) class, F-127c-4)').test('Trusted Plumbers Nairobi')).toBe(true);
    expect(rule('promise of work to providers (F-127c-5)').test('access a steady stream of customers')).toBe(true);
    expect(rule('absolute quality claim (F-127c-6)').test('We raise the bar on every booking')).toBe(true);
    // Positive controls: the accepted wording does not fire.
    expect(rule('speed promise').test('Book in the app')).toBe(false);
    expect(rule('provider-trust claim (D10 (b) class, F-127c-4)').test('Trusted home services in Nairobi')).toBe(false);
  });

  it('the approved-text exclusion covers only content/*.md and the approval record', () => {
    expect(isApprovedText('content/privacy.md')).toBe(true);
    expect(isApprovedText('content/terms-v1.md')).toBe(true);
    expect(isApprovedText('content/terms-release.json')).toBe(true);
    expect(isApprovedText('content/site.ts')).toBe(false);
    expect(isApprovedText('content/legal-pages.ts')).toBe(false);
    expect(isApprovedText('README.md')).toBe(false);
    expect(isApprovedText('app/terms/page.tsx')).toBe(false);
  });
});
