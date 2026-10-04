// app/privacy/page.tsx — the Privacy Policy page.
// Server component, rendered once at build time — no client code, no Supabase.
//
// The text is the approved file content/privacy.md. The version line shows the version and effective date of the
// owner's approval record content/terms-release.json (one release for the Terms, Privacy and account-deletion pages).
// While a file is absent the page shows a short notice and makes no version claim (components/LegalDocument.tsx).

import { buildMetadata } from '@/lib/site';
import { readContentFile, readTermsRelease } from '@/lib/legal-content';
import { LEGAL_PAGES } from '@/content/legal-pages';
import LegalDocument from '@/components/LegalDocument';

const PAGE = LEGAL_PAGES.privacy;

export const metadata = buildMetadata({
  title: PAGE.title,
  description: PAGE.description,
  path: '/privacy',
});

export default function PrivacyPage() {
  const release = readTermsRelease('content/terms-release.json');
  const marker = release ? { version: release.version, effectiveDate: release.effectiveDate } : null;
  return <LegalDocument page={PAGE} text={readContentFile('privacy.md')} marker={marker} />;
}
