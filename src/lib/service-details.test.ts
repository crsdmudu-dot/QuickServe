/**
 * service-details.test.ts — Service Details V1.1 data-model tests.
 *
 * These cover the snapshot contract the whole feature rests on: machine keys AND human labels
 * are preserved, versions are recorded, unanswered questions never leak, request item lists
 * serialize deterministically, and MAXIMUM GOODS BUDGET stays a distinct concept.
 *
 * Pure functions only — no config (V1.2), no UI (V1.3), no database. Fixtures stand in for the
 * service forms that do not exist yet.
 */

import {
  ITEM_UNITS,
  SERVICE_DETAILS_SCHEMA_VERSION,
  buildServiceDetailsSnapshot,
  isServiceDetailsSnapshot,
  newItemLineId,
  serviceDetailsPrimaryValue,
  type AnsweredQuestion,
  type ItemList,
  type ServiceDetailsInput,
} from '@/lib/service-details';

// ── Fixtures (stand in for V1.2 service forms) ────────────────────────────────

const primary: AnsweredQuestion = {
  key: 'variant',
  question: 'What kind of cleaning?',
  kind: 'single',
  value: 'deep',
  display: 'Deep clean',
};

const baseInput: ServiceDetailsInput = {
  formVersion: 3,
  serviceSlug: 'house-cleaning',
  serviceTitle: 'House Cleaning',
  primaryKind: 'variant',
  primary,
};

const answer = (over: Partial<AnsweredQuestion> = {}): AnsweredQuestion => ({
  key: 'bedrooms',
  question: 'Bedrooms',
  kind: 'number',
  value: 4,
  display: '4',
  ...over,
});

const groceryItems: ItemList = {
  kind: 'grocery',
  goods_budget: { currency: 'KES', max_goods_amount: 5000 },
  substitution: { value: 'substitute', display: 'Choose something similar' },
  lines: [
    { line_id: 'l1', name: 'Milk', qty: 2, unit: 'pcs', brand: null, note: null },
    { line_id: 'l2', name: 'Rice', qty: 5, unit: 'kg', brand: 'Pishori', note: null },
  ],
};

// ── Envelope ──────────────────────────────────────────────────────────────────

describe('snapshot envelope', () => {
  it('records the schema and form versions', () => {
    const snap = buildServiceDetailsSnapshot({ ...baseInput, formVersion: 7 });
    expect(snap.schema).toBe(SERVICE_DETAILS_SCHEMA_VERSION);
    expect(snap.form_version).toBe(7);
  });

  it('snapshots the service slug and title', () => {
    const snap = buildServiceDetailsSnapshot(baseInput);
    expect(snap.service_slug).toBe('house-cleaning');
    expect(snap.service_title).toBe('House Cleaning');
  });

  it('records primary_kind so variant and issue stay distinguishable', () => {
    expect(buildServiceDetailsSnapshot(baseInput).primary_kind).toBe('variant');
    expect(
      buildServiceDetailsSnapshot({ ...baseInput, primaryKind: 'issue' }).primary_kind,
    ).toBe('issue');
  });

  it('defaults answers/addons/items/flags rather than leaving them undefined', () => {
    const snap = buildServiceDetailsSnapshot(baseInput);
    expect(snap.answers).toEqual([]);
    expect(snap.addons).toEqual([]);
    expect(snap.items).toBeNull();
    expect(snap.flags).toEqual({});
  });
});

// ── Label preservation (the historical-integrity contract) ────────────────────

describe('label preservation', () => {
  it('keeps machine value AND human display for the primary answer', () => {
    const snap = buildServiceDetailsSnapshot(baseInput);
    expect(snap.primary.value).toBe('deep');
    expect(snap.primary.display).toBe('Deep clean');
    expect(snap.primary.question).toBe('What kind of cleaning?');
  });

  it('keeps question text and display for every answer', () => {
    const snap = buildServiceDetailsSnapshot({
      ...baseInput,
      answers: [answer({ key: 'supplies', question: 'Who provides cleaning supplies?', kind: 'single', value: 'provider', display: 'Provider brings supplies' })],
    });
    expect(snap.answers[0]).toEqual({
      key: 'supplies',
      question: 'Who provides cleaning supplies?',
      kind: 'single',
      value: 'provider',
      display: 'Provider brings supplies',
    });
  });

  it('a rendered booking never needs the config: every answer is self-describing', () => {
    const snap = buildServiceDetailsSnapshot({ ...baseInput, answers: [answer()] });
    for (const a of [snap.primary, ...snap.answers]) {
      expect(typeof a.question).toBe('string');
      expect(a.question.length).toBeGreaterThan(0);
      expect(typeof a.display).toBe('string');
    }
  });
});

// ── Unanswered / hidden values must not leak ─────────────────────────────────

describe('unanswered and hidden questions', () => {
  it('drops entries whose value is undefined', () => {
    const snap = buildServiceDetailsSnapshot({
      ...baseInput,
      answers: [answer(), answer({ key: 'ghost', value: undefined as unknown as null })],
    });
    expect(snap.answers.map((a) => a.key)).toEqual(['bedrooms']);
  });

  it('drops null/undefined entries entirely', () => {
    const snap = buildServiceDetailsSnapshot({ ...baseInput, answers: [null, answer(), undefined] });
    expect(snap.answers).toHaveLength(1);
  });

  it('drops NaN numeric answers', () => {
    const snap = buildServiceDetailsSnapshot({ ...baseInput, answers: [answer({ value: Number.NaN })] });
    expect(snap.answers).toHaveLength(0);
  });

  it('KEEPS legitimate falsy answers (false, 0, empty string, null)', () => {
    const snap = buildServiceDetailsSnapshot({
      ...baseInput,
      answers: [
        answer({ key: 'active_leak', kind: 'boolean', value: false, display: 'No' }),
        answer({ key: 'bedrooms', kind: 'number', value: 0, display: '0' }),
        answer({ key: 'brand', kind: 'text', value: '', display: '—' }),
        answer({ key: 'unit', kind: 'single', value: null, display: 'Not specified' }),
      ],
    });
    expect(snap.answers.map((a) => a.key)).toEqual(['active_leak', 'bedrooms', 'brand', 'unit']);
  });
});

// ── Determinism ──────────────────────────────────────────────────────────────

describe('determinism and ordering', () => {
  it('preserves the order the customer answered in', () => {
    const snap = buildServiceDetailsSnapshot({
      ...baseInput,
      answers: [answer({ key: 'a' }), answer({ key: 'b' }), answer({ key: 'c' })],
    });
    expect(snap.answers.map((a) => a.key)).toEqual(['a', 'b', 'c']);
  });

  it('collapses a re-answered question to the last value, keeping its original position', () => {
    const snap = buildServiceDetailsSnapshot({
      ...baseInput,
      answers: [answer({ key: 'a', value: 1, display: '1' }), answer({ key: 'b' }), answer({ key: 'a', value: 9, display: '9' })],
    });
    expect(snap.answers.map((a) => a.key)).toEqual(['a', 'b']);
    expect(snap.answers[0].value).toBe(9);
  });

  it('dedupes add-ons by key and preserves order', () => {
    const snap = buildServiceDetailsSnapshot({
      ...baseInput,
      addons: [{ key: 'fridge', label: 'Inside fridge' }, null, { key: 'fridge', label: 'Inside fridge' }, { key: 'oven', label: 'Inside oven' }],
    });
    expect(snap.addons).toEqual([
      { key: 'fridge', label: 'Inside fridge' },
      { key: 'oven', label: 'Inside oven' },
    ]);
  });
});

// ── Serialization safety ─────────────────────────────────────────────────────

describe('serialization', () => {
  it('round-trips through JSON unchanged', () => {
    const snap = buildServiceDetailsSnapshot({
      ...baseInput,
      answers: [answer()],
      addons: [{ key: 'oven', label: 'Inside oven' }],
      items: groceryItems,
      flags: { priority: true },
    });
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });

  it('stores no functions or class instances', () => {
    const snap = buildServiceDetailsSnapshot({ ...baseInput, answers: [answer()], items: groceryItems });
    const walk = (v: unknown): void => {
      expect(typeof v).not.toBe('function');
      if (v && typeof v === 'object') {
        expect(v.constructor === Object || Array.isArray(v)).toBe(true);
        Object.values(v as Record<string, unknown>).forEach(walk);
      }
    };
    walk(snap);
  });

  it('is frozen — a built snapshot cannot be mutated afterwards', () => {
    const snap = buildServiceDetailsSnapshot({ ...baseInput, answers: [answer()] });
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.answers)).toBe(true);
    expect(Object.isFrozen(snap.primary)).toBe(true);
  });

  it('copies inputs — later mutation of the caller array cannot alter the snapshot', () => {
    const answers = [answer()];
    const snap = buildServiceDetailsSnapshot({ ...baseInput, answers });
    answers.push(answer({ key: 'late' }));
    expect(snap.answers).toHaveLength(1);
  });
});

// ── Item lists ───────────────────────────────────────────────────────────────

describe('request item lists', () => {
  it('serializes lines with stable line_id, name, qty and unit', () => {
    const snap = buildServiceDetailsSnapshot({ ...baseInput, serviceSlug: 'grocery', items: groceryItems });
    expect(snap.items?.lines).toEqual([
      { line_id: 'l1', name: 'Milk', qty: 2, unit: 'pcs', brand: null, note: null },
      { line_id: 'l2', name: 'Rice', qty: 5, unit: 'kg', brand: 'Pishori', note: null },
    ]);
  });

  it('preserves line order', () => {
    const snap = buildServiceDetailsSnapshot({ ...baseInput, items: groceryItems });
    expect(snap.items?.lines.map((l) => l.name)).toEqual(['Milk', 'Rice']);
  });

  it('normalises omitted optional line fields to explicit null, never undefined', () => {
    const snap = buildServiceDetailsSnapshot({
      ...baseInput,
      items: { ...groceryItems, lines: [{ line_id: 'x', name: 'Bread', qty: 1 } as never] },
    });
    const line = snap.items!.lines[0];
    expect(line.unit).toBeNull();
    expect(line.brand).toBeNull();
    expect(line.note).toBeNull();
    expect(Object.values(line).every((v) => v !== undefined)).toBe(true);
  });

  it('shares one shape across grocery, medicine and food', () => {
    for (const kind of ['grocery', 'medicine', 'food'] as const) {
      const snap = buildServiceDetailsSnapshot({ ...baseInput, items: { ...groceryItems, kind } });
      expect(snap.items?.kind).toBe(kind);
      expect(Array.isArray(snap.items?.lines)).toBe(true);
    }
  });

  it('items is null when the service has no request list', () => {
    expect(buildServiceDetailsSnapshot(baseInput).items).toBeNull();
  });

  it('exposes a fixed unit vocabulary', () => {
    expect([...ITEM_UNITS]).toEqual(['pcs', 'kg', 'g', 'litres', 'ml', 'packs', 'bottles', 'bunches']);
  });

  it('newItemLineId() returns unique, prefixed, serializable ids', () => {
    const a = newItemLineId();
    const b = newItemLineId();
    expect(a).not.toBe(b);
    expect(a.startsWith('line_')).toBe(true);
    expect(typeof a).toBe('string');
  });
});

// ── MAXIMUM GOODS BUDGET ─────────────────────────────────────────────────────

describe('maximum goods budget', () => {
  it('is a distinct property of the item list, not a booking total', () => {
    const snap = buildServiceDetailsSnapshot({ ...baseInput, items: groceryItems });
    expect(snap.items?.goods_budget).toEqual({ currency: 'KES', max_goods_amount: 5000 });
    // It lives ONLY inside items — never at snapshot level, where it could be mistaken for a total.
    expect((snap as unknown as Record<string, unknown>).total).toBeUndefined();
    expect((snap as unknown as Record<string, unknown>).budget).toBeUndefined();
    expect((snap as unknown as Record<string, unknown>).spend_cap).toBeUndefined();
  });

  it('carries no fee, total or price fields — pricing is a later phase', () => {
    const snap = buildServiceDetailsSnapshot({ ...baseInput, items: groceryItems });
    const json = JSON.stringify(snap);
    for (const banned of ['delivery_fee', 'service_fee', 'sourcing_fee', 'order_total', 'grand_total', 'unit_price']) {
      expect(json).not.toContain(banned);
    }
  });

  it('is null when QuickServe is collecting rather than purchasing', () => {
    const snap = buildServiceDetailsSnapshot({
      ...baseInput,
      items: { kind: 'grocery', goods_budget: null, substitution: null, lines: [] },
    });
    expect(snap.items?.goods_budget).toBeNull();
  });

  it('records the substitution preference with its display label', () => {
    const snap = buildServiceDetailsSnapshot({ ...baseInput, items: groceryItems });
    expect(snap.items?.substitution).toEqual({ value: 'substitute', display: 'Choose something similar' });
  });
});

// ── Flags ────────────────────────────────────────────────────────────────────

describe('flags', () => {
  it('records only the flags that were supplied', () => {
    expect(buildServiceDetailsSnapshot({ ...baseInput, flags: { priority: true } }).flags).toEqual({ priority: true });
    expect(buildServiceDetailsSnapshot({ ...baseInput, flags: { safety_ack: true } }).flags).toEqual({ safety_ack: true });
  });

  it('keeps an explicit false rather than dropping it', () => {
    expect(buildServiceDetailsSnapshot({ ...baseInput, flags: { priority: false } }).flags).toEqual({ priority: false });
  });
});

// ── Historical / null-safe reading ───────────────────────────────────────────

describe('reading historical bookings', () => {
  it('recognises a built snapshot', () => {
    expect(isServiceDetailsSnapshot(buildServiceDetailsSnapshot(baseInput))).toBe(true);
  });

  it('rejects null, undefined, primitives and arrays (pre-V1 bookings)', () => {
    for (const v of [null, undefined, 0, '', 'x', [], true]) {
      expect(isServiceDetailsSnapshot(v)).toBe(false);
    }
  });

  it('rejects an object missing the fields we actually read', () => {
    expect(isServiceDetailsSnapshot({ schema: 1 })).toBe(false);
    expect(isServiceDetailsSnapshot({ schema: 1, service_slug: 'x', answers: [] })).toBe(false);
  });

  it('accepts a snapshot from a NEWER schema version rather than discarding it', () => {
    const future = { ...buildServiceDetailsSnapshot(baseInput), schema: 99, unknown_future_field: true };
    expect(isServiceDetailsSnapshot(future)).toBe(true);
  });

  it('serviceDetailsPrimaryValue returns the primary machine value', () => {
    expect(serviceDetailsPrimaryValue(buildServiceDetailsSnapshot(baseInput))).toBe('deep');
  });

  it('serviceDetailsPrimaryValue returns null for pre-Service-Details bookings', () => {
    expect(serviceDetailsPrimaryValue(null)).toBeNull();
    expect(serviceDetailsPrimaryValue(undefined)).toBeNull();
    expect(serviceDetailsPrimaryValue({ nonsense: true })).toBeNull();
  });

  it('serviceDetailsPrimaryValue returns null for a non-string primary (multi-select)', () => {
    const snap = buildServiceDetailsSnapshot({
      ...baseInput,
      primary: { ...primary, kind: 'multi', value: ['a', 'b'], display: 'A, B' },
    });
    expect(serviceDetailsPrimaryValue(snap)).toBeNull();
  });
});
