// account-state.ts — is the signed-in account suspended? (F5.6, migration 0069)
//
// A suspended account is refused everything in the database, including its own profile, so the app cannot tell a
// suspension from "no profile" by reading it. get_my_account_state() answers about the caller only.
import { supabase } from '@/lib/supabase';

/** True only when the database says the caller's account is suspended. Any failure answers false (no sign-out). */
export async function isAccountSuspended(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('get_my_account_state');
    return !error && data === 'suspended';
  } catch {
    return false;
  }
}
