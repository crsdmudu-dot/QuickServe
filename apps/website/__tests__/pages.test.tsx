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
import DeleteAccountPage, { metadata as deleteAccountMeta } from '@/app/delete-account/page';

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
  it('renders a single <h1> containing "How KwikServe Works"', () => {
    render(<HowItWorksPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1.textContent).toMatch(/How KwikServe Works/i);
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
  it('renders a single <h1> containing "Why Choose KwikServe"', () => {
    render(<WhyQuickServePage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1.textContent).toMatch(/Why Choose KwikServe/i);
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
    expect(h1.textContent).toMatch(/Grow Your Business with KwikServe/i);
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
  it('renders a single <h1> containing "Contact KwikServe"', () => {
    render(<ContactPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1.textContent).toMatch(/Contact KwikServe/i);
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

  it('renders no live outbound anchor to placeholder social domains', () => {
    // Placeholder social URLs must not be rendered as live <a href="..."> links.
    const { container } = render(<ContactPage />);
    const anchors = Array.from(container.querySelectorAll('a'));
    const placeholderDomains = ['twitter.com', 'facebook.com', 'instagram.com'];
    const liveLinks = anchors.filter((a) => {
      const href = a.getAttribute('href') ?? '';
      return placeholderDomains.some((d) => href.includes(d));
    });
    expect(liveLinks.length).toBe(0);
  });

  it('shows a coming-soon notice for social channels', () => {
    render(<ContactPage />);
    // The "coming soon" text indicates social handles are not yet active.
    const comingSoonElements = screen.getAllByText(/coming soon/i);
    expect(comingSoonElements.length).toBeGreaterThanOrEqual(1);
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
  it('renders a single <h1> containing "Get the KwikServe App"', () => {
    render(<DownloadPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1.textContent).toMatch(/Get the KwikServe App/i);
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

  it('carries no placeholder or "pending legal review" status', () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/placeholder/i);
    expect(text).not.toMatch(/pending legal review/i);
  });

  it('names the operating entity', () => {
    render(<PrivacyPage />);
    expect(document.body.textContent ?? '').toMatch(/Hired Corp Limited/);
  });

  it.each([
    ['authentication and account management', /Authentication and account management/i],
    ['bookings and fulfilment', /Bookings and service fulfilment/i],
    ['payments and M-PESA', /Payments and M-PESA records/i],
    ['provider verification and payouts', /Provider verification and payouts/i],
    ['location data', /Location data/i],
    ['notifications and device tokens', /Notifications and device tokens/i],
    ['support, safety, fraud and audit', /Support, safety, fraud prevention and audit/i],
    ['processors', /Service providers we use/i],
    ['account deletion', /Deleting your account/i],
    ['retention', /How long we keep data/i],
    ['security', /How we protect your data/i],
    ['rights', /Your rights/i],
    ['contact', /Contact us/i],
    ['complaints', /Complaints/i],
    ['policy updates', /Changes to this policy/i],
  ])('covers %s', (_label, pattern) => {
    render(<PrivacyPage />);
    expect(screen.getByRole('heading', { level: 2, name: pattern })).toBeInTheDocument();
  });

  it('explains deletion, tombstoning and the admin exclusion, and links to /delete-account', () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/tombstone/i);
    expect(text).toMatch(/we stop serving your data to any device/i);
    expect(text).toMatch(/Administrator accounts cannot be deleted/i);
    expect(screen.getByRole('link', { name: /delete your account/i })).toHaveAttribute(
      'href',
      '/delete-account',
    );
  });

  it('states reasonable-necessity retention with purpose limitation and no fixed period', () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/only where it is still needed for the purpose/i);
    expect(text).toMatch(/legal obligation/i);
    expect(text).toMatch(/not use retained records for marketing, profiling or any other unrelated purpose/i);
    expect(text).toMatch(/not a guarantee that every retained record is free of personal information/i);
    expect(text).not.toMatch(/\b\d+\s*(years?|months?|days?)\b/i);
  });

  it('names the Kenyan supervisory authority for complaints', () => {
    render(<PrivacyPage />);
    expect(document.body.textContent ?? '').toMatch(/Office of the Data Protection Commissioner/i);
  });

  it('lists the rights the policy must offer', () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? '';
    const rights = [/access a copy/i, /corrected/i, /object to/i, /restrict/i, /delete your data/i];
    for (const right of rights) expect(text).toMatch(right);
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
// Cross-page: metadata title uniqueness (all 13 pages)
// =============================================================================
describe('Metadata title uniqueness across all pages', () => {
  it('all 13 page titles are distinct (no duplicates)', () => {
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
      deleteAccountMeta,
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

// ── /delete-account — Google Play public deletion page ───────────────────────
describe('DeleteAccountPage', () => {
  it('renders the h1, the in-app path, the email request route and legal links', () => {
    render(<DeleteAccountPage />);
    expect(screen.getByRole('heading', { level: 1, name: /delete your kwikserve account/i })).toBeInTheDocument();
    expect(screen.getByText(/delete it yourself in the app/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /sign in.*ask us/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: /terms of service/i })).toHaveAttribute('href', '/terms');
    const mail = screen.getAllByRole('link').find((a) => (a.getAttribute('href') ?? '').startsWith('mailto:'));
    expect(mail?.getAttribute('href')).toMatch(/subject=Account%20deletion%20request/);
  });

  it('states what is deleted and what is kept without quoting an unapproved retention period', () => {
    render(<DeleteAccountPage />);
    expect(screen.getByText(/what is deleted/i)).toBeInTheDocument();
    expect(screen.getByText(/what is kept, and why/i)).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/\b\d+\s*(years?|months?|days?)\b/i);
  });

  it('states that access ends on completion without promising other devices sign out', () => {
    render(<DeleteAccountPage />);
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/we stop serving your data to any device/i);
    expect(text).toMatch(/may keep showing its last screen/i);
    expect(text).not.toMatch(/signed out everywhere immediately/i);
    expect(text).not.toMatch(/every device is signed out/i);
  });

  it('discloses support notes, safety records and retained booking photos', () => {
    render(<DeleteAccountPage />);
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/support cases, internal notes and safety or fraud records/i);
    expect(text).toMatch(/photos attached to those bookings/i);
  });

  it('states the purpose limitation and the real access scope', () => {
    render(<DeleteAccountPage />);
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/only where one of these still applies/i);
    expect(text).toMatch(/the other person on a booking you shared/i);
    expect(text).toMatch(/do not gain access to your payment records/i);
    expect(text).toMatch(/not use retained records for marketing, profiling or any other unrelated purpose/i);
  });

  it('does not claim every retained record is stripped of personal information', () => {
    render(<DeleteAccountPage />);
    expect(document.body.textContent ?? '').toMatch(
      /not a guarantee that every retained record is free of personal information/i,
    );
  });

  it('promises no end-of-retention deletion while no such process is implemented', () => {
    render(<DeleteAccountPage />);
    expect(document.body.textContent ?? '').not.toMatch(/fully anonymised/i);
  });

  it('describes identity verification for the email request route', () => {
    render(<DeleteAccountPage />);
    expect(document.body.textContent ?? '').toMatch(
      /we verify the request by replying to that registered address/i,
    );
  });
});
