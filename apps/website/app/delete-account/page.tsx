// app/delete-account/page.tsx — public account-deletion request page.
// Server component — no data fetching, no hooks, no Supabase, no credentials of any kind.
//
// Google Play requires a page like this to be reachable WITHOUT signing in. It must identify the
// app, say how to delete in-app, offer a route for people who cannot sign in, and state honestly
// what is deleted and what is kept. The wording here must stay consistent with the in-app screen
// and docs/pilot/legal-support.md section 8. Retention periods are deliberately not quoted:
// they are pending owner/legal review.

import Link from 'next/link';

import { buildMetadata } from '@/lib/site';
import { BRAND } from '@/lib/site';

import SectionHeading from '@/components/SectionHeading';

export const metadata = buildMetadata({
  title: 'Delete your account — KwikServe',
  description:
    'How to delete your KwikServe account from the app or by request, and what data is deleted or retained.',
  path: '/delete-account',
});

const REQUEST_SUBJECT = 'Account deletion request';

export default function DeleteAccountPage() {
  return (
    <>
      <section className="bg-primarySurface py-20 px-6">
        <div className="max-w-4xl mx-auto flex flex-col items-start gap-6">
          <SectionHeading
            as="h1"
            eyebrow="Your account"
            title="Delete your KwikServe account"
            subtitle="You can delete your account yourself in the app, or ask us to do it if you can no longer sign in."
          />
        </div>
      </section>

      <section className="py-12 px-6 bg-background">
        <div className="max-w-4xl mx-auto flex flex-col gap-10">

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">1. Delete it yourself in the app</h2>
            <ol className="list-decimal pl-6 text-body text-textSecondary flex flex-col gap-1">
              <li>Open KwikServe and go to <strong>Profile</strong>.</li>
              <li>Tap <strong>Delete account</strong>.</li>
              <li>Read what will be deleted and kept, type <strong>DELETE</strong>, and enter your current password.</li>
              <li>Tap <strong>Delete my account</strong>. You are signed out everywhere immediately.</li>
            </ol>
            <p className="text-body text-textSecondary">
              If something still needs your attention — a booking that is not finished, a payment
              that has not settled, earnings not yet paid out, a wallet balance, or an open support
              case — the app tells you exactly what to resolve first. Nothing is deleted until you can
              complete the request.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">2. Can&apos;t sign in? Ask us</h2>
            <p className="text-body text-textSecondary">
              Email{' '}
              <a
                href={`mailto:${BRAND.email}?subject=${encodeURIComponent(REQUEST_SUBJECT)}`}
                className="text-primary underline underline-offset-2 hover:text-primaryDark"
              >
                {BRAND.email}
              </a>{' '}
              with the subject <strong>&ldquo;{REQUEST_SUBJECT}&rdquo;</strong> from the email address
              registered on your account. To protect you, we verify the request by replying to that
              registered address before anything is deleted, and we apply the same checks as the app:
              if a booking, payment, payout or support case is still open we will tell you what must
              be resolved first.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">3. What is deleted</h2>
            <ul className="list-disc pl-6 text-body text-textSecondary flex flex-col gap-1">
              <li>
                Your login. Access ends immediately: every device is signed out the moment the
                deletion succeeds, and you cannot sign in again.
              </li>
              <li>Your name, phone number, profile photo, and — for providers — bio, skills and experience.</li>
              <li>Saved addresses, favourites, notification settings and device registrations.</li>
              <li>Your written review comments (the star rating you gave is kept, without your name).</li>
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">4. What is kept, and why</h2>
            <p className="text-body text-textSecondary">
              Records of completed bookings and payments — and, for providers, earnings and payouts —
              are retained, together with support cases and safety or fraud records involving your
              account. We keep them only where it is reasonably necessary for accounting, payment
              reconciliation, dispute resolution, safety, fraud prevention or a legal obligation we
              are subject to.
            </p>
            <p className="text-body text-textSecondary">
              Direct personal identifiers are removed from those records where possible: the booking
              address, notes and location are cleared, chat messages you sent are replaced with a
              placeholder, the payer phone number on a payment is reduced to its last three digits,
              and the account itself is marked as deleted so the remaining rows no longer identify
              you by name.
            </p>
            <p className="text-body text-textSecondary">
              Access to retained records is restricted to staff who need it for one of the purposes
              above. They are not used for marketing, profiling or any other unrelated purpose, and
              they are deleted or fully anonymised once that purpose and any applicable legal
              obligation no longer apply.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-heading font-bold text-ink">5. Related</h2>
            <p className="text-body text-textSecondary">
              See our{' '}
              <Link href="/privacy" className="text-primary underline underline-offset-2 hover:text-primaryDark">
                Privacy Policy
              </Link>{' '}
              for how we handle your data and our{' '}
              <Link href="/terms" className="text-primary underline underline-offset-2 hover:text-primaryDark">
                Terms of Service
              </Link>
              .
            </p>
          </div>

        </div>
      </section>
    </>
  );
}
