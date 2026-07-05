// Hero — large page hero with headline, subheadline, optional supporting line, and two CTAs.
// Server component — no interactivity.

import Link from 'next/link';
import type { Cta } from '@/content/site';

type Props = {
  headline: string;
  subheadline: string;
  supporting?: string;
  primaryCta: Cta;
  secondaryCta: Cta;
};

export default function Hero({
  headline,
  subheadline,
  supporting,
  primaryCta,
  secondaryCta,
}: Props) {
  return (
    <section className="bg-primarySurface py-20 px-6">
      <div className="max-w-4xl mx-auto text-center flex flex-col items-center gap-6">
        <h1 className="text-display font-bold text-ink leading-tight">{headline}</h1>
        <p className="text-body text-textSecondary max-w-2xl">{subheadline}</p>
        {supporting && (
          <p className="text-label text-textTertiary">{supporting}</p>
        )}
        <div className="flex flex-col sm:flex-row items-center gap-4 mt-2">
          <Link
            href={primaryCta.href}
            className="text-label font-semibold text-white bg-primary rounded-pill px-8 py-3 hover:bg-primaryDark transition-colors"
          >
            {primaryCta.label}
          </Link>
          <Link
            href={secondaryCta.href}
            className="text-label font-semibold text-primary border border-primary rounded-pill px-8 py-3 hover:bg-primaryTint transition-colors"
          >
            {secondaryCta.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
