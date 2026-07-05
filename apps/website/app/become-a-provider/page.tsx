// app/become-a-provider/page.tsx — Provider recruitment landing page.
// Server component — no data fetching, no hooks, no Supabase.
// STRONGLY drives provider applications: multiple prominent PROVIDER_CTA placements.
// All content mapped from content/site.ts; structural headings are literals.

import Link from 'next/link';
import { buildMetadata } from '@/lib/site';
import {
  PROVIDER_BENEFITS,
  PROVIDER_CTA,
  SECONDARY_CTA,
  SEO_PHRASES,
} from '@/content/site';

import SectionHeading from '@/components/SectionHeading';
import BenefitItem from '@/components/BenefitItem';
import CtaSection from '@/components/CtaSection';

export const metadata = buildMetadata({
  title: 'Become a Service Provider in Nairobi — Join QuickServe',
  description: `Grow your business as a service provider in Nairobi. Join QuickServe, get a steady stream of jobs, set your own hours, and keep more of your earnings. ${SEO_PHRASES[5]} — apply free today.`,
  path: '/become-a-provider',
});

export default function BecomeAProviderPage() {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Hero — single <h1> + prominent top CTA                             */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-primarySurface py-20 px-6">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center gap-6">
          <span className="text-caption uppercase tracking-widest font-semibold text-primary">
            For Service Professionals
          </span>
          <h1 className="text-display font-bold text-ink leading-tight">
            Grow Your Business with QuickServe
          </h1>
          <p className="text-body text-textSecondary max-w-2xl">
            Whether you&apos;re a plumber, electrician, cleaner, mechanic, or beautician — QuickServe
            connects you with customers who need your skills right now. Get a steady stream of jobs,
            set your own schedule, and build a reputation that drives repeat business.
          </p>
          {/* Prominent provider CTA near top */}
          <div className="flex flex-col sm:flex-row items-center gap-4 mt-2">
            <Link
              href={PROVIDER_CTA.href}
              className="text-label font-semibold text-white bg-primary rounded-pill px-8 py-3 hover:bg-primaryDark transition-colors"
            >
              {PROVIDER_CTA.label}
            </Link>
            <Link
              href={SECONDARY_CTA.href}
              className="text-label font-semibold text-primary border border-primary rounded-pill px-8 py-3 hover:bg-primaryTint transition-colors"
            >
              {SECONDARY_CTA.label}
            </Link>
          </div>
          <p className="text-caption text-textTertiary">Free to join · No upfront fees · Get paid fast</p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Provider benefits                                                   */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-7xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="Why Join Us"
            title="Built for Professionals Like You"
            subtitle="QuickServe is designed to help service professionals in Nairobi earn more, work smarter, and grow their reputation."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {PROVIDER_BENEFITS.map((benefit) => (
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
      {/* How to get started — provider-framed steps                         */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-primarySurface">
        <div className="max-w-4xl mx-auto flex flex-col gap-10">
          <SectionHeading
            eyebrow="Getting Started"
            title="Apply in Minutes"
            subtitle="Joining QuickServe as a service provider is quick, free, and straightforward."
            align="center"
          />
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-6 list-none">
            {[
              {
                step: 1,
                title: 'Submit your application',
                body: 'Fill in your name, skills, and service area via the app or Contact page. Takes under 5 minutes.',
              },
              {
                step: 2,
                title: 'Complete verification',
                body: 'We verify your identity and skills to protect customers and uphold our quality standard.',
              },
              {
                step: 3,
                title: 'Get approved & go live',
                body: 'Once approved, your profile is visible to customers in your area and jobs start coming in.',
              },
              {
                step: 4,
                title: 'Earn, grow & repeat',
                body: 'Complete jobs, collect great reviews, build your reputation, and watch your bookings grow.',
              },
            ].map(({ step, title, body }) => (
              <li key={step} className="bg-surface border border-border rounded-lg p-6 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-pill bg-primary flex items-center justify-center flex-shrink-0">
                  <span className="text-label font-bold text-white">{step}</span>
                </div>
                <h3 className="text-heading font-semibold text-ink">{title}</h3>
                <p className="text-label text-textSecondary">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Eligibility note                                                    */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <SectionHeading
            eyebrow="Who Can Apply"
            title="We Welcome All Skilled Professionals"
          />
          <p className="text-body text-textSecondary">
            If you are skilled, reliable, and passionate about delivering great service, we want you
            on the QuickServe platform. We currently onboard professionals in Nairobi across all 19+
            service categories — from electricians and plumbers to cleaners, mechanics, beauticians,
            and delivery riders. Expansion to other Kenyan cities is underway.
          </p>
          <p className="text-body text-textSecondary">
            Questions about the process? Visit our{' '}
            <Link href="/faq" className="text-primary underline underline-offset-2 hover:text-primaryDark">
              FAQ page
            </Link>{' '}
            or{' '}
            <Link href="/contact" className="text-primary underline underline-offset-2 hover:text-primaryDark">
              contact our team
            </Link>{' '}
            directly.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Closing CTA — provider-primary                                      */}
      {/* ------------------------------------------------------------------ */}
      <CtaSection
        heading="Ready to Start Earning?"
        body="Join hundreds of professionals already growing their business on QuickServe. Apply today — it's free."
        primaryCta={PROVIDER_CTA}
        secondaryCta={SECONDARY_CTA}
      />
    </>
  );
}
