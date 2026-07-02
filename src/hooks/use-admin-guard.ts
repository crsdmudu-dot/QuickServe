import { useAuth } from '@/auth/auth-context';

/**
 * Thin guard hook that derives admin access from the shared auth context.
 * No extra DB query — role is already fetched by AuthProvider on sign-in.
 */
export function useAdminGuard(): { loading: boolean; session: unknown; isAdmin: boolean } {
  const { session, role, isLoading } = useAuth();
  return { loading: isLoading, session, isAdmin: role === 'admin' };
}
