// terms-gate.tsx — tracks whether the signed-in customer or provider has accepted the current Terms (F5.4).
//
// On sign-in it checks the record. Someone who ticked the Terms box when registering carries the accepted version in
// their sign-up details, so the acceptance is recorded for them automatically (source 'register') — no second prompt.
// Everyone else gets status 'required', and the root navigator sends them to the Terms screen.
// Admins are not gated here: administration lives in the admin web, and admins do not post customer content.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useAuth } from '@/auth/auth-context';
import { CURRENT_TERMS_VERSION } from '@/constants/terms';
import { acceptCurrentTerms, getMyTermsStatus, type TermsStatus } from '@/lib/terms';

/** idle: not applicable (signed out, admin, or role not known yet) · checking: looking it up. */
export type TermsGateStatus = TermsStatus | 'idle' | 'checking';

type TermsGateState = {
  status: TermsGateStatus;
  /** Records acceptance from the in-app prompt. */
  accept: () => Promise<{ ok: boolean; error?: string }>;
};

const TermsGateContext = createContext<TermsGateState | null>(null);

export function TermsGateProvider({ children }: { children: ReactNode }) {
  const { session, role } = useAuth();
  const userId = session?.user?.id ?? null;
  const registeredVersion = (session?.user?.user_metadata as { terms_version?: unknown } | undefined)?.terms_version;
  // The check applies only to a signed-in customer or provider; `key` identifies the check a result belongs to.
  const key = userId && (role === 'customer' || role === 'provider') ? userId : null;
  const [result, setResult] = useState<{ key: string; status: TermsStatus } | null>(null);

  useEffect(() => {
    if (!key) return;
    let active = true;
    (async () => {
      let next: TermsStatus = await getMyTermsStatus(key);
      if (next === 'required' && registeredVersion === CURRENT_TERMS_VERSION) {
        const recorded = await acceptCurrentTerms('register');
        if (recorded.ok) next = 'accepted';
      }
      if (active) setResult({ key, status: next });
    })();
    return () => {
      active = false;
    };
  }, [key, registeredVersion]);

  const accept = useCallback(async () => {
    const outcome = await acceptCurrentTerms('prompt');
    if (outcome.ok && key) setResult({ key, status: 'accepted' });
    return outcome;
  }, [key]);

  const status: TermsGateStatus = !key ? 'idle' : result?.key === key ? result.status : 'checking';
  return <TermsGateContext.Provider value={{ status, accept }}>{children}</TermsGateContext.Provider>;
}

export function useTermsGate(): TermsGateState {
  const ctx = useContext(TermsGateContext);
  if (!ctx) throw new Error('useTermsGate must be used inside TermsGateProvider');
  return ctx;
}
