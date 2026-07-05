// app/faq/page.tsx — Frequently asked questions page.
// Server component — no data fetching, no hooks, no Supabase.
// All FAQ content mapped from content/site.ts FAQ_ITEMS.

import { buildMetadata } from '@/lib/site';
import { FAQ_ITEMS, PRIMARY_CTA, SECONDARY_CTA } from '@/content/site';

import SectionHeading from '@/components/SectionHeading';
import FaqItem from '@/components/FaqItem';
import CtaSection from '@/components/CtaSection';

export const metadata = buildMetadata({
  title: 'Frequently Asked Questions — QuickServe',
  description:
    'Find answers to the most common questions about QuickServe: how booking works, payment options, provider verification, coverage areas, the mobile app, and how to get support.',
  path: '/faq',
});

export default function FaqPage() {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Page header — single <h1>                                           */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-primarySurface py-20 px-6">
        <div className="max-w-3xl mx-auto text-center flex flex-col items-center gap-6">
          <SectionHeading
            as="h1"
            eyebrow="Help Centre"
            title="Frequently Asked Questions"
            subtitle="Can't find what you're looking for? Visit our support page or contact us directly."
            align="center"
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* All FAQ items                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-background">
        <div className="max-w-3xl mx-auto flex flex-col gap-3">
          {FAQ_ITEMS.map((item) => (
            <FaqItem key={item.question} question={item.question} answer={item.answer} />
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Still need help?                                                    */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 px-6 bg-surfaceMuted">
        <div className="max-w-3xl mx-auto flex flex-col gap-4">
          <SectionHeading
            eyebrow="Still Have Questions?"
            title="We're Here to Help"
            subtitle="Our support team is available around the clock. Reach out and we'll get back to you quickly."
            align="center"
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Closing CTA                                                         */}
      {/* ------------------------------------------------------------------ */}
      <CtaSection
        heading="Ready to Book or Need More Help?"
        body="Book your first service, or contact our support team for any question not answered above."
        primaryCta={SECONDARY_CTA}
        secondaryCta={PRIMARY_CTA}
      />
    </>
  );
}
