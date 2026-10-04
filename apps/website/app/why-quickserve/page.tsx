// app/why-quickserve/page.tsx — Value proposition and trust differentiators.
// Server component — no data fetching, no hooks, no Supabase.
// All content mapped from content/site.ts; structural headings are literals.

import { buildMetadata } from '@/lib/site';
import {
  CUSTOMER_BENEFITS,
  TRUST_BADGES,
  PRIMARY_CTA,
  PROVIDER_CTA,
  SEO_PHRASES,
} from '@/content/site';

import SectionHeading from '@/components/SectionHeading';
import BenefitItem from '@/components/BenefitItem';
import TrustBadge from '@/components/TrustBadge';
import CtaSection from '@/components/CtaSection';

export const metadata = buildMetadata({
  title: 'Why Choose KwikServe — Trusted Home Services in Nairobi',
  description: `See what KwikServe offers: upfront quotes, real-time tracking, M-PESA payment after the job and ${SEO_PHRASES[5]} at your door.`,
  path: '/why-quickserve',
});

export default function WhyQuickServePage() {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Page header — single <h1>                                           */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-primarySurface py-20 px-6">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center gap-6">
          <SectionHeading
            as="h1"
            eyebrow="Our Promise"
            title="Why Choose KwikServe"
            subtitle={`${SEO_PHRASES[5]}, with a quote before any work starts, so you can relax and let the pros handle it.`}
            align="center"
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Customer benefits                                                   */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-7xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="For Customers"
            title="Everything You Need, Every Time"
            subtitle="KwikServe puts quality, safety, and convenience at the heart of every booking."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {CUSTOMER_BENEFITS.map((benefit) => (
              <BenefitItem
                key={benefit.title}
                icon={benefit.icon}
                title={benefit.title}
                text={benefit.text}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Trust badges                                                        */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-primarySurface">
        <div className="max-w-7xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="Built on Safety"
            title="Our Quality Standards"
            subtitle="Every interaction on KwikServe is designed around your safety, satisfaction, and peace of mind."
            align="center"
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {TRUST_BADGES.map((badge) => (
              <TrustBadge
                key={badge.label}
                icon={badge.icon}
                label={badge.label}
                description={badge.description}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Differentiator prose                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-surfaceMuted">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <SectionHeading
            eyebrow="The Difference"
            title="What Sets Us Apart"
          />
          <p className="text-body text-textSecondary">
            You can report or block anyone in the app, our team reviews every report within 24 hours,
            and we can suspend providers who break our rules.
          </p>
          <p className="text-body text-textSecondary">
            You see the price in a quote before you accept it. You can follow your provider on the
            map while they are on the way. You pay with M-PESA in the app after the job — and if
            anything goes wrong, you can email KwikServe Support for help.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Closing CTA                                                         */}
      {/* ------------------------------------------------------------------ */}
      <CtaSection
        heading="Experience the KwikServe Difference"
        body="Book your first service in the KwikServe app."
        primaryCta={PRIMARY_CTA}
        secondaryCta={PROVIDER_CTA}
      />
    </>
  );
}
