import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import type { Role } from '@/constants/roles';
import { supabase } from '@/lib/supabase';
import { mapAuthError } from '@/lib/auth-errors';

type SignUpValues = { fullName: string; email: string; phone: string; password: string };

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

type AuthState = {
  session: Session | null;
  role: Role | null;
  approvalStatus: ApprovalStatus | null;   // from profiles; exposed for future provider-approval routing
  isLoading: boolean;
  pendingRole: Role | null;
  signedIn: boolean;
  authError: string | null;
  profileError: string | null;
  selectRole: (role: Role) => void;
  signUp: (v: SignUpValues) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

type ProfileResult = { role: Role | null; approvalStatus: ApprovalStatus | null; error: unknown };

async function fetchProfile(userId: string): Promise<ProfileResult> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, approval_status')
    .eq('id', userId)
    .maybeSingle();
  return {
    role: (data?.role as Role | undefined) ?? null,
    approvalStatus: (data?.approval_status as ApprovalStatus | undefined) ?? null,
    error,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // The user id whose role/profile is currently resolved. Used so a session change for
  // a NEW user re-enters the loading state while the role is fetched (making "role
  // resolving" a distinct, explicit state), while a same-user token refresh does not
  // (no spurious loading flash mid-session).
  const resolvedUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    async function applySession(s: Session | null) {
      if (!active) return;
      setSession(s);
      if (s) {
        // Re-enter loading while the role resolves for a newly signed-in user, so
        // consumers (the admin route guard) can distinguish "role resolving" (show a
        // loading state) from "resolved, not an admin" (show not-authorized) instead of
        // briefly treating an unresolved role as a rejection.
        if (s.user.id !== resolvedUserId.current) setIsLoading(true);
        const p = await fetchProfile(s.user.id);
        if (!active) return;
        resolvedUserId.current = s.user.id;
        setRole(p.role);
        setApprovalStatus(p.approvalStatus);
        if (p.error) {
          if (__DEV__) console.error('[auth] profile fetch error:', p.error);
          setProfileError("You're signed in, but we couldn't load your profile. Please try again.");
        } else {
          setProfileError(null);
        }
      } else {
        resolvedUserId.current = null;
        setRole(null);
        setApprovalStatus(null);
        setProfileError(null);
      }
      if (active) setIsLoading(false);
    }
    supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      applySession(s);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  function selectRole(r: Role) {
    setPendingRole(r);
  }

  async function signUp(v: SignUpValues): Promise<boolean> {
    setAuthError(null);
    const { error } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: { data: { full_name: v.fullName, phone: v.phone, role: pendingRole } },
    });
    if (error) {
      if (__DEV__) console.error('[auth] sign-up error:', error);
      setAuthError(mapAuthError(error));
      return false;
    }
    return true;
  }

  async function signIn(email: string, password: string): Promise<boolean> {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (__DEV__) console.error('[auth] sign-in error:', error);
      setAuthError(mapAuthError(error));
      return false;
    }
    return true;
  }

  async function signOut() {
    await supabase.auth.signOut();
    setPendingRole(null);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        role,
        approvalStatus,
        isLoading,
        pendingRole,
        signedIn: session != null,
        authError,
        profileError,
        selectRole,
        signUp,
        signIn,
        signOut,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/**
 * True once auth has RESOLVED to an authenticated admin.
 *
 * Protected admin screens gate their data fetches on this. Under the Phase 3D
 * navigator-stabilization fix the (admin-web) `<Slot/>` stays mounted through the
 * post-login "session set, role not yet resolved" window, so protected screens now
 * mount *before* authorization completes. Without a gate they would execute their
 * data effects during that window — racing tests and issuing admin fetches for a
 * not-yet-authorized (or non-admin) user. This hook lets a screen stay mounted (so
 * the native navigator is never destroyed) while staying idle until admin is
 * confirmed. It never fetches for a non-admin. See
 * docs/qa/PHASE-3E-PROTECTED-ROUTE-ACTIVATION.md.
 */
export function useAdminReady(): boolean {
  const { isLoading, role } = useAuth();
  return !isLoading && role === 'admin';
}
