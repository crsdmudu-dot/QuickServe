// app/delete-account/page.tsx — the public account-deletion page (Google Play requires one, reachable without signing in).
// Server component, rendered once at build time — no client code, no Supabase, no credentials of any kind.
//
// The text is the approved file content/delete-account.md. The version line shows the version and effective date of
// the owner's approval record content/terms-release.json. While the text is absent the page shows a short notice and
// makes no version claim; the text without the record stops the build (components/LegalDocument.tsx).

import { buildMetadata } from '@/lib/site';
import { readContentFile, readTermsRelease } from '@/lib/legal-content';
import { LEGAL_PAGES } from '@/content/legal-pages';
import LegalDocument from '@/components/LegalDocument';

const PAGE = LEGAL_PAGES['delete-account'];

export const metadata = buildMetadata({
  title: PAGE.title,
  description: PAGE.description,
  path: '/delete-account',
});

export default function DeleteAccountPage() {
  const release = readTermsRelease('content/terms-release.json');
  const marker = release ? { version: release.version, effectiveDate: release.effectiveDate } : null;
  return <LegalDocument page={PAGE} text={readContentFile('delete-account.md')} marker={marker} />;
}
