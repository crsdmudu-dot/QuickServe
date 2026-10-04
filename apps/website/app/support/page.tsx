// app/support/page.tsx — the Help & Support page (the store listings' Support URL).
// Server component, rendered once at build time — no client code, no Supabase, no backend.
//
// The support text is the approved file content/support.md, rendered inside one data-legal-doc="support" container
// (the release checker pins it like the legal pages). It has no version line. While the file is absent the page shows
// a short notice with the support address (components/LegalDocument.tsx). The closing call to action is page chrome,
// outside the approved text.

import { buildMetadata } from '@/lib/site';
import { readContentFile } from '@/lib/legal-content';
import { PRIMARY_CTA, SECONDARY_CTA } from '@/content/site';
import { LEGAL_PAGES } from '@/content/legal-pages';
import LegalDocument from '@/components/LegalDocument';
import CtaSection from '@/components/CtaSection';

const PAGE = LEGAL_PAGES.support;

export const metadata = buildMetadata({
  title: PAGE.title,
  description: PAGE.description,
  path: '/support',
});

export default function SupportPage() {
  return (
    <>
      <LegalDocument page={PAGE} text={readContentFile('support.md')} marker={null} />
      <CtaSection
        heading="Still Need Help?"
        body="Email KwikServe Support and we will help."
        primaryCta={SECONDARY_CTA}
        secondaryCta={PRIMARY_CTA}
      />
    </>
  );
}
