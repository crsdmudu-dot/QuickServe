// scripts/check-legal-pages.mjs — proves that each built page shows exactly its approved text (PM stage 127, F-127-5).
//
// For each of the five pages (terms, privacy, delete-account, support, faq) it compares:
//   - the canonical text of the page's single data-legal-doc="<id>" element in the BUILT HTML (out/<page>/index.html),
//     using the release checker's canonicaliser (kwikserve-legal-canon/1, copied unchanged below), with the record-rendered
//     version line taken out; and
//   - the canonical text of the APPROVED Markdown file (content/…), worked out independently of the site's renderer.
// On the Terms, Privacy and account-deletion pages it also requires exactly one version line, equal to
// "Version <version> · Effective <effectiveDate>" from content/terms-release.json, with the same values in the
// data-terms-version and data-effective-date attributes of one element inside the container. For the Terms it checks the
// approved file's raw bytes against the record's textSha256. It also compares the ordered list of link targets (every
// href inside the container) with the approved file's links and auto-linked e-mail addresses (PM stage 127c, F-127c-8).
//
//   node scripts/check-legal-pages.mjs [--website <apps/website folder>] [--out <built out folder>]
//
// Defaults: --website is the folder above this script; --out is <website>/out. Plain Node 18+ ESM, no dependencies, offline:
// it reads files and prints a report. Exit codes: 0 every page equals its approved file; 1 a page differs or is missing;
// 2 usage error.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DOCS = [
  { id: 'terms', path: 'terms', file: null, versioned: true },
  { id: 'privacy', path: 'privacy', file: 'privacy.md', versioned: true },
  { id: 'delete-account', path: 'delete-account', file: 'delete-account.md', versioned: true },
  { id: 'support', path: 'support', file: 'support.md', versioned: false },
  { id: 'faq', path: 'faq', file: 'faq.md', versioned: false },
];

// ---------------------------------------------------------------------------------------------------------------------
// The canonicaliser of the release checker (check-website-r3.mjs, package 79; L6 "kwikserve-legal-canon/1"), copied
// unchanged so that this check and the release manifest hash the same text.
// ---------------------------------------------------------------------------------------------------------------------
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009',
  ndash: '\u2013', mdash: '\u2014', lsquo: '\u2018', rsquo: '\u2019', sbquo: '\u201A', ldquo: '\u201C', rdquo: '\u201D',
  bdquo: '\u201E', hellip: '\u2026', middot: '\u00B7', bull: '\u2022', copy: '\u00A9', reg: '\u00AE', trade: '\u2122',
  laquo: '\u00AB', raquo: '\u00BB', times: '\u00D7', divide: '\u00F7', deg: '\u00B0', euro: '\u20AC', pound: '\u00A3',
  sect: '\u00A7', para: '\u00B6', shy: '\u00AD', zwj: '\u200D', zwnj: '\u200C', minus: '\u2212', rarr: '\u2192', larr: '\u2190',
};
const BLOCK_TAGS = new Set(['address', 'article', 'aside', 'blockquote', 'br', 'caption', 'dd', 'details', 'dialog', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav',
  'ol', 'p', 'pre', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul']);
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const LINE_SENTINEL = '\uE000';

export function decodeEntities(s) {
  return s.replace(/&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (whole, body) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '\uFFFD';
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : whole;
  });
}

export function stripNonContent(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '');
}

export function canonicalText(fragment) {
  let s = stripNonContent(fragment);
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/g, (_m, tag) => (BLOCK_TAGS.has(tag.toLowerCase()) ? LINE_SENTINEL : ''));
  s = s.replace(/[\t\n\f\r ]+/g, ' ');
  s = decodeEntities(s).normalize('NFC');
  s = s.replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '');
  s = s.replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\t\n\f\r\v]/g, ' ');
  return s.split(LINE_SENTINEL).map((line) => line.replace(/ {2,}/g, ' ').trim()).filter(Boolean).join('\n');
}

export function parseAttrs(attrText) {
  const out = new Map();
  for (const m of attrText.matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = m[1].toLowerCase();
    if (!out.has(name)) out.set(name, decodeEntities(m[2] ?? m[3] ?? m[4] ?? ''));
  }
  return out;
}

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

export function findElements(html, attr, value) {
  const doc = stripNonContent(html);
  const found = [];
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(doc))) {
    if (m[1]) continue;
    const attrs = parseAttrs(m[3].replace(/\/\s*$/, ''));
    if (!attrs.has(attr) || (value !== undefined && attrs.get(attr) !== value)) continue;
    const tag = m[2].toLowerCase();
    const innerStart = m.index + m[0].length;
    if (VOID_TAGS.has(tag) || /\/\s*$/.test(m[3])) { found.push({ tag, attrs, inner: '' }); continue; }
    const scan = new RegExp(`<(/?)${tag}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi');
    scan.lastIndex = innerStart;
    let depth = 1;
    let end = -1;
    let s;
    while ((s = scan.exec(doc))) {
      if (s[1]) depth -= 1; else if (!/\/\s*>$/.test(s[0])) depth += 1;
      if (depth === 0) { end = s.index; break; }
    }
    found.push({ tag, attrs, inner: end >= 0 ? doc.slice(innerStart, end) : null });
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------
// The approved Markdown file as canonical lines. Written separately from lib/legal-markdown.ts on purpose: a defect in
// the site's renderer must show up here as a difference, not be repeated. One line per heading, paragraph and list item
// (a paragraph's or item's continuation lines joined with a space); heading marks, list marks, ** and * emphasis marks
// and link syntax removed; backslash escapes resolved; then the same whitespace and Unicode steps as canonicalText.
// ---------------------------------------------------------------------------------------------------------------------
const MD_HEADING = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const MD_BULLET = /^[-*+][ \t]+(.*)$/;
const MD_ORDERED = /^(\d{1,9})[.)][ \t]+(.*)$/;
const PRIVATE_BASE = 0xf0000; // escaped characters are parked in a private-use plane while marks are removed

function mdInline(text) {
  let s = text.replace(/\\([!-/:-@[-`{-~])/g, (_m, ch) => String.fromCodePoint(PRIVATE_BASE + ch.charCodeAt(0)));
  s = s.replace(/\[([^\]]*)\]\([^()\s]*\)/g, '$1');
  s = s.replace(/\*/g, '');
  s = s.replace(/[\u{F0000}-\u{F007F}]/gu, (ch) => String.fromCharCode(ch.codePointAt(0) - PRIVATE_BASE));
  return s;
}

function normaliseLine(line) {
  let s = line.replace(/[\t\n\f\r ]+/g, ' ').normalize('NFC');
  s = s.replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '');
  s = s.replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\t\n\f\r\v]/g, ' ');
  return s.replace(/ {2,}/g, ' ').trim();
}

/** The approved Markdown file as raw logical lines: one per heading, paragraph and list item (continuations joined). */
function markdownLogicalLines(source) {
  const lines = source.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  const out = [];
  let open = null; // 'paragraph' | 'item' | null: the kind of the last logical line while it can still continue
  for (const raw of lines) {
    if (!raw.trim()) { if (open === 'paragraph') open = null; else if (open === 'item') open = 'item-after-blank'; continue; }
    const t = raw.trim();
    const heading = MD_HEADING.exec(raw);
    if (heading) { out.push(heading[1]); open = null; continue; }
    const bullet = MD_BULLET.exec(raw);
    const ordered = bullet ? null : MD_ORDERED.exec(raw);
    if (bullet || (ordered && !(open === 'paragraph' && Number(ordered[1]) !== 1))) {
      out.push((bullet ? bullet[1] : ordered[2]).trim());
      open = 'item';
      continue;
    }
    if (open === 'paragraph' || open === 'item') { out[out.length - 1] += ` ${t}`; continue; }
    out.push(t);
    open = 'paragraph';
  }
  return out;
}

export function markdownCanonical(source) {
  return markdownLogicalLines(source).map((l) => normaliseLine(mdInline(l))).filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------------------------------------------------
// The approved file's link targets, in order (PM stage 127c, F-127c-8). Also worked out independently of the site's
// renderer: every [text](target) link, and every e-mail address in the text outside link text, which the renderer turns
// into a mailto: link (MD_EMAIL is the renderer's e-mail rule, lib/legal-markdown.ts). Backslash escapes are parked first,
// as in mdInline, so an escaped "[" never starts a link; they are resolved before e-mail addresses are looked for.
// ---------------------------------------------------------------------------------------------------------------------
const MD_LINK = /\[([^\]]*)\]\(([^()\s]*)\)/g;
const MD_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const parkEscapes = (s) => s.replace(/\\([!-/:-@[-`{-~])/g, (_m, ch) => String.fromCodePoint(PRIVATE_BASE + ch.charCodeAt(0)));
const PARKED = new RegExp(`[${String.fromCodePoint(PRIVATE_BASE)}-${String.fromCodePoint(PRIVATE_BASE + 0x7f)}]`, 'gu');
const unparkEscapes = (s) => s.replace(PARKED, (ch) => String.fromCharCode(ch.codePointAt(0) - PRIVATE_BASE));

export function markdownHrefs(source) {
  const hrefs = [];
  const emails = (text) => {
    for (const m of unparkEscapes(text).matchAll(MD_EMAIL)) hrefs.push(`mailto:${m[0]}`);
  };
  for (const line of markdownLogicalLines(source)) {
    const s = parkEscapes(line);
    let last = 0;
    for (const m of s.matchAll(MD_LINK)) {
      emails(s.slice(last, m.index));
      hrefs.push(unparkEscapes(m[2]));
      last = m.index + m[0].length;
    }
    emails(s.slice(last));
  }
  return hrefs;
}

/** The link targets inside a built container, in document order (every element with an href attribute). */
export function pageHrefs(fragment) {
  return findElements(fragment, 'href').map((e) => e.attrs.get('href'));
}

// ---------------------------------------------------------------------------------------------------------------------
// The comparison.
// ---------------------------------------------------------------------------------------------------------------------
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** The first differing line of two canonical texts. */
export function firstDifference(expected, actual) {
  const e = expected.split('\n');
  const a = actual.split('\n');
  for (let i = 0; i < Math.max(e.length, a.length); i++) {
    if (e[i] !== a[i]) return `line ${i + 1}: approved "${e[i] ?? '(end of text)'}" / page "${a[i] ?? '(end of text)'}"`;
  }
  return null;
}

/**
 * Compares one page's HTML with its approved Markdown. `marker` is { version, effectiveDate } for a versioned page,
 * null otherwise. Returns { ok, problems, lines }.
 */
export function compareLegalPage({ html, id, approvedSource, marker }) {
  const problems = [];
  const containers = findElements(html, 'data-legal-doc');
  const mine = containers.filter((c) => c.attrs.get('data-legal-doc') === id);
  if (containers.length !== 1 || mine.length !== 1) problems.push(`expected exactly one data-legal-doc element, "${id}"; found ${containers.length} (${containers.map((c) => c.attrs.get('data-legal-doc')).join(', ') || 'none'})`);
  else if (mine[0].inner === null) problems.push('the data-legal-doc element is not closed');
  if (problems.length) return { ok: false, problems, lines: 0 };
  const inner = mine[0].inner;
  let pageLines = canonicalText(inner).split('\n');
  // A version line, as the release checker reads one: "Version" followed by v<digit>, <digit> or "draft".
  const versionLines = pageLines.filter((l) => /^Version (?:v\d|\d|draft)/i.test(l));
  if (marker) {
    const want = `Version ${marker.version} \u00B7 Effective ${marker.effectiveDate}`;
    const versions = findElements(inner, 'data-terms-version');
    const effectives = findElements(inner, 'data-effective-date');
    if (versions.length !== 1 || versions[0].attrs.get('data-terms-version') !== marker.version) problems.push(`expected one data-terms-version="${marker.version}" inside the container; found ${JSON.stringify(versions.map((v) => v.attrs.get('data-terms-version')))}`);
    if (effectives.length !== 1 || effectives[0].attrs.get('data-effective-date') !== marker.effectiveDate) problems.push(`expected one data-effective-date="${marker.effectiveDate}" inside the container; found ${JSON.stringify(effectives.map((v) => v.attrs.get('data-effective-date')))}`);
    if (versions.length === 1 && versions[0].inner !== null && canonicalText(versions[0].inner) !== want) problems.push(`the version element shows "${canonicalText(versions[0].inner ?? '')}", expected "${want}"`);
    if (versionLines.length !== 1 || versionLines[0] !== want) problems.push(`expected exactly one version line "${want}"; found ${JSON.stringify(versionLines)}`);
    pageLines = pageLines.filter((l) => l !== want);
  } else if (versionLines.length || findElements(inner, 'data-terms-version').length || findElements(inner, 'data-effective-date').length) {
    problems.push(`this page carries no version line, but found ${JSON.stringify(versionLines)} or a version attribute`);
  }
  const pageText = pageLines.join('\n');
  const approved = markdownCanonical(approvedSource);
  if (sha256(pageText) !== sha256(approved)) problems.push(`the page text differs from the approved file: ${firstDifference(approved, pageText)}`);
  // F-127c-8: the same words can hide a different link, so the ordered link targets must be equal too.
  const wantHrefs = markdownHrefs(approvedSource);
  const gotHrefs = pageHrefs(inner);
  for (let i = 0; i < Math.max(wantHrefs.length, gotHrefs.length); i++) {
    if (wantHrefs[i] === gotHrefs[i]) continue;
    problems.push(`the page's link targets differ from the approved file: link ${i + 1}: approved ${JSON.stringify(wantHrefs[i] ?? '(none)')} / page ${JSON.stringify(gotHrefs[i] ?? '(none)')} (${wantHrefs.length} approved, ${gotHrefs.length} on the page)`);
    break;
  }
  return { ok: problems.length === 0, problems, lines: approved.split('\n').length, links: wantHrefs.length, approvedSha256: sha256(approved) };
}

const FINAL_LABEL = /^[a-z0-9][a-z0-9.-]{0,63}$/i;
const TEXT_FILE_PATTERN = /^apps\/website\/content\/terms-[a-z0-9.-]+\.md$/i;

export function checkBuild({ website, out }) {
  const results = [];
  const recordFile = join(website, 'content', 'terms-release.json');
  let record = null;
  if (existsSync(recordFile)) {
    try { record = JSON.parse(readFileSync(recordFile, 'utf8')); } catch (e) { results.push({ id: 'record', ok: false, problems: [`content/terms-release.json is not valid JSON: ${e.message}`] }); }
  }
  if (record && (!FINAL_LABEL.test(record.version ?? '') || /^draft/i.test(record.version) || !/^\d{4}-\d{2}-\d{2}$/.test(record.effectiveDate ?? '') || !TEXT_FILE_PATTERN.test(record.textFile ?? ''))) {
    results.push({ id: 'record', ok: false, problems: ['content/terms-release.json is not a complete record (version, effectiveDate, textFile)'] });
    record = null;
  }
  for (const d of DOCS) {
    const page = join(out, d.path, 'index.html');
    const problems = [];
    let approvedPath = null;
    if (d.versioned && !record) problems.push('content/terms-release.json is missing or invalid, so the version line cannot be checked');
    if (d.file) approvedPath = join(website, 'content', d.file);
    else if (record) approvedPath = join(website, record.textFile.replace(/^apps\/website\//, ''));
    if (!approvedPath || !existsSync(approvedPath)) problems.push(`the approved file ${approvedPath ? approvedPath : '(named by the record)'} is missing`);
    if (!existsSync(page)) problems.push(`the built page ${page} is missing`);
    if (problems.length) { results.push({ id: d.id, ok: false, problems }); continue; }
    const bytes = readFileSync(approvedPath);
    if (!d.file && sha256(bytes) !== record.textSha256) problems.push(`${record.textFile} has sha256 ${sha256(bytes)}, but the record approves ${record.textSha256}`);
    const r = compareLegalPage({ html: readFileSync(page, 'utf8'), id: d.id, approvedSource: bytes.toString('utf8'), marker: d.versioned ? { version: record.version, effectiveDate: record.effectiveDate } : null });
    results.push({ id: d.id, ok: r.ok && !problems.length, problems: [...problems, ...r.problems], lines: r.lines, links: r.links, approvedSha256: r.approvedSha256 });
  }
  return results;
}

export function main(argv, print = (l) => process.stdout.write(`${l}\n`)) {
  const here = dirname(fileURLToPath(import.meta.url));
  let website = resolve(here, '..');
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--website' && argv[i + 1]) website = resolve(argv[++i]);
    else if (argv[i] === '--out' && argv[i + 1]) out = resolve(argv[++i]);
    else { print(`USAGE ERROR: unexpected argument "${argv[i]}" (use --website <dir> and --out <dir>)`); return 2; }
  }
  out = out ?? join(website, 'out');
  if (!existsSync(out) || !statSync(out).isDirectory()) { print(`USAGE ERROR: no built site at ${out} (run npm run build first)`); return 2; }
  print(`check-legal-pages (F-127-5): website ${website}; build ${out}`);
  const results = checkBuild({ website, out });
  for (const r of results) {
    if (r.ok) print(`PASS  ${r.id}: the page text and link targets equal the approved file (${r.lines} canonical lines, ${r.links} link targets, sha256 ${r.approvedSha256})`);
    else for (const p of r.problems) print(`FAIL  ${r.id}: ${p}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  print(failed ? `LEGAL PAGES: FAILED (${failed} of ${results.length} check(s))` : `LEGAL PAGES: OK (${results.length} of ${results.length} pages equal their approved files)`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
