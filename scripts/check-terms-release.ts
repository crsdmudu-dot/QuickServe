/**
 * check-terms-release.ts — the Terms of Service release gate (a submission blocker until it passes).
 *
 * Run from the repository root with Node 24+ (native TypeScript execution):
 *
 *     node scripts/check-terms-release.ts                     # the repository: app, database, website, approval
 *     node scripts/check-terms-release.ts --live <url>        # also the PUBLISHED page (M6), read-only fetch
 *
 * It is a RELEASE GATE, not part of CI: it fails until the owner has approved the final Terms. It must print
 * "TERMS RELEASE OK" before the release builds (M8), the website going live (M6) and the store submissions (M11).
 *
 * WHAT MUST AGREE — one approved release, used everywhere:
 *   1. the app constant CURRENT_TERMS_VERSION (src/constants/terms.ts);
 *   2. the database label: the LAST migration that defines public.current_terms_version() (0068, or a later
 *      forward migration once 0068 is on QA);
 *   3. the owner's approval record apps/website/content/terms-release.json:
 *        { version, effectiveDate, textFile, textSha256, approvedBy, approvedOn }
 *      whose textSha256 is the sha256 of the RAW BYTES of the approved text file (apps/website/content/terms-*.md,
 *      marked -text in .gitattributes so no checkout can change its line endings);
 *   4. the website Terms page, which must render the version, the effective date AND the text from that record,
 *      with no hard-coded prose of its own, so it cannot show one version line and different words.
 * The approved text and the page must carry no placeholder wording. The label must be final: not "draft…",
 * letters, digits, "." and "-" only, at most 64 characters (the database column's limit).
 *
 * Read-only: it writes nothing, and it contacts the network only with --live.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const APP_CONSTANT_FILE = 'src/constants/terms.ts';
export const MIGRATIONS_DIR = 'supabase/migrations';
export const RELEASE_FILE = 'apps/website/content/terms-release.json';
export const TEXT_FILE_PATTERN = /^apps\/website\/content\/terms-[a-z0-9.-]+\.md$/i;
export const TEXT_ATTRIBUTE_RULE = 'apps/website/content/terms-*.md -text';
export const TERMS_PAGE = 'apps/website/app/terms/page.tsx';

const PLACEHOLDER = /placeholder|pending legal review|lorem ipsum|\bTBD\b|\bTODO\b|\bXXX\b/i;
const FINAL_LABEL = /^[a-z0-9][a-z0-9.-]{0,63}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type Release = {
  version: string;
  effectiveDate: string;
  textFile: string;
  textSha256: string;
  approvedBy: string;
  approvedOn: string;
};
export type Check = { name: string; ok: boolean; detail: string };

const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

/** The label the database will use: the last migration (by file name) that defines current_terms_version(). */
export function databaseLabel(root: string): { label: string | null; file: string | null; unparsed: string | null } {
  const dir = join(root, MIGRATIONS_DIR);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort() : [];
  let label: string | null = null;
  let file: string | null = null;
  let unparsed: string | null = null;
  for (const f of files) {
    const sql = readFileSync(join(dir, f), 'utf8');
    if (!/function\s+public\.current_terms_version\s*\(/i.test(sql)) continue;
    const m = /create or replace function public\.current_terms_version\(\)[\s\S]*?select\s+'([^']+)'::text/i.exec(sql);
    // A later definition the check cannot read must not let an earlier, readable one through: fail closed.
    label = m ? m[1] : null;
    file = f;
    unparsed = m ? null : f;
  }
  return { label, file, unparsed };
}

export function checkTermsRelease(root: string): Check[] {
  const checks: Check[] = [];
  const add = (name: string, ok: unknown, detail: string) => checks.push({ name, ok: !!ok, detail });
  const read = (p: string) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : null);

  // 1-2. App and database labels.
  const app = /export const CURRENT_TERMS_VERSION = '([^']+)'/.exec(read(APP_CONSTANT_FILE) ?? '')?.[1] ?? null;
  add('app label found', app, app ?? `CURRENT_TERMS_VERSION not found in ${APP_CONSTANT_FILE}`);
  const db = databaseLabel(root);
  add('database label found', db.label, db.unparsed ? `the last definition (${db.unparsed}) cannot be read` : db.label ? `${db.label} (${db.file})` : 'no migration defines current_terms_version()');
  add('app and database labels are equal', app && db.label && app === db.label, `app ${app} / database ${db.label}`);
  add('label is final', app && !/^draft/i.test(app) && FINAL_LABEL.test(app), `label ${app} (not "draft…", letters/digits/./-, at most 64)`);

  // 3. The owner's approval record, tied to the exact bytes of the approved text.
  let release: Release | null = null;
  const raw = read(RELEASE_FILE);
  try {
    release = raw ? (JSON.parse(raw) as Release) : null;
  } catch {
    release = null;
  }
  add('approval record exists', release, release ? RELEASE_FILE : `${RELEASE_FILE} missing or not valid JSON`);
  let textBytes: Buffer | null = null;
  if (release) {
    add('approval record names the approver and the date', release.approvedBy && ISO_DATE.test(release.approvedOn ?? ''),
      `approvedBy ${release.approvedBy ?? '-'} / approvedOn ${release.approvedOn ?? '-'}`);
    add('approval record has an effective date', ISO_DATE.test(release.effectiveDate ?? ''), `effectiveDate ${release.effectiveDate ?? '-'}`);
    add('approval record version equals the app and database label', release.version === app && release.version === db.label,
      `record ${release.version}`);
    const textPathOk = typeof release.textFile === 'string' && TEXT_FILE_PATTERN.test(release.textFile);
    add('approved text is a terms-*.md file in apps/website/content', textPathOk, `textFile ${release.textFile ?? '-'}`);
    textBytes = textPathOk && existsSync(join(root, release.textFile)) ? readFileSync(join(root, release.textFile)) : null;
    const actual = textBytes ? sha256(textBytes) : null;
    add('approved text matches the approved hash (raw bytes)', actual && actual === release.textSha256,
      `sha256 ${actual ?? 'file missing'} / approved ${release.textSha256 ?? '-'}`);
    add('approved text carries no placeholder wording', textBytes && !PLACEHOLDER.test(textBytes.toString('utf8')),
      textBytes && PLACEHOLDER.test(textBytes.toString('utf8')) ? 'placeholder wording found in the text' : 'ok');
  }
  const attributes = read('.gitattributes') ?? '';
  add('the approved text is protected from line-ending conversion', attributes.split(/\r?\n/).map((l) => l.trim()).includes(TEXT_ATTRIBUTE_RULE),
    `.gitattributes must contain "${TEXT_ATTRIBUTE_RULE}"`);

  // 4. The website page renders the record: version, effective date and text; no prose of its own.
  const page = read(TERMS_PAGE);
  add('website Terms page exists', page, TERMS_PAGE);
  if (page) {
    add('website Terms page carries no placeholder wording', !PLACEHOLDER.test(page),
      PLACEHOLDER.test(page) ? 'the page still says it is a placeholder or pending legal review' : 'ok');
    add('website page reads the approval record', /terms-release\.json/.test(page), 'the page must import apps/website/content/terms-release.json');
    add('website page renders the version, effective date and text from the record',
      /\.version\b/.test(page) && /\.effectiveDate\b/.test(page) && /\.textFile\b/.test(page),
      'the page must use release.version, release.effectiveDate and release.textFile');
    const hardCoded = page.match(/<(h[1-6]|p|li)\b[^>]*>\s*[A-Za-z][^<{]*/g) ?? [];
    add('website page has no hard-coded prose (the text comes only from the approved file)', hardCoded.length === 0,
      hardCoded.length ? `${hardCoded.length} hard-coded element(s), e.g. ${(hardCoded[0] ?? '').slice(0, 60).replace(/\s+/g, ' ')}` : 'ok');
  }
  return checks;
}

/** Words only: case, punctuation, Markdown syntax and whitespace removed, so HTML and Markdown compare. */
export function words(text: string): string {
  return text.toLowerCase().replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;|&#\d+;/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * True when every paragraph of the text appears in the page, word for word and in order. Paragraphs (blocks separated
 * by a blank line) are compared one by one, because the page places its own heading and version line between them.
 */
export function containsTextInOrder(pageWords: string, text: string): boolean {
  let from = 0;
  for (const block of text.split(/\r?\n\s*\r?\n/)) {
    const w = words(block);
    if (!w) continue;
    const at = pageWords.indexOf(` ${w} `, from);
    if (at < 0) return false;
    from = at + w.length + 1;
  }
  return true;
}

/** The published page (M6): it must show the approved version, date and every word of the approved text. */
export function checkLivePage(html: string, release: Release, text: string): Check[] {
  const pageWords = ` ${words(html)} `;
  return [
    { name: 'live page shows the approved version', ok: pageWords.includes(` ${words(`Version ${release.version}`)} `), detail: `Version ${release.version}` },
    { name: 'live page shows the approved effective date', ok: pageWords.includes(` ${words(`Effective ${release.effectiveDate}`)} `), detail: `Effective ${release.effectiveDate}` },
    { name: 'live page shows the approved text, word for word', ok: containsTextInOrder(pageWords, text), detail: 'every paragraph of the approved text, word for word, in order' },
    { name: 'live page carries no placeholder wording', ok: !PLACEHOLDER.test(html), detail: PLACEHOLDER.test(html) ? 'placeholder wording found' : 'ok' },
  ];
}

async function main(argv: string[]): Promise<void> {
  const root = process.cwd();
  const checks = checkTermsRelease(root);
  const liveAt = argv.indexOf('--live');
  if (liveAt >= 0) {
    const url = argv[liveAt + 1];
    const release = JSON.parse(readFileSync(join(root, RELEASE_FILE), 'utf8')) as Release;
    const text = readFileSync(join(root, release.textFile), 'utf8');
    const res = await fetch(url, { redirect: 'follow' });
    checks.push({ name: 'live page answers 200', ok: res.status === 200, detail: `${url} -> ${res.status}` });
    checks.push(...checkLivePage(await res.text(), release, text));
  }
  for (const c of checks) process.stdout.write(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name} — ${c.detail}\n`);
  const failed = checks.filter((c) => !c.ok).length;
  process.stdout.write(failed === 0 ? 'TERMS RELEASE OK\n' : `TERMS RELEASE BLOCKED: ${failed} check(s) failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

const invokedPath = resolve(process.argv[1] ?? '');
if (invokedPath === resolve(process.cwd(), 'scripts', 'check-terms-release.ts')) void main(process.argv.slice(2));
