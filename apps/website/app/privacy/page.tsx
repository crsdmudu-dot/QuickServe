// app/privacy/page.tsx — Privacy Policy placeholder page.
// Server component — no data fetching, no hooks, no Supabase.
// PLACEHOLDER pending legal review — concise, practical sections.

import { buildMetadata } from '@/lib/site';
import { BRAND } from '@/lib/site';

import SectionHeading from '@/components/SectionHeading';

export const metadata = buildMetadata({
  title: 'Privacy Policy — KwikServe',
  description:
    'Read the KwikServe Privacy Policy to understand how we collect, use, and protect your personal data when you use our platform.',
  path: '/privacy',
});

export default function PrivacyPage() {
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
            title="Privacy Policy"
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
      {/* Policy content                                                      */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-12 px-6 bg-background">
        <div className="max-w-4xl mx-auto flex flex-col gap-10">

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">1. What We Collect</h2>
            <p className="text-body text-textSecondary">
              We collect information you provide directly, such as your name, email address, phone
              number, and payment details when you create an account or make a booking. We also
              collect location data (with your permission) to match you with nearby service
              providers, and usage data such as pages visited and features used to improve the
              platform.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">2. How We Use Your Information</h2>
            <p className="text-body text-textSecondary">
              We use your information to: process bookings and payments; match customers with
              service providers; send booking confirmations and service updates; provide customer
              support; improve and personalise the platform experience; and comply with legal
              obligations.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">3. Sharing Your Information</h2>
            <p className="text-body text-textSecondary">
              We share your information only as necessary to fulfil bookings (e.g., sharing your
              address with the assigned provider) or as required by law. We do not sell your
              personal data to third parties. Service providers on the platform see only the
              information needed to complete your job.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">4. Data Security</h2>
            <p className="text-body text-textSecondary">
              We implement industry-standard security measures to protect your data, including
              encryption in transit and at rest. Payment information is handled by certified payment
              processors and is never stored on our servers in full.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">5. Your Rights</h2>
            <p className="text-body text-textSecondary">
              You have the right to access, correct, or delete your personal data. You may also
              object to certain processing or request a copy of your data. To exercise these rights,
              contact us at the address below.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">6. Cookies</h2>
            <p className="text-body text-textSecondary">
              We use essential cookies to operate the platform and optional analytics cookies to
              understand usage patterns. You can control cookie preferences in your browser settings.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">7. Contact</h2>
            <p className="text-body text-textSecondary">
              For privacy-related enquiries or to exercise your data rights, contact us at:{' '}
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
