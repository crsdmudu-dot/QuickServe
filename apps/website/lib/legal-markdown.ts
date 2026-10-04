// lib/legal-markdown.ts — a small, strict Markdown reader for the approved legal and help texts.
//
// The Terms, Privacy, account-deletion, Support and FAQ pages publish texts the owner approves word for word. Those
// texts are kept as Markdown files in content/ and this module turns them into a simple block list that
// components/LegalMarkdown.tsx renders as plain HTML (headings, paragraphs, lists, bold, italics and links).
//
// Why in-house: apps/website has no Markdown dependency, and this change adds none.
// Why strict: an approved text must appear exactly as the reviewer read it. Anything outside the small subset below
// stops the build with the file name and line number, instead of being shown in some other way.
//
// SUPPORTED (a subset of CommonMark):
//   - "# " to "###### " headings on one line (an optional closing run of "#" is dropped);
//   - paragraphs: consecutive lines; the line break inside a paragraph becomes a space;
//   - bullet lists ("- ", "* " or "+ ") and numbered lists ("1. " or "1) "), one level only. An item may continue on
//     the next lines (indented or not) until a blank line. Changing the bullet or number style starts a new list;
//   - **bold**, *italics*, [link text](target) where the target is a site path (/terms/), an anchor (#rights),
//     mailto:… or https://…;
//   - e-mail addresses in the text become mailto: links;
//   - a backslash before ASCII punctuation shows that character as it is (\* shows *).
// REFUSED (the build fails): raw HTML and comments, entities such as &amp;, block quotes, code (fenced, indented or
// `inline`), tables, images, horizontal rules, underlined (setext) headings, nested lists, list items with more than one
// paragraph, link reference definitions, hard line breaks, underscore emphasis, strikethrough, an unclosed * or **,
// and any other link target, including any target with a backslash or a control character. Tabs at the start of a line
// are refused because their indentation is ambiguous.
//
// This module only parses. It has no React and no file access, so it can be tested on its own.

export type Inline =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: Inline[][] };

/** Thrown for any construct outside the supported subset; the message names the file and the line. */
export class LegalMarkdownError extends Error {
  constructor(label: string, line: number, why: string) {
    super(`${label}:${line}: ${why}`);
    this.name = 'LegalMarkdownError';
  }
}

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const HASH_START = /^ {0,3}#/;
const BULLET = /^([-*+])[ \t]+(.*)$/;
const ORDERED = /^(\d{1,9})([.)])[ \t]+(.*)$/;
const EMPTY_ITEM = /^(?:[-*+]|\d{1,9}[.)])[ \t]*$/;
const INDENTED_MARKER = /^[ ]{1,}(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/;
const BLOCK_QUOTE = /^ {0,3}>/;
const FENCE = /^ {0,3}(?:```|~~~)/;
const TABLE_ROW = /^ {0,3}\|/;
const TABLE_DELIMITER = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*$/;
const HTML_BLOCK = /^ {0,3}<[A-Za-z!/?]/;
const LINK_DEFINITION = /^ {0,3}\[[^\]]+\]:/;
const ENTITY = /&(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/;
const ASCII_PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/**
 * Characters no link target may contain (PM stage 127c, F-127c-7):
 *   - a backslash: browsers read "\" as "/" in web addresses, so "/\evil.example" would leave the site;
 *   - control characters (C0, DEL and C1): browsers drop or rewrite them, so the target would not be what it shows.
 */
const UNSAFE_HREF_CHARACTER = /[\\\x00-\x1f\x7f-\x9f]/;

/** The link targets a legal page may use: site paths, anchors, e-mail and https. Nothing else. */
export function isAllowedHref(href: string): boolean {
  if (UNSAFE_HREF_CHARACTER.test(href)) return false;
  if (/^\/(?![/\\])[^\s]*$/.test(href)) return true; // a path on this site (not "//host" or "/\host")
  if (/^#[A-Za-z0-9_-]+$/.test(href)) return true;
  if (/^mailto:[^\s@]+@[^\s@]+\.[A-Za-z]{2,}(?:\?[^\s]*)?$/.test(href)) return true;
  if (/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:[/?#][^\s]*)?$/.test(href)) return true;
  return false;
}

type Line = { text: string; n: number };

/**
 * Parses one approved text. `label` names the file in error messages (for example "content/privacy.md").
 * Line endings may be LF or CRLF; a leading byte-order mark is ignored.
 */
export function parseLegalMarkdown(source: string, label: string): Block[] {
  const lines: Line[] = source
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .map((text, i) => ({ text: text.replace(/[ \t]+$/, ''), n: i + 1 }));
  const blocks: Block[] = [];
  const fail = (n: number, why: string): never => {
    throw new LegalMarkdownError(label, n, why);
  };
  const isBlank = (t: string) => t.trim() === '';

  /** Structural checks that apply to every non-blank line. */
  const refuse = (line: Line) => {
    const t = line.text;
    if (/^ {0,3}\t/.test(t)) fail(line.n, 'a tab at the start of a line (use spaces)');
    if (FENCE.test(t)) fail(line.n, 'code blocks are not supported');
    if (BLOCK_QUOTE.test(t)) fail(line.n, 'block quotes are not supported');
    if (HTML_BLOCK.test(t)) fail(line.n, 'raw HTML and HTML comments are not supported');
    if (TABLE_ROW.test(t) || TABLE_DELIMITER.test(t)) fail(line.n, 'tables are not supported');
    if (LINK_DEFINITION.test(t)) fail(line.n, 'link reference definitions are not supported');
    if (THEMATIC_BREAK.test(t)) fail(line.n, 'horizontal rules are not supported');
    if (SETEXT_UNDERLINE.test(t)) fail(line.n, 'a line of only "=" or "-" (an underlined heading) is not supported; use "# Title"');
    if (/\\$/.test(t)) fail(line.n, 'a hard line break ("\\" at the end of a line) is not supported');
  };

  type Pending = { kind: 'paragraph'; parts: string[]; n: number } | { kind: 'list'; ordered: boolean; marker: string; start: number; items: { parts: string[]; n: number }[] };
  let pending: Pending | null = null;
  let afterBlank = true;

  const flush = () => {
    if (!pending) return;
    if (pending.kind === 'paragraph') blocks.push({ type: 'paragraph', children: parseInline(pending.parts.join(' '), label, pending.n) });
    else {
      const items = pending.items.map((it) => parseInline(it.parts.join(' '), label, it.n));
      blocks.push({ type: 'list', ordered: pending.ordered, start: pending.start, items });
    }
    pending = null;
  };

  for (const line of lines) {
    const t = line.text;
    if (isBlank(t)) {
      if (pending?.kind === 'paragraph') flush();
      afterBlank = true;
      continue;
    }
    refuse(line);
    if (INDENTED_MARKER.test(t)) fail(line.n, 'indented list items (nested lists) are not supported');
    if (/^ /.test(t) && (afterBlank || !pending)) fail(line.n, 'an indented line that does not continue a paragraph or list item (indented code, or a list item with a second paragraph) is not supported');

    const heading = HEADING.exec(t);
    if (HASH_START.test(t) && !heading) fail(line.n, 'a "#" at the start of a line must be a heading ("# Title")');
    if (heading) {
      if (!heading[2] || !heading[2].trim()) fail(line.n, 'an empty heading');
      flush();
      blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6, children: parseInline(heading[2].trim(), label, line.n) });
      afterBlank = false;
      continue;
    }

    if (EMPTY_ITEM.test(t)) fail(line.n, 'an empty list item');
    const bullet = BULLET.exec(t);
    const ordered = bullet ? null : ORDERED.exec(t);
    // A numbered line interrupts a paragraph only when it starts at 1 (CommonMark); otherwise it continues the paragraph.
    const startsList = !!bullet || (!!ordered && !(pending?.kind === 'paragraph' && Number(ordered[1]) !== 1));
    if (startsList) {
      const isOrdered = !bullet;
      const marker = bullet ? bullet[1] : ordered![2];
      const text = bullet ? bullet[2] : ordered![3];
      if (pending?.kind === 'list' && pending.ordered === isOrdered && pending.marker === marker) {
        pending.items.push({ parts: [text.trim()], n: line.n });
      } else {
        flush();
        pending = { kind: 'list', ordered: isOrdered, marker, start: isOrdered ? Number(ordered![1]) : 1, items: [{ parts: [text.trim()], n: line.n }] };
      }
      afterBlank = false;
      continue;
    }

    // A text line: it continues the open paragraph or list item, or starts a paragraph.
    if (pending?.kind === 'list' && afterBlank) {
      flush(); // a blank line ended the list; this line starts a paragraph
    }
    if (pending?.kind === 'list') {
      pending.items[pending.items.length - 1].parts.push(t.trim());
    } else if (pending?.kind === 'paragraph') {
      pending.parts.push(t.trim());
    } else {
      pending = { kind: 'paragraph', parts: [t.trim()], n: line.n };
    }
    afterBlank = false;
  }
  flush();
  return blocks;
}

/** Splits plain text into text and mailto-link pieces. */
function linkEmails(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(EMAIL)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ type: 'text', value: text.slice(last, at) });
    out.push({ type: 'link', href: `mailto:${m[0]}`, children: [{ type: 'text', value: m[0] }] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

/** Finds the next unescaped occurrence of `token` at or after `from`; -1 if none. */
function findUnescaped(s: string, token: string, from: number, single = false): number {
  for (let i = from; i < s.length; i++) {
    if (s[i] === '\\') { i += 1; continue; }
    if (!s.startsWith(token, i)) continue;
    if (single && (s[i + 1] === '*' || s[i - 1] === '*')) continue; // part of "**", not a single "*"
    return i;
  }
  return -1;
}

/**
 * Parses the inline text of one block (a heading, a paragraph or a list item). `n` is the block's first line, for errors.
 * `inLink` is true inside link text, where another link is not allowed.
 */
export function parseInline(s: string, label: string, n: number, inLink = false): Inline[] {
  const fail = (why: string): never => {
    throw new LegalMarkdownError(label, n, why);
  };
  if (ENTITY.test(s)) fail(`character references such as "${ENTITY.exec(s)![0]}" are not supported; write the character itself`);
  const out: Inline[] = [];
  let buf = '';
  const pushText = () => {
    if (!buf) return;
    if (inLink) out.push({ type: 'text', value: buf });
    else out.push(...linkEmails(buf));
    buf = '';
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      const next = s[i + 1];
      if (next !== undefined && ASCII_PUNCTUATION.test(next)) { buf += next; i += 1; } else buf += c;
      continue;
    }
    if (c === '`') fail('inline code is not supported');
    if (c === '<' && /[A-Za-z/!?]/.test(s[i + 1] ?? '')) fail('raw HTML and <…> links are not supported');
    if (c === '!' && s[i + 1] === '[') fail('images are not supported');
    if (c === '~' && s[i + 1] === '~') fail('strikethrough is not supported');
    if (c === '_') {
      const before = s[i - 1];
      const after = s[i + 1];
      const leftOpen = before === undefined || !/[A-Za-z0-9]/.test(before);
      if (leftOpen && after !== undefined && !/\s/.test(after) && after !== '_') fail('underscore emphasis is not supported; use *italics*');
      buf += c;
      continue;
    }
    if (c === '*' && s[i + 1] === '*') {
      const close = findUnescaped(s, '**', i + 2);
      if (close < 0) fail('an unclosed "**"');
      const inner = s.slice(i + 2, close);
      if (!inner || /^\s|\s$/.test(inner)) fail('"**" must wrap text without spaces inside the markers');
      pushText();
      out.push({ type: 'strong', children: parseInline(inner, label, n, inLink) });
      i = close + 1;
      continue;
    }
    if (c === '*') {
      const close = findUnescaped(s, '*', i + 1, true);
      if (close < 0) fail('an unclosed "*" (write \\* for a literal asterisk)');
      const inner = s.slice(i + 1, close);
      if (!inner || /^\s|\s$/.test(inner)) fail('"*" must wrap text without spaces inside the markers');
      pushText();
      out.push({ type: 'em', children: parseInline(inner, label, n, inLink) });
      i = close;
      continue;
    }
    if (c === '[') {
      const close = findUnescaped(s, ']', i + 1);
      const m = close >= 0 && s[close + 1] === '(' ? /^\(([^()\s]*)\)/.exec(s.slice(close + 1)) : null;
      if (close >= 0 && s[close + 1] === '(' && !m) fail('a link target must be one word in brackets: [text](/path/)');
      if (m) {
        if (inLink) fail('a link inside link text is not supported');
        const text = s.slice(i + 1, close);
        if (text.includes('[')) fail('"[" inside link text is not supported');
        if (!text.trim()) fail('a link needs visible text');
        const href = m[1];
        if (!isAllowedHref(href)) fail(`link target "${href}" is not allowed (use /path, #anchor, mailto: or https://)`);
        pushText();
        out.push({ type: 'link', href, children: parseInline(text, label, n, true) });
        i = close + m[0].length;
        continue;
      }
      buf += c; // a "[" that does not start a link is shown as it is
      continue;
    }
    buf += c;
  }
  pushText();
  return out;
}

/** The plain text of inline content (used for page titles and tests). */
export function inlineText(nodes: Inline[]): string {
  return nodes.map((x) => (x.type === 'text' ? x.value : inlineText(x.children))).join('');
}
