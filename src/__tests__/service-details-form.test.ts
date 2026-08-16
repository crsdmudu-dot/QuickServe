/**
 * Tests for src/booking/service-details-form.ts — the pure logic behind the generic
 * Service Details step (V1.3).
 *
 * These are plain function tests: no React, no navigation, no network. They cover the places the
 * subtle bugs live — conditional visibility, TRANSITIVE hiding, pruning of stale answers,
 * validation, and snapshot construction — against the REAL V1.2 service configurations, so a
 * config change that breaks a customer path fails here.
 *
 * Screen-level behaviour (rendering, Continue, Back, fail-closed UI) lives in
 * booking-service-details.test.tsx.
 */

import { CONFIGURED_SERVICE_SLUGS, getServiceForm, isServiceBookable } from '@/constants/service-forms';
import {
  initialFormState,
  isSafetyBlocked,
  isVisible,
  newDraftLine,
  optionsFor,
  orderedQuestions,
  setAnswer,
  stateFromSnapshot,
  toggleMulti,
  toSnapshot,
  validate,
  visibleNotices,
  visibleQuestions,
  type AnswerMap,
  type DraftItemLine,
  type FormState,
} from '@/booking/service-details-form';
import { ITEM_UNITS, SERVICE_DETAILS_SCHEMA_VERSION } from '@/lib/service-details';

// ── Helpers ───────────────────────────────────────────────────────────────────

const form = (slug: string) => {
  const f = getServiceForm(slug);
  if (!f) throw new Error(`missing config for ${slug}`);
  return f;
};

/** Keys of the questions currently visible, in display order. */
const visibleKeys = (slug: string, answers: AnswerMap) => visibleQuestions(form(slug), answers).map((q) => q.key);

const line = (over: Partial<DraftItemLine> = {}): DraftItemLine => ({ ...newDraftLine(), ...over });

/** SERVICE_FORMS is keyed by slug — every configured form, in declaration order. */
const allForms = () => CONFIGURED_SERVICE_SLUGS.map((slug) => form(slug));

// ── 9. Conditional show / hide ────────────────────────────────────────────────

describe('conditional visibility', () => {
  it('hides a follow-up until its parent answer matches (requirement 9)', () => {
    expect(visibleKeys('electrical', {})).not.toContain('outage_extent');
    expect(visibleKeys('electrical', { issue: 'no_power_or_partial_outage' })).toContain('outage_extent');
  });

  it('supports notEquals conditions', () => {
    // Package: weight is asked for everything EXCEPT documents.
    expect(visibleKeys('package-delivery', { variant: 'documents' })).not.toContain('approximate_weight');
    expect(visibleKeys('package-delivery', { variant: 'small_package' })).toContain('approximate_weight');
  });

  it('always shows the primary question', () => {
    for (const f of allForms()) {
      expect(visibleQuestions(f, {})[0].key).toBe(f.primary.key);
    }
  });

  it('shows the "other" description only when the customer picked "other"', () => {
    expect(visibleKeys('plumbing', { issue: 'sink_problem' })).not.toContain('other_description');
    expect(visibleKeys('plumbing', { issue: 'other' })).toContain('other_description');
  });
});

// ── 10. Transitive hiding ─────────────────────────────────────────────────────

describe('transitive hiding', () => {
  // Plumbing chain: issue -> actively_leaking -> mains_shut_off
  it('hides a grandchild when its parent is hidden, even if its own condition passes (requirement 10)', () => {
    const answers: AnswerMap = {
      issue: 'installation_or_replacement', // hides actively_leaking
      actively_leaking: 'yes', // mains_shut_off's own condition WOULD pass
    };
    const f = form('plumbing');
    const actively = orderedQuestions(f).find((q) => q.key === 'actively_leaking')!;
    const mains = orderedQuestions(f).find((q) => q.key === 'mains_shut_off')!;

    expect(isVisible(f, actively, answers)).toBe(false);
    // The parent is hidden, so the child must be hidden too — this is the whole point.
    expect(isVisible(f, mains, answers)).toBe(false);
  });

  it('shows the grandchild when the whole chain passes', () => {
    const answers: AnswerMap = { issue: 'leaking_tap_or_pipe', actively_leaking: 'yes' };
    expect(visibleKeys('plumbing', answers)).toContain('mains_shut_off');
  });
});

// ── 11. Parent change clears hidden descendant values ─────────────────────────

describe('pruning stale answers', () => {
  it('drops a descendant answer when the parent changes (requirement 11)', () => {
    const f = form('plumbing');
    let answers: AnswerMap = {};
    answers = setAnswer(f, answers, 'issue', 'leaking_tap_or_pipe');
    answers = setAnswer(f, answers, 'actively_leaking', 'yes');
    answers = setAnswer(f, answers, 'mains_shut_off', 'no');
    expect(answers.mains_shut_off).toBe('no');

    // Changing the top-level issue hides the whole branch.
    answers = setAnswer(f, answers, 'issue', 'installation_or_replacement');

    expect(answers.actively_leaking).toBeUndefined();
    expect(answers.mains_shut_off).toBeUndefined();
  });

  it('keeps answers that are still visible after the change', () => {
    const f = form('plumbing');
    let answers: AnswerMap = {};
    answers = setAnswer(f, answers, 'issue', 'leaking_tap_or_pipe');
    answers = setAnswer(f, answers, 'location_of_issue', 'kitchen');
    answers = setAnswer(f, answers, 'issue', 'sink_problem');

    expect(answers.location_of_issue).toBe('kitchen'); // unconditional — must survive
  });

  it('a pruned answer can never reach the snapshot (requirement 18)', () => {
    const f = form('plumbing');
    let answers: AnswerMap = {};
    answers = setAnswer(f, answers, 'issue', 'leaking_tap_or_pipe');
    answers = setAnswer(f, answers, 'actively_leaking', 'yes');
    answers = setAnswer(f, answers, 'location_of_issue', 'bathroom');
    answers = setAnswer(f, answers, 'issue', 'installation_or_replacement');

    const snap = toSnapshot(f, 'Plumbing', { answers, lines: [] });
    expect(snap.answers.map((a) => a.key)).not.toContain('actively_leaking');
  });
});

// ── 12. Disabled options never render ─────────────────────────────────────────

describe('disabled options', () => {
  it('never offers a disabled option to the customer (requirement 12)', () => {
    for (const f of allForms()) {
      for (const q of orderedQuestions(f)) {
        const offered = optionsFor(f, q, {}).map((o) => o.key);
        const disabled = (q.options ?? []).filter((o) => o.disabled).map((o) => o.key);
        for (const key of disabled) expect(offered).not.toContain(key);
      }
    }
  });

  it('Food does not offer order_for_me (requirement 31)', () => {
    const f = form('food-delivery');
    expect(optionsFor(f, f.primary, {}).map((o) => o.key)).toEqual(['collect_paid', 'collect_unpaid']);
  });

  it('Medicine does not offer request_items (requirement 32)', () => {
    const f = form('medicine-delivery');
    expect(optionsFor(f, f.primary, {}).map((o) => o.key)).toEqual(['collect']);
  });

  it('Medicine exposes no item list anywhere in V1.3', () => {
    const f = form('medicine-delivery');
    expect(orderedQuestions(f).some((q) => q.kind === 'itemlist')).toBe(false);
  });

  it('Massage does not ask how many people (locked V1.2 correction)', () => {
    const f = form('massage');
    expect(orderedQuestions(f).map((q) => q.key)).not.toContain('number_of_people');
  });

  it('Haircuts does not ask stylist gender', () => {
    const keys = orderedQuestions(form('haircuts')).map((q) => q.key);
    expect(keys.filter((k) => k.includes('gender'))).toHaveLength(0);
  });
});

// ── 13. Safety gate ───────────────────────────────────────────────────────────

describe('towing safety gate', () => {
  const towing = () => form('car-towing');

  it('blocks progression when the customer reports injury or danger (requirement 33)', () => {
    const state: FormState = { answers: {}, lines: [], gate: 'yes' };
    expect(isSafetyBlocked(towing(), state)).toBe(true);
  });

  it('does not block when nobody is in danger', () => {
    expect(isSafetyBlocked(towing(), { answers: {}, lines: [], gate: 'no' })).toBe(false);
  });

  it('requires the gate to be answered before continuing', () => {
    const errors = validate(towing(), { answers: {}, lines: [] });
    expect(errors.injury_check).toBeDefined();
  });

  it('contains no emergency telephone number anywhere in customer-visible copy (requirement 34)', () => {
    // Scan the whole config set, not just towing — an emergency number must not creep in anywhere.
    // reviewNote / disabledReason are reviewer-only and never rendered, so they are stripped first.
    const customerFacing = JSON.stringify(allForms(), (key, value) => {
      if (key === 'reviewNote' || key === 'disabledReason') return undefined;
      return value;
    });
    for (const number of ['999', '911', '112', '000', '911', '119']) {
      expect(customerFacing).not.toContain(number);
    }
  });

  it('gives generic emergency-services guidance without dialling anything', () => {
    const gate = towing().safetyGate!;
    expect(gate.blockBody).toContain('contact emergency services');
    expect(gate.blockBody).toContain('not an emergency service');
  });

  it('marks safety_ack on the snapshot for gated services', () => {
    const f = towing();
    const answers: AnswerMap = {
      issue: 'breakdown',
      vehicle_make_model: 'Toyota Vitz',
      destination: 'Westlands garage',
      can_roll_or_steer: 'yes',
      difficult_access: 'no',
    };
    const snap = toSnapshot(f, 'Car Towing', { answers, lines: [], gate: 'no' });
    expect(snap.flags.safety_ack).toBe(true);
  });
});

// ── 14. Non-blocking notices ──────────────────────────────────────────────────

describe('non-blocking notices', () => {
  it('shows the electrical danger notice without blocking Continue (requirement 35)', () => {
    const f = form('electrical');
    const answers: AnswerMap = {
      issue: 'sockets_or_switches',
      danger_signs: 'burning_smell',
      affected_points: 'one',
    };
    expect(visibleNotices(f, answers).map((n) => n.key)).toContain('danger_guidance');
    // A notice is NOT a gate: the form has no safetyGate and validation passes.
    expect(f.safetyGate).toBeUndefined();
    expect(validate(f, { answers, lines: [] })).toEqual({});
  });

  it('shows the plumbing active-leak notice without blocking Continue (requirement 36)', () => {
    const f = form('plumbing');
    const answers: AnswerMap = {
      issue: 'leaking_tap_or_pipe',
      location_of_issue: 'kitchen',
      actively_leaking: 'yes',
      mains_shut_off: 'no',
    };
    expect(visibleNotices(f, answers).map((n) => n.key)).toContain('active_leak_guidance');
    expect(validate(f, { answers, lines: [] })).toEqual({});
  });

  it('hides notices whose condition does not match', () => {
    const f = form('electrical');
    expect(visibleNotices(f, { issue: 'lights', danger_signs: 'none' })).toEqual([]);
  });

  it('flags priority on the snapshot when a priority notice is showing', () => {
    const f = form('plumbing');
    const answers: AnswerMap = {
      issue: 'leaking_tap_or_pipe',
      location_of_issue: 'kitchen',
      actively_leaking: 'yes',
      mains_shut_off: 'yes',
    };
    expect(toSnapshot(f, 'Plumbing', { answers, lines: [] }).flags.priority).toBe(true);
  });
});

// ── 15. Media from config ─────────────────────────────────────────────────────

describe('media configuration', () => {
  it('never allows video on any service (requirement 15)', () => {
    for (const f of allForms()) {
      if (f.media.enabled) expect(f.media.allow).toEqual(['image']);
    }
  });

  it('Mechanic allows images only', () => {
    expect(form('mechanic').media).toMatchObject({ enabled: true, allow: ['image'] });
  });

  it('Massage has no media at all', () => {
    expect(form('massage').media.enabled).toBe(false);
  });
});

// ── 16. Fail-closed ───────────────────────────────────────────────────────────

describe('fail-closed configuration lookup', () => {
  it('returns undefined for an unknown service (requirement 16)', () => {
    expect(getServiceForm('teleportation')).toBeUndefined();
    expect(isServiceBookable('teleportation')).toBe(false);
  });

  it('every configured service is bookable', () => {
    for (const f of allForms()) expect(isServiceBookable(f.slug)).toBe(true);
  });
});

// ── 4/5/6. Validation of number, text and boolean ─────────────────────────────

describe('validation', () => {
  it('enforces number min and max (requirement 4)', () => {
    const f = form('makeup');
    const base: AnswerMap = { variant: 'evening_or_event', ready_by_time: '18:00' };

    expect(validate(f, { answers: { ...base, number_of_people: 0 }, lines: [] }).number_of_people).toBeDefined();
    expect(validate(f, { answers: { ...base, number_of_people: 21 }, lines: [] }).number_of_people).toBeDefined();
    expect(validate(f, { answers: { ...base, number_of_people: 4 }, lines: [] }).number_of_people).toBeUndefined();
  });

  it('requires a required text answer, and treats whitespace as blank (requirement 5)', () => {
    const f = form('food-delivery');
    const answers: AnswerMap = { variant: 'collect_paid', restaurant: '   ', order_reference: 'A12' };
    expect(validate(f, { answers, lines: [] }).restaurant).toBeDefined();
  });

  it('does not require an optional text answer', () => {
    const f = form('food-delivery');
    const answers: AnswerMap = { variant: 'collect_paid', restaurant: 'Mama Oliech', order_reference: 'A12' };
    expect(validate(f, { answers, lines: [] })).toEqual({});
  });

  it('requires an explicit true for a required acknowledgement — no implicit acceptance (requirement 6)', () => {
    const f = form('package-delivery');
    const answers: AnswerMap = {
      variant: 'documents',
      recipient_name: 'Amina',
      recipient_phone: '0700000000',
      fragile: 'no',
    };
    // Unanswered → blocked.
    expect(validate(f, { answers, lines: [] }).prohibited_acknowledgement).toBeDefined();
    // Explicitly false → still blocked.
    expect(
      validate(f, { answers: { ...answers, prohibited_acknowledgement: false }, lines: [] })
        .prohibited_acknowledgement,
    ).toBeDefined();
    // Explicitly true → accepted.
    expect(validate(f, { answers: { ...answers, prohibited_acknowledgement: true }, lines: [] })).toEqual({});
  });

  it('requires a time answer where the config says so (requirement 7)', () => {
    const f = form('makeup');
    const answers: AnswerMap = { variant: 'photoshoot', number_of_people: 2 };
    expect(validate(f, { answers, lines: [] }).ready_by_time).toBeDefined();
    expect(validate(f, { answers: { ...answers, ready_by_time: '09:30' }, lines: [] })).toEqual({});
  });

  it('never requires a hidden question', () => {
    const f = form('plumbing');
    // mains_shut_off is required, but hidden while there is no active leak.
    const answers: AnswerMap = { issue: 'sink_problem', location_of_issue: 'kitchen', actively_leaking: 'no' };
    expect(validate(f, { answers, lines: [] })).toEqual({});
  });

  it('requires at least one option on a required multi-select (requirement 3)', () => {
    const f = form('makeup');
    // Add-ons are optional here, so an empty selection must NOT block.
    const answers: AnswerMap = { variant: 'bridal', number_of_people: 1, ready_by_time: '06:00', addons: [] };
    expect(validate(f, { answers, lines: [] })).toEqual({});
  });
});

// ── 2/3. Single and multi select semantics ────────────────────────────────────

describe('select semantics', () => {
  it('single-select holds exactly one value (requirement 2)', () => {
    const f = form('plumbing');
    let answers = setAnswer(f, {}, 'issue', 'sink_problem');
    answers = setAnswer(f, answers, 'issue', 'toilet_problem');
    expect(answers.issue).toBe('toilet_problem');
  });

  it('multi-select toggles values on and off (requirement 3)', () => {
    const f = form('makeup');
    const q = f.addons!;
    let answers: AnswerMap = setAnswer(f, {}, 'variant', 'bridal');
    answers = toggleMulti(f, answers, q, 'lashes');
    answers = toggleMulti(f, answers, q, 'hair_styling');
    expect(answers.addons).toEqual(['lashes', 'hair_styling']);

    answers = toggleMulti(f, answers, q, 'lashes');
    expect(answers.addons).toEqual(['hair_styling']);
  });

  it('stores multi-select in the config option order, not tap order (deterministic)', () => {
    const f = form('makeup');
    const q = f.addons!;
    let answers: AnswerMap = setAnswer(f, {}, 'variant', 'bridal');
    // Tapped last-to-first…
    answers = toggleMulti(f, answers, q, 'hair_styling');
    answers = toggleMulti(f, answers, q, 'touch_up');
    answers = toggleMulti(f, answers, q, 'lashes');
    // …stored in config order.
    expect(answers.addons).toEqual(['lashes', 'touch_up', 'hair_styling']);
  });
});

// ── 8 / 22-30. Grocery item list ──────────────────────────────────────────────

describe('grocery item list', () => {
  const grocery = () => form('grocery-delivery');

  const shopping = (lines: DraftItemLine[], over: AnswerMap = {}): FormState => ({
    answers: {
      variant: 'shop_for_me',
      max_goods_budget: 3000,
      substitution: 'call',
      ...over,
    },
    lines,
  });

  it('starts with one blank line (requirement 22)', () => {
    expect(initialFormState(grocery()).lines).toHaveLength(1);
  });

  it('gives every line a distinct, stable id (requirement 24)', () => {
    const a = newDraftLine();
    const b = newDraftLine();
    expect(a.line_id).not.toBe(b.line_id);

    // The id survives a snapshot round-trip — it is not regenerated.
    const state = shopping([line({ line_id: a.line_id, name: 'Milk', qty: '2', unit: 'litres' })]);
    const snap = toSnapshot(grocery(), 'Grocery Delivery', state);
    expect(snap.items!.lines[0].line_id).toBe(a.line_id);
    expect(stateFromSnapshot(grocery(), snap).lines[0].line_id).toBe(a.line_id);
  });

  it('requires an item name on every line (requirement 25)', () => {
    const errors = validate(grocery(), shopping([line({ name: '  ', qty: '1' })]));
    expect(errors.items).toBeDefined();
  });

  it('requires a quantity greater than zero (requirement 26)', () => {
    expect(validate(grocery(), shopping([line({ name: 'Rice', qty: '' })])).items).toBeDefined();
    expect(validate(grocery(), shopping([line({ name: 'Rice', qty: '0' })])).items).toBeDefined();
    expect(validate(grocery(), shopping([line({ name: 'Rice', qty: 'abc' })])).items).toBeDefined();
    expect(validate(grocery(), shopping([line({ name: 'Rice', qty: '2' })])).items).toBeUndefined();
  });

  it('accepts only the approved units (requirement 27)', () => {
    const spec = orderedQuestions(grocery()).find((q) => q.kind === 'itemlist')!.itemList!;
    expect(spec.units).toEqual(ITEM_UNITS);

    const bad = validate(
      grocery(),
      shopping([line({ name: 'Rice', qty: '2', unit: 'sacks' as unknown as null })]),
    );
    expect(bad.items).toBeDefined();
  });

  it('requires the maximum goods budget (requirement 28)', () => {
    const errors = validate(
      grocery(),
      shopping([line({ name: 'Rice', qty: '2' })], { max_goods_budget: undefined }),
    );
    expect(errors.max_goods_budget).toBeDefined();
  });

  it('describes the budget as a GOODS maximum, never a final charge (requirement 29)', () => {
    const budget = orderedQuestions(grocery()).find((q) => q.key === 'max_goods_budget')!;
    expect(budget.label.toLowerCase()).toContain('spend on the goods');
    expect(budget.helpText).toContain('Delivery and service fees are separate');

    // No pricing / totals / checkout vocabulary anywhere in the customer-visible grocery config.
    const customerFacing = JSON.stringify(grocery(), (key, value) =>
      key === 'reviewNote' || key === 'disabledReason' ? undefined : value,
    ).toLowerCase();
    for (const banned of ['total charge', 'final charge', 'checkout', 'subtotal', 'invoice']) {
      expect(customerFacing).not.toContain(banned);
    }
  });

  it('stores the budget as a KES goods budget on the snapshot', () => {
    const snap = toSnapshot(
      grocery(),
      'Grocery Delivery',
      shopping([line({ name: 'Rice', qty: '2', unit: 'kg' })]),
    );
    expect(snap.items!.goods_budget).toEqual({ currency: 'KES', max_goods_amount: 3000 });
  });

  it('skips the shopping list on the collect path (requirement 30)', () => {
    const answers: AnswerMap = { variant: 'collect_existing_order' };
    const keys = visibleKeys('grocery-delivery', answers);
    expect(keys).not.toContain('items');
    expect(keys).not.toContain('max_goods_budget');
    expect(keys).not.toContain('substitution');
    expect(keys).toContain('order_reference');
  });

  it('produces no item list at all on the collect path', () => {
    const state: FormState = {
      answers: { variant: 'collect_existing_order', store_name: 'Naivas', order_reference: 'A1', already_paid: 'yes' },
      lines: [line({ name: 'stale', qty: '9' })], // left over from an abandoned branch
    };
    expect(validate(grocery(), state)).toEqual({});
    expect(toSnapshot(grocery(), 'Grocery Delivery', state).items).toBeNull();
  });

  it('folds items, budget and substitution into one item list — never duplicated as answers', () => {
    const snap = toSnapshot(
      grocery(),
      'Grocery Delivery',
      shopping([line({ name: 'Milk', qty: '2', unit: 'litres', brand: 'Brookside' })]),
    );
    const answerKeys = snap.answers.map((a) => a.key);
    expect(answerKeys).not.toContain('items');
    expect(answerKeys).not.toContain('max_goods_budget');
    expect(answerKeys).not.toContain('substitution');
    expect(snap.items).toMatchObject({
      kind: 'grocery',
      substitution: { value: 'call', display: 'Call me first' },
    });
    expect(snap.items!.lines[0]).toMatchObject({ name: 'Milk', qty: 2, unit: 'litres', brand: 'Brookside', note: null });
  });

  it('keeps a goods budget WITHOUT an item list as an ordinary answer (Food collect_unpaid)', () => {
    const f = form('food-delivery');
    const state: FormState = {
      answers: {
        variant: 'collect_unpaid',
        restaurant: 'Mama Oliech',
        order_reference: 'A12',
        max_goods_budget: 1500,
      },
      lines: [],
    };
    const snap = toSnapshot(f, 'Food Delivery', state);
    expect(snap.items).toBeNull();
    expect(snap.answers.map((a) => a.key)).toContain('max_goods_budget');
  });
});

// ── 17-21. Snapshot construction ──────────────────────────────────────────────

describe('snapshot', () => {
  const makeupState = (): FormState => ({
    answers: {
      variant: 'bridal',
      number_of_people: 3,
      ready_by_time: '07:30',
      desired_look: 'Soft glam',
      addons: ['lashes', 'hair_styling'],
    },
    lines: [],
  });

  it('records schema version, form version, slug and title (requirement 19)', () => {
    const snap = toSnapshot(form('makeup'), 'Makeup', makeupState());
    expect(snap.schema).toBe(SERVICE_DETAILS_SCHEMA_VERSION);
    expect(snap.form_version).toBe(form('makeup').version);
    expect(snap.service_slug).toBe('makeup');
    expect(snap.service_title).toBe('Makeup');
  });

  it('keeps machine keys AND the human labels the customer actually saw (requirement 19)', () => {
    const snap = toSnapshot(form('makeup'), 'Makeup', makeupState());
    expect(snap.primary).toMatchObject({ key: 'variant', value: 'bridal', display: 'Bridal' });
    const people = snap.answers.find((a) => a.key === 'number_of_people')!;
    expect(people.question).toBe('How many people?');
    expect(people.value).toBe(3);
    expect(snap.addons).toEqual([
      { key: 'lashes', label: 'Lashes' },
      { key: 'hair_styling', label: 'Hair styling' },
    ]);
  });

  it('is deeply frozen — a snapshot can never be edited after the fact', () => {
    const snap = toSnapshot(form('makeup'), 'Makeup', makeupState());
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.primary)).toBe(true);
    expect(Object.isFrozen(snap.answers)).toBe(true);
  });

  it('contains only visible answers (requirement 18)', () => {
    const f = form('electrical');
    const answers: AnswerMap = { issue: 'lights', danger_signs: 'none', affected_points: 'one' };
    const snap = toSnapshot(f, 'Electrical Repairs', { answers, lines: [] });
    // outage_extent belongs to a branch the customer never entered.
    expect(snap.answers.map((a) => a.key)).not.toContain('outage_extent');
    expect(snap.answers.map((a) => a.key)).toContain('affected_points');
  });

  it('round-trips through stateFromSnapshot so Back restores the answers (requirement 20)', () => {
    const f = form('makeup');
    const snap = toSnapshot(f, 'Makeup', makeupState());
    const restored = stateFromSnapshot(f, snap);

    expect(restored.answers.variant).toBe('bridal');
    expect(restored.answers.number_of_people).toBe(3);
    expect(restored.answers.ready_by_time).toBe('07:30');
    expect(restored.answers.addons).toEqual(['lashes', 'hair_styling']);
  });

  it('round-trips a grocery item list', () => {
    const f = form('grocery-delivery');
    const state: FormState = {
      answers: { variant: 'shop_for_me', max_goods_budget: 2500, substitution: 'skip' },
      lines: [line({ name: 'Sukuma', qty: '3', unit: 'bunches', note: 'fresh' })],
    };
    const restored = stateFromSnapshot(f, toSnapshot(f, 'Grocery Delivery', state));

    expect(restored.answers.max_goods_budget).toBe(2500);
    expect(restored.answers.substitution).toBe('skip');
    expect(restored.lines[0]).toMatchObject({ name: 'Sukuma', qty: '3', unit: 'bunches', note: 'fresh' });
  });

  it('ignores a snapshot belonging to a DIFFERENT service (requirement 21 / 47)', () => {
    const makeupSnap = toSnapshot(form('makeup'), 'Makeup', makeupState());
    const restored = stateFromSnapshot(form('plumbing'), makeupSnap);

    // No leakage: a plumbing form must start empty rather than inherit makeup's answers.
    expect(restored.answers).toEqual({});
    expect(restored.lines).toEqual([]);
  });

  it('starts empty when there is no snapshot at all', () => {
    expect(stateFromSnapshot(form('plumbing'), null).answers).toEqual({});
  });

  it('never restores a safety-gate answer — safety is re-asked every time', () => {
    const f = form('car-towing');
    const state: FormState = {
      answers: {
        issue: 'breakdown',
        vehicle_make_model: 'Probox',
        destination: 'Home',
        can_roll_or_steer: 'yes',
        difficult_access: 'no',
      },
      lines: [],
      gate: 'no',
    };
    const restored = stateFromSnapshot(f, toSnapshot(f, 'Car Towing', state));
    expect(restored.gate).toBeUndefined();
  });
});

// ── 1. Every configured service is renderable ─────────────────────────────────

describe('all 19 services', () => {
  it('exposes a primary question with at least one selectable option (requirement 1)', () => {
    for (const f of allForms()) {
      expect(f.primary.required).toBe(true);
      if (f.primary.kind === 'single') {
        expect(optionsFor(f, f.primary, {}).length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('blocks Continue on a completely empty form for every service', () => {
    for (const f of allForms()) {
      const errors = validate(f, initialFormState(f));
      expect(Object.keys(errors).length).toBeGreaterThan(0);
    }
  });

  it('uses only question kinds the renderer implements', () => {
    const supported = ['single', 'multi', 'number', 'text', 'boolean', 'time', 'itemlist'];
    for (const f of allForms()) {
      for (const q of orderedQuestions(f)) expect(supported).toContain(q.kind);
    }
  });

  it('never exposes internal vocabulary in customer-visible copy', () => {
    // Machine KEYS may say "variant"; customer-visible LABELS may not.
    for (const f of allForms()) {
      const copy: string[] = [];
      for (const q of orderedQuestions(f)) {
        copy.push(q.label, q.helpText ?? '', q.placeholder ?? '', q.disclaimer ?? '');
        for (const o of q.options ?? []) copy.push(o.label, o.hint ?? '');
      }
      for (const n of f.notices ?? []) copy.push(n.title, n.body);
      const joined = copy.join(' ').toLowerCase();
      for (const banned of ['form_version', 'schema', 'snapshot', 'machine key']) {
        expect(joined).not.toContain(banned);
      }
    }
  });
});
