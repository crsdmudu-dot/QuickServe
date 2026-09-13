/**
 * security-headers.test.ts — public/_headers ships with every web export (Cloudflare static assets).
 * Pins the global security headers and the route-scoped hardening for the auth link bridge.
 */
import fs from 'fs';
import path from 'path';

const raw = fs.readFileSync(path.join(__dirname, '..', '..', 'public', '_headers'), 'utf8');

type Rule = { pattern: string; lines: string[] };
function parseRules(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!line.startsWith(' ') && !line.startsWith('\t')) rules.push({ pattern: line.trim(), lines: [] });
    else rules[rules.length - 1]?.lines.push(line.trim());
  }
  return rules;
}
const rules = parseRules(raw);
const rule = (p: string) => rules.find((r) => r.pattern === p);

describe('public/_headers', () => {
  it('keeps the global security headers on /*', () => {
    const g = rule('/*');
    expect(g).toBeDefined();
    const names = g!.lines.map((l) => l.split(':')[0]);
    for (const h of ['X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'X-Frame-Options', 'Content-Security-Policy-Report-Only', 'Cache-Control']) {
      expect(names).toContain(h);
    }
    expect(g!.lines).toContain('X-Frame-Options: DENY');
  });

  it('hardens the auth link bridge routes only: no-store, no-referrer, noindex (replacing only those two global values)', () => {
    const a = rule('/auth/*');
    expect(a).toBeDefined();
    expect(a!.lines).toContain('! Cache-Control');
    expect(a!.lines).toContain('Cache-Control: no-store');
    expect(a!.lines).toContain('! Referrer-Policy');
    expect(a!.lines).toContain('Referrer-Policy: no-referrer');
    expect(a!.lines).toContain('X-Robots-Tag: noindex');
    // it must not remove or restate the other global protections
    const names = a!.lines.map((l) => l.replace(/^!\s*/, '').split(':')[0]);
    for (const h of ['X-Content-Type-Options', 'Permissions-Policy', 'X-Frame-Options', 'Content-Security-Policy-Report-Only']) {
      expect(names).not.toContain(h);
    }
  });

  it('applies no-store to no other path', () => {
    for (const r of rules) {
      if (r.pattern === '/auth/*') continue;
      expect(r.lines).not.toContain('Cache-Control: no-store');
    }
  });
});
