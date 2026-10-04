// app/faq/page.tsx — the Frequently Asked Questions page.
// Server component, rendered once at build time — no client code, no Supabase.
//
// The questions and answers are the approved file content/faq.md, rendered in full (no collapsed answers, so every
// word is in the page) inside one data-legal-doc="faq" container. It has no version line. While the file is absent
// the page shows a short notice (components/LegalDocument.tsx). The closing call to action is page chrome, outside the
// approved text. (The Home page lists a few questions only, FAQ_PREVIEW_QUESTIONS in content/site.ts, linking here.)

import { buildMetadata } from '@/lib/site';
import { readContentFile } from '@/lib/legal-content';
import { PRIMARY_CTA, SECONDARY_CTA } from '@/content/site';
import { LEGAL_PAGES } from '@/content/legal-pages';
import LegalDocument from '@/components/LegalDocument';
import CtaSection from '@/components/CtaSection';

const PAGE = LEGAL_PAGES.faq;

export const metadata = buildMetadata({
  title: PAGE.title,
  description: PAGE.description,
  path: '/faq',
});

export default function FaqPage() {
  return (
    <>
      <LegalDocument page={PAGE} text={readContentFile('faq.md')} marker={null} />
      <CtaSection
        heading="Ready to Book or Need More Help?"
        body="Book your first service, or contact our support team for any question not answered above."
        primaryCta={SECONDARY_CTA}
        secondaryCta={PRIMARY_CTA}
      />
    </>
  );
}
