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
 *   - deleted               the account is gone; sign out locally and leave.
 *   - pending_auth_delete   the profile is tombstoned and access is already revoked, but the auth
 *                           record could not be removed yet; the user is told it will complete and
 *                           may retry safely.
 *   - blocked               nothing changed; `blockers` explains why (machine codes, mapped to
 *                           copy by the screen).
 */
export type DeletionBlocker =
  | 'active_booking'
  | 'pending_payment_attempt'
  | 'unsettled_payment'
  | 'unpaid_provider_earning'
  | 'positive_wallet_balance'
  | 'open_support_case'
  | 'active_account_flag';

export type DeletionOutcome =
  | { ok: true; status: 'deleted' | 'pending_auth_delete' }
  | { ok: false; status: 'blocked'; blockers: DeletionBlocker[] }
  | { ok: false; status: 'error'; error: string };

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
    | { ok?: boolean; status?: string; blockers?: unknown; error?: string; retry_after_seconds?: number }
    | null;

  if (payload?.status === 'blocked') {
    const blockers = Array.isArray(payload.blockers)
      ? (payload.blockers.filter((b): b is DeletionBlocker => typeof b === 'string' && KNOWN_BLOCKERS.has(b)))
      : [];
    return { ok: false, status: 'blocked', blockers };
  }
  if (payload?.ok && (payload.status === 'deleted' || payload.status === 'pending_auth_delete')) {
    return { ok: true, status: payload.status };
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
