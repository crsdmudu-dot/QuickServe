// lib/legal-content.ts — reads the approved texts and the Terms approval record at BUILD time.
//
// The website is a static export: `npm run build` (run in apps/website) renders every page once, and these functions run
// then, on the build machine. Nothing is read in a visitor's browser.
//
// THE RECORD. content/terms-release.json is the owner's approval record (the repository's Terms release gate,
// scripts/check-terms-release.ts, defines it): { version, effectiveDate, textFile, textSha256, approvedBy, approvedOn }.
// It does not exist until the approved texts are added. While it is absent, readTermsRelease returns null and the pages
// make no version claim. When it exists it must be valid, or the build stops: a broken record never reaches a page.
//
// THE TEXTS. The Terms text is the file the record names (apps/website/content/terms-<label>.md), and its raw bytes must
// match the record's textSha256, or the build stops. Privacy, account deletion, Support and FAQ are content/<name>.md
// (see content/legal-pages.ts). A missing text file returns null (the page shows its notice instead).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const TERMS_RELEASE_PATH = 'content/terms-release.json';
/** The record's textFile, relative to the repository root (the same rule as scripts/check-terms-release.ts). */
const TEXT_FILE_PATTERN = /^apps\/website\/content\/terms-[a-z0-9.-]+\.md$/i;
/** The label rule of the Terms gate and the release checker: letters, digits, "." and "-", at most 64; not "draft…". */
const FINAL_LABEL = /^[a-z0-9][a-z0-9.-]{0,63}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256 = /^[0-9a-f]{64}$/;
/** The fixed approved-file names of the other four pages: lower-case letters and "-", then ".md". */
const CONTENT_FILE = /^[a-z][a-z-]*\.md$/;

export type TermsRelease = {
  version: string;
  effectiveDate: string;
  textFile: string;
  textSha256: string;
  approvedBy: string;
  approvedOn: string;
};

/** The version line's values, as the pages render them. */
export type VersionMarker = { version: string; effectiveDate: string };

export class LegalContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegalContentError';
  }
}

/**
 * The website folder (apps/website). The build and the tests run with it as the working directory. A build started
 * from anywhere else would silently find no texts, so it is refused instead.
 */
export function websiteRoot(): string {
  const root = process.cwd();
  const content = join(root, 'content');
  if (!existsSync(content) || !statSync(content).isDirectory()) {
    throw new LegalContentError(`no content/ folder in ${root}: build the website from apps/website (npm run build there)`);
  }
  return root;
}

function validDate(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Reads the owner's approval record. Returns null when the file does not exist; throws when it exists but is not a
 * complete, final record. `path` must be TERMS_RELEASE_PATH (it is passed explicitly so each page names the record).
 */
export function readTermsRelease(path: string): TermsRelease | null {
  if (path !== TERMS_RELEASE_PATH) throw new LegalContentError(`the approval record is ${TERMS_RELEASE_PATH}, not ${path}`);
  const file = join(websiteRoot(), path);
  if (!existsSync(file)) return null;
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new LegalContentError(`${path} is not valid JSON: ${(e as Error).message}`);
  }
  const r = (data ?? {}) as Record<string, unknown>;
  const problems: string[] = [];
  if (typeof r.version !== 'string' || !FINAL_LABEL.test(r.version) || /^draft/i.test(r.version)) problems.push(`version ${JSON.stringify(r.version)} is not a final label`);
  if (!validDate(r.effectiveDate)) problems.push(`effectiveDate ${JSON.stringify(r.effectiveDate)} is not a YYYY-MM-DD date`);
  if (typeof r.textFile !== 'string' || !TEXT_FILE_PATTERN.test(r.textFile)) problems.push(`textFile ${JSON.stringify(r.textFile)} is not apps/website/content/terms-<label>.md`);
  if (typeof r.textSha256 !== 'string' || !SHA256.test(r.textSha256)) problems.push('textSha256 is not a lower-case sha256');
  if (typeof r.approvedBy !== 'string' || !r.approvedBy.trim()) problems.push('approvedBy is empty');
  if (!validDate(r.approvedOn)) problems.push(`approvedOn ${JSON.stringify(r.approvedOn)} is not a YYYY-MM-DD date`);
  if (problems.length) throw new LegalContentError(`${path} is not a complete approval record: ${problems.join('; ')}`);
  return r as unknown as TermsRelease;
}

/**
 * Reads the approved Terms text the record names. Its raw bytes must match the record's textSha256 (the approval is of
 * those exact bytes); a missing file or a different hash stops the build.
 */
export function readApprovedTermsText(textFile: string, textSha256: string): { source: string; label: string } {
  if (!TEXT_FILE_PATTERN.test(textFile)) throw new LegalContentError(`textFile ${JSON.stringify(textFile)} is not apps/website/content/terms-<label>.md`);
  const label = textFile.replace(/^apps\/website\//, '');
  const file = join(websiteRoot(), label);
  if (!existsSync(file)) throw new LegalContentError(`${TERMS_RELEASE_PATH} names ${textFile}, which does not exist`);
  const bytes = readFileSync(file);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== textSha256) throw new LegalContentError(`${textFile} has sha256 ${actual}, but ${TERMS_RELEASE_PATH} approves ${textSha256}`);
  return { source: bytes.toString('utf8'), label };
}

/** Reads content/<name>; null when the file is not there yet. */
export function readContentFile(name: string): { source: string; label: string } | null {
  if (!CONTENT_FILE.test(name)) throw new LegalContentError(`not an approved-text file name: ${JSON.stringify(name)}`);
  const label = `content/${name}`;
  const file = join(websiteRoot(), label);
  if (!existsSync(file)) return null;
  return { source: readFileSync(file, 'utf8'), label };
}
