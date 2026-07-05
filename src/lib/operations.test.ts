import {
  getSupportCases,
  getSupportCase,
  getSupportCaseNotes,
  getSupportCaseEvents,
  getInternalNotes,
  getAccountFlags,
  getCaseEvidence,
  createSupportCase,
  updateSupportCaseStatus,
  updateSupportCasePriority,
  assignSupportCase,
  setDisputeOutcome,
  addSupportCaseNote,
  addInternalNote,
  flagAccount,
  liftAccountFlag,
} from '@/lib/operations';

// ── Mock fns (must be prefixed "mock" for jest.mock factory rule) ──────────

const mockGetUser = jest.fn();
const mockRpc = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockIn = jest.fn();
const mockOrder = jest.fn();
const mockRange = jest.fn();
const mockMaybeSingle = jest.fn();

// Per-table response registry — set per-test via setTableResult()
const mockTableResults: Record<string, unknown> = {};

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (table: string) => {
      // terminal: resolves the value stored in mockTableResults[table]
      const resolve = () =>
        Promise.resolve(mockTableResults[table] ?? { data: null, error: null });

      // Build a fluent node: thenable + every chainable method.
      // Each method records the call and returns a new node (same shape).
      function node(): Record<string, unknown> & PromiseLike<unknown> {
        return {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          then: (res?: any, rej?: any) => resolve().then(res, rej),
          select: (...a: unknown[]) => { mockSelect(...a); return node(); },
          eq: (...a: unknown[]) => { mockEq(...a); return node(); },
          in: (...a: unknown[]) => { mockIn(...a); return node(); },
          order: (...a: unknown[]) => {
            mockOrder(...a);
            const n = node();
            // attach .range for pagination callers
            (n as Record<string, unknown>).range =
              (...b: unknown[]) => { mockRange(...b); return resolve(); };
            return n;
          },
          range: (...a: unknown[]) => { mockRange(...a); return resolve(); },
          maybeSingle: (...a: unknown[]) => { mockMaybeSingle(...a); return resolve(); },
        };
      }
      void table; // suppress unused-var lint
      return node();
    },
  },
}));

/** Helper: configure the supabase response for a given table. */
function setTableResult(table: string, value: unknown) {
  mockTableResults[table] = value;
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockTableResults)) delete mockTableResults[k];
});

// ── getSupportCases ────────────────────────────────────────────────────────

describe('getSupportCases', () => {
  it('returns rows newest-first when no filter', async () => {
    const rows = [{ id: 'c1' }, { id: 'c2' }];
    setTableResult('support_cases', { data: rows, error: null });

    const result = await getSupportCases();

    expect(result).toEqual(rows);
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    setTableResult('support_cases', { data: null, error: { message: 'db error' } });
    expect(await getSupportCases()).toEqual([]);
  });

  it('filter=open: calls .eq("status", "open")', async () => {
    setTableResult('support_cases', { data: [], error: null });
    await getSupportCases('open');
    expect(mockEq).toHaveBeenCalledWith('status', 'open');
  });

  it('filter=urgent: calls .eq("priority", "urgent")', async () => {
    setTableResult('support_cases', { data: [], error: null });
    await getSupportCases('urgent');
    expect(mockEq).toHaveBeenCalledWith('priority', 'urgent');
  });

  it('filter=assigned_to_me: resolves uid then calls .eq("assigned_to", uid)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-uid' } } });
    setTableResult('support_cases', { data: [], error: null });
    await getSupportCases('assigned_to_me');
    expect(mockGetUser).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith('assigned_to', 'admin-uid');
  });

  it('filter=assigned_to_me: returns [] when no uid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const result = await getSupportCases('assigned_to_me');
    expect(result).toEqual([]);
  });

  it('filter=unresolved: calls .in("status", UNRESOLVED_STATUSES)', async () => {
    setTableResult('support_cases', { data: [], error: null });
    await getSupportCases('unresolved');
    expect(mockIn).toHaveBeenCalledWith(
      'status',
      ['open', 'in_review', 'waiting_on_customer', 'waiting_on_provider'],
    );
  });

  it('filter=disputes: calls .eq("case_type", "dispute")', async () => {
    setTableResult('support_cases', { data: [], error: null });
    await getSupportCases('disputes');
    expect(mockEq).toHaveBeenCalledWith('case_type', 'dispute');
  });

  it('applies .range(10, 19) when page=1, pageSize=10', async () => {
    setTableResult('support_cases', { data: [], error: null });
    await getSupportCases(undefined, 1, 10);
    expect(mockRange).toHaveBeenCalledWith(10, 19);
  });

  it('does NOT call .range when no pagination args', async () => {
    setTableResult('support_cases', { data: [], error: null });
    await getSupportCases();
    expect(mockRange).not.toHaveBeenCalled();
  });
});

// ── getSupportCase ─────────────────────────────────────────────────────────

describe('getSupportCase', () => {
  it('returns the case when found', async () => {
    const c = { id: 'c1', subject: 'Broken tap' };
    setTableResult('support_cases', { data: c, error: null });
    const result = await getSupportCase('c1');
    expect(result).toEqual(c);
    expect(mockEq).toHaveBeenCalledWith('id', 'c1');
    expect(mockMaybeSingle).toHaveBeenCalled();
  });

  it('returns null on error', async () => {
    setTableResult('support_cases', { data: null, error: { message: 'not found' } });
    expect(await getSupportCase('c1')).toBeNull();
  });

  it('returns null when data is null and no error', async () => {
    setTableResult('support_cases', { data: null, error: null });
    expect(await getSupportCase('c1')).toBeNull();
  });
});

// ── getSupportCaseNotes ────────────────────────────────────────────────────

describe('getSupportCaseNotes', () => {
  it('returns notes oldest-first', async () => {
    const notes = [{ id: 'n1', body: 'first' }, { id: 'n2', body: 'second' }];
    setTableResult('support_case_notes', { data: notes, error: null });
    const result = await getSupportCaseNotes('c1');
    expect(result).toEqual(notes);
    expect(mockEq).toHaveBeenCalledWith('case_id', 'c1');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('returns [] on error', async () => {
    setTableResult('support_case_notes', { data: null, error: { message: 'err' } });
    expect(await getSupportCaseNotes('c1')).toEqual([]);
  });
});

// ── getSupportCaseEvents ───────────────────────────────────────────────────

describe('getSupportCaseEvents', () => {
  it('returns events oldest-first', async () => {
    const events = [{ id: 'e1', event_type: 'created' }];
    setTableResult('support_case_events', { data: events, error: null });
    const result = await getSupportCaseEvents('c1');
    expect(result).toEqual(events);
    expect(mockEq).toHaveBeenCalledWith('case_id', 'c1');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('returns [] on error', async () => {
    setTableResult('support_case_events', { data: null, error: { message: 'err' } });
    expect(await getSupportCaseEvents('c1')).toEqual([]);
  });
});

// ── getInternalNotes ───────────────────────────────────────────────────────

describe('getInternalNotes', () => {
  it('returns notes newest-first filtered by subject type and id', async () => {
    const notes = [{ id: 'n1', body: 'note' }];
    setTableResult('internal_notes', { data: notes, error: null });
    const result = await getInternalNotes('booking', 'bk-1');
    expect(result).toEqual(notes);
    expect(mockEq).toHaveBeenCalledWith('subject_type', 'booking');
    expect(mockEq).toHaveBeenCalledWith('subject_id', 'bk-1');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    setTableResult('internal_notes', { data: null, error: { message: 'err' } });
    expect(await getInternalNotes('customer', 'u1')).toEqual([]);
  });
});

// ── getAccountFlags ────────────────────────────────────────────────────────

describe('getAccountFlags', () => {
  it('returns flags newest-first for subject', async () => {
    const flags = [{ id: 'f1', kind: 'flag' }];
    setTableResult('account_flags', { data: flags, error: null });
    const result = await getAccountFlags('u1');
    expect(result).toEqual(flags);
    expect(mockEq).toHaveBeenCalledWith('subject_id', 'u1');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns [] on error', async () => {
    setTableResult('account_flags', { data: null, error: { message: 'err' } });
    expect(await getAccountFlags('u1')).toEqual([]);
  });
});

// ── getCaseEvidence ────────────────────────────────────────────────────────

describe('getCaseEvidence', () => {
  it('returns [] when case is not found (maybeSingle returns null)', async () => {
    setTableResult('support_cases', { data: null, error: null });
    expect(await getCaseEvidence('c-missing')).toEqual([]);
  });

  it('returns [] when case has no booking_id or payment_id', async () => {
    setTableResult('support_cases', { data: { id: 'c1', booking_id: null, payment_id: null }, error: null });
    const result = await getCaseEvidence('c1');
    expect(result).toEqual([]);
  });

  it('returns photo links when booking has photos', async () => {
    setTableResult('support_cases', {
      data: { id: 'c1', booking_id: 'bk1', payment_id: null },
      error: null,
    });
    setTableResult('booking_photos', {
      data: [{ id: 'p1', photo_type: 'before', photo_url: 'url1' }],
      error: null,
    });
    setTableResult('booking_messages', { data: [], error: null });
    setTableResult('reviews', { data: [], error: null });

    const result = await getCaseEvidence('c1');
    const photoLinks = result.filter((l) => l.kind === 'photo');
    expect(photoLinks).toHaveLength(1);
    expect(photoLinks[0].ref).toBe('p1');
    expect(photoLinks[0].label).toContain('before');
  });

  it('returns payment_attempt links when case has payment_id', async () => {
    setTableResult('support_cases', {
      data: { id: 'c2', booking_id: null, payment_id: 'pm1' },
      error: null,
    });
    setTableResult('payment_attempts', {
      data: [{ id: 'a1', provider: 'mpesa', status: 'successful', amount: 500 }],
      error: null,
    });

    const result = await getCaseEvidence('c2');
    const attemptLinks = result.filter((l) => l.kind === 'payment_attempt');
    expect(attemptLinks).toHaveLength(1);
    expect(attemptLinks[0].ref).toBe('a1');
    expect(attemptLinks[0].label).toContain('mpesa');
  });

  it('returns review links when booking has a review', async () => {
    setTableResult('support_cases', {
      data: { id: 'c3', booking_id: 'bk3', payment_id: null },
      error: null,
    });
    setTableResult('booking_photos', { data: [], error: null });
    setTableResult('booking_messages', { data: [], error: null });
    setTableResult('reviews', {
      data: [{ id: 'rv1', rating: 4, comment: 'Good service' }],
      error: null,
    });

    const result = await getCaseEvidence('c3');
    const reviewLinks = result.filter((l) => l.kind === 'review');
    expect(reviewLinks).toHaveLength(1);
    expect(reviewLinks[0].ref).toBe('rv1');
    expect(reviewLinks[0].label).toContain('4/5');
  });

  it('returns [] on case fetch error (never throws)', async () => {
    setTableResult('support_cases', { data: null, error: { message: 'db crash' } });
    expect(await getCaseEvidence('c1')).toEqual([]);
  });
});

// ── createSupportCase ──────────────────────────────────────────────────────

describe('createSupportCase', () => {
  it('calls create_support_case with exact p_ param names and returns { ok: true, id }', async () => {
    mockRpc.mockResolvedValue({ data: 'new-case-id', error: null });

    const result = await createSupportCase({
      caseType: 'dispute',
      priority: 'high',
      subject: 'Payment not received',
      description: 'Details here',
      bookingId: 'bk1',
      customerId: 'cu1',
      providerId: 'pr1',
      paymentId: 'pm1',
      reviewId: 'rv1',
      disputeKind: 'payment_dispute',
    });

    expect(result).toEqual({ ok: true, id: 'new-case-id' });
    expect(mockRpc).toHaveBeenCalledWith('create_support_case', {
      p_case_type:    'dispute',
      p_priority:     'high',
      p_subject:      'Payment not received',
      p_description:  'Details here',
      p_booking_id:   'bk1',
      p_customer_id:  'cu1',
      p_provider_id:  'pr1',
      p_payment_id:   'pm1',
      p_review_id:    'rv1',
      p_dispute_kind: 'payment_dispute',
    });
  });

  it('sends nulls for all omitted optional fields', async () => {
    mockRpc.mockResolvedValue({ data: 'id2', error: null });
    await createSupportCase({ subject: 'Minimal case' });
    expect(mockRpc).toHaveBeenCalledWith('create_support_case', {
      p_case_type:    null,
      p_priority:     null,
      p_subject:      'Minimal case',
      p_description:  null,
      p_booking_id:   null,
      p_customer_id:  null,
      p_provider_id:  null,
      p_payment_id:   null,
      p_review_id:    null,
      p_dispute_kind: null,
    });
  });

  it('returns { ok: false, error } on rpc failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc error' } });
    expect(await createSupportCase({ subject: 'Test' })).toEqual({
      ok: false,
      error: 'Could not create support case.',
    });
  });
});

// ── updateSupportCaseStatus ────────────────────────────────────────────────

describe('updateSupportCaseStatus', () => {
  it('calls update_support_case_status with correct p_ params', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const result = await updateSupportCaseStatus('c1', 'resolved');
    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('update_support_case_status', {
      p_case_id: 'c1',
      p_status:  'resolved',
    });
  });

  it('returns { ok: false, error } on failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    expect(await updateSupportCaseStatus('c1', 'closed')).toEqual({
      ok: false,
      error: 'Could not update case status.',
    });
  });
});

// ── updateSupportCasePriority ──────────────────────────────────────────────

describe('updateSupportCasePriority', () => {
  it('calls update_support_case_priority with correct p_ params', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const result = await updateSupportCasePriority('c1', 'urgent');
    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('update_support_case_priority', {
      p_case_id:  'c1',
      p_priority: 'urgent',
    });
  });

  it('returns { ok: false, error } on failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    expect(await updateSupportCasePriority('c1', 'low')).toEqual({
      ok: false,
      error: 'Could not update case priority.',
    });
  });
});

// ── assignSupportCase ──────────────────────────────────────────────────────

describe('assignSupportCase', () => {
  it('calls assign_support_case with correct p_ params', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const result = await assignSupportCase('c1', 'admin-uid');
    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('assign_support_case', {
      p_case_id:  'c1',
      p_assignee: 'admin-uid',
    });
  });

  it('passes null to unassign', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await assignSupportCase('c1', null);
    expect(mockRpc).toHaveBeenCalledWith('assign_support_case', {
      p_case_id:  'c1',
      p_assignee: null,
    });
  });

  it('returns { ok: false, error } on failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    expect(await assignSupportCase('c1', null)).toEqual({
      ok: false,
      error: 'Could not assign support case.',
    });
  });
});

// ── setDisputeOutcome ──────────────────────────────────────────────────────

describe('setDisputeOutcome', () => {
  it('calls set_dispute_outcome with correct p_ params', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const result = await setDisputeOutcome('c1', 'refund_recommended', 'Full refund approved');
    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('set_dispute_outcome', {
      p_case_id:          'c1',
      p_outcome:          'refund_recommended',
      p_resolution_notes: 'Full refund approved',
    });
  });

  it('sends null for resolutionNotes when omitted', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await setDisputeOutcome('c1', 'no_action');
    expect(mockRpc).toHaveBeenCalledWith('set_dispute_outcome', {
      p_case_id:          'c1',
      p_outcome:          'no_action',
      p_resolution_notes: null,
    });
  });

  it('returns { ok: false, error } on failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    expect(await setDisputeOutcome('c1', 'no_action')).toEqual({
      ok: false,
      error: 'Could not set dispute outcome.',
    });
  });
});

// ── addSupportCaseNote ─────────────────────────────────────────────────────

describe('addSupportCaseNote', () => {
  it('calls add_support_case_note with correct p_ params', async () => {
    mockRpc.mockResolvedValue({ data: 'note-id', error: null });
    const result = await addSupportCaseNote('c1', 'Internal note body', 'internal');
    expect(result).toEqual({ ok: true, id: 'note-id' });
    expect(mockRpc).toHaveBeenCalledWith('add_support_case_note', {
      p_case_id:   'c1',
      p_body:      'Internal note body',
      p_note_type: 'internal',
    });
  });

  it('defaults noteType to "internal"', async () => {
    mockRpc.mockResolvedValue({ data: 'n2', error: null });
    await addSupportCaseNote('c1', 'Auto-internal');
    expect(mockRpc).toHaveBeenCalledWith('add_support_case_note', expect.objectContaining({
      p_note_type: 'internal',
    }));
  });

  it('accepts "resolution" note type', async () => {
    mockRpc.mockResolvedValue({ data: 'n3', error: null });
    await addSupportCaseNote('c1', 'Resolution note', 'resolution');
    expect(mockRpc).toHaveBeenCalledWith('add_support_case_note', expect.objectContaining({
      p_note_type: 'resolution',
    }));
  });

  it('returns { ok: false, error } on failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    expect(await addSupportCaseNote('c1', 'body')).toEqual({
      ok: false,
      error: 'Could not add case note.',
    });
  });
});

// ── addInternalNote ────────────────────────────────────────────────────────

describe('addInternalNote', () => {
  it('calls add_internal_note with correct p_ params', async () => {
    mockRpc.mockResolvedValue({ data: 'int-note-id', error: null });
    const result = await addInternalNote('customer', 'u1', 'Note about customer');
    expect(result).toEqual({ ok: true, id: 'int-note-id' });
    expect(mockRpc).toHaveBeenCalledWith('add_internal_note', {
      p_subject_type: 'customer',
      p_subject_id:   'u1',
      p_body:         'Note about customer',
    });
  });

  it('returns { ok: false, error } on failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    expect(await addInternalNote('booking', 'bk1', 'note')).toEqual({
      ok: false,
      error: 'Could not add internal note.',
    });
  });
});

// ── flagAccount ────────────────────────────────────────────────────────────

describe('flagAccount', () => {
  it('calls flag_account with correct p_ params', async () => {
    mockRpc.mockResolvedValue({ data: 'flag-id', error: null });
    const result = await flagAccount('u1', 'provider', 'suspension', 'Repeated no-shows');
    expect(result).toEqual({ ok: true, id: 'flag-id' });
    expect(mockRpc).toHaveBeenCalledWith('flag_account', {
      p_subject_id:   'u1',
      p_subject_role: 'provider',
      p_kind:         'suspension',
      p_reason:       'Repeated no-shows',
    });
  });

  it('returns { ok: false, error } on failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    expect(await flagAccount('u1', 'customer', 'flag', 'Reason')).toEqual({
      ok: false,
      error: 'Could not flag account.',
    });
  });
});

// ── liftAccountFlag ────────────────────────────────────────────────────────

describe('liftAccountFlag', () => {
  it('calls lift_account_flag with correct p_flag_id param', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const result = await liftAccountFlag('flag-id');
    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('lift_account_flag', {
      p_flag_id: 'flag-id',
    });
  });

  it('returns { ok: false, error } on failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    expect(await liftAccountFlag('flag-id')).toEqual({
      ok: false,
      error: 'Could not lift account flag.',
    });
  });
});
