// app/privacy/page.tsx — Privacy Policy.
// Server component — no data fetching, no hooks, no Supabase, no credentials of any kind.
//
// This policy describes the behaviour the repository actually implements: Supabase-backed auth and
// data, M-PESA payments through Safaricom's Daraja API, Expo push tokens, Google Places address
// lookup, optional crash diagnostics, and the account-deletion/tombstone model introduced by
// migration 0056. It deliberately quotes NO fixed retention period: retention is expressed as
// reasonable necessity plus applicable legal obligation, which is what the code enforces. Keep it
// consistent with /delete-account, the in-app delete screen and docs/pilot/legal-support.md.

import Link from 'next/link';

import { buildMetadata } from '@/lib/site';
import { BRAND } from '@/lib/site';

import SectionHeading from '@/components/SectionHeading';

export const metadata = buildMetadata({
  title: 'Privacy Policy — KwikServe',
  description:
    'Read the KwikServe Privacy Policy to understand how we collect, use, and protect your personal data when you use our platform.',
  path: '/privacy',
});

const OPERATOR = 'Hired Corp Limited';

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
            subtitle={`How ${OPERATOR} collects, uses, retains and protects your personal data when you use KwikServe.`}
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Policy content                                                      */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-12 px-6 bg-background">
        <div className="max-w-4xl mx-auto flex flex-col gap-10">

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">1. Who we are</h2>
            <p className="text-body text-textSecondary">
              KwikServe is an on-demand services platform operated by {OPERATOR} (&ldquo;we&rdquo;,
              &ldquo;us&rdquo;). We connect customers with service providers for home, auto, delivery
              and personal-care services, and we are the data controller for the personal data
              described in this policy. This policy applies to the KwikServe mobile apps, this
              website and the systems behind them.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">2. What we collect</h2>
            <ul className="list-disc pl-6 text-body text-textSecondary flex flex-col gap-1">
              <li>
                <strong>Account details.</strong> Your email address, password (stored only as a
                cryptographic hash), name, phone number and the role you hold on the platform.
              </li>
              <li>
                <strong>Profile details.</strong> For providers, a bio, skills, experience and a
                profile photo. For customers, a profile photo where you add one.
              </li>
              <li>
                <strong>Booking details.</strong> The service requested, the address and access
                notes you supply, scheduling, booking photos, status history and the messages you
                exchange in the booking chat.
              </li>
              <li>
                <strong>Payment details.</strong> The amount, currency, status and reference of each
                payment, and the phone number used for an M-PESA transaction.
              </li>
              <li>
                <strong>Location data.</strong> Address coordinates for a booking, and, for
                providers who are on an active job, live location while that job is in progress.
              </li>
              <li>
                <strong>Device and notification data.</strong> Push notification tokens for the
                devices you sign in on, and your notification preferences.
              </li>
              <li>
                <strong>Support and safety records.</strong> Support cases you raise or are named
                in, internal notes on them, account flags, and records created by safety or fraud
                review.
              </li>
              <li>
                <strong>Technical data.</strong> Basic usage and diagnostic information needed to
                operate the service, including error diagnostics where crash reporting is enabled.
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">3. Why we process it</h2>
            <p className="text-body text-textSecondary">
              We process your data to create and secure your account, to take and fulfil bookings, to
              take payment and reconcile it, to pay providers, to keep the platform safe, to answer
              support requests, and to meet obligations that apply to us. We do not sell your
              personal data. The sections below describe each purpose in the terms the product
              actually works in.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">
              4. Authentication and account management
            </h2>
            <p className="text-body text-textSecondary">
              Your email address and password authenticate you. Passwords are never stored in a
              readable form. We send account emails such as sign-up confirmation and password reset,
              and those links are single-use and time-limited. Sessions are held on your device and
              are revoked when you sign out and when your account is deleted. Your role determines what you can see and do, and that separation is enforced
              by the database itself, not only by the app.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">5. Bookings and service fulfilment</h2>
            <p className="text-body text-textSecondary">
              To fulfil a booking we share with the assigned provider only what they need to do the
              job: the service address and access notes you supply, the scheduled time, and the
              details of that booking. Providers do not see your profile, your payment records or
              your other bookings.
              Booking chat messages are visible to you and to the other party on that booking.
              Photos attached to a booking form part of its record. Reviews you write are shown with
              your first name against the provider you reviewed.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">6. Payments and M-PESA records</h2>
            <p className="text-body text-textSecondary">
              Payments are taken through Safaricom&apos;s M-PESA service. When you pay, the phone
              number you use is sent to Safaricom to initiate the transaction, and Safaricom returns
              a result that we record against your booking. We store the amount, status, timestamps,
              transaction reference and the outcome reported back to us, so that a payment can be
              reconciled, refunded or disputed later. We do not receive or store your M-PESA PIN.
              Full card details are never stored on our servers.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">7. Provider verification and payouts</h2>
            <p className="text-body text-textSecondary">
              If you offer services on KwikServe we hold the profile and verification details you
              submit, your service categories and your availability, together with an earnings
              ledger recording what each completed job earned, what has been deducted and what has
              been paid out. These records exist so that payouts can be calculated, evidenced and
              audited, and so that a payout dispute can be resolved.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">8. Location data</h2>
            <p className="text-body text-textSecondary">
              Address lookup and autocomplete are provided by Google Places: the text you type into
              an address field is sent to that service to return suggestions. Coordinates for a
              booking address are stored with the booking so the provider can find you. Where a
              provider has granted location permission, their location is shared while a job is
              active so that you can follow its progress. When the job is completed or cancelled the
              app stops sending updates and asks us to delete the last position it stored. That
              request comes from the provider's device, so if their app is closed at that moment the
              last stored position can remain until it is removed. Customer location is not tracked
              in the background.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">9. Notifications and device tokens</h2>
            <p className="text-body text-textSecondary">
              When you allow notifications we register a push token for that device and send it, with
              the notification content, through Expo&apos;s push service to Apple or Google for
              delivery. We use notifications for booking, payment, chat and account activity. You can
              turn categories off in the app or withdraw the permission in your device settings, and
              registrations are removed when you sign out or delete your account.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">
              10. Support, safety, fraud prevention and audit
            </h2>
            <p className="text-body text-textSecondary">
              When you contact support, or when your account is involved in a safety or fraud review,
              we create a case record with the relevant history and internal notes. We also keep an
              audit trail of significant actions on the platform, including administrative actions
              taken on an account. These records let us investigate incidents, prevent and detect
              fraud and abuse, resolve disputes, and show what happened and when. Access to them is
              restricted to staff who need it for those purposes.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">11. Service providers we use</h2>
            <p className="text-body text-textSecondary">
              We use a small number of processors to run the service, and they may process your data
              only on our instructions and only for the purpose they are engaged for: Supabase for
              application hosting, the database, authentication and file storage; Safaricom for
              M-PESA payments; Expo, together with Apple and Google, for push notification delivery;
              Google for address lookup; Cloudflare for website and link hosting; and, where crash
              reporting is enabled, an error-diagnostics provider. Some of these process data outside
              Kenya. We share data with them only as needed to run KwikServe, and otherwise only
              where the law requires it.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">12. Deleting your account</h2>
            <p className="text-body text-textSecondary">
              You can delete your account yourself in the app, or ask us to do it if you can no
              longer sign in. See{' '}
              <Link
                href="/delete-account"
                className="text-primary underline underline-offset-2 hover:text-primaryDark"
              >
                Delete your account
              </Link>{' '}
              for the steps and for exactly what is removed.
            </p>
            <p className="text-body text-textSecondary">
              Deletion removes your login. As soon as it completes we stop serving your data to any
              device and your saved sign-ins are revoked, so nothing can sign in or renew a session;
              a device still open may keep showing its last screen until it next contacts us.
              <strong>Your account record itself is not erased.</strong> Your name, phone number,
              photo, bio and skills are removed from it, but the record stays, still linked by an
              internal identifier to your retained bookings, payments and support history, and your
              overall ratings and job counts remain on it. It no longer carries your name or contact
              details, but it is not anonymous: it remains the single thread connecting your past
              activity. We keep it because removing it today would break the retained records that
              reference it, and in some cases destroy them &mdash; including other people&apos;s
              payment and payout records. Whether it can later be reduced further, or removed once
              the records that depend on it have gone, is under review. Deletion is refused, and nothing is changed, while a booking, payment, payout
              or support case is still open, and the app tells you what to resolve first.
              Administrator accounts cannot be deleted this way and are removed by our operations
              team.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">13. How long we keep data</h2>
            <p className="text-body text-textSecondary">
              We keep personal data only where it is still needed for the purpose it was collected
              for, or where a legal obligation that applies to us requires it. In practice that means
              account and profile data lasts while your account does; booking, payment, payout,
              booking photos, support, safety and audit records are kept after deletion where
              accounting, payment reconciliation, dispute resolution, safety, fraud prevention or a
              legal obligation still applies.
            </p>
            <p className="text-body text-textSecondary">
              We remove direct personal identifiers from those records where we can. Some retained
              records still contain personal information and we do not edit them: photos attached to
              a booking are kept exactly as uploaded and may show you, your home or your belongings,
              and support and safety notes are written by our staff in their own words and may name
              or describe you and what happened. Access is limited to our staff who need it for one
              of the purposes above, and to the other person on a booking you shared, who keeps
              their own view of that booking. We do not use retained records for marketing,
              profiling or any other unrelated purpose.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">14. How we protect your data</h2>
            <p className="text-body text-textSecondary">
              Data is encrypted in transit and at rest. Access rules are enforced in the database, so
              a user can only reach the rows their role entitles them to, and the operations that
              move money run with checks that prevent an account being overdrawn or a payment being
              settled twice. Administrative access is limited to staff who need it and significant
              administrative actions are recorded. No system can be guaranteed completely secure, but
              we work to protect your data and to respond quickly if something goes wrong.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">15. Your rights</h2>
            <p className="text-body text-textSecondary">
              Under Kenya&apos;s Data Protection Act you have the right to be informed how your data
              is used, to access a copy of it, to have inaccurate data corrected, to object to or ask
              us to restrict certain processing, and to ask us to delete your data. You can also
              withdraw a permission you gave, such as location or notifications, at any time. Some of
              these rights have limits: where we must keep a record for accounting, dispute
              resolution, safety, fraud prevention or a legal obligation, we will keep that record
              and restrict it to that purpose rather than delete it, and we will tell you when that
              applies. To exercise a right, contact us using the details below.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">16. Contact us</h2>
            <p className="text-body text-textSecondary">
              For privacy enquiries, or to exercise any of the rights above, contact {OPERATOR} at:{' '}
              <a
                href={`mailto:${BRAND.email}`}
                className="text-primary underline underline-offset-2 hover:text-primaryDark"
              >
                {BRAND.email}
              </a>
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">17. Complaints</h2>
            <p className="text-body text-textSecondary">
              Please raise any concern with us first so we can put it right. If you are not satisfied
              with how we have handled your personal data, you have the right to lodge a complaint
              with the Office of the Data Protection Commissioner in Kenya.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">18. Changes to this policy</h2>
            <p className="text-body text-textSecondary">
              We may update this policy as the service changes or as the law requires. When we make a
              significant change we will update this page and, where the change materially affects
              you, tell you in the app or by email. Continuing to use KwikServe after an update means
              the updated policy applies to you.
            </p>
          </div>

        </div>
      </section>
    </>
  );
}
