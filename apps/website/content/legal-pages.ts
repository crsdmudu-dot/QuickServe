// content/legal-pages.ts — the five pages that publish an approved text, and what each one shows.
//
// Each page renders ONE approved Markdown file inside ONE element marked data-legal-doc="<id>" (the site markup contract,
// Update 73 73-SITE-MARKUP-CONTRACT.md, and the release checker r3). The Terms text file is named by the owner's approval
// record content/terms-release.json (its "textFile"); the other four files have fixed names in content/.
// The Terms, Privacy and account-deletion pages also show the version line "Version <label> · Effective <date>",
// rendered from that same record. The Support and FAQ pages have no version line.
//
// When a page's approved file (or, for the version line, the record) is not in content/ yet, the page shows the short
// notice below and makes no version claim. It then has NO data-legal-doc container, so a build without the approved
// texts can never be pinned or pass the release check (it fails closed).
//
// Nothing here is legal text: these are page titles, search descriptions and the notice.

export type LegalDocId = 'terms' | 'privacy' | 'delete-account' | 'support' | 'faq';

export type LegalPageDef = {
  /** The data-legal-doc value and the release checker's document id. */
  id: LegalDocId;
  /** The page's path on the site (with the trailing slash the static export uses). */
  path: string;
  /** The approved Markdown file in content/, or null for the Terms (named by content/terms-release.json). */
  file: string | null;
  /** True when the page shows the version line from content/terms-release.json. */
  versioned: boolean;
  /** The heading shown only while the approved file is not in content/ (the approved text brings its own heading). */
  heading: string;
  /** The page title and search description (metadata only; not part of the approved text). */
  title: string;
  description: string;
};

export const LEGAL_PAGES: Record<LegalDocId, LegalPageDef> = {
  terms: {
    id: 'terms',
    path: '/terms/',
    file: null,
    versioned: true,
    heading: 'Terms of Service',
    title: 'Terms of Service — KwikServe',
    description:
      'Read the KwikServe Terms of Service to understand the rules governing use of our platform, bookings, payments, and responsibilities of customers and providers.',
  },
  privacy: {
    id: 'privacy',
    path: '/privacy/',
    file: 'privacy.md',
    versioned: true,
    heading: 'Privacy Policy',
    title: 'Privacy Policy — KwikServe',
    description:
      'Read the KwikServe Privacy Policy to understand how we collect, use, and protect your personal data when you use our platform.',
  },
  'delete-account': {
    id: 'delete-account',
    path: '/delete-account/',
    file: 'delete-account.md',
    versioned: true,
    heading: 'Delete your KwikServe account',
    title: 'Delete your account — KwikServe',
    description:
      'How to delete your KwikServe account from the app or by request, and what data is deleted or retained.',
  },
  support: {
    id: 'support',
    path: '/support/',
    file: 'support.md',
    versioned: false,
    heading: 'KwikServe Support',
    title: 'Help & Support — KwikServe',
    description: 'Get help with your KwikServe account, bookings and payments, and contact KwikServe Support.',
  },
  faq: {
    id: 'faq',
    path: '/faq/',
    file: 'faq.md',
    versioned: false,
    heading: 'Frequently Asked Questions',
    title: 'Frequently Asked Questions — KwikServe',
    description: 'Answers to common questions about KwikServe: booking, paying with M-PESA, your account and how to get support.',
  },
};

/** Shown, with a link to the support address, while a page's approved file is not in content/ yet. */
export const NOT_PUBLISHED_NOTICE = 'This page has not been published yet. For help, email KwikServe Support at';
