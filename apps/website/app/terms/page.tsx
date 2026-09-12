// app/terms/page.tsx — Terms of Service placeholder page.
// Server component — no data fetching, no hooks, no Supabase.
// PLACEHOLDER pending legal review — concise, practical sections.

import { buildMetadata } from '@/lib/site';
import { BRAND } from '@/lib/site';

import SectionHeading from '@/components/SectionHeading';

export const metadata = buildMetadata({
  title: 'Terms of Service — KwikServe',
  description:
    'Read the KwikServe Terms of Service to understand the rules governing use of our platform, bookings, payments, and responsibilities of customers and providers.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Page header — single <h1>                                           */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-primarySurface py-20 px-6">
        <div className="max-w-4xl mx-auto flex flex-col items-start gap-6">
          <SectionHeading
            as="h1"
            eyebrow="Legal"
            title="Terms of Service"
            subtitle="Last updated: placeholder — pending legal review."
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Placeholder notice                                                  */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-6 px-6 bg-background">
        <div className="max-w-4xl mx-auto">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-label font-semibold text-amber-800">
              This is a placeholder policy pending legal review. It does not constitute legal advice
              and will be replaced with a reviewed, finalised policy before public launch.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Terms content                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-12 px-6 bg-background">
        <div className="max-w-4xl mx-auto flex flex-col gap-10">

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">1. Acceptance of Terms</h2>
            <p className="text-body text-textSecondary">
              By accessing or using the KwikServe platform (including the website and mobile app),
              you agree to be bound by these Terms of Service. If you do not agree, please do not
              use our services.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">2. Using the Platform</h2>
            <p className="text-body text-textSecondary">
              KwikServe provides an on-demand marketplace connecting customers with independent
              service providers in Nairobi and surrounding areas. We are a technology intermediary —
              we do not directly employ service providers. You must be at least 18 years old to
              create an account.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">3. Bookings & Payments</h2>
            <p className="text-body text-textSecondary">
              When you book a service through KwikServe, you enter into a service agreement
              directly with the independent provider. KwikServe facilitates the transaction but is
              not a party to the service contract. Payment is processed securely through our
              platform using M-Pesa or card. Refund and cancellation policies are described in the
              app.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">4. Acceptable Use</h2>
            <p className="text-body text-textSecondary">
              You agree not to misuse the platform, including by: submitting false information;
              harassing providers or other users; attempting to circumvent our payment system;
              using the platform for unlawful purposes; or interfering with platform operations.
              Violations may result in account suspension.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">5. Liability</h2>
            <p className="text-body text-textSecondary">
              KwikServe acts as an intermediary and does not guarantee the quality, safety, or
              legality of any service performed by an independent provider. While we verify all
              providers, we are not liable for any damages arising from the services you receive.
              Our liability is limited to the amount you paid for the relevant booking.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">6. Changes to These Terms</h2>
            <p className="text-body text-textSecondary">
              We may update these Terms from time to time. Continued use of the platform after
              changes are posted constitutes your acceptance of the revised Terms. We will notify
              registered users of significant changes.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">7. Contact</h2>
            <p className="text-body text-textSecondary">
              For questions about these Terms, contact us at:{' '}
              <a
                href={`mailto:${BRAND.email}`}
                className="text-primary underline underline-offset-2 hover:text-primaryDark"
              >
                {BRAND.email}
              </a>
            </p>
          </div>

        </div>
      </section>
    </>
  );
}
