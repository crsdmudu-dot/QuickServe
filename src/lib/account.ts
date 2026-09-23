import { supabase } from '@/lib/supabase';

/**
 * Self-service account deletion — the client half.
 *
 * Everything that matters happens server-side in the `delete-account` Edge Function: the target
 * identity is derived from the caller's own bearer token (nothing here names a user), the current
 * password is re-proven there, and the database work runs as a single SECURITY DEFINER
 * transaction. This module only shapes the request and interprets the response.
 *
 * Statuses returned to the screen:
 *   - deleted               the auth identity is gone; sign out locally and leave.
 *   - pending_auth_delete   the profile is tombstoned and access is already revoked, but the auth
 *                           record could not be removed yet; it is retried automatically and the
 *                           user may retry safely.
 *   - blocked               nothing changed; `blockers` explains why (machine codes, mapped to
 *                           copy by the screen).
 *
 * Alongside the status the server reports the independent work dimensions (0059): whether the
 * login removal is done and whether the removal of the person's uploads is done. The message
 * shown to the person is COMPOSED from those (see `describeDeletionOutcome`); it never claims
 * more than the server has verified and never says "your data has been removed" as a blanket.
 */
export type DeletionBlocker =
  | 'active_booking'
  | 'pending_payment_attempt'
  | 'unsettled_payment'
  | 'unpaid_provider_earning'
  | 'positive_wallet_balance'
  | 'open_support_case'
  | 'active_account_flag';

export type AuthState = 'not_started' | 'pending_retry' | 'deleted' | 'needs_operator';
export type CleanupState = 'not_started' | 'pending' | 'provisional' | 'complete' | 'complete_with_retained' | 'needs_operator';

export type DeletionOutcome =
  | {
      ok: true;
      status: 'deleted' | 'pending_auth_delete';
      authState: AuthState;
      cleanupState: CleanupState;
      requestId?: string;
    }
  | { ok: false; status: 'blocked'; blockers: DeletionBlocker[] }
  | { ok: false; status: 'error'; error: string };

const AUTH_STATES = new Set<string>(['not_started', 'pending_retry', 'deleted', 'needs_operator']);
const CLEANUP_STATES = new Set<string>(['not_started', 'pending', 'provisional', 'complete', 'complete_with_retained', 'needs_operator']);

/**
 * Precise, composed copy for a completed request. One sentence per dimension; nothing merged.
 *   access   always revoked once the request succeeded.
 *   login    removed, or pending (retried automatically), or needing our team.
 *   uploads  the person's own booking photos: removed, being removed, retained under a hold, or
 *            needing our team.
 *   retained the records that stay, named, so "deleted" is never read as "everything".
 */
export function describeDeletionOutcome(outcome: Extract<DeletionOutcome, { ok: true }>): {
  title: string;
  lines: string[];
} {
  const lines: string[] = ['Your access has been revoked. You can no longer sign in or use the app.'];

  if (outcome.authState === 'deleted') {
    lines.push('Your login has been removed.');
  } else if (outcome.authState === 'needs_operator') {
    lines.push('Removing your login needs attention from our team. You still cannot sign in.');
  } else {
    lines.push('Removal of your login is still pending. It is retried automatically; you cannot sign in meanwhile.');
  }

  switch (outcome.cleanupState) {
    case 'complete':
      lines.push('Photos you uploaded to bookings have been removed.');
      break;
    case 'complete_with_retained':
      lines.push('Photos you uploaded to bookings have been removed, except items retained under a hold. Support can tell you which.');
      break;
    case 'needs_operator':
      lines.push('Removing some photos you uploaded needs attention from our team.');
      break;
    case 'provisional':
      // Truthful: held photos may remain; the final check runs at or after the upload boundary
      // and may be delayed; completion is not confirmed yet.
      lines.push('Photo cleanup is awaiting a final check for uploads that were already in progress. Some photos may remain under a hold. We cannot confirm completion yet.');
      break;
    default:
      lines.push('Photos you uploaded to bookings are being removed. A final check runs automatically.');
  }

  // Accurate to what 0056/0060 do: the person's own profile fields, addresses, sent messages
  // and review text are removed or replaced; records written by the other party or by support,
  // and retained booking/payment/support records, are kept as the privacy policy describes.
  lines.push('Your profile details, saved addresses, the messages you sent and your review text have been removed or replaced.');
  lines.push('Booking, payment and support records are kept as described in the privacy policy. Photos and messages from the other person on a booking, and support notes, may still refer to you.');
  if (outcome.requestId) lines.push(`Request reference: ${outcome.requestId}`);

  const title = outcome.authState === 'deleted' && outcome.cleanupState === 'complete'
    ? 'Account deleted'
    : 'Account deletion in progress';
  return { title, lines };
}

/** The exact word the user must type. Exported so the screen and its tests share one source. */
export const DELETE_CONFIRMATION_WORD = 'DELETE';

/** Human copy for each blocker code — what the user must resolve first. */
export const DELETION_BLOCKER_COPY: Record<DeletionBlocker, string> = {
  active_booking: 'You have a booking that is not yet completed or cancelled.',
  pending_payment_attempt: 'A payment is still being processed.',
  unsettled_payment: 'A payment on one of your bookings has not been settled.',
  unpaid_provider_earning: 'You have earnings that have not been paid out yet.',
  positive_wallet_balance: 'Your wallet still has a balance.',
  open_support_case: 'A support case involving your account is still open.',
  active_account_flag: 'Your account is under review by support.',
};

const KNOWN_BLOCKERS = new Set<string>(Object.keys(DELETION_BLOCKER_COPY));

export async function requestAccountDeletion(input: {
  password: string;
  confirmation: string;
}): Promise<DeletionOutcome> {
  if (input.confirmation !== DELETE_CONFIRMATION_WORD) {
    return { ok: false, status: 'error', error: `Type ${DELETE_CONFIRMATION_WORD} to confirm.` };
  }
  if (!input.password) {
    return { ok: false, status: 'error', error: 'Enter your password.' };
  }

  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: { confirmation: input.confirmation, password: input.password },
  });

  // supabase-js surfaces non-2xx as `error` with the parsed body on `error.context`; the body we
  // care about is whichever one is present.
  const payload = (data ?? (await readErrorBody(error))) as
    | {
        ok?: boolean;
        status?: string;
        blockers?: unknown;
        error?: string;
        retry_after_seconds?: number;
        auth_state?: unknown;
        cleanup_state?: unknown;
        deletion_id?: unknown;
      }
    | null;

  if (payload?.status === 'blocked') {
    const blockers = Array.isArray(payload.blockers)
      ? (payload.blockers.filter((b): b is DeletionBlocker => typeof b === 'string' && KNOWN_BLOCKERS.has(b)))
      : [];
    return { ok: false, status: 'blocked', blockers };
  }
  if (payload?.ok && (payload.status === 'deleted' || payload.status === 'pending_auth_delete')) {
    const authState =
      typeof payload.auth_state === 'string' && AUTH_STATES.has(payload.auth_state)
        ? (payload.auth_state as AuthState)
        : payload.status === 'deleted' ? 'deleted' : 'pending_retry';
    const cleanupState =
      typeof payload.cleanup_state === 'string' && CLEANUP_STATES.has(payload.cleanup_state)
        ? (payload.cleanup_state as CleanupState)
        : 'pending';
    return {
      ok: true,
      status: payload.status,
      authState,
      cleanupState,
      requestId: typeof payload.deletion_id === 'string' ? payload.deletion_id : undefined,
    };
  }
  if (payload?.status === 'unsupported_identity') {
    return {
      ok: false,
      status: 'error',
      error: 'This sign-in method cannot confirm deletion in the app. Please contact support.',
    };
  }
  return {
    ok: false,
    status: 'error',
    error: typeof payload?.error === 'string' ? payload.error : 'Could not delete the account. Please try again.',
  };
}

async function readErrorBody(error: unknown): Promise<unknown> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx && typeof (ctx as { json?: unknown }).json === 'function') {
    try {
      return await (ctx as { json: () => Promise<unknown> }).json();
    } catch {
      return null;
    }
  }
  return null;
}
