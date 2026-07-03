import {
  getMySavedAddresses,
  createSavedAddress,
  updateSavedAddress,
  deleteSavedAddress,
  setDefaultSavedAddress,
  touchSavedAddress,
  savedAddressToDraftLocation,
  draftToSavedAddressInput,
  type SavedAddress,
} from '@/lib/saved-addresses';

// ── Mock Supabase ──────────────────────────────────────────────────────────

const getUser = jest.fn();
const select = jest.fn();
const order = jest.fn();
const insert = jest.fn();
const insertSelect = jest.fn();
const insertSingle = jest.fn();
const update = jest.fn();
const updateEq = jest.fn();
const del = jest.fn();
const delEq = jest.fn();
const rpc = jest.fn();

// Note: variables used inside jest.mock() factory must be prefixed with "mock" (Jest rule).
const mockGetUser = getUser;
const mockSelect = select;
const mockOrder = order;
const mockInsert = insert;
const mockInsertSelect = insertSelect;
const mockInsertSingle = insertSingle;
const mockUpdate = update;
const mockUpdateEq = updateEq;
const mockDelete = del;
const mockDeleteEq = delEq;
const mockRpc = rpc;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: (_table: string) => ({
      // select returns whatever mockSelect returns (tests set this per-case via mockReturnValue)
      select: (...a: unknown[]) => mockSelect(...a),
      insert: (...a: unknown[]) => {
        mockInsert(...a);
        return {
          select: (...b: unknown[]) => {
            mockInsertSelect(...b);
            return {
              single: (...c: unknown[]) => mockInsertSingle(...c),
            };
          },
        };
      },
      update: (...a: unknown[]) => {
        mockUpdate(...a);
        return {
          eq: (...b: unknown[]) => mockUpdateEq(...b),
        };
      },
      delete: () => {
        mockDelete();
        return {
          eq: (...b: unknown[]) => mockDeleteEq(...b),
        };
      },
    }),
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Sample data ────────────────────────────────────────────────────────────

const SAMPLE_ADDRESS: SavedAddress = {
  id: 'addr-1',
  customer_id: 'user-1',
  label_type: 'home',
  nickname: 'My Home',
  address: '123 Main St',
  address_label: 'Home',
  latitude: 1.23,
  longitude: 4.56,
  building_name: 'Sunset Tower',
  floor: '3',
  door_number: '301',
  landmark: 'Near park',
  access_notes: 'Ring bell twice',
  is_default: true,
  last_used_at: '2026-01-01T00:00:00Z',
  created_at: '2025-12-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// ── getMySavedAddresses ────────────────────────────────────────────────────

describe('getMySavedAddresses', () => {
  it('calls select(*) with three orders and returns rows', async () => {
    // Build the chain: select → order1 → order2 → order3 (resolves)
    const order3 = jest.fn().mockResolvedValue({ data: [SAMPLE_ADDRESS], error: null });
    const order2 = jest.fn().mockReturnValue({ order: order3 });
    const order1 = jest.fn().mockReturnValue({ order: order2 });
    mockSelect.mockReturnValue({ order: order1 });

    const result = await getMySavedAddresses();
    expect(result).toEqual([SAMPLE_ADDRESS]);
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(order1).toHaveBeenCalledWith('is_default', { ascending: false });
    expect(order2).toHaveBeenCalledWith('last_used_at', { ascending: false, nullsFirst: false });
    expect(order3).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    const order3 = jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } });
    const order2 = jest.fn().mockReturnValue({ order: order3 });
    const order1 = jest.fn().mockReturnValue({ order: order2 });
    mockSelect.mockReturnValue({ order: order1 });

    const result = await getMySavedAddresses();
    expect(result).toEqual([]);
  });

  it('returns [] when data is null without error', async () => {
    const order3 = jest.fn().mockResolvedValue({ data: null, error: null });
    const order2 = jest.fn().mockReturnValue({ order: order3 });
    const order1 = jest.fn().mockReturnValue({ order: order2 });
    mockSelect.mockReturnValue({ order: order1 });

    const result = await getMySavedAddresses();
    expect(result).toEqual([]);
  });
});

// ── createSavedAddress ─────────────────────────────────────────────────────

describe('createSavedAddress', () => {
  it('inserts with customer_id from auth, defaults label_type and is_default', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    insertSingle.mockResolvedValue({ data: { id: 'addr-new' }, error: null });

    const res = await createSavedAddress({ address: '123 Main St' });

    expect(res).toEqual({ ok: true, id: 'addr-new' });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_id: 'user-1',
        address: '123 Main St',
        label_type: 'other',
        is_default: false,
      }),
    );
    // Ensure customer_id is NOT passed in by caller (it comes from auth)
    expect(mockInsert).not.toHaveBeenCalledWith(expect.objectContaining({ customer_id: undefined }));
  });

  it('uses provided label_type and is_default', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    insertSingle.mockResolvedValue({ data: { id: 'addr-new' }, error: null });

    await createSavedAddress({ address: '456 Work Ave', label_type: 'work', is_default: true });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ label_type: 'work', is_default: true }),
    );
  });

  it('returns { ok: false } when not signed in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const res = await createSavedAddress({ address: '123 Main St' });
    expect(res).toEqual({ ok: false, error: 'You must be signed in.' });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('returns { ok: false } on DB error', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    insertSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const res = await createSavedAddress({ address: '123 Main St' });
    expect(res).toEqual({ ok: false, error: 'Could not save address. Please try again.' });
  });

  it('nullifies missing optional fields', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    insertSingle.mockResolvedValue({ data: { id: 'addr-new' }, error: null });

    await createSavedAddress({ address: '123 Main St' });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        nickname: null,
        address_label: null,
        latitude: null,
        longitude: null,
        building_name: null,
        floor: null,
        door_number: null,
        landmark: null,
        access_notes: null,
      }),
    );
  });
});

// ── updateSavedAddress ─────────────────────────────────────────────────────

describe('updateSavedAddress', () => {
  it('calls update with patch + updated_at and .eq(id)', async () => {
    updateEq.mockResolvedValue({ error: null });

    const res = await updateSavedAddress('addr-1', { address: 'New Address' });
    expect(res).toEqual({ ok: true });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ address: 'New Address', updated_at: expect.any(String) }),
    );
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'addr-1');
  });

  it('returns { ok: false } on error', async () => {
    updateEq.mockResolvedValue({ error: { message: 'DB error' } });

    const res = await updateSavedAddress('addr-1', { address: 'New Address' });
    expect(res).toEqual({ ok: false, error: 'Could not update address.' });
  });
});

// ── deleteSavedAddress ─────────────────────────────────────────────────────

describe('deleteSavedAddress', () => {
  it('calls delete + .eq(id) and returns ok', async () => {
    delEq.mockResolvedValue({ error: null });

    const res = await deleteSavedAddress('addr-1');
    expect(res).toEqual({ ok: true });
    expect(mockDelete).toHaveBeenCalled();
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'addr-1');
  });

  it('returns { ok: false } on error', async () => {
    delEq.mockResolvedValue({ error: { message: 'DB error' } });

    const res = await deleteSavedAddress('addr-1');
    expect(res).toEqual({ ok: false, error: 'Could not delete address.' });
  });
});

// ── setDefaultSavedAddress ─────────────────────────────────────────────────

describe('setDefaultSavedAddress', () => {
  it('calls rpc set_default_address with p_address_id and returns ok', async () => {
    rpc.mockResolvedValue({ error: null });

    const res = await setDefaultSavedAddress('addr-1');
    expect(res).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('set_default_address', { p_address_id: 'addr-1' });
  });

  it('returns { ok: false } on error', async () => {
    rpc.mockResolvedValue({ error: { message: 'DB error' } });

    const res = await setDefaultSavedAddress('addr-1');
    expect(res).toEqual({ ok: false, error: 'Could not set default address.' });
  });
});

// ── touchSavedAddress ─────────────────────────────────────────────────────

describe('touchSavedAddress', () => {
  it('calls rpc touch_saved_address with p_address_id and returns ok', async () => {
    rpc.mockResolvedValue({ error: null });

    const res = await touchSavedAddress('addr-1');
    expect(res).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('touch_saved_address', { p_address_id: 'addr-1' });
  });

  it('returns { ok: false } on error', async () => {
    rpc.mockResolvedValue({ error: { message: 'DB error' } });

    const res = await touchSavedAddress('addr-1');
    expect(res).toEqual({ ok: false, error: 'Could not update address.' });
  });
});

// ── savedAddressToDraftLocation ────────────────────────────────────────────

describe('savedAddressToDraftLocation', () => {
  it('maps address fields correctly, keeping coords as number | null', () => {
    const result = savedAddressToDraftLocation(SAMPLE_ADDRESS);
    expect(result.location).toEqual({
      address: '123 Main St',
      address_label: 'Home',
      latitude: 1.23,
      longitude: 4.56,
    });
    expect(result.apartment).toEqual({
      building_name: 'Sunset Tower',
      floor: '3',
      door_number: '301',
      landmark: 'Near park',
      access_notes: 'Ring bell twice',
    });
  });

  it('converts null text fields to empty strings', () => {
    const nullish: SavedAddress = {
      ...SAMPLE_ADDRESS,
      address_label: null,
      building_name: null,
      floor: null,
      door_number: null,
      landmark: null,
      access_notes: null,
    };
    const result = savedAddressToDraftLocation(nullish);
    expect(result.location.address_label).toBe('');
    expect(result.apartment.building_name).toBe('');
    expect(result.apartment.floor).toBe('');
    expect(result.apartment.door_number).toBe('');
    expect(result.apartment.landmark).toBe('');
    expect(result.apartment.access_notes).toBe('');
  });

  it('keeps null coords as null', () => {
    const noCoords: SavedAddress = { ...SAMPLE_ADDRESS, latitude: null, longitude: null };
    const result = savedAddressToDraftLocation(noCoords);
    expect(result.location.latitude).toBeNull();
    expect(result.location.longitude).toBeNull();
  });

  it('preserves address string as-is', () => {
    const result = savedAddressToDraftLocation(SAMPLE_ADDRESS);
    expect(result.location.address).toBe('123 Main St');
  });
});

// ── draftToSavedAddressInput ───────────────────────────────────────────────

describe('draftToSavedAddressInput', () => {
  const FULL_DRAFT = {
    address: '123 Main St',
    address_label: 'Home',
    latitude: 1.23,
    longitude: 4.56,
    building_name: 'Sunset Tower',
    floor: '3',
    door_number: '301',
    landmark: 'Near park',
    access_notes: 'Ring bell twice',
  };

  it('maps full draft correctly with meta', () => {
    const result = draftToSavedAddressInput(FULL_DRAFT, {
      label_type: 'home',
      nickname: 'My Home',
      is_default: true,
    });
    expect(result).toEqual({
      address: '123 Main St',
      address_label: 'Home',
      latitude: 1.23,
      longitude: 4.56,
      building_name: 'Sunset Tower',
      floor: '3',
      door_number: '301',
      landmark: 'Near park',
      access_notes: 'Ring bell twice',
      nickname: 'My Home',
      label_type: 'home',
      is_default: true,
    });
  });

  it('converts empty strings to null for optional text fields', () => {
    const emptyDraft = {
      address: '123 Main St',
      address_label: '',
      latitude: null,
      longitude: null,
      building_name: '',
      floor: '',
      door_number: '',
      landmark: '',
      access_notes: '',
    };
    const result = draftToSavedAddressInput(emptyDraft, {});
    expect(result.address_label).toBeNull();
    expect(result.building_name).toBeNull();
    expect(result.floor).toBeNull();
    expect(result.door_number).toBeNull();
    expect(result.landmark).toBeNull();
    expect(result.access_notes).toBeNull();
  });

  it('applies default label_type (other) and is_default (false) when omitted', () => {
    const result = draftToSavedAddressInput(FULL_DRAFT, {});
    expect(result.label_type).toBe('other');
    expect(result.is_default).toBe(false);
  });

  it('converts empty nickname to null', () => {
    const result = draftToSavedAddressInput(FULL_DRAFT, { nickname: '' });
    expect(result.nickname).toBeNull();
  });

  it('converts null nickname to null', () => {
    const result = draftToSavedAddressInput(FULL_DRAFT, { nickname: null });
    expect(result.nickname).toBeNull();
  });

  it('keeps coords as null when null', () => {
    const result = draftToSavedAddressInput({ ...FULL_DRAFT, latitude: null, longitude: null }, {});
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
  });

  it('keeps coords when set', () => {
    const result = draftToSavedAddressInput(FULL_DRAFT, {});
    expect(result.latitude).toBe(1.23);
    expect(result.longitude).toBe(4.56);
  });
});
