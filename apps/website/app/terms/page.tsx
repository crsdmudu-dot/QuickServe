// app/terms/page.tsx — the Terms of Service page.
// Server component, rendered once at build time — no client code, no Supabase.
//
// The page has no words of its own. Everything comes from the owner's approval record content/terms-release.json:
//   - the text is the file the record names (release.textFile), checked against release.textSha256;
//   - the version line shows release.version and release.effectiveDate (components/LegalDocument.tsx).
// This is what the repository's Terms release gate (scripts/check-terms-release.ts) requires of this file.
// While the record is absent the page shows a short notice and makes no version claim.

import { buildMetadata } from '@/lib/site';
import { readApprovedTermsText, readTermsRelease } from '@/lib/legal-content';
import { LEGAL_PAGES } from '@/content/legal-pages';
import LegalDocument from '@/components/LegalDocument';

const PAGE = LEGAL_PAGES.terms;

export const metadata = buildMetadata({
  title: PAGE.title,
  description: PAGE.description,
  path: '/terms',
});

export default function TermsPage() {
  const release = readTermsRelease('content/terms-release.json');
  const text = release ? readApprovedTermsText(release.textFile, release.textSha256) : null;
  const marker = release ? { version: release.version, effectiveDate: release.effectiveDate } : null;
  return <LegalDocument page={PAGE} text={text} marker={marker} />;
}
