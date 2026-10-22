/**
 * cancellation.ts — Update 74, customer cancellation in the app: the OWNER DECISIONS.
 *
 * DECIDED by the owner on 2026-10-03 19:19 EAT
 * (kwikserve-updates/74e-cancellation-owner-decisions/00-OWNER-DECISIONS-2026-10-03-1919.md, items 1-8).
 * The decisions are binding; the TEXTS that show them are still DRAFT (src/constants/cancellation-copy.ts;
 * text approval is separate). This file is the ONE place in the app where those decisions live, so a later
 * decision changes one place here.
 *
 * The server decides; this is the app's mirror, used only to choose which button to show. The server has
 * the same block at the top of customer_cancel_booking (supabase/migrations/0076_customer_booking_cancellation); the guard
 * test src/__tests__/customer-cancellation-migration-guard.test.ts fails if the two ever differ.
 */
import type { BookingStatus } from '@/constants/booking-status';

/**
 * OD-74-1, OD-74-3, OD-74-4: DECIDED (owner item 1; item 5: the actual work-start status decides). A
 * customer may cancel before work starts: awaiting assignment, assigned, travelling and arrived. Arrival is
 * not recorded and is not work started; work started is 'in_progress'.
 */
export const CANCELLABLE_STATUSES: readonly BookingStatus[] = [
  'pending',
  'accepted',
  'provider_assigned',
  'on_the_way',
];

/**
 * OD-74-5: DECIDED (owner item 1): no customer cancellation fee, and the confirmation says so. No fee
 * exists in the code.
 */
export const SHOW_NO_FEE_LINE = true;

/**
 * OD-74-6: DECIDED (owner item 4): a payment, a payment attempt, wallet credit or a promotion on the booking
 * means support-assisted handling under the approved refund process (Get help). No money moves in the app.
 */
export const MONEY_APPLIED_GOES_TO_HELP = true as const;

/**
 * OD-74-8: DECIDED (owner item 5): cancelling never requires accepting the latest Terms. The client Terms
 * gate lets a customer reach the cancellation screens, and the server function has no Terms check.
 */
export const TERMS_GATE_EXEMPTS_CANCELLATION = true;

/**
 * OD-74-9: DECIDED (owner item 5): the reason is optional; admins see it, providers never do. The labels
 * are DRAFT strings in src/constants/cancellation-copy.ts (CANCEL_REASON_LABELS).
 */
export const CANCEL_REASON_CODES = [
  'plans_changed',
  'booked_by_mistake',
  'found_another_option',
  'provider_late',
  'other',
] as const;
export type CancelReasonCode = (typeof CANCEL_REASON_CODES)[number];

/*
 * Not code values (recorded here so every decision has one home):
 *   OD-74-2  DECIDED (owner item 3): manually dispatched bookings have the same eligibility; there is no
 *            "Get help after assignment" exception. Operational dependency: an admin sets 'in_progress'
 *            when a manual provider starts work, and phones a manual provider when a customer cancels
 *            (kwikserve-updates/74e-cancellation-owner-decisions/MANUAL-DISPATCH-FINDING.md).
 *   OD-74-7  UNDECIDED (owner item 8): provider compensation for wasted travel. Nothing in code, and no
 *            text promises it.
 *   OD-74-10 DECIDED: Option B, in-app cancellation at launch (a release decision, not a code value).
 *   OD-74-11 not decided by the owner: Get help uses the existing constant support email
 *            (src/lib/support.ts) plus the booking reference shown on screen.
 *   OD-74-12 DECIDED through owner item 6: when anyone other than the customer cancels, the customer gets
 *            an in-app notice (the server trigger trg_bookings_customer_cancel_notice).
 *   OD-74-13 DECIDED (owner item 5): no time limit.
 */
