import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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
  selectRole: (role: Role) => void;
  signUp: (v: SignUpValues) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

type ProfileInfo = { role: Role | null; approvalStatus: ApprovalStatus | null };

async function fetchProfile(userId: string): Promise<ProfileInfo> {
  const { data } = await supabase
    .from('profiles')
    .select('role, approval_status')
    .eq('id', userId)
    .single();
  return {
    role: (data?.role as Role | undefined) ?? null,
    approvalStatus: (data?.approval_status as ApprovalStatus | undefined) ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function applySession(s: Session | null) {
      if (!active) return;
      setSession(s);
      if (s) {
        const p = await fetchProfile(s.user.id);
        if (!active) return;
        setRole(p.role);
        setApprovalStatus(p.approvalStatus);
      } else {
        setRole(null);
        setApprovalStatus(null);
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
      setAuthError(mapAuthError(error));
      return false;
    }
    return true;
  }

  async function signIn(email: string, password: string): Promise<boolean> {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
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
