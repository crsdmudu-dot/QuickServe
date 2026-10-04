// helpers/approved-texts.ts — tripwire checks for the owner's approved texts, once they are in content/ (commit B).
//
// PM stage 127c, F-127c-10. Each check looks for one element the stores require, as listed in package 77c's
// STORE-CHECKLIST-FOR-FINAL-TEXTS.md (Apple 5.1.1(i) and (v); Google Play's account-deletion and User Data pages).
// They check that an element is THERE, not that its wording is right: the wording is the owner's approval and the
// PM's commit-B delta check. They are deliberately loose, so that any reasonable final wording passes.
// The developer (company) name is not checked here while CD1 is open; the PM's delta check covers it.
import { canonicalText, findElements } from '../../scripts/check-legal-pages.mjs';

/**
 * The withdrawn H-1 photo wording: the five phrases of package 79's checker/forbidden-phrases-H1.txt (sha256
 * 10835b2a…). No published page may carry them after M3 (PM stages 89/90). Matched like the release checker:
 * case-insensitive, on the visible text with whitespace collapsed. The two proposed cancellation phrases
 * (forbidden-phrases-H1-proposed-additions.txt) are not adopted yet, so they are not listed here.
 */
export const H1_OLD_PHRASES: readonly string[] = [
  'kept exactly as uploaded',
  'kept exactly as they were uploaded',
  'kept as uploaded',
  'photos attached to those bookings',
  'booking photos, support, safety and audit records are kept',
];

/** The H-1 phrases found in a page's visible text (an empty list means none). */
export function h1PhrasesIn(text: string): string[] {
  const visible = text.replace(/\s+/g, ' ').toLowerCase();
  return H1_OLD_PHRASES.filter((phrase) => visible.includes(phrase));
}

/** The visible text of each h2-h6 heading in an HTML fragment, in order. */
function headings(html: string): string[] {
  return Array.from(html.matchAll(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi), (m) => canonicalText(m[2]));
}

/** The visible text from the first h2-h6 heading that matches `heading` to the next h2 (or the end). */
function section(html: string, heading: RegExp): string {
  const starts = Array.from(html.matchAll(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi));
  const at = starts.find((m) => heading.test(canonicalText(m[2])));
  if (!at || at.index === undefined) return '';
  const rest = html.slice(at.index + at[0].length);
  const next = rest.search(/<h2\b/i);
  return canonicalText(next < 0 ? rest : rest.slice(0, next));
}

const hasHref = (html: string, pattern: RegExp) =>
  findElements(html, 'href').some((e: { attrs: Map<string, string> }) => pattern.test(e.attrs.get('href') ?? ''));

const SUPPORT_MAILTO = /^mailto:support@kwikserve\.co\.ke(?:\?|$)/;

type Check = { element: string; ok: (html: string, text: string) => boolean };

/** Account deletion: Google Play's account-deletion requirements (G1-G4) and Apple 5.1.1(v) (A5). */
export const DELETION_PAGE_CHECKS: readonly Check[] = [
  { element: 'names the app (KwikServe)', ok: (_h, t) => /\bKwikServe\b/.test(t) },
  { element: 'describes deleting the account in the app', ok: (_h, t) => /\bin the (?:KwikServe )?app\b/i.test(t) },
  { element: 'offers an e-mail request route to KwikServe Support', ok: (h) => hasHref(h, SUPPORT_MAILTO) },
  {
    element: 'says the request route needs no sign-in or app',
    ok: (_h, t) => /(?:do not|don't|no) need (?:to sign in|the app)|without (?:signing in|the app)/i.test(t),
  },
  { element: 'has a section on what is deleted', ok: (h) => headings(h).some((x) => /\bis deleted\b|\bwe delete\b/i.test(x)) },
  { element: 'has a section on what is kept', ok: (h) => headings(h).some((x) => /\bkept\b|\bkeep\b|\bretain/i.test(x)) },
  { element: 'says how long kept data is kept', ok: (_h, t) => /\buntil\b|\bexpire|\bretention\b|\bhow long\b/i.test(t) },
  { element: 'links to the Privacy Policy', ok: (h) => hasHref(h, /^\/privacy\/?$/) },
];

/** Privacy: Apple 5.1.1(i) (A2-A4) and Google Play User Data (G6, G9). */
export const PRIVACY_PAGE_CHECKS: readonly Check[] = [
  { element: 'names the Office of the Data Protection Commissioner', ok: (_h, t) => /Office of the Data Protection Commissioner/i.test(t) },
  { element: 'has a "Your rights" section', ok: (h) => headings(h).some((x) => /\byour rights\b/i.test(x)) },
  { element: 'the rights section covers access', ok: (h) => /\baccess\b/i.test(section(h, /\byour rights\b/i)) },
  { element: 'the rights section covers correction', ok: (h) => /\bcorrect/i.test(section(h, /\byour rights\b/i)) },
  { element: 'the rights section covers objection', ok: (h) => /\bobject\b/i.test(section(h, /\byour rights\b/i)) },
  { element: 'the rights section covers restriction', ok: (h) => /\brestrict/i.test(section(h, /\byour rights\b/i)) },
  { element: 'the rights section covers deletion', ok: (h) => /\bdelet/i.test(section(h, /\byour rights\b/i)) },
  { element: 'has a section on how long data is kept', ok: (h) => headings(h).some((x) => /\bhow long\b|\bretention\b|\bkeep\b/i.test(x)) },
  { element: 'gives the KwikServe Support e-mail as the privacy contact', ok: (h) => hasHref(h, SUPPORT_MAILTO) },
  { element: 'links to the account-deletion page', ok: (h) => hasHref(h, /^\/delete-account\/?$/) },
];

/** The elements a page's approved-text container lacks (an empty list means every element is there). */
export function missingElements(checks: readonly Check[], containerHtml: string): string[] {
  const text = canonicalText(containerHtml);
  return checks.filter((c) => !c.ok(containerHtml, text)).map((c) => c.element);
}
