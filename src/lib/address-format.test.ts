import { formatDestination } from '@/lib/address-format';

describe('formatDestination', () => {
  it('structured (full): all fields → primary = label; lines has all 5 entries in order', () => {
    const result = formatDestination({
      address: '123 Riverside Dr, Nairobi',
      address_label: 'Home',
      building_name: 'Riverside Towers',
      floor: '4th Floor',
      door_number: 'Apt 401',
      landmark: 'Near Java House',
      access_notes: 'Ring bell twice',
    });
    expect(result.primary).toBe('Home');
    expect(result.lines).toEqual([
      'Building: Riverside Towers',
      'Floor: 4th Floor',
      'Door/Unit: Apt 401',
      'Landmark: Near Java House',
      'Access: Ring bell twice',
    ]);
  });

  it('partial apartment details: only building_name + door_number → 2 lines only', () => {
    const result = formatDestination({
      address: '456 Mombasa Rd, Nairobi',
      address_label: 'Office',
      building_name: 'Mombasa Plaza',
      door_number: 'Suite 10',
    });
    expect(result.primary).toBe('Office');
    expect(result.lines).toEqual([
      'Building: Mombasa Plaza',
      'Door/Unit: Suite 10',
    ]);
  });

  it('fallback old address: only address set → primary = address; lines = []', () => {
    const result = formatDestination({
      address: '123 Riverside Dr, Nairobi',
    });
    expect(result.primary).toBe('123 Riverside Dr, Nairobi');
    expect(result.lines).toEqual([]);
  });

  it('empty optional fields: blank/null structured fields are skipped; primary falls back to address', () => {
    const result = formatDestination({
      address: '789 Karen Rd, Nairobi',
      address_label: null,
      building_name: '  ',
      floor: '',
      door_number: null,
    });
    expect(result.primary).toBe('789 Karen Rd, Nairobi');
    expect(result.lines).toEqual([]);
  });

  it('edge: address_label set but blank → primary falls back to address', () => {
    const result = formatDestination({
      address: '10 Ngong Ave, Nairobi',
      address_label: '   ',
      building_name: 'Ngong Suites',
    });
    expect(result.primary).toBe('10 Ngong Ave, Nairobi');
    expect(result.lines).toEqual(['Building: Ngong Suites']);
  });
});
