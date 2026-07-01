import { renderHook } from '@testing-library/react-native';

// Mock auth context before importing the hook.
const mockUseAuth = jest.fn();
jest.mock('@/auth/auth-context', () => ({ useAuth: () => mockUseAuth() }));

import { useAdminGuard } from '@/hooks/use-admin-guard';

describe('useAdminGuard', () => {
  it('returns isAdmin true when role is admin', () => {
    mockUseAuth.mockReturnValue({ session: { user: { id: 'u1' } }, role: 'admin', isLoading: false });
    const { result } = renderHook(() => useAdminGuard());
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.session).toBeTruthy();
  });

  it('returns isAdmin false when role is customer', () => {
    mockUseAuth.mockReturnValue({ session: { user: { id: 'u2' } }, role: 'customer', isLoading: false });
    const { result } = renderHook(() => useAdminGuard());
    expect(result.current.isAdmin).toBe(false);
  });

  it('returns isAdmin false when role is provider', () => {
    mockUseAuth.mockReturnValue({ session: { user: { id: 'u3' } }, role: 'provider', isLoading: false });
    const { result } = renderHook(() => useAdminGuard());
    expect(result.current.isAdmin).toBe(false);
  });

  it('returns loading true when isLoading is true and no session', () => {
    mockUseAuth.mockReturnValue({ session: null, role: null, isLoading: true });
    const { result } = renderHook(() => useAdminGuard());
    expect(result.current.loading).toBe(true);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.session).toBeNull();
  });

  it('returns isAdmin false when no session and not loading', () => {
    mockUseAuth.mockReturnValue({ session: null, role: null, isLoading: false });
    const { result } = renderHook(() => useAdminGuard());
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.loading).toBe(false);
  });
});
