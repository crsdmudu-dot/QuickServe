// legal-pages.test.tsx — the five content-rendered pages (Terms, Privacy, account deletion, Support, FAQ).
//
// Every case runs against a temporary website root holding FIXTURE texts (helpers/fixture-site.ts): never the real
// apps/website/content/. It covers:
//   - the markup contract (Update 73 73-SITE-MARKUP-CONTRACT.md R1-R4): one data-legal-doc container per page, one
//     version marker inside it on the three versioned pages, rendered from content/terms-release.json;
//   - the absent state: no record and no texts give a notice, no container and no version claim;
//   - fail-closed records: an invalid record, or a Terms file whose bytes differ from textSha256, stops the build;
//   - F-127-5: the page text equals the approved file (scripts/check-legal-pages.mjs), with negative controls;
//   - compatibility with the repository's Terms release gate (scripts/check-terms-release.ts).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeEach, vi } from 'vitest';

import TermsPage from '@/app/terms/page';
import PrivacyPage from '@/app/privacy/page';
import DeleteAccountPage from '@/app/delete-account/page';
import SupportPage from '@/app/support/page';
import FaqPage from '@/app/faq/page';
import { LegalContentError } from '@/lib/legal-content';
import { NOT_PUBLISHED_NOTICE } from '@/content/legal-pages';
import { canonicalText, compareLegalPage, findElements, markdownCanonical } from '../scripts/check-legal-pages.mjs';
import { checkTermsRelease } from '../../../scripts/check-terms-release';

import {
  FIXTURE_EFFECTIVE,
  FIXTURE_LABEL,
  FIXTURE_TERMS_FILE,
  FIXTURE_VERSION_LINE,
  cleanupFixtureSites,
  fixtureRecord,
  makeFixtureSite,
  readFixture,
  sha256,
} from './helpers/fixture-site';

type PageCase = { id: string; Page: ComponentType; versioned: boolean };
const PAGES: PageCase[] = [
  { id: 'terms', Page: TermsPage, versioned: true },
  { id: 'privacy', Page: PrivacyPage, versioned: true },
  { id: 'delete-account', Page: DeleteAccountPage, versioned: true },
  { id: 'support', Page: SupportPage, versioned: false },
  { id: 'faq', Page: FaqPage, versioned: false },
];

let cwd: ReturnType<typeof vi.spyOn> | null = null;
function useRoot(root: string) {
  cwd?.mockRestore();
  cwd = vi.spyOn(process, 'cwd').mockReturnValue(root);
}
const html = (Page: ComponentType) => renderToStaticMarkup(<Page />);

beforeEach(() => {
  cwd = null;
});
afterEach(() => {
  cwd?.mockRestore();
  cwd = null;
});
afterAll(() => cleanupFixtureSites());

// -------------------------------------------------------------------------------------------------------------------
describe('with the approved texts and the record (FIXTURE texts)', () => {
  it.each(PAGES)('$id: exactly one data-legal-doc container, with the right id', ({ id, Page }) => {
    useRoot(makeFixtureSite());
    const page = html(Page);
    const containers = findElements(page, 'data-legal-doc');
    expect(containers.map((c) => c.attrs.get('data-legal-doc'))).toEqual([id]);
  });

  it.each(PAGES.filter((p) => p.versioned))('$id: one version marker, inside the container, exactly from the record', ({ id, Page }) => {
    useRoot(makeFixtureSite());
    const page = html(Page);
    const markers = findElements(page, 'data-terms-version');
    expect(markers).toHaveLength(1);
    expect(markers[0].attrs.get('data-terms-version')).toBe(FIXTURE_LABEL);
    expect(markers[0].attrs.get('data-effective-date')).toBe(FIXTURE_EFFECTIVE);
    expect(findElements(page, 'data-effective-date')).toHaveLength(1);
    expect(canonicalText(markers[0].inner ?? '')).toBe(FIXTURE_VERSION_LINE);
    const inner = findElements(page, 'data-legal-doc', id)[0].inner ?? '';
    expect(findElements(inner, 'data-terms-version')).toHaveLength(1);
    // R4: no other version line anywhere on the page.
    expect(canonicalText(page).split('\n').filter((l: string) => /^Version (?:v\d|\d|draft)/i.test(l))).toEqual([FIXTURE_VERSION_LINE]);
  });

  it.each(PAGES.filter((p) => p.versioned))('$id: the version line sits right under the text\'s own title', ({ id, Page }) => {
    useRoot(makeFixtureSite());
    const lines = canonicalText(findElements(html(Page), 'data-legal-doc', id)[0].inner ?? '').split('\n');
    expect(lines[0]).toMatch(/^FIXTURE /);
    expect(lines[1]).toBe(FIXTURE_VERSION_LINE);
  });

  it.each(PAGES.filter((p) => !p.versioned))('$id: carries no version line or version attribute', ({ Page }) => {
    useRoot(makeFixtureSite());
    const page = html(Page);
    expect(findElements(page, 'data-terms-version')).toHaveLength(0);
    expect(findElements(page, 'data-effective-date')).toHaveLength(0);
    expect(page).not.toMatch(/Version v\d/);
  });

  it.each(PAGES)('$id: F-127-5, the page text equals the approved file', ({ id, Page, versioned }) => {
    useRoot(makeFixtureSite());
    const r = compareLegalPage({
      html: html(Page),
      id,
      approvedSource: readFixture(id),
      marker: versioned ? { version: FIXTURE_LABEL, effectiveDate: FIXTURE_EFFECTIVE } : null,
    });
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('the Terms page renders the file the record names, links included, and links e-mail addresses', () => {
    useRoot(makeFixtureSite());
    const page = html(TermsPage);
    const inner = findElements(page, 'data-legal-doc', 'terms')[0].inner ?? '';
    expect(inner).toContain('<strong');
    expect(inner).toContain('<em>italic words</em>');
    expect(inner).toContain('href="/privacy/"');
    expect(inner).toContain('href="/delete-account/"');
    expect(inner).toContain('href="mailto:support@kwikserve.co.ke"');
    expect(inner).toContain('<ol');
    expect(canonicalText(inner)).toContain('escaped *asterisk*');
  });

  it('the account-deletion page links "Support page" to /support/ (N-121-4) when its text does', () => {
    useRoot(makeFixtureSite());
    const inner = findElements(html(DeleteAccountPage), 'data-legal-doc', 'delete-account')[0].inner ?? '';
    expect(inner).toMatch(/<a [^>]*href="\/support\/"[^>]*>Support page<\/a>/);
  });

  it('the FAQ page shows every answer in the page (nothing collapsed)', () => {
    useRoot(makeFixtureSite());
    const text = canonicalText(html(FaqPage));
    expect(text).toContain('A synthetic answer.');
    expect(text).toContain('Another synthetic answer with emphasis and a link to Support.');
  });
});

// -------------------------------------------------------------------------------------------------------------------
describe('without the record and the texts (commit A: nothing approved yet)', () => {
  it.each(PAGES)('$id: a notice and the support address, no container and no version claim', ({ Page }) => {
    useRoot(makeFixtureSite({ texts: [], record: false }));
    const page = html(Page);
    expect(findElements(page, 'data-legal-doc')).toHaveLength(0);
    expect(findElements(page, 'data-terms-version')).toHaveLength(0);
    expect(findElements(page, 'data-effective-date')).toHaveLength(0);
    const text = canonicalText(page);
    expect(text).not.toMatch(/\bVersion\b|\bEffective\b/);
    expect(text).toContain(NOT_PUBLISHED_NOTICE);
    expect(page).toContain('href="mailto:support@kwikserve.co.ke"');
    expect(text).not.toMatch(/placeholder|pending legal review|\bDRAFT\b/i);
  });

  it.each(PAGES.filter((p) => p.versioned && p.id !== 'terms'))('$id: its text without the record shows the text but no version line (the release check then fails)', ({ id, Page }) => {
    useRoot(makeFixtureSite({ record: false }));
    const page = html(Page);
    expect(findElements(page, 'data-legal-doc', id)).toHaveLength(1);
    expect(findElements(page, 'data-terms-version')).toHaveLength(0);
    const r = compareLegalPage({ html: page, id, approvedSource: readFixture(id), marker: { version: FIXTURE_LABEL, effectiveDate: FIXTURE_EFFECTIVE } });
    expect(r.ok).toBe(false);
  });

  it.each(PAGES.filter((p) => p.id !== 'terms'))('$id: the record alone (no text file) still shows only the notice', ({ Page }) => {
    useRoot(makeFixtureSite({ texts: ['terms'] }));
    const page = html(Page);
    expect(findElements(page, 'data-legal-doc')).toHaveLength(0);
    expect(findElements(page, 'data-terms-version')).toHaveLength(0);
  });
});

// -------------------------------------------------------------------------------------------------------------------
describe('a record that exists must be valid (the build stops otherwise)', () => {
  const terms = () => readFixture('terms');
  it.each([
    ['not JSON', '{ "version": '],
    ['a draft label', { version: 'draft-2026-09-26' }],
    ['a label with a space', { version: 'v 1' }],
    ['an impossible date', { effectiveDate: '2026-02-30' }],
    ['a text file outside content/terms-*.md', { textFile: 'apps/website/content/privacy.md' }],
    ['a malformed sha256', { textSha256: 'abc' }],
    ['no approver', { approvedBy: '' }],
  ])('refuses %s', (_name, record) => {
    useRoot(makeFixtureSite({ record: record as string | Record<string, unknown> }));
    for (const { Page } of PAGES.filter((p) => p.versioned)) expect(() => html(Page)).toThrow(LegalContentError);
  });

  it('refuses a Terms file whose bytes differ from the approved textSha256', () => {
    useRoot(makeFixtureSite({ replace: { terms: `${terms()}\nA clause added after approval.\n` } }));
    expect(() => html(TermsPage)).toThrow(/sha256/);
  });

  it('refuses a record that names a Terms file that is not there', () => {
    useRoot(makeFixtureSite({ texts: [] }));
    expect(() => html(TermsPage)).toThrow(/does not exist/);
  });

  it('refuses to build from a folder without content/ (a wrong working directory)', () => {
    const empty = mkdtempSync(join(tmpdir(), 'kwikserve-website-nocontent-'));
    try {
      useRoot(empty);
      for (const { Page } of PAGES) expect(() => html(Page)).toThrow(/no content\/ folder/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('an unsupported construct in an approved text stops the build with the file and line', () => {
    useRoot(makeFixtureSite({ replace: { privacy: '# FIXTURE Privacy\n\n<script>alert(1)</script>\n' } }));
    expect(() => html(PrivacyPage)).toThrow(/content\/privacy\.md:3: raw HTML/);
  });
});

// -------------------------------------------------------------------------------------------------------------------
describe('F-127-5 comparison: negative controls (each must fail)', () => {
  const base = () => {
    useRoot(makeFixtureSite());
    return html(PrivacyPage);
  };
  const marker = { version: FIXTURE_LABEL, effectiveDate: FIXTURE_EFFECTIVE };
  const privacy = () => readFixture('privacy');

  it('passes on the unchanged page (positive control)', () => {
    expect(compareLegalPage({ html: base(), id: 'privacy', approvedSource: privacy(), marker }).ok).toBe(true);
  });

  it('fails when the page adds a sentence inside the container', () => {
    const page = base().replace('</article>', '<p>An extra sentence.</p></article>');
    const r = compareLegalPage({ html: page, id: 'privacy', approvedSource: privacy(), marker });
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toMatch(/differs from the approved file/);
  });

  it('fails when the approved file says something else', () => {
    const r = compareLegalPage({ html: base(), id: 'privacy', approvedSource: privacy().replace('Another synthetic point', 'A different point'), marker });
    expect(r.ok).toBe(false);
  });

  it('fails when the version line or its attributes differ from the record', () => {
    expect(compareLegalPage({ html: base(), id: 'privacy', approvedSource: privacy(), marker: { ...marker, version: 'v1' } }).ok).toBe(false);
    const attr = base().replace(`data-terms-version="${FIXTURE_LABEL}"`, 'data-terms-version="v1"');
    expect(compareLegalPage({ html: attr, id: 'privacy', approvedSource: privacy(), marker }).ok).toBe(false);
  });

  it('fails with a second container or a second version line', () => {
    const two = base().replace('</article>', '</article><div data-legal-doc="privacy">x</div>');
    expect(compareLegalPage({ html: two, id: 'privacy', approvedSource: privacy(), marker }).ok).toBe(false);
    const line = base().replace('</article>', `<p>${FIXTURE_VERSION_LINE}</p></article>`);
    expect(compareLegalPage({ html: line, id: 'privacy', approvedSource: privacy(), marker }).ok).toBe(false);
  });

  it('fails when an unversioned page shows a version line', () => {
    useRoot(makeFixtureSite());
    const page = html(SupportPage).replace('</article>', `<p>${FIXTURE_VERSION_LINE}</p></article>`);
    expect(compareLegalPage({ html: page, id: 'support', approvedSource: readFixture('support'), marker: null }).ok).toBe(false);
  });

  it('the Markdown canonical form is independent of line endings and wrapping', () => {
    const lf = privacy();
    expect(markdownCanonical(lf.replace(/\n/g, '\r\n'))).toBe(markdownCanonical(lf));
    expect(markdownCanonical('# T\n\nOne\nparagraph.\n')).toBe('T\nOne paragraph.');
  });
});

// -------------------------------------------------------------------------------------------------------------------
describe('compatibility with the repository Terms release gate (scripts/check-terms-release.ts)', () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it('the real app/terms/page.tsx passes every gate check in a consistent synthetic release (FIXTURE text)', () => {
    const root = mkdtempSync(join(tmpdir(), 'kwikserve-terms-gate-'));
    dirs.push(root);
    const terms = readFixture('terms');
    const files: Record<string, string> = {
      'src/constants/terms.ts': `export const CURRENT_TERMS_VERSION = '${FIXTURE_LABEL}';\n`,
      'supabase/migrations/0099_fixture_terms_version.sql':
        `create or replace function public.current_terms_version()\nreturns text language sql immutable as $$\n  select '${FIXTURE_LABEL}'::text\n$$;\n`,
      'apps/website/content/terms-release.json': JSON.stringify(fixtureRecord(terms)),
      [`apps/website/content/${FIXTURE_TERMS_FILE}`]: terms,
      '.gitattributes': 'apps/website/content/terms-*.md -text\napps/website/content/*.md -text\n',
      'apps/website/app/terms/page.tsx': readFileSync(join(__dirname, '..', 'app', 'terms', 'page.tsx'), 'utf8'),
    };
    for (const [file, body] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), body);
    }
    const checks = checkTermsRelease(root);
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect(checks.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'website page reads the approval record',
        'website page renders the version, effective date and text from the record',
        'website page has no hard-coded prose (the text comes only from the approved file)',
        'website Terms page carries no placeholder wording',
      ]),
    );
    expect(sha256(terms)).toBe(fixtureRecord(terms).textSha256);
  });
});
