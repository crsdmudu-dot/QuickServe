// approved-texts.test.tsx — checks that switch on when the owner's approved texts are added to content/ (commit B).
//
// PM stage 127c, F-127c-10. In commit A, content/ holds no approved text, so the checks on the real files are SKIPPED
// (Vitest reports them as skipped, not passed). When content/delete-account.md or content/privacy.md exists, they
// render the real page and look for the store elements in helpers/approved-texts.ts. The H-1 check runs on all five
// content-rendered pages in both states.
//
// The checks themselves are always tested on synthetic FIXTURE text below (a complete sample passes; a sample missing
// one element fails on exactly that element), so a skipped real-file check is never an untested one.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import TermsPage from '@/app/terms/page';
import PrivacyPage from '@/app/privacy/page';
import DeleteAccountPage from '@/app/delete-account/page';
import SupportPage from '@/app/support/page';
import FaqPage from '@/app/faq/page';
import LegalMarkdown from '@/components/LegalMarkdown';
import { parseLegalMarkdown } from '@/lib/legal-markdown';
import { canonicalText, findElements } from '../scripts/check-legal-pages.mjs';

import { DELETION_PAGE_CHECKS, H1_OLD_PHRASES, PRIVACY_PAGE_CHECKS, h1PhrasesIn, missingElements } from './helpers/approved-texts';

const WEBSITE_ROOT = join(__dirname, '..');
const approvedFileExists = (name: string) => existsSync(join(WEBSITE_ROOT, 'content', name));

/** The real page's approved-text container, as built (the tests run with apps/website as the working directory). */
function container(Page: ComponentType, id: string): string {
  const found = findElements(renderToStaticMarkup(<Page />), 'data-legal-doc', id);
  expect(found).toHaveLength(1);
  return found[0].inner ?? '';
}

// -------------------------------------------------------------------------------------------------------------------
describe.runIf(approvedFileExists('delete-account.md'))('the approved account-deletion page (content/delete-account.md)', () => {
  it('carries every store element (Google Play account deletion; Apple 5.1.1(v))', () => {
    expect(missingElements(DELETION_PAGE_CHECKS, container(DeleteAccountPage, 'delete-account'))).toEqual([]);
  });
});

describe.runIf(approvedFileExists('privacy.md'))('the approved Privacy Policy (content/privacy.md)', () => {
  it('carries every store element (Apple 5.1.1(i); Google Play User Data)', () => {
    expect(missingElements(PRIVACY_PAGE_CHECKS, container(PrivacyPage, 'privacy'))).toEqual([]);
  });
});

describe('the five content-rendered pages carry none of the withdrawn H-1 photo phrases', () => {
  it.each([
    ['terms', TermsPage],
    ['privacy', PrivacyPage],
    ['delete-account', DeleteAccountPage],
    ['support', SupportPage],
    ['faq', FaqPage],
  ] as [string, ComponentType][])('%s', (_id, Page) => {
    expect(h1PhrasesIn(canonicalText(renderToStaticMarkup(<Page />)))).toEqual([]);
  });
});

// -------------------------------------------------------------------------------------------------------------------
// The checks, on synthetic FIXTURE text (always on).
const renderFixture = (markdown: string) => renderToStaticMarkup(<LegalMarkdown blocks={parseLegalMarkdown(markdown, 'fixture.md')} />);

const DELETION_FIXTURE = [
  '# FIXTURE Delete your KwikServe account',
  '',
  'FIXTURE: synthetic test text. It is not the KwikServe account deletion page.',
  '',
  '## FIXTURE Steps',
  '',
  'Synthetic step: delete the account in the KwikServe app.',
  '',
  '## FIXTURE By e-mail',
  '',
  'Synthetic route: you do not need the app. Write to support@kwikserve.co.ke.',
  '',
  '## FIXTURE What is deleted',
  '',
  'Synthetic list of deleted data.',
  '',
  '## FIXTURE What is kept',
  '',
  'Synthetic records are kept until a synthetic case ends.',
  '',
  'Read the synthetic [Privacy Policy](/privacy/).',
  '',
].join('\n');

const PRIVACY_FIXTURE = [
  '# FIXTURE Privacy Policy',
  '',
  'FIXTURE: synthetic test text. It is not the KwikServe Privacy Policy.',
  '',
  '## FIXTURE How long we keep data',
  '',
  'Synthetic retention text. See the synthetic [account deletion page](/delete-account/).',
  '',
  '## FIXTURE Your rights',
  '',
  'Synthetic rights: access, have it corrected, object, restrict, or delete it.',
  '',
  '## FIXTURE Complaints',
  '',
  'Synthetic contact support@kwikserve.co.ke, or the Office of the Data Protection Commissioner.',
  '',
].join('\n');

describe('the store-element checks fire correctly (positive and negative controls on FIXTURE text)', () => {
  it('a complete synthetic deletion page passes every check', () => {
    expect(missingElements(DELETION_PAGE_CHECKS, renderFixture(DELETION_FIXTURE))).toEqual([]);
  });

  it('a complete synthetic Privacy page passes every check', () => {
    expect(missingElements(PRIVACY_PAGE_CHECKS, renderFixture(PRIVACY_FIXTURE))).toEqual([]);
  });

  it.each([
    ['names the app (KwikServe)', (s: string) => s.replace(/KwikServe /g, '')],
    ['describes deleting the account in the app', (s: string) => s.replace('in the KwikServe app', 'somewhere')],
    ['offers an e-mail request route to KwikServe Support', (s: string) => s.replace('support@kwikserve.co.ke', 'the support team')],
    ['says the request route needs no sign-in or app', (s: string) => s.replace('you do not need the app', 'see below')],
    ['has a section on what is deleted', (s: string) => s.replace('## FIXTURE What is deleted', '## FIXTURE Data')],
    ['has a section on what is kept', (s: string) => s.replace('## FIXTURE What is kept', '## FIXTURE Records')],
    ['says how long kept data is kept', (s: string) => s.replace('until a synthetic case ends', 'for a synthetic reason')],
    ['links to the Privacy Policy', (s: string) => s.replace('[Privacy Policy](/privacy/)', 'Privacy Policy')],
  ])('the deletion check "%s" fails when that element is missing', (element, mutate) => {
    const mutated = mutate(DELETION_FIXTURE);
    expect(mutated).not.toBe(DELETION_FIXTURE);
    expect(missingElements(DELETION_PAGE_CHECKS, renderFixture(mutated))).toEqual([element]);
  });

  it.each([
    ['names the Office of the Data Protection Commissioner', (s: string) => s.replace(', or the Office of the Data Protection Commissioner', '')],
    ['the rights section covers access', (s: string) => s.replace('access, ', '')],
    ['the rights section covers correction', (s: string) => s.replace('have it corrected, ', '')],
    ['the rights section covers objection', (s: string) => s.replace('object, ', '')],
    ['the rights section covers restriction', (s: string) => s.replace('restrict, ', '')],
    ['the rights section covers deletion', (s: string) => s.replace(', or delete it', '')],
    ['has a section on how long data is kept', (s: string) => s.replace('## FIXTURE How long we keep data', '## FIXTURE Data')],
    ['gives the KwikServe Support e-mail as the privacy contact', (s: string) => s.replace('support@kwikserve.co.ke, ', '')],
    ['links to the account-deletion page', (s: string) => s.replace('[account deletion page](/delete-account/)', 'account deletion page')],
  ])('the Privacy check "%s" fails when that element is missing', (element, mutate) => {
    const mutated = mutate(PRIVACY_FIXTURE);
    expect(mutated).not.toBe(PRIVACY_FIXTURE);
    expect(missingElements(PRIVACY_PAGE_CHECKS, renderFixture(mutated))).toEqual([element]);
  });

  it('the rights checks look only inside the "Your rights" section', () => {
    const moved = PRIVACY_FIXTURE.replace('## FIXTURE Your rights', '## FIXTURE Other');
    expect(missingElements(PRIVACY_PAGE_CHECKS, renderFixture(moved))).toEqual(
      expect.arrayContaining(['has a "Your rights" section', 'the rights section covers access', 'the rights section covers deletion']),
    );
  });

  it('the H-1 check finds each of the five phrases, whatever the case and spacing', () => {
    expect(H1_OLD_PHRASES).toHaveLength(5);
    for (const phrase of H1_OLD_PHRASES) {
      const shouted = `FIXTURE text: ${phrase.toUpperCase().replace(/ /g, '  \n ')}.`;
      expect(h1PhrasesIn(shouted)).toContain(phrase);
    }
    expect(h1PhrasesIn('FIXTURE text: photos you uploaded are deleted.')).toEqual([]);
  });
});
