import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { Role } from '@/constants/roles';
import { clearAuth, loadAuth, saveAuth } from '@/auth/auth-storage';

type AuthState = {
  role: Role | null;
  signedIn: boolean;
  isLoading: boolean;
  selectRole: (role: Role) => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadAuth().then((s) => {
      if (!active) return;
      setRole(s.role);
      setSignedIn(s.signedIn);
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function selectRole(r: Role) {
    setRole(r);
    setSignedIn(false);
    await saveAuth({ role: r, signedIn: false });
  }
  async function signIn() {
    setSignedIn(true);
    const current = await loadAuth();
    await saveAuth({ role: current.role, signedIn: true });
  }
  async function signOut() {
    setRole(null);
    setSignedIn(false);
    await clearAuth();
  }

  return (
    <AuthContext.Provider value={{ role, signedIn, isLoading, selectRole, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
