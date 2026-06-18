import { ROLES, roleHref, type Role } from '@/constants/roles';

describe('roles', () => {
  it('defines exactly three roles with unique ids', () => {
    expect(ROLES).toHaveLength(3);
    const ids = ROLES.map((r) => r.id);
    expect(new Set(ids)).toEqual(new Set<Role>(['customer', 'provider', 'admin']));
  });
  it('every role has a label, description, and icon', () => {
    for (const r of ROLES) {
      expect(r.label).toBeTruthy();
      expect(r.description).toBeTruthy();
      expect(r.icon).toBeTruthy();
    }
  });
  it('maps each role to its app path', () => {
    expect(roleHref('customer')).toBe('/');
    expect(roleHref('provider')).toBe('/provider');
    expect(roleHref('admin')).toBe('/admin');
  });
});
