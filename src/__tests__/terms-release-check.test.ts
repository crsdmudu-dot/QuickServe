/**
 * terms-release-check.test.ts — the Terms release gate (scripts/check-terms-release.ts).
 *
 * Each case builds a small synthetic repository in a temporary folder (made-up text, no real Terms) and checks the
 * gate's verdict: a consistent release passes; every way the app, the database, the approval record, the approved
 * text and the website page can disagree fails. Lead-PM stage 24 probes S24-1..S24-3 are cases here. The real
 * repository is NOT tested here: it is expected to fail until the owner approves the final Terms.
 */
import { createHash } from 'crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

import { checkLivePage, checkTermsRelease, type Release } from '../../scripts/check-terms-release';

const TEXT = '# KwikServe Terms of Service\n\nBe respectful. Synthetic clause one.\n\n- Synthetic clause two.\n';
const PAGE = `import release from '../../content/terms-release.json';
import { readTermsText } from '../../lib/terms-text';
export default function TermsPage() {
  const text = readTermsText(release.textFile);
  return (<main><TermsHeader version={release.version} effective={release.effectiveDate} /><Markdown source={text} /></main>);
}
`;
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

type Repo = Record<string, string | Buffer>;
function goodRepo(label = 'v1'): Repo {
  const release: Release = {
    version: label,
    effectiveDate: '2026-10-05',
    textFile: `apps/website/content/terms-${label}.md`,
    textSha256: sha(TEXT),
    approvedBy: 'Synthetic Owner',
    approvedOn: '2026-09-28',
  };
  return {
    'src/constants/terms.ts': `export const CURRENT_TERMS_VERSION = '${label}';\n`,
    'supabase/migrations/0068_terms_acceptance.sql':
      "create or replace function public.current_terms_version()\nreturns text language sql immutable as $$\n  select 'draft-x'::text\n$$;\n",
    'supabase/migrations/0071_terms_version.sql':
      `create or replace function public.current_terms_version()\nreturns text language sql immutable as $$\n  select '${label}'::text\n$$;\n`,
    'apps/website/content/terms-release.json': JSON.stringify(release),
    [`apps/website/content/terms-${label}.md`]: TEXT,
    '.gitattributes': 'supabase/migrations/007[0-9]_*.sql -text\r\napps/website/content/terms-*.md -text\r\n',
    'apps/website/app/terms/page.tsx': PAGE,
  };
}

const dirs: string[] = [];
function run(repo: Repo) {
  const root = mkdtempSync(join(tmpdir(), 'terms-gate-'));
  dirs.push(root);
  for (const [file, body] of Object.entries(repo)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), body);
  }
  const checks = checkTermsRelease(root);
  return { ok: checks.every((c) => c.ok), failed: checks.filter((c) => !c.ok).map((c) => c.name) };
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe('Terms release gate: the repository', () => {
  it('a consistent release passes (positive control), using the LAST migration that defines the label', () => {
    expect(run(goodRepo())).toEqual({ ok: true, failed: [] });
  });

  it('fails when the app label differs from the database label', () => {
    const repo = goodRepo();
    repo['src/constants/terms.ts'] = "export const CURRENT_TERMS_VERSION = 'v2';\n";
    expect(run(repo).failed).toEqual(expect.arrayContaining(['app and database labels are equal', 'approval record version equals the app and database label']));
  });

  it('fails when the last definition cannot be read, even if an earlier one can (fails closed)', () => {
    const repo = goodRepo();
    repo['supabase/migrations/0072_terms_version.sql'] = 'create or replace function public.current_terms_version() returns text language sql as $$ select current_setting(\'x\') $$;\n';
    expect(run(repo).failed).toContain('database label found');
  });

  it('fails for a draft, an over-long or a malformed label', () => {
    for (const label of ['draft-2026-09-26', 'v'.repeat(65), 'v 1']) {
      const repo = goodRepo();
      repo['src/constants/terms.ts'] = `export const CURRENT_TERMS_VERSION = '${label}';\n`;
      repo['supabase/migrations/0071_terms_version.sql'] = `create or replace function public.current_terms_version() returns text language sql as $$\n  select '${label}'::text\n$$;\n`;
      expect(run(repo).failed).toContain('label is final');
    }
  });

  it('fails when the approved text changed after approval (raw bytes)', () => {
    const repo = goodRepo();
    repo['apps/website/content/terms-v1.md'] = `${TEXT}Synthetic clause added later.\n`;
    expect(run(repo).failed).toEqual(['approved text matches the approved hash (raw bytes)']);
  });

  it('S24-2: a CRLF copy of the approved LF text is a different text; the -text rule is required so no checkout makes one', () => {
    const crlf = goodRepo();
    crlf['apps/website/content/terms-v1.md'] = Buffer.from(TEXT.replace(/\n/g, '\r\n'));
    expect(run(crlf).failed).toEqual(['approved text matches the approved hash (raw bytes)']);
    const noRule = goodRepo();
    noRule['.gitattributes'] = 'supabase/migrations/007[0-9]_*.sql -text\n';
    expect(run(noRule).failed).toEqual(['the approved text is protected from line-ending conversion']);
  });

  it('S24-3: placeholder wording inside the approved text fails, even with a matching hash', () => {
    const repo = goodRepo();
    const text = `${TEXT}\nThis is a placeholder pending legal review.\n`;
    repo['apps/website/content/terms-v1.md'] = text;
    repo['apps/website/content/terms-release.json'] = JSON.stringify({ ...JSON.parse(repo['apps/website/content/terms-release.json'] as string), textSha256: sha(text) });
    expect(run(repo).failed).toEqual(['approved text carries no placeholder wording']);
  });

  it('S24-1: a page that shows the right version line but hard-codes its own words fails', () => {
    const repo = goodRepo();
    repo['apps/website/app/terms/page.tsx'] = `import release from '../../content/terms-release.json';
export default function TermsPage() {
  return (<main><p>Version {release.version} · Effective {release.effectiveDate} {release.textFile}</p><h2>Other terms</h2><p>Anything goes.</p></main>);
}
`;
    expect(run(repo).failed).toEqual(['website page has no hard-coded prose (the text comes only from the approved file)']);
  });

  it('a page that does not read the approval record, or is still a placeholder, fails', () => {
    const notReading = goodRepo();
    notReading['apps/website/app/terms/page.tsx'] = 'export default function TermsPage() { return <Terms />; }\n';
    expect(run(notReading).failed).toEqual(expect.arrayContaining([
      'website page reads the approval record',
      'website page renders the version, effective date and text from the record',
    ]));
    const placeholder = goodRepo();
    placeholder['apps/website/app/terms/page.tsx'] = `${PAGE}// Last updated: placeholder — pending legal review.\n`;
    expect(run(placeholder).failed).toEqual(['website Terms page carries no placeholder wording']);
  });

  it('fails without an approval record, or with one that has no approver or date', () => {
    const missing = goodRepo();
    delete missing['apps/website/content/terms-release.json'];
    expect(run(missing).failed).toContain('approval record exists');
    const unsigned = goodRepo();
    unsigned['apps/website/content/terms-release.json'] = JSON.stringify({ ...JSON.parse(unsigned['apps/website/content/terms-release.json'] as string), approvedBy: '', approvedOn: 'soon' });
    expect(run(unsigned).failed).toEqual(['approval record names the approver and the date']);
  });

  it('refuses an approved text outside apps/website/content/terms-*.md', () => {
    const repo = goodRepo();
    repo['legal/terms.md'] = TEXT;
    repo['apps/website/content/terms-release.json'] = JSON.stringify({ ...JSON.parse(repo['apps/website/content/terms-release.json'] as string), textFile: 'legal/terms.md' });
    expect(run(repo).failed).toEqual(expect.arrayContaining(['approved text is a terms-*.md file in apps/website/content']));
  });
});

describe('Terms release gate: the published page (M6, --live)', () => {
  const release: Release = {
    version: 'v1', effectiveDate: '2026-10-05', textFile: 'apps/website/content/terms-v1.md',
    textSha256: sha(TEXT), approvedBy: 'Synthetic Owner', approvedOn: '2026-09-28',
  };
  const html = '<html><h1>KwikServe Terms of Service</h1><p>Version v1 &middot; Effective 2026-10-05</p>'
    + '<p>Be respectful. Synthetic clause one.</p><ul><li>Synthetic clause two.</li></ul></html>';

  it('passes when the live page shows the approved version, date and every word of the text', () => {
    expect(checkLivePage(html, release, TEXT).every((c) => c.ok)).toBe(true);
  });

  it('fails when a sentence is missing, the date differs, or placeholder wording is shown', () => {
    const fail = (h: string) => checkLivePage(h, release, TEXT).filter((c) => !c.ok).map((c) => c.name);
    expect(fail(html.replace('Synthetic clause two.', ''))).toEqual(['live page shows the approved text, word for word']);
    expect(fail(html.replace('2026-10-05', '2026-10-01'))).toEqual(['live page shows the approved effective date']);
    expect(fail(html.replace('</html>', '<p>This is a placeholder.</p></html>'))).toEqual(['live page carries no placeholder wording']);
  });

  it('fails when paragraphs are out of order, or a clause is slipped into a paragraph', () => {
    const fail = (h: string) => checkLivePage(h, release, TEXT).filter((c) => !c.ok).map((c) => c.name);
    const swapped = '<html><p>Version v1 Effective 2026-10-05</p><li>Synthetic clause two.</li><h1>KwikServe Terms of Service</h1>'
      + '<p>Be respectful. Synthetic clause one.</p></html>';
    expect(fail(swapped)).toEqual(['live page shows the approved text, word for word']);
    expect(fail(html.replace('Be respectful.', 'Be respectful. Except on weekends.'))).toEqual(['live page shows the approved text, word for word']);
  });
});
