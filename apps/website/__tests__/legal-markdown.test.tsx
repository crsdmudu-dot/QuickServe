// legal-markdown.test.tsx — the strict Markdown reader for the approved texts (lib/legal-markdown.ts) and its renderer.
// Inputs are synthetic. The last block checks that the rendered HTML and the independent Markdown canonical form of
// scripts/check-legal-pages.mjs agree, so the F-127-5 comparison measures the renderer rather than repeating it.
import { renderToStaticMarkup } from 'react-dom/server';

import { LegalMarkdownError, inlineText, isAllowedHref, parseLegalMarkdown, type Block } from '@/lib/legal-markdown';
import LegalMarkdown from '@/components/LegalMarkdown';
import { canonicalText, markdownCanonical } from '../scripts/check-legal-pages.mjs';

const parse = (s: string) => parseLegalMarkdown(s, 'test.md');
const render = (s: string) => renderToStaticMarkup(<LegalMarkdown blocks={parse(s)} />);

describe('supported constructs', () => {
  it('reads headings of every level, with optional closing hashes', () => {
    const blocks = parse('# One\n\n## Two ##\n\n###### Six\n');
    expect(blocks.map((b) => (b.type === 'heading' ? [b.level, inlineText(b.children)] : null))).toEqual([[1, 'One'], [2, 'Two'], [6, 'Six']]);
  });

  it('joins the lines of a paragraph with a space and splits paragraphs at blank lines', () => {
    const blocks = parse('First line\nsecond line.\n\nNext paragraph.\n');
    expect(blocks).toHaveLength(2);
    expect(inlineText((blocks[0] as Extract<Block, { type: 'paragraph' }>).children)).toBe('First line second line.');
  });

  it('reads bullet and numbered lists, item continuations and the start number', () => {
    const blocks = parse('- one\n- two\n  continued\nlazy\n\n3. three\n4. four\n');
    expect(blocks).toHaveLength(2);
    const [ul, ol] = blocks as Extract<Block, { type: 'list' }>[];
    expect(ul.ordered).toBe(false);
    expect(ul.items.map(inlineText)).toEqual(['one', 'two continued lazy']);
    expect(ol.ordered).toBe(true);
    expect(ol.start).toBe(3);
    expect(render('3. three\n')).toContain('<ol start="3"');
  });

  it('keeps one list across a blank line, and starts a new list when the marker changes', () => {
    expect(parse('- a\n\n- b\n')).toHaveLength(1);
    expect(parse('- a\n* b\n')).toHaveLength(2);
  });

  it('lets a bullet, a heading or "1." interrupt a paragraph, but not "2."', () => {
    expect(parse('Text\n- item\n').map((b) => b.type)).toEqual(['paragraph', 'list']);
    expect(parse('Text\n# Head\n').map((b) => b.type)).toEqual(['paragraph', 'heading']);
    expect(parse('Text\n1. item\n').map((b) => b.type)).toEqual(['paragraph', 'list']);
    expect(parse('In\n2026. we\n').map((b) => b.type)).toEqual(['paragraph']);
  });

  it('renders bold, italics, links and nested emphasis', () => {
    const out = render('**Bold** and *it* and [a link](/terms/) and **bold *inner* bold**.');
    expect(out).toContain('<strong class="font-semibold text-ink">Bold</strong>');
    expect(out).toContain('<em>it</em>');
    expect(out).toContain('href="/terms/"');
    expect(out).toMatch(/<strong[^>]*>bold <em>inner<\/em> bold<\/strong>/);
  });

  it('turns e-mail addresses into mailto links, but not inside link text', () => {
    expect(render('Write to support@kwikserve.co.ke.')).toContain('<a href="mailto:support@kwikserve.co.ke"');
    expect(render('[mail support@kwikserve.co.ke](/support/)')).not.toContain('mailto:');
  });

  it('shows escaped punctuation as it is and a "[" that is not a link as text', () => {
    const blocks = parse('A \\*star\\* and [KES] and 5 \\_ 6.');
    expect(inlineText((blocks[0] as Extract<Block, { type: 'paragraph' }>).children)).toBe('A *star* and [KES] and 5 _ 6.');
  });

  it('escapes text instead of passing HTML through (React escapes every piece of text)', () => {
    expect(render('Less than 5 > 3 & "quotes".')).toContain('Less than 5 &gt; 3 &amp; &quot;quotes&quot;.');
  });

  it('accepts CRLF line endings and a byte-order mark', () => {
    expect(parse('\uFEFF# T\r\n\r\nP\r\n')).toEqual(parse('# T\n\nP\n'));
  });

  it('allows only site paths, anchors, mailto and https link targets', () => {
    for (const ok of ['/terms/', '/delete-account/', '#rights', 'mailto:support@kwikserve.co.ke', 'https://kwikserve.co.ke/privacy/']) expect(isAllowedHref(ok)).toBe(true);
    for (const bad of ['javascript:alert(1)', 'http://kwikserve.co.ke/', '//evil.example/', 'data:text/html,x', 'terms', 'mailto:', 'ftp://x.y']) expect(isAllowedHref(bad)).toBe(false);
  });
});

describe('refused constructs stop the build, naming the file and line', () => {
  it.each([
    ['raw HTML', 'Text\n\n<div>x</div>\n', /test\.md:3: raw HTML/],
    ['an HTML comment', '<!-- PUBLIC TEXT START -->\n', /raw HTML/],
    ['inline HTML', 'A <b>bold</b> word.\n', /raw HTML/],
    ['a block quote', '> quoted\n', /block quotes/],
    ['a fenced code block', '```\ncode\n```\n', /code blocks/],
    ['inline code', 'Use `code` here.\n', /inline code/],
    ['an indented code block', 'Text\n\n    code\n', /indented line/],
    ['a table', '| a | b |\n|---|---|\n', /tables/],
    ['a table without outer pipes', 'a | b\n--|--\n', /tables|underlined/],
    ['an image', '![alt](/x.png)\n', /images/],
    ['a horizontal rule', 'Text\n\n---\n', /horizontal rules/],
    ['a setext heading', 'Title\n=====\n', /underlined heading/],
    ['a nested list', '- a\n  - b\n', /nested lists/],
    ['a list item with a second paragraph', '- a\n\n  more\n', /indented line/],
    ['a link reference definition', '[x]: /terms/\n', /reference definitions/],
    ['a character reference', 'Fish &amp; chips\n', /character references/],
    ['underscore emphasis', 'An _italic_ word.\n', /underscore emphasis/],
    ['an unclosed "*"', 'A * star.\n', /unclosed "\*"/],
    ['an unclosed "**"', 'A **bold start.\n', /unclosed "\*\*"/],
    ['strikethrough', '~~old~~\n', /strikethrough/],
    ['a hard line break', 'Line\\\nnext\n', /hard line break/],
    ['a tab indent', '\tTabbed\n', /tab at the start/],
    ['a "#" that is not a heading', '#hashtag\n', /must be a heading/],
    ['an empty heading', '#\n', /empty heading|must be a heading/],
    ['an empty list item', '-\n', /empty list item|underlined heading/],
    ['a javascript: link', '[x](javascript:alert)\n', /not allowed/],
    ['an http: link', '[x](http://kwikserve.co.ke/)\n', /not allowed/],
    ['a link with a title', '[x](/terms/ "title")\n', /one word in brackets/],
    ['a link inside link text', '[a [b](/x/)](/y/)\n', /inside link text/],
    ['an angle-bracket autolink', '<https://kwikserve.co.ke/>\n', /raw HTML/],
  ])('refuses %s', (_name, source, message) => {
    expect(() => parse(source)).toThrow(LegalMarkdownError);
    expect(() => parse(source)).toThrow(message);
  });
});

describe('the rendered HTML and the independent canonical form agree (what F-127-5 compares)', () => {
  const samples = [
    '# Title\n\nA paragraph that\nwraps over lines, with **bold**, *italics* and a [link](/privacy/).\n\n## Section\n\n- One item\n- Two items\n  wrapped\n\n1. First\n2. Second\n',
    '# T\n\nEscapes: \\*not italic\\*, \\[not a link\\], back\\\\slash, 5 > 3 & 2 < 4.\n',
    '### Question?\n\nAnswer with support@kwikserve.co.ke and "quotes" and \u00A0non-breaking\u00A0spaces.\n',
    'No heading first.\n\n- item\nlazy line\n\nAfter the list.\n',
    '# Cafe\u0301 (NFC)\n\nZero\u200Bwidth and soft\u00ADhyphen.\n',
  ];
  it.each(samples.map((s, i) => [i, s]))('sample %i', (_i, source) => {
    expect(canonicalText(render(source as string))).toBe(markdownCanonical(source as string));
  });
});
