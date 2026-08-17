/**
 * Tests for src/lib/service-details-view.ts — the Service Details V1.4 read model.
 *
 * These cover the PURE narrowing/shaping rules. Rendering assertions live in
 * src/components/booking/service-details-summary.test.tsx.
 */

import { hasServiceDetails, toServiceDetailsView } from '@/lib/service-details-view';

/** A structurally valid snapshot, built by hand so these tests are independent of the builder. */
function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    schema: 1,
    form_version: 1,
    service_slug: 'house-cleaning',
    service_title: 'House Cleaning',
    primary_kind: 'variant',
    primary: {
      key: 'variant',
      question: 'What kind of cleaning do you need?',
      kind: 'single',
      value: 'deep_clean',
      display: 'Deep cleaning',
    },
    answers: [],
    addons: [],
    items: null,
    flags: {},
    ...overrides,
  };
}

describe('toServiceDetailsView — absent / unreadable input', () => {
  it('returns null for a legacy booking (null service_details)', () => {
    expect(toServiceDetailsView(null)).toBeNull();
    expect(toServiceDetailsView(undefined)).toBeNull();
  });

  it('returns null for values that are not snapshots at all', () => {
    for (const bad of ['{}', 42, true, [], {}, [snapshot()]]) {
      expect(toServiceDetailsView(bad)).toBeNull();
    }
  });

  it('returns null when the required snapshot fields are malformed', () => {
    expect(toServiceDetailsView(snapshot({ answers: 'not-an-array' }))).toBeNull();
    expect(toServiceDetailsView(snapshot({ primary: null }))).toBeNull();
    expect(toServiceDetailsView(snapshot({ schema: 'one' }))).toBeNull();
  });

  it('returns null when a structurally valid snapshot has nothing renderable', () => {
    // Narrowing passes, but no saved label survives — an empty card would be worse than none.
    const view = toServiceDetailsView(
      snapshot({ primary: { key: 'variant', value: 'deep_clean' }, answers: [], addons: [], items: null }),
    );
    expect(view).toBeNull();
  });

  it('hasServiceDetails mirrors toServiceDetailsView', () => {
    expect(hasServiceDetails(null)).toBe(false);
    expect(hasServiceDetails(snapshot())).toBe(true);
  });
});

describe('toServiceDetailsView — rows', () => {
  it('renders the primary answer from the SAVED label, not a machine value', () => {
    const view = toServiceDetailsView(snapshot())!;
    expect(view.primary).toEqual({
      id: 'variant-0',
      label: 'What kind of cleaning do you need?',
      value: 'Deep cleaning',
    });
  });

  it('keeps answer order and uses each answer\'s saved question + display', () => {
    const view = toServiceDetailsView(
      snapshot({
        answers: [
          { key: 'scope', question: 'Scope', kind: 'single', value: 'whole_home', display: 'Whole home' },
          { key: 'bedrooms', question: 'Bedrooms', kind: 'number', value: 4, display: '4' },
        ],
      }),
    )!;
    expect(view.answers.map((r) => [r.label, r.value])).toEqual([
      ['Scope', 'Whole home'],
      ['Bedrooms', '4'],
    ]);
  });

  it('drops an answer with no question label (a machine key is never shown as a label)', () => {
    const view = toServiceDetailsView(
      snapshot({ answers: [{ key: 'secret_key', kind: 'text', value: 'x', display: 'x' }] }),
    )!;
    expect(view.answers).toEqual([]);
  });

  it('drops an answer whose value cannot be rendered without leaking a machine value', () => {
    const view = toServiceDetailsView(
      snapshot({ answers: [{ key: 'scope', question: 'Scope', kind: 'single', value: 'whole_home' }] }),
    )!;
    expect(view.answers).toEqual([]);
  });

  it('falls back to Yes/No and digits only for self-describing values with no saved display', () => {
    const view = toServiceDetailsView(
      snapshot({
        answers: [
          { key: 'supplies', question: 'Provider brings supplies', kind: 'boolean', value: true },
          { key: 'no_pets', question: 'Any pets', kind: 'boolean', value: false },
          { key: 'bedrooms', question: 'Bedrooms', kind: 'number', value: 4 },
        ],
      }),
    )!;
    expect(view.answers.map((r) => r.value)).toEqual(['Yes', 'No', '4']);
  });

  it('ignores garbage entries inside the answers array', () => {
    const view = toServiceDetailsView(
      snapshot({
        answers: [
          null,
          'nope',
          42,
          { key: 'scope', question: 'Scope', kind: 'single', value: 'whole_home', display: 'Whole home' },
        ],
      }),
    )!;
    expect(view.answers).toHaveLength(1);
  });
});

describe('toServiceDetailsView — add-ons', () => {
  it('keeps saved add-on labels and drops entries with no label', () => {
    const view = toServiceDetailsView(
      snapshot({
        addons: [{ key: 'packing', label: 'Packing' }, { key: 'dismantle' }, null],
      }),
    )!;
    expect(view.addons).toEqual(['Packing']);
  });

  it('reports an empty add-on list rather than a placeholder', () => {
    expect(toServiceDetailsView(snapshot())!.addons).toEqual([]);
  });
});

describe('toServiceDetailsView — request lists', () => {
  const grocery = snapshot({
    service_slug: 'grocery-delivery',
    service_title: 'Grocery Delivery',
    primary: {
      key: 'variant',
      question: 'How would you like to shop?',
      kind: 'single',
      value: 'shop_for_me',
      display: 'Shop for me',
    },
    items: {
      kind: 'grocery',
      goods_budget: { currency: 'KES', max_goods_amount: 5000 },
      substitution: { value: 'ask_first', display: 'Contact me before substituting' },
      lines: [
        { line_id: 'line_a', name: 'Milk', qty: 2, unit: 'bottles', brand: 'Brookside', note: null },
        { line_id: 'line_b', name: 'Rice', qty: 5, unit: 'kg', brand: null, note: null },
        { line_id: 'line_c', name: 'Cooking oil', qty: 2, unit: 'litres', brand: null, note: 'Any brand' },
      ],
    },
  });

  it('renders every requested line with its quantity, unit, brand and note', () => {
    const items = toServiceDetailsView(grocery)!.items!;
    expect(items.lines).toEqual([
      { id: 'line_a', name: 'Milk', quantity: '2 bottles', brand: 'Brookside', note: null },
      { id: 'line_b', name: 'Rice', quantity: '5 kg', brand: null, note: null },
      { id: 'line_c', name: 'Cooking oil', quantity: '2 litres', brand: null, note: 'Any brand' },
    ]);
  });

  it('formats the maximum goods budget as currency and keeps the substitution choice', () => {
    const items = toServiceDetailsView(grocery)!.items!;
    expect(items.goodsBudget).toBe('KES 5,000');
    expect(items.substitution).toBe('Contact me before substituting');
  });

  it('omits a line with no name, and omits the quantity when it is not a usable number', () => {
    const items = toServiceDetailsView(
      snapshot({
        items: {
          kind: 'grocery',
          goods_budget: null,
          substitution: null,
          lines: [
            { line_id: 'l1', name: '', qty: 1, unit: 'pcs' },
            { line_id: 'l2', name: 'Bread', qty: '2', unit: 'pcs' },
            { line_id: 'l3', name: 'Sugar', qty: 1, unit: null },
          ],
        },
      }),
    )!.items!;
    expect(items.lines.map((l) => [l.name, l.quantity])).toEqual([
      ['Bread', ''],
      ['Sugar', '1'],
    ]);
  });

  it('returns no items section at all when the list carries nothing', () => {
    const view = toServiceDetailsView(
      snapshot({ items: { kind: 'grocery', goods_budget: null, substitution: null, lines: [] } }),
    )!;
    expect(view.items).toBeNull();
  });

  it('renders a non-KES goods amount explicitly rather than mislabelling it as shillings', () => {
    const items = toServiceDetailsView(
      snapshot({
        items: {
          kind: 'grocery',
          goods_budget: { currency: 'USD', max_goods_amount: 40 },
          substitution: null,
          lines: [{ line_id: 'l1', name: 'Milk', qty: 1, unit: null }],
        },
      }),
    )!.items!;
    expect(items.goodsBudget).toBe('USD 40');
  });
});

describe('toServiceDetailsView — flags and forward compatibility', () => {
  it('reports only flags actually captured in the snapshot', () => {
    expect(toServiceDetailsView(snapshot())!.flags).toEqual({ priority: false, safetyAck: false });
    expect(toServiceDetailsView(snapshot({ flags: { priority: true, safety_ack: true } }))!.flags).toEqual({
      priority: true,
      safetyAck: true,
    });
    // A non-boolean flag value is not a flag.
    expect(toServiceDetailsView(snapshot({ flags: { priority: 'yes' } }))!.flags.priority).toBe(false);
  });

  it('reads a snapshot written by a NEWER schema from its own saved labels', () => {
    const future = snapshot({
      schema: 99,
      form_version: 12,
      unknown_future_block: { anything: true },
      answers: [
        {
          key: 'new_question',
          question: 'A question this app version has never seen',
          kind: 'single',
          value: 'x',
          display: 'Its saved answer',
          extra_future_field: 1,
        },
      ],
    });
    const view = toServiceDetailsView(future)!;
    expect(view.primary!.value).toBe('Deep cleaning');
    expect(view.answers).toEqual([
      { id: 'new_question-1', label: 'A question this app version has never seen', value: 'Its saved answer' },
    ]);
  });

  it('never mutates the value it is given', () => {
    const input = snapshot({ answers: [{ key: 'scope', question: 'Scope', kind: 'single', value: 'w', display: 'Whole home' }] });
    const before = JSON.stringify(input);
    toServiceDetailsView(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
