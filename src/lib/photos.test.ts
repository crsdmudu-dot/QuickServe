import {
  uploadBookingPhoto,
  getBookingPhotos,
  deleteBookingPhoto,
  setPhotoVerified,
} from '@/lib/photos';

// ── Mock globals ───────────────────────────────────────────────────────────

// Mock fetch so uploadBookingPhoto can read file bytes without a real network call
globalThis.fetch = jest.fn().mockResolvedValue({
  arrayBuffer: async () => new ArrayBuffer(8),
}) as unknown as typeof fetch;

// ── Mock Supabase ──────────────────────────────────────────────────────────

const getUser = jest.fn();
const insert = jest.fn();
const order = jest.fn();
const del = jest.fn();
const delEq = jest.fn();
const update = jest.fn();
const updateEq = jest.fn();
const upload = jest.fn();
const createSignedUrl = jest.fn();
const remove = jest.fn();
const storageFrom = jest.fn();

// Note: variables used inside jest.mock() factory must be prefixed with "mock" (Jest rule).
// We define them above and alias here with the required prefix for the factory.
const mockGetUser = getUser;
const mockInsert = insert;
const mockOrder = order;
const mockDel = del;
const mockUpdate = update;
const mockUpload = upload;
const mockCreateSignedUrl = createSignedUrl;
const mockRemove = remove;
const mockStorageFrom = storageFrom;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: (table: string) => {
      if (table === 'booking_photos') {
        return {
          insert: (...a: unknown[]) => mockInsert(...a),
          select: () => ({
            eq: () => ({
              order: (...a: unknown[]) => mockOrder(...a),
            }),
          }),
          delete: (...a: unknown[]) => mockDel(...a),
          update: (...a: unknown[]) => mockUpdate(...a),
        };
      }
      return {};
    },
    storage: {
      from: (...a: unknown[]) => {
        mockStorageFrom(...a);
        return {
          upload: (...a: unknown[]) => mockUpload(...a),
          createSignedUrl: (...a: unknown[]) => mockCreateSignedUrl(...a),
          remove: (...a: unknown[]) => mockRemove(...a),
        };
      },
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  // Restore fetch mock after clearAllMocks
  (globalThis.fetch as jest.Mock).mockResolvedValue({
    arrayBuffer: async () => new ArrayBuffer(8),
  });
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('uploadBookingPhoto', () => {
  it('fails when signed out', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await uploadBookingPhoto({ bookingId: 'bk1', uri: 'file://p.jpg', photoType: 'issue' });
    expect(res).toEqual({ ok: false, error: 'You must be signed in to upload photos.' });
  });

  it('uploads then inserts a row', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    upload.mockResolvedValue({ data: { path: 'x' }, error: null });
    insert.mockResolvedValue({ error: null });
    const res = await uploadBookingPhoto({ bookingId: 'bk1', uri: 'file://p.jpg', photoType: 'issue' });
    expect(res).toEqual({ ok: true });
    expect(storageFrom).toHaveBeenCalledWith('booking-photos');
    const insertedRow = insert.mock.calls[0][0];
    expect(insertedRow).toMatchObject({ booking_id: 'bk1', uploaded_by: 'u1', photo_type: 'issue' });
    expect(insertedRow.photo_url.startsWith('bk1/')).toBe(true);
  });

  it('returns error when upload fails', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    upload.mockResolvedValue({ data: null, error: { message: 'upload failed' } });
    const res = await uploadBookingPhoto({ bookingId: 'bk1', uri: 'file://p.jpg', photoType: 'before' });
    expect(res).toEqual({ ok: false, error: 'Could not upload photo. Please try again.' });
  });
});

describe('getBookingPhotos', () => {
  it('attaches a signed url per row', async () => {
    order.mockResolvedValue({ data: [{ id: 'p1', photo_url: 'bk1/a.jpg', photo_type: 'issue', is_verified: false }], error: null });
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/a' }, error: null });
    const rows = await getBookingPhotos('bk1');
    expect(rows[0].signedUrl).toBe('https://signed/a');
  });

  it('sets signedUrl to null when signed url creation fails', async () => {
    order.mockResolvedValue({ data: [{ id: 'p1', photo_url: 'bk1/a.jpg', photo_type: 'issue', is_verified: false }], error: null });
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'failed' } });
    const rows = await getBookingPhotos('bk1');
    expect(rows[0].signedUrl).toBeNull();
  });

  it('returns [] on query error', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'oops' } });
    const rows = await getBookingPhotos('bk1');
    expect(rows).toEqual([]);
  });
});

describe('deleteBookingPhoto', () => {
  it('removes the object then the row', async () => {
    remove.mockResolvedValue({ data: {}, error: null });
    del.mockReturnValue({ eq: (...a: unknown[]) => delEq(...a) });
    delEq.mockResolvedValue({ error: null });
    expect(await deleteBookingPhoto({ id: 'p1', photo_url: 'bk1/a.jpg' })).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith(['bk1/a.jpg']);
  });

  it('returns error when remove fails', async () => {
    remove.mockResolvedValue({ data: null, error: { message: 'remove failed' } });
    const res = await deleteBookingPhoto({ id: 'p1', photo_url: 'bk1/a.jpg' });
    expect(res).toEqual({ ok: false, error: 'Could not delete photo file. Please try again.' });
  });
});

describe('setPhotoVerified', () => {
  it('updates the row', async () => {
    update.mockReturnValue({ eq: (...a: unknown[]) => updateEq(...a) });
    updateEq.mockResolvedValue({ error: null });
    expect(await setPhotoVerified('p1', true)).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ is_verified: true });
  });

  it('returns error when update fails', async () => {
    update.mockReturnValue({ eq: (...a: unknown[]) => updateEq(...a) });
    updateEq.mockResolvedValue({ error: { message: 'update failed' } });
    const res = await setPhotoVerified('p1', false);
    expect(res).toEqual({ ok: false, error: 'Could not update photo. Please try again.' });
  });
});
