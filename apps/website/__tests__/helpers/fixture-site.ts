// helpers/fixture-site.ts — builds a throw-away website root with FIXTURE texts for the legal-page tests.
//
// The pages read content/ under the working directory at build time (lib/legal-content.ts). A test points the working
// directory at a temporary folder made here, so it never reads or writes the real apps/website/content/.
// Every text comes from __tests__/fixtures/legal/*.fixture.md (synthetic, marked FIXTURE). The approval record written
// here is a FIXTURE too: label v0-fixture, dates 2000-01-01, and the sha256 of the Terms fixture as written.
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'legal');
export const FIXTURE_LABEL = 'v0-fixture';
export const FIXTURE_EFFECTIVE = '2000-01-01';
export const FIXTURE_TERMS_FILE = 'terms-v0-fixture.md';
export const FIXTURE_VERSION_LINE = `Version ${FIXTURE_LABEL} · Effective ${FIXTURE_EFFECTIVE}`;

/** The approved-file name in content/ for each fixture. */
export const FIXTURE_FILES: Record<string, string> = {
  terms: FIXTURE_TERMS_FILE,
  privacy: 'privacy.md',
  'delete-account': 'delete-account.md',
  support: 'support.md',
  faq: 'faq.md',
};

/** A fixture text, with LF line endings whatever the checkout did. */
export function readFixture(id: string): string {
  return readFileSync(join(FIXTURE_DIR, `${id}.fixture.md`), 'utf8').replace(/\r\n/g, '\n');
}

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

export function fixtureRecord(termsSource: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fixture: 'FIXTURE: test data for the apps/website tests only. Not an approval record.',
    version: FIXTURE_LABEL,
    effectiveDate: FIXTURE_EFFECTIVE,
    textFile: `apps/website/content/${FIXTURE_TERMS_FILE}`,
    textSha256: sha256(termsSource),
    approvedBy: 'FIXTURE (no approval)',
    approvedOn: FIXTURE_EFFECTIVE,
    ...overrides,
  };
}

type Options = {
  /** Which texts to write (default: all five). */
  texts?: string[];
  /** Write the approval record (default true); an object overrides fields; a string is written as the raw file. */
  record?: boolean | Record<string, unknown> | string;
  /** Replace a text's source (by id) after the record is made (to test a changed approved file). */
  replace?: Record<string, string>;
};

const made: string[] = [];

/** Creates a website root holding content/ with the requested FIXTURE files; returns its path. */
export function makeFixtureSite({ texts = Object.keys(FIXTURE_FILES), record = true, replace = {} }: Options = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'kwikserve-website-fixture-'));
  made.push(root);
  mkdirSync(join(root, 'content'));
  const terms = readFixture('terms');
  for (const id of texts) writeFileSync(join(root, 'content', FIXTURE_FILES[id]), replace[id] ?? readFixture(id));
  if (record !== false) {
    const body = typeof record === 'string' ? record : JSON.stringify(fixtureRecord(terms, record === true ? {} : record), null, 2);
    writeFileSync(join(root, 'content', 'terms-release.json'), body);
  }
  return root;
}

/** Removes every folder made by makeFixtureSite. */
export function cleanupFixtureSites(): void {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
}
