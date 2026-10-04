/**
 * cancellation-copy.ts — Update 74: every customer- and provider-facing text of in-app cancellation.
 *
 * DRAFT. Every string in this file is a proposal awaiting the owner's approval; text approval is separate
 * from the policy, which the owner DECIDED on 2026-10-03 19:19 (src/constants/cancellation.ts). The rev-3
 * list is kwikserve-updates/74e-cancellation-owner-decisions/WORDING-OPTION-B-rev3.md and STRINGS-DRAFT.md.
 * None states a fee, a time limit, an automatic refund or any payment to a provider for travel (owner item
 * 8: undecided). Refunds stay manual (R1b).
 */
import type { CancelReasonCode } from '@/constants/cancellation';

// ── Screen header titles (booking stack, src/app/booking/_layout.tsx) ──────────────────────────────
export const CANCEL_HEADER = 'Cancel booking';
export const CANCEL_LIST_HEADER = 'Cancel a booking';
export const HELP_HEADER = 'Get help';

// ── Booking detail actions (50 §1.1) ─────────────────────────────────────────────────────────────
export const CANCEL_BUTTON = 'Cancel booking';
export const HELP_BUTTON = 'Get help with this booking';
export const REBOOK_BUTTON = 'Book again';

// ── Confirmation screen (50 §1.2–§1.4) ────────────────────────────────────────────────────────────
export const CONFIRM_TITLE = 'Cancel this booking?';
export const PROVIDER_LINE = (name: string) => `Provider: ${name}`;
export const CQ_NO_PROVIDER = 'No provider has been sent yet.';
export const CQ_PROVIDER = (name: string | null) =>
  name
    ? `We'll tell ${name} straight away that the booking is cancelled.`
    : "We'll tell your provider straight away that the booking is cancelled.";
export const CQ_TRAVELLING = (name: string | null) =>
  `${name ?? 'Your provider'} is already on the way. We'll tell them straight away that they don't need to come. ` +
  "If they have already started work, don't cancel here: use Get help with this booking instead.";
/** A provider we arranged by phone (manual dispatch): an admin tells them, so no timing promise. */
export const CQ_MANUAL_PROVIDER = (name: string | null) =>
  `We'll let ${name ?? 'your provider'} know that the booking is cancelled.`;
export const CQ_MANUAL_TRAVELLING = (name: string | null) =>
  `${name ?? 'Your provider'} may already be on the way. We'll let them know that they don't need to come. ` +
  "If they have already started work, don't cancel here: use Get help with this booking instead.";
export const CQ_QUOTE = 'The quote for this booking is cancelled too.';
export const CQ_NOTHING_TO_PAY = 'There is nothing to pay for this booking.';
/** Shown only while SHOW_NO_FEE_LINE (OD-74-5) is true. */
export const CQ_NO_FEE = 'There is no cancellation fee.';
export const CQ_REBOOK = 'You can book again at any time.';
export const REASON_GROUP_LABEL = 'Why are you cancelling? (optional)';
export const REASON_HELPER = "You don't have to choose a reason.";
export const CANCEL_REASON_LABELS: Record<CancelReasonCode, string> = {
  plans_changed: 'My plans changed',
  booked_by_mistake: 'I booked by mistake',
  found_another_option: 'I found another way to get it done',
  provider_late: 'The provider is taking too long',
  other: 'Another reason',
};
export const CONFIRM_BUTTON = 'Cancel booking';
export const KEEP_BUTTON = 'Keep booking';
export const SENDING_ANNOUNCEMENT = 'Cancelling your booking';

// ── Result (50 §1.5) ──────────────────────────────────────────────────────────────────────────────
export const RESULT_TITLE = 'Booking cancelled';
export const RESULT_BODY = (service: string, when: string) => `Your ${service} booking for ${when} is cancelled.`;
export const RESULT_PROVIDER_TOLD = "We've told your provider.";
export const RESULT_PROVIDER_MANUAL = "We'll let your provider know.";
export const RESULT_QUOTE = 'The quote is cancelled too.';
export const RESULT_NOTHING_TO_PAY = 'There is nothing to pay.';
export const RESULT_ALREADY_YOU = 'This booking was already cancelled.';
export const RESULT_ALREADY_KWIKSERVE = 'This booking was already cancelled by KwikServe.';
export const BACK_TO_BOOKING = 'Back to booking';

// ── Refusals and errors (50 §1.6) ─────────────────────────────────────────────────────────────────
export const ERR_WORK_STARTED =
  'Your provider has started work, so this booking can no longer be cancelled in the app. We can still help.';
export const ERR_COMPLETED =
  "This job is complete, so it can't be cancelled. If something wasn't done as agreed, we can help.";
export const ERR_NEEDS_SUPPORT = 'We need to arrange this cancellation with you ourselves.';
export const ERR_PAYMENT_IN_PROGRESS =
  "A payment for this booking is still being processed, so it can't be cancelled in the app. Please don't pay again.";
export const ERR_PAYMENT_RECORDED = "A payment is recorded for this booking, so it can't be cancelled in the app.";
export const ERR_NETWORK = "We couldn't confirm the cancellation. Check your connection and try again.";
export const ERR_NOT_FOUND = "We couldn't find this booking.";
export const ERR_UNAVAILABLE = "Cancelling in the app isn't available right now. We can still help.";
export const TRY_AGAIN = 'Try again';
export const BACK = 'Back';
export const BACK_TO_MY_BOOKINGS = 'Back to My bookings';

// ── Get help with this booking (50 §1.7) ──────────────────────────────────────────────────────────
export const HELP_TITLE = 'Get help with this booking';
export const HELP_REFERENCE = (ref: string) => `Booking reference: ${ref}`;
export const HELP_WORK_STARTED =
  "Work on this booking has started, so it can't be cancelled in the app. If you need the work stopped, or something is wrong, email us and tell the provider in the chat if you can.";
export const HELP_COMPLETED =
  "If something wasn't done as agreed, email us as soon as you can with the details and any photos.";
export const HELP_MONEY =
  "This booking has a payment or credit on it, so we need to sort it out with you. Email us and we'll help.";
export const HELP_GENERAL = "Email us and we'll help with this booking.";
export const HELP_EMAIL_PROMPT = 'Email KwikServe Support. Please include the booking reference.';
export const HELP_CHAT_LINE = "You can also message your provider in the booking's chat.";
export const HELP_REFUND_PARAGRAPH =
  'If we agree that you should get money back, we send it by M-PESA to the phone number that made the payment, and only to that number. We email you when it has been sent. The app will still show the booking as paid.';
export const HELP_REQUEST_NOTE =
  "An email is a request. We'll reply by email, and we'll tell you when anything about your booking changes.";

// ── Choosing a booking to cancel (the Terms-gate path, OD-74-8) ────────────────────────────────────
export const LIST_TITLE = 'Cancel a booking';
export const LIST_INTRO = 'Choose the booking you want to cancel. You can cancel a booking until work starts.';
export const LIST_EMPTY = 'You have no bookings that can be cancelled in the app.';
export const LIST_OPEN = 'Cancel this booking';
export const TERMS_SCREEN_CANCEL_LINK = 'Cancel a booking';

// ── Provider side (50 §1.9) ───────────────────────────────────────────────────────────────────────
export const PROVIDER_CANCELLED_BANNER = "This booking has been cancelled. You don't need to go.";
export const PROVIDER_STATUS_FINAL =
  "This booking has been cancelled or completed, so its status can't be changed.";

// ── Chat, customer side (50 §1.8; the provider keeps the owner's 11:16 text, src/lib/blocks.ts) ───
export const CHAT_BLOCKED_NOTICE_CUSTOMER_TEXT =
  "Chat isn't available for this booking. On the booking screen you can use Cancel booking before work starts, or Get help with this booking. For anything else, email KwikServe Support at support@kwikserve.co.ke.";
