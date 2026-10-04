// LegalDocument — the body of a page that publishes an approved text (Terms, Privacy, account deletion, Support, FAQ).
// Server component — no interactivity.
//
// With the approved text: ONE element marked data-legal-doc="<id>" holds the whole text and nothing else, so the release
// checker can hash exactly the approved words. On the versioned pages it also holds the ONE version line, rendered from
// content/terms-release.json as a single expression: "Version <label> · Effective <date>" with the same values in
// data-terms-version and data-effective-date (the site markup contract, rules R1-R4).
//
// Without the approved text: a heading and a short notice, NO data-legal-doc container and NO version line, so such a
// build can never be pinned or pass the release check.
//
// A versioned page (Privacy, account deletion) whose text is in content/ but whose record is not stops the build: it
// would otherwise publish an approved text without its version line (PM stage 127c, F-127c-9).

import { parseLegalMarkdown } from '@/lib/legal-markdown';
import { LegalContentError, TERMS_RELEASE_PATH, type VersionMarker } from '@/lib/legal-content';
import { BRAND } from '@/lib/site';
import { NOT_PUBLISHED_NOTICE, type LegalPageDef } from '@/content/legal-pages';
import LegalMarkdown from '@/components/LegalMarkdown';

type Props = {
  page: LegalPageDef;
  /** The approved text (raw Markdown) and its file name for error messages; null while it is not in content/. */
  text: { source: string; label: string } | null;
  /** The version line's values from content/terms-release.json; null while the record is absent. Ignored on unversioned pages. */
  marker: VersionMarker | null;
};

export default function LegalDocument({ page, text, marker }: Props) {
  if (!text) {
    return (
      <section className="bg-primarySurface py-20 px-6">
        <div className="max-w-3xl mx-auto flex flex-col gap-4">
          <h1 className="text-display font-bold text-ink leading-tight">{page.heading}</h1>
          <p className="text-body text-textSecondary">
            {NOT_PUBLISHED_NOTICE}{' '}
            <a href={`mailto:${BRAND.email}`} className="text-primary underline underline-offset-2 hover:text-primaryDark">
              {BRAND.email}
            </a>
            {'.'}
          </p>
        </div>
      </section>
    );
  }

  if (page.versioned && !marker) {
    throw new LegalContentError(
      `${text.label} is in content/, but ${TERMS_RELEASE_PATH} is not: the ${page.id} page needs the record for its version line, so it cannot be built without it`,
    );
  }

  const blocks = parseLegalMarkdown(text.source, text.label);
  const versionLine =
    page.versioned && marker ? (
      <p
        className="text-label text-textTertiary"
        data-terms-version={marker.version}
        data-effective-date={marker.effectiveDate}
      >
        {`Version ${marker.version} · Effective ${marker.effectiveDate}`}
      </p>
    ) : null;

  return (
    <section className="py-16 px-6 bg-background">
      <article data-legal-doc={page.id} className="max-w-3xl mx-auto flex flex-col gap-4">
        <LegalMarkdown blocks={blocks} afterFirstHeading={versionLine} />
      </article>
    </section>
  );
}
