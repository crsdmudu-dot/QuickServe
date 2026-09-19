// support-contact.test.tsx — the website support-access contract.
//
// One cross-cutting requirement, pinned in one place: whenever a visitor needs help on the
// KwikServe website they must be offered the verified Hired Corp support mailbox, and only that
// mailbox. The contract spans the brand constant (lib/site.ts), the FAQ copy (content/site.ts),
// the shared footer and the four assistance/legal pages, so it is asserted here rather than
// scattered across lib/content/components/pages suites where no single file could express it.
//
// It also guards the two ways this regressed before: a stale address surviving in source, and
// marketing copy promising a support channel (in-app chat) that does not exist in the product.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';

import { BRAND, SITE_URL } from '@/lib/site';
import { FAQ_ITEMS, NAV_LINKS } from '@/content/site';

import MarketingFooter from '@/components/MarketingFooter';
import SupportPage from '@/app/support/page';
import ContactPage from '@/app/contact/page';
import PrivacyPage from '@/app/privacy/page';
import TermsPage from '@/app/terms/page';

/** The one live support mailbox. Verified in the Auth email templates and certified in QA. */
const SUPPORT_EMAIL = 'support@hiredcorp.co.ke';
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

/** The address this replaced. It must never reappear in website source or in rendered output. */
const STALE_EMAIL = 'hello@quickserve.co.ke';

/** The five audited surfaces that must offer the support mailbox. */
const SURFACES: { name: string; ui: React.ReactElement }[] = [
  { name: 'Marketing footer', ui: <MarketingFooter /> },
  { name: 'Support page', ui: <SupportPage /> },
  { name: 'Contact page', ui: <ContactPage /> },
  { name: 'Privacy page', ui: <PrivacyPage /> },
  { name: 'Terms page', ui: <TermsPage /> },
];

// ---------------------------------------------------------------------------
// Source scan — tracked website source, excluding build output and dependencies
// ---------------------------------------------------------------------------

// The scan targets shipped website source. `__tests__` is excluded because this file must name the
// forbidden strings in order to assert against them, and would otherwise match its own guards.
const WEBSITE_ROOT = join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.next', 'out', '.git', 'public', '__tests__']);

function sourceFiles(dir: string = WEBSITE_ROOT): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(ts|tsx|js|jsx|json|css|md)$/.test(entry)) found.push(full);
  }
  return found;
}

/** Files whose text contains `needle`, relative to the website root. */
function filesContaining(needle: string): string[] {
  return sourceFiles()
    .filter((file) => readFileSync(file, 'utf8').includes(needle))
    .map((file) => file.slice(WEBSITE_ROOT.length + 1).replace(/\\/g, '/'));
}

// ---------------------------------------------------------------------------
// 1. Canonical address
// ---------------------------------------------------------------------------

describe('canonical website support address', () => {
  it('is exactly the Hired Corp support mailbox', () => {
    expect(BRAND.email).toBe(SUPPORT_EMAIL);
  });

  it('is not the stale address', () => {
    expect(BRAND.email).not.toBe(STALE_EMAIL);
  });
});

// ---------------------------------------------------------------------------
// 2 & 3. Every audited surface links to — and shows — the support mailbox
// ---------------------------------------------------------------------------

describe.each(SURFACES)('$name', ({ ui }) => {
  it('sends every mailto link to the support mailbox and nowhere else', () => {
    const { container } = render(ui);
    const mailtos = [...container.querySelectorAll('a[href^="mailto:"]')].map((a) =>
      a.getAttribute('href'),
    );
    expect(mailtos.length).toBeGreaterThan(0);
    for (const href of mailtos) expect(href).toBe(SUPPORT_MAILTO);
  });

  it('shows the support address as readable text', () => {
    render(ui);
    expect(screen.getAllByText(SUPPORT_EMAIL).length).toBeGreaterThan(0);
  });

  it('renders none of the stale address', () => {
    const { container } = render(ui);
    expect(container.innerHTML).not.toContain(STALE_EMAIL);
  });

  it('still renders content', () => {
    const { container } = render(ui);
    expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 4. The support URL carries nothing but the address
// ---------------------------------------------------------------------------

describe('support mailto URL shape', () => {
  it('is a bare mailto with no subject, body, query or fragment', () => {
    expect(SUPPORT_MAILTO).toBe(`mailto:${SUPPORT_EMAIL}`);
    expect(SUPPORT_MAILTO).not.toContain('?');
    expect(SUPPORT_MAILTO).not.toContain('&');
    expect(SUPPORT_MAILTO).not.toContain('#');
    expect(SUPPORT_MAILTO).not.toMatch(/subject=|body=/i);
  });

  it('carries no query, fragment or dynamic segment on any rendered surface', () => {
    for (const { ui } of SURFACES) {
      const { container, unmount } = render(ui);
      for (const a of container.querySelectorAll('a[href^="mailto:"]')) {
        const href = a.getAttribute('href') ?? '';
        expect(href).toBe(SUPPORT_MAILTO);
        expect(href).not.toMatch(/[?#&]/);
      }
      unmount();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. No stale address anywhere in website source
// ---------------------------------------------------------------------------

describe('website source', () => {
  it('contains no occurrence of the stale address', () => {
    expect(filesContaining(STALE_EMAIL)).toEqual([]);
  });

  it('defines the support address in lib/site.ts', () => {
    expect(filesContaining(SUPPORT_EMAIL)).toContain('lib/site.ts');
  });
});

// ---------------------------------------------------------------------------
// 6 & 7. Support copy is truthful: no in-app chat, and it points at email
// ---------------------------------------------------------------------------

describe('support copy', () => {
  it('claims no in-app chat anywhere in website source', () => {
    expect(filesContaining('in-app chat')).toEqual([]);
  });

  it('claims no chat channel in the FAQ answer', () => {
    const answer = FAQ_ITEMS.find((item) => /support/i.test(item.question))?.answer ?? '';
    expect(answer).not.toMatch(/chat/i);
  });

  it('directs the user to email the support mailbox in the FAQ answer', () => {
    const answer = FAQ_ITEMS.find((item) => /support/i.test(item.question))?.answer ?? '';
    expect(answer).toContain(SUPPORT_EMAIL);
    expect(answer).toMatch(/email/i);
  });

  it('offers no chat channel on the rendered Support page', () => {
    const { container } = render(<SupportPage />);
    expect(container.textContent ?? '').not.toMatch(/in-app chat/i);
  });
});

// ---------------------------------------------------------------------------
// 8. Nothing unrelated moved
// ---------------------------------------------------------------------------

describe('unrelated site values are unchanged', () => {
  it('keeps the canonical site URL', () => {
    expect(SITE_URL).toBe('https://quickserve.co.ke');
  });

  it('keeps the brand name and tagline', () => {
    expect(BRAND.name).toBe('KwikServe');
    expect(BRAND.tagline).toBe('Trusted home services in Nairobi');
  });

  it('keeps the navigation set', () => {
    expect(NAV_LINKS.map((link) => link.href)).toEqual([
      '/services',
      '/how-it-works',
      '/why-quickserve',
      '/become-a-provider',
      '/pricing',
      '/faq',
      '/contact',
    ]);
  });

  it('introduces no other email address in website source', () => {
    const addresses = new Set<string>();
    for (const file of sourceFiles()) {
      for (const match of readFileSync(file, 'utf8').matchAll(
        /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
      )) {
        addresses.add(match[0]);
      }
    }
    expect([...addresses]).toEqual([SUPPORT_EMAIL]);
  });
});
