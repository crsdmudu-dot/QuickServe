/**
 * auth-email-templates.test.ts — contract tests over the version-controlled Supabase Auth
 * email templates in `supabase/templates/`. Pure fs reads; nothing is applied to Supabase.
 *
 * These are Go templates rendered by GoTrue. The security contract they must satisfy:
 * the one-time token appears exactly once, only inside the CTA `href`, and always in the URL
 * FRAGMENT — so it never reaches the bridge origin's request line, access logs or `Referer`
 * headers, and never appears as readable text in a forwarded or screenshotted message.
 */
import * as fs from 'fs';
import * as path from 'path';

const TEMPLATE_DIR = path.resolve(__dirname, '../../supabase/templates');

type TemplateName = 'confirmation' | 'recovery';

const NAMES: TemplateName[] = ['confirmation', 'recovery'];

const APPROVED_SUBJECTS: Record<TemplateName, string> = {
  confirmation: 'Confirm your email address for KwikServe',
  recovery: 'Reset your KwikServe password',
};

const ROUTE: Record<TemplateName, { path: string; type: string }> = {
  confirmation: { path: '/auth/confirm', type: 'signup' },
  recovery: { path: '/auth/recovery', type: 'recovery' },
};

function readTemplate(name: TemplateName): string {
  return fs.readFileSync(path.join(TEMPLATE_DIR, name + '.html'), 'utf-8');
}

function readSubjects(): Record<string, string> {
  return JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, 'subjects.json'), 'utf-8'));
}

/** Decode the character references a mail client's HTML parser resolves in attribute values. */
function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, String.fromCharCode(39))
    .replace(/&amp;/g, '&');
}

function hrefs(html: string): string[] {
  const found = html.match(/href="[^"]*"/g) ?? [];
  return found.map((h) => h.slice(6, -1));
}

function ctaHref(html: string): string {
  const cta = hrefs(html).filter((h) => !h.startsWith('mailto:'));
  return cta[0] ?? '';
}

/** Text a recipient can actually read: head removed, tags stripped, entities decoded. */
function visibleText(html: string): string {
  const stripped = html.replace(/<head[\s\S]*?<\/head>/i, ' ').replace(/<[^>]+>/g, ' ');
  return decodeEntities(stripped).replace(/\s+/g, ' ').trim();
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('approved subjects', () => {
  test('subjects.json holds exactly the two approved templates', () => {
    expect(Object.keys(readSubjects()).sort()).toEqual(['confirmation', 'recovery']);
  });

  test.each(NAMES)('%s subject matches the approved value', (name) => {
    expect(readSubjects()[name]).toBe(APPROVED_SUBJECTS[name]);
  });

  test.each(NAMES)('%s <title> stays in sync with the subject', (name) => {
    const title = readTemplate(name).match(/<title>([^<]*)<\/title>/);
    expect(title?.[1]).toBe(APPROVED_SUBJECTS[name]);
  });
});

describe.each(NAMES)('%s — one-time token transport', (name) => {
  test('.TokenHash occurs exactly once', () => {
    expect(occurrences(readTemplate(name), '{{ .TokenHash }}')).toBe(1);
  });

  test('the only .TokenHash is inside the CTA href', () => {
    const html = readTemplate(name);
    expect(ctaHref(html)).toContain('{{ .TokenHash }}');
    // Blank every href value; no token expression may survive anywhere else in the document.
    expect(html.replace(/href="[^"]*"/g, 'href=""')).not.toContain('{{ .TokenHash }}');
  });

  test('token is carried in the fragment, never the query string', () => {
    const html = readTemplate(name);
    expect(html).toContain('#token_hash=');
    expect(html).not.toContain('?token_hash=');
  });

  test('the # precedes token_hash within the CTA href', () => {
    const href = ctaHref(readTemplate(name));
    expect(href.indexOf('#')).toBeGreaterThan(-1);
    expect(href.indexOf('#')).toBeLessThan(href.indexOf('token_hash='));
  });

  test('.ConfirmationURL is absent', () => {
    expect(readTemplate(name)).not.toContain('.ConfirmationURL');
  });
});

describe.each(NAMES)('%s — HTML decoding produces the runtime URL', (name) => {
  test('source encodes separators as &amp;', () => {
    const href = ctaHref(readTemplate(name));
    expect(href).toContain('&amp;type=');
    expect(href).toContain('&amp;redirect_to=');
  });

  test('decoded href contains ordinary & separators', () => {
    const decoded = decodeEntities(ctaHref(readTemplate(name)));
    expect(decoded).toContain('&type=');
    expect(decoded).toContain('&redirect_to=');
  });

  test('no &amp; survives decoding and nothing is double escaped', () => {
    const href = ctaHref(readTemplate(name));
    expect(href).not.toContain('&amp;amp;');
    expect(decodeEntities(href)).not.toContain('&amp;');
  });

  test('every & in the source href is encoded', () => {
    expect(ctaHref(readTemplate(name))).not.toMatch(/&(?!amp;)/);
  });
});

describe.each(NAMES)('%s — route and link shape', (name) => {
  test('CTA targets the correct route under the runtime .SiteURL placeholder', () => {
    expect(ctaHref(readTemplate(name))).toContain('{{ .SiteURL }}' + ROUTE[name].path + '#');
  });

  test('CTA carries the correct link type', () => {
    expect(decodeEntities(ctaHref(readTemplate(name)))).toContain('&type=' + ROUTE[name].type);
  });

  test('exactly one CTA link and one mailto support link', () => {
    const all = hrefs(readTemplate(name));
    expect(all).toHaveLength(2);
    expect(all.filter((h) => h.startsWith('mailto:'))).toEqual(['mailto:support@hiredcorp.co.ke']);
    expect(all.filter((h) => !h.startsWith('mailto:'))).toHaveLength(1);
  });
});

describe.each(NAMES)('%s — no token-bearing text is visible', (name) => {
  test('visible text contains no template expression', () => {
    expect(visibleText(readTemplate(name))).not.toContain('{{');
  });

  test('visible text contains no token, .SiteURL or URL', () => {
    const text = visibleText(readTemplate(name));
    expect(text).not.toContain('token_hash');
    expect(text).not.toContain('.SiteURL');
    expect(text).not.toContain('://');
  });
});

describe.each(NAMES)('%s — identity', (name) => {
  test('identifies KwikServe and Hired Corp Limited', () => {
    const text = visibleText(readTemplate(name));
    expect(text).toContain('KwikServe');
    expect(text).toContain('Hired Corp Limited');
  });

  test('offers the verified support mailbox as readable text', () => {
    expect(visibleText(readTemplate(name))).toContain('support@hiredcorp.co.ke');
  });

  test('explains why the message was received', () => {
    expect(visibleText(readTemplate(name))).toContain('You are receiving this message because');
  });

  test('legacy QuickServe branding is absent', () => {
    expect(readTemplate(name)).not.toContain('QuickServe');
  });

  test('uses the KwikServe primary green for the CTA', () => {
    expect(readTemplate(name).toLowerCase()).toContain('#00875a');
  });
});

describe.each(NAMES)('%s — no tracking, remote content or marketing', (name) => {
  test.each([
    ['image', /<img\b/i],
    ['script', /<script\b/i],
    ['style element', /<style\b/i],
    ['external stylesheet', /<link\b/i],
    ['iframe', /<iframe\b/i],
    ['CSS remote fetch', /url\(/i],
  ])('contains no %s', (_label, pattern) => {
    expect(readTemplate(name)).not.toMatch(pattern as RegExp);
  });

  test('contains no plaintext http:// link', () => {
    expect(readTemplate(name)).not.toContain('http://');
  });

  test('contains no tracking parameters', () => {
    expect(readTemplate(name)).not.toMatch(/utm_|\bpixel\b|\btracking\b/i);
  });

  test('contains no unsubscribe copy', () => {
    expect(readTemplate(name)).not.toMatch(/unsubscribe/i);
  });

  test('claims no specific expiry duration', () => {
    const text = visibleText(readTemplate(name));
    expect(text).not.toMatch(/\b\d+\s*(second|minute|hour|day)s?\b/i);
    expect(text).not.toMatch(/expire/i);
  });

  test('states the link is single use', () => {
    expect(visibleText(readTemplate(name))).toContain('This link can only be used once');
  });
});

describe.each(NAMES)('%s — hygiene', (name) => {
  test('is standalone HTML with a declared language and one heading', () => {
    const html = readTemplate(name);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(occurrences(html, '<h1')).toBe(1);
  });

  test('carries no HTML comment that would ship to recipients', () => {
    expect(readTemplate(name)).not.toContain('<!--');
  });

  test('contains no control characters and no non-ASCII', () => {
    const html = readTemplate(name);
    const control = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]');
    const nonAscii = new RegExp('[^\\u0000-\\u007F]');
    expect(control.test(html)).toBe(false);
    expect(nonAscii.test(html)).toBe(false);
  });
});
