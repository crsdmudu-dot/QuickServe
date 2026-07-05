// app/how-it-works/page.tsx — Step-by-step explainer of the QuickServe booking flow.
// Server component — no data fetching, no hooks, no Supabase.
// All content mapped from content/site.ts; structural headings are literals.

import { buildMetadata } from '@/lib/site';
import { HOW_IT_WORKS_STEPS, PRIMARY_CTA, PROVIDER_CTA } from '@/content/site';

import SectionHeading from '@/components/SectionHeading';
import StepCard from '@/components/StepCard';
import CtaSection from '@/components/CtaSection';

export const metadata = buildMetadata({
  title: 'How QuickServe Works — Book a Service in Minutes',
  description:
    'Discover how QuickServe makes booking home services in Nairobi simple: choose a service, set your location, get matched with a verified professional, and track them in real time.',
  path: '/how-it-works',
});

export default function HowItWorksPage() {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Page header — single <h1>                                           */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-primarySurface py-20 px-6">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center gap-6">
          <SectionHeading
            as="h1"
            eyebrow="Simple Steps"
            title="How QuickServe Works"
            subtitle="Getting a professional to your door has never been easier. Follow these six simple steps to go from request to completed job."
            align="center"
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Step cards                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-7xl mx-auto flex flex-col gap-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {HOW_IT_WORKS_STEPS.map((step, i) => (
              <StepCard
                key={step.title}
                index={i + 1}
                title={step.title}
                body={step.body}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Why it's fast & reliable                                            */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-surfaceMuted">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          <SectionHeading
            eyebrow="Our Promise"
            title="Fast, Reliable & Transparent"
            subtitle="Every step of the process is designed to give you confidence — from the moment you open the app to the moment the job is done."
          />
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-label text-textSecondary list-none">
            <li className="bg-surface border border-border rounded-lg p-5">
              <span className="font-semibold text-ink">Upfront pricing</span> — you see the price before you confirm.
            </li>
            <li className="bg-surface border border-border rounded-lg p-5">
              <span className="font-semibold text-ink">Verified professionals</span> — every provider is identity- and skill-verified.
            </li>
            <li className="bg-surface border border-border rounded-lg p-5">
              <span className="font-semibold text-ink">Real-time tracking</span> — follow your pro on the map as they travel to you.
            </li>
            <li className="bg-surface border border-border rounded-lg p-5">
              <span className="font-semibold text-ink">Secure payment</span> — pay safely in the app after the job is complete.
            </li>
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Closing CTA                                                         */}
      {/* ------------------------------------------------------------------ */}
      <CtaSection
        heading="Ready to Try It?"
        body="Book your first service in under a minute and experience the QuickServe difference."
        primaryCta={PRIMARY_CTA}
        secondaryCta={PROVIDER_CTA}
      />
    </>
  );
}
