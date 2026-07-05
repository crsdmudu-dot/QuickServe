// CtaSection — a full-width call-to-action banner with heading, optional body, and CTA buttons.
// Server component — no interactivity.

import Link from 'next/link';
import type { Cta } from '@/content/site';

type Props = {
  heading: string;
  body?: string;
  primaryCta: Cta;
  secondaryCta?: Cta;
};

export default function CtaSection({ heading, body, primaryCta, secondaryCta }: Props) {
  return (
    <section className="bg-primary py-16 px-6">
      <div className="max-w-3xl mx-auto text-center flex flex-col items-center gap-6">
        <h2 className="text-display font-bold text-white leading-tight">{heading}</h2>
        {body && (
          <p className="text-body text-white/80">{body}</p>
        )}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link
            href={primaryCta.href}
            className="text-label font-semibold text-primary bg-white rounded-pill px-8 py-3 hover:bg-primaryTint transition-colors"
          >
            {primaryCta.label}
          </Link>
          {secondaryCta && (
            <Link
              href={secondaryCta.href}
              className="text-label font-semibold text-white border border-white/60 rounded-pill px-8 py-3 hover:bg-primaryDark transition-colors"
            >
              {secondaryCta.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
