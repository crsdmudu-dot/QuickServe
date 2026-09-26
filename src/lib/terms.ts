// terms.ts — reading and recording the signed-in user's acceptance of the current Terms (F5.4, migration 0068).
import { supabase } from '@/lib/supabase';
import { CURRENT_TERMS_VERSION } from '@/constants/terms';

/** accepted: this version is on record · required: not yet · unknown: the check failed (the database still enforces). */
export type TermsStatus = 'accepted' | 'required' | 'unknown';
/** Where the acceptance came from: the register checkbox, or the in-app prompt. */
export type TermsSource = 'register' | 'prompt';

export const TERMS_NOT_ACCEPTED_MESSAGE = 'Please accept the Terms of Service first.';

/** True when a database error is the Terms gate's refusal ('terms_not_accepted', migration 0068). */
export function isTermsNotAccepted(error: { message?: string } | null | undefined): boolean {
  return error?.message === 'terms_not_accepted';
}

/** Has this user accepted the current Terms version? */
export async function getMyTermsStatus(userId: string): Promise<TermsStatus> {
  const { data, error } = await supabase
    .from('terms_acceptances')
    .select('terms_version')
    .eq('user_id', userId)
    .eq('terms_version', CURRENT_TERMS_VERSION)
    .maybeSingle();
  if (error) return 'unknown';
  return data ? 'accepted' : 'required';
}

/** Records the signed-in user's acceptance of the current Terms. The server accepts only the current version. */
export async function acceptCurrentTerms(source: TermsSource): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('accept_terms', { p_version: CURRENT_TERMS_VERSION, p_source: source });
  if (!error) return { ok: true };
  if (error.message === 'terms_version_mismatch') {
    return { ok: false, error: 'Our Terms have been updated. Please update the app to continue.' };
  }
  return { ok: false, error: 'Could not record your acceptance. Please try again.' };
}
