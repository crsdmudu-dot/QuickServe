// pages.test.tsx — integration tests for all 11 remaining marketing pages.
// Covers: h1 render, unique metadata titles, targeted per-page assertions,
// provider CTA strength, cross-page admin-link guard.

import { render, screen, within } from '@testing-library/react';

// ── Page imports ──────────────────────────────────────────────────────────────
import ServicesPage, { metadata as servicesMeta } from '@/app/services/page';
import HowItWorksPage, { metadata as howItWorksMeta } from '@/app/how-it-works/page';
import WhyQuickServePage, { metadata as whyMeta } from '@/app/why-quickserve/page';
import BecomeAProviderPage, { metadata as providerMeta } from '@/app/become-a-provider/page';
import PricingPage, { metadata as pricingMeta } from '@/app/pricing/page';
import FaqPage, { metadata as faqMeta } from '@/app/faq/page';
import ContactPage, { metadata as contactMeta } from '@/app/contact/page';
import SupportPage, { metadata as supportMeta } from '@/app/support/page';
import DownloadPage, { metadata as downloadMeta } from '@/app/download/page';
import PrivacyPage, { metadata as privacyMeta } from '@/app/privacy/page';
import TermsPage, { metadata as termsMeta } from '@/app/terms/page';

// Home metadata for duplicate-title check
import { metadata as homeMeta } from '@/app/page';

// Content for targeted assertions
import {
  SERVICE_CATEGORIES,
  PROVIDER_BENEFITS,
  FAQ_ITEMS,
} from '@/content/site';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract the string title from a Next.js Metadata object (may be string | TemplateMetadata | null/undefined). */
function resolveTitle(meta: { title?: unknown }): string {
  const t = meta.title;
  if (typeof t === 'string') return t;
  if (t && typeof t === 'object' && 'default' in t) return String((t as { default: unknown }).default);
  return String(t ?? '');
}

// =============================================================================
// 1. /services
// =============================================================================
describe('/services page', () => {
  it('renders a single <h1> containing the required headline', () => {
    render(<ServicesPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1.textContent).toMatch(/Home Services in Nairobi/i);
  });

  it('renders all 19 service category cards (≥15 service headings)', () => {
    render(<ServicesPage />);
    const h3s = screen.getAllByRole('heading', { level: 3 });
    const serviceTitles = h3s.filter((h) =>
      SERVICE_CATEGORIES.some((cat) => cat.title === h.textContent)
    );
    expect(serviceTitles.length).toBeGreaterThanOrEqual(15);
    // Spot-check a few known titles
    expect(screen.getAllByText('House Cleaning').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Plumbing').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Massage').length).toBeGreaterThanOrEqual(1);
  });

  it('has a defined, non-empty metadata title', () => {
    expect(resolveTitle(servicesMeta)).toBeTruthy();
  });
});

// =============================================================================
// 2. /how-it-works
// =============================================================================
describe('/how-it-works page', () => {
  it('renders a single <h1> containing "How QuickServe Works"', () => {
    render(<HowItWorksPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1.textContent).toMatch(/How QuickServe Works/i);
  });

  it('renders all how-it-works step cards', () => {
    render(<HowItWorksPage />);
    expect(screen.getByText('Choose a service')).toBeInTheDocument();
    expect(screen.getByText('Book in seconds')).toBeInTheDocument();
    expect(screen.getByText('Rate & review')).toBeInTheDocument();
  });

  it('has a defined, non-empty metadata title', () => {
    expect(resolveTitle(howItWorksMeta)).toBeTruthy();
  });
});

// =============================================================================
// 3. /why-quickserve
// =============================================================================
describe('/why-quickserve page', () => {
  it('renders a single <h1> containing "Why Choose QuickServe"', () => {
    render(<WhyQuickServePage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1.textContent).toMatch(/Why Choose QuickServe/i);
  });

  it('renders trust badges', () => {
    render(<WhyQuickServePage />);
    expect(screen.getAllByText('Verified Providers').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Secure Payments').length).toBeGreaterThanOrEqual(1);
  });

  it('has a defined, non-empty metadata title', () => {
    expect(resolveTitle(whyMeta)).toBeTruthy();
  });
});

// =============================================================================
// 4. /become-a-provider
// =============================================================================
describe('/become-a-provider page', () => {
  it('renders a single <h1> with provider headline', () => {
    render(<BecomeAProviderPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1.textContent).toMatch(/Grow Your Business with QuickServe/i);
  });

  it('renders ≥3 provider benefit texts', () => {
    render(<BecomeAProviderPage />);
    // Each PROVIDER_BENEFITS entry has a unique title rendered as h3
    const benefitTitles = PROVIDER_BENEFITS.map((b) => b.title);
    const matches = benefitTitles.filter((title) => {
      try {
        return screen.getAllByText(title).length >= 1;
      } catch {
        return false;
      }
    });
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('renders a link to /contact (SECONDARY_CTA)', () => {
    render(<BecomeAProviderPage />);
    const contactLinks = screen
      .getAllByRole('link')
      .filter((el) => el.getAttribute('href') === '/contact');
    expect(contactLinks.length).toBeGreaterThanOrEqual(1);
  });

  it('has a defined, non-empty metadata title', () => {
    expect(resolveTitle(providerMeta)).toBeTruthy();
  });
});

// =============================================================================
// 5. /pricing
// =============================================================================
describe('/pricing page', () => {
  it('renders a single <h1> containing "Simple, Transparent Pricing"', () => {
    render(<PricingPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1.textContent).toMatch(/Simple, Transparent Pricing/i);
  });

  it('renders service category cards', () => {
    render(<PricingPage />);
    expect(screen.getAllByText('House Cleaning').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Plumbing').length).toBeGreaterThanOrEqual(1);
  });

  it('has a defined, non-empty metadata title', () => {
    expect(resolveTitle(pricingMeta)).toBeTruthy();
  });
});

// =============================================================================
// 6. /faq
// =============================================================================
describe('/faq page', () => {
  it('renders a single <h1> containing "Frequently Asked Questions"', () => {
    render(<FaqPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1.textContent).toMatch(/Frequently Asked Questions/i);
  });

  it('renders ≥6 FAQ questions', () => {
    render(<FaqPage />);
    // FAQ questions are rendered as buttons (FaqItem uses a button toggle)
    const questions = FAQ_ITEMS.slice(0, 6).map((item) => item.question);
    for (const q of questions) {
      expect(screen.getByRole('button', { name: new RegExp(q, 'i') })).toBeInTheDocument();
    }
  });

  it('renders all 8 FAQ items', () => {
    render(<FaqPage />);
    const buttons = screen.getAllByRole('button');
    // All FAQ items render as toggle buttons
    expect(buttons.length).toBeGreaterThanOrEqual(FAQ_ITEMS.length);
  });

  it('has a defined, non-empty metadata title', () => {
    expect(resolveTitle(faqMeta)).toBeTruthy();
  });
});

// =============================================================================
// 7. /contact
// =============================================================================
describe('/contact page', () => {
  it('renders a single <h1> containing "Contact QuickServe"', () => {
    render(<ContactPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1.textContent).toMatch(/Contact QuickServe/i);
  });

  it('renders a mailto: link', () => {
    render(<ContactPage />);
    const links = screen.getAllByRole('link');
    const mailtoLink = links.find((el) =>
      (el.getAttribute('href') ?? '').startsWith('mailto:')
    );
    expect(mailtoLink).toBeDefined();
    expect(mailtoLink).toBeInTheDocument();
  });

  it('renders no <form> element (no backend submission)', () => {
    const { container } = render(<ContactPage />);
    const forms = container.querySelectorAll('form');
    expect(forms.length).toBe(0);
  });

  it('has a defined, non-empty metadata title', () => {
    expect(resolveTitle(contactMeta)).toBeTruthy();
  });
});

// =============================================================================
// 8. /support
// =============================================================================
describe('/support page', () => {
  it('renders a single <h1> containing "Help & Support"', () => {
    render(<SupportPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1.textContent).toMatch(/Help & Support/i);
  });

  it('links to /faq and /contact', () => {
    render(<SupportPage />);
    const links = screen.getAllByRole('link');
    const faqLink = links.find((el) => el.getAttribute('href') === '/faq');
    const contactLink = links.find((el) => el.getAttribute('href') === '/contact');
    expect(faqLink).toBeDefined();
    expect(contactLink).toBeDefined();
  });

  it('has a defined, non-empty metadata title', () => {
    expect(resolveTitle(supportMeta)).toBeTruthy();
  });
});

// =============================================================================
// 9. /download
// =============================================================================
describe('/download page', () => {
  it('renders a single <h1> containing "Get the QuickServe App"', () => {
    render(<DownloadPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1.textContent).toMatch(/Get the QuickServe App/i);
  });

  it('renders Google Play and App Store coming-soon placeholders', () => {
    render(<DownloadPage />);
    expect(screen.getAllByText(/Google Play/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/App Store/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders no fake store URLs (no links to play.google.com or apple.com)', () => {
    const { container } = render(<DownloadPage />);
    const anchors = Array.from(container.querySelectorAll('a'));
    const storeLinks = anchors.filter(
      (a) =>
        (a.getAttribute('href') ?? '').includes('play.google.com') ||
        (a.getAttribute('href') ?? '').includes('apple.com')
    );
    expect(storeLinks.length).toBe(0);
  });

  it('has a defined, non-empty metadata title', () => {
    expect(resolveTitle(downloadMeta)).toBeTruthy();
  });
});

// =============================================================================
// 10. /privacy
// =============================================================================
describe('/privacy page', () => {
  it('renders a single <h1> containing "Privacy Policy"', () => {
    render(<PrivacyPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1.textContent).toMatch(/Privacy Policy/i);
  });

  it('renders the "pending legal review" placeholder notice', () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/placeholder policy pending legal review/i)).toBeInTheDocument();
  });

  it('has a defined, non-empty metadata title', () => {
    expect(resolveTitle(privacyMeta)).toBeTruthy();
  });
});

// =============================================================================
// 11. /terms
// =============================================================================
describe('/terms page', () => {
  it('renders a single <h1> containing "Terms of Service"', () => {
    render(<TermsPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1.textContent).toMatch(/Terms of Service/i);
  });

  it('renders the "pending legal review" placeholder notice', () => {
    render(<TermsPage />);
    expect(screen.getByText(/placeholder policy pending legal review/i)).toBeInTheDocument();
  });

  it('has a defined, non-empty metadata title', () => {
    expect(resolveTitle(termsMeta)).toBeTruthy();
  });
});

// =============================================================================
// Cross-page: metadata title uniqueness (all 12 pages)
// =============================================================================
describe('Metadata title uniqueness across all pages', () => {
  it('all 12 page titles are distinct (no duplicates)', () => {
    const allMetas = [
      homeMeta,
      servicesMeta,
      howItWorksMeta,
      whyMeta,
      providerMeta,
      pricingMeta,
      faqMeta,
      contactMeta,
      supportMeta,
      downloadMeta,
      privacyMeta,
      termsMeta,
    ];
    const titles = allMetas.map((m) => resolveTitle(m as { title?: unknown }));
    const uniqueTitles = new Set(titles);
    expect(uniqueTitles.size).toBe(allMetas.length);
  });
});

// =============================================================================
// Cross-page: no admin links
// =============================================================================
describe('Cross-page admin-link guard', () => {
  const pageComponents = [
    { name: '/services', Component: ServicesPage },
    { name: '/become-a-provider', Component: BecomeAProviderPage },
    { name: '/faq', Component: FaqPage },
    { name: '/contact', Component: ContactPage },
  ];

  it.each(pageComponents)(
    '$name renders no links to /admin or (admin-web)',
    ({ Component }) => {
      const { container } = render(<Component />);
      const anchors = Array.from(container.querySelectorAll('a'));
      const adminLinks = anchors.filter((a) => {
        const href = a.getAttribute('href') ?? '';
        return href.startsWith('/admin') || href.includes('(admin-web)');
      });
      expect(adminLinks.length).toBe(0);
    }
  );
});
