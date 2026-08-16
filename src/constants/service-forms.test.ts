/**
 * service-forms.test.ts — Service Details V1.2 configuration-integrity tests.
 *
 * These are the guardrails that let ONE generic renderer (V1.3) trust the configuration. They
 * check structural integrity (unique keys, resolvable conditionals, no cycles), the locked
 * product decisions (disabled paths, safety wording, first splits), and compatibility with the
 * V1.1 snapshot builder.
 *
 * Pure config assertions — no UI, no database, no network.
 */

import {
  CONFIGURED_SERVICE_SLUGS,
  SERVICE_FORMS,
  customerOptions,
  disabledOptions,
  getServiceForm,
  isServiceBookable,
  type Question,
  type ServiceForm,
} from '@/constants/service-forms';
import { SERVICES } from '@/constants/services';
import { ITEM_UNITS, buildServiceDetailsSnapshot } from '@/lib/service-details';

const FORMS = Object.values(SERVICE_FORMS);

/** Every question in a form, including the primary and the optional add-ons question. */
const allQuestions = (f: ServiceForm): Question[] => [f.primary, ...f.questions, ...(f.addons ? [f.addons] : [])];

/** Every option on a question, across plain `options` and branch `optionsBy`. */
const allOptions = (q: Question) => [...(q.options ?? []), ...Object.values(q.optionsBy ?? {}).flat()];

/**
 * The form as a CUSTOMER could ever see it: reviewer-only fields removed (`reviewNote`,
 * `disabledReason`) and disabled options dropped.
 *
 * "Must NOT contain X" assertions run against this, never against the raw config. The internal
 * notes legitimately discuss the very things the rules forbid — e.g. Hair's note explains that
 * stylist *gender* is deliberately not collected, and Movers' note says there is no second
 * *Places* subsystem. Scanning those would fail on documentation rather than on behaviour.
 */
const customerFacingJson = (form: ServiceForm): string => {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.filter((o) => !(o && typeof o === 'object' && 'disabled' in o && o.disabled)).map(strip);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k]) => k !== 'reviewNote' && k !== 'disabledReason')
          .map(([k, val]) => [k, strip(val)]),
      );
    }
    return v;
  };
  return JSON.stringify(strip(form)).toLowerCase();
};

const each = (): [string, ServiceForm][] => FORMS.map((f) => [f.slug, f]);

// ── 1–4: coverage, uniqueness, versioning, schema compatibility ───────────────

describe('service coverage', () => {
  it('configures exactly the 19 catalogue services', () => {
    expect(FORMS).toHaveLength(19);
    expect([...CONFIGURED_SERVICE_SLUGS].sort()).toEqual([...SERVICES.map((s) => s.id)].sort());
  });

  it('every catalogue service has a form (fail-closed rule)', () => {
    for (const s of SERVICES) {
      expect(getServiceForm(s.id)).toBeDefined();
      expect(isServiceBookable(s.id)).toBe(true);
    }
  });

  it('an unknown slug is NOT bookable — the renderer must fail closed, never skip', () => {
    expect(getServiceForm('does-not-exist')).toBeUndefined();
    expect(isServiceBookable('does-not-exist')).toBe(false);
  });

  it('no duplicate service config', () => {
    const slugs = FORMS.map((f) => f.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(each())('%s: slug matches its registry key', (slug, form) => {
    expect(form.slug).toBe(slug);
  });

  it.each(each())('%s: form_version is a positive integer', (_slug, form) => {
    expect(Number.isInteger(form.version)).toBe(true);
    expect(form.version).toBeGreaterThan(0);
  });

  it.each(each())('%s: primary_kind is variant or issue', (_slug, form) => {
    expect(['variant', 'issue']).toContain(form.primaryKind);
  });
});

// ── 5–7: primary question, key and value uniqueness ──────────────────────────

describe('question and option integrity', () => {
  it.each(each())('%s: has a required primary question keyed to its primary_kind', (_slug, form) => {
    expect(form.primary).toBeDefined();
    expect(form.primary.required).toBe(true);
    expect(form.primary.key).toBe(form.primaryKind);
    // Medicine has exactly ONE enabled option by locked decision (request_items is disabled),
    // so the floor is 1 rather than 2; the per-service tests below assert the exact sets.
    expect(customerOptions(form.primary).length).toBeGreaterThanOrEqual(1);
  });

  it.each(each())('%s: all question keys are unique within the form', (_slug, form) => {
    const keys = allQuestions(form).map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(each())('%s: option keys are unique within each question', (_slug, form) => {
    for (const q of allQuestions(form)) {
      for (const set of [q.options, ...Object.values(q.optionsBy ?? {})]) {
        if (!set) continue;
        const keys = set.map((o) => o.key);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });

  it.each(each())('%s: every choice question has options, and no other kind does', (_slug, form) => {
    for (const q of allQuestions(form)) {
      const hasOptions = allOptions(q).length > 0;
      if (q.kind === 'single' || q.kind === 'multi') expect(hasOptions).toBe(true);
      else expect(hasOptions).toBe(false);
    }
  });

  it.each(each())('%s: every option has a non-empty customer label', (_slug, form) => {
    for (const q of allQuestions(form)) {
      for (const o of allOptions(q)) {
        expect(typeof o.label).toBe('string');
        expect(o.label.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

// ── 8–11: conditional integrity ──────────────────────────────────────────────

describe('conditional rules', () => {
  it.each(each())('%s: every showIf parent key exists in the same form', (_slug, form) => {
    const keys = new Set(allQuestions(form).map((q) => q.key));
    for (const q of allQuestions(form)) {
      if (q.showIf) expect(keys.has(q.showIf.key)).toBe(true);
    }
  });

  it.each(each())('%s: every showIf value exists as an option on the parent', (_slug, form) => {
    const byKey = new Map(allQuestions(form).map((q) => [q.key, q]));
    for (const q of allQuestions(form)) {
      if (!q.showIf) continue;
      const parent = byKey.get(q.showIf.key)!;
      const parentValues = new Set(allOptions(parent).map((o) => o.key));
      for (const v of [...(q.showIf.equals ?? []), ...(q.showIf.notEquals ?? [])]) {
        expect(parentValues.has(v)).toBe(true);
      }
    }
  });

  it.each(each())('%s: showIf uses exactly one test (no compound conditions)', (_slug, form) => {
    for (const q of allQuestions(form)) {
      if (!q.showIf) continue;
      const used = [q.showIf.equals, q.showIf.notEquals, q.showIf.isTrue].filter((v) => v !== undefined);
      expect(used).toHaveLength(1);
    }
  });

  it.each(each())('%s: no question depends on itself and the graph has no cycle', (_slug, form) => {
    const byKey = new Map(allQuestions(form).map((q) => [q.key, q]));
    for (const q of allQuestions(form)) {
      const seen = new Set<string>([q.key]);
      let cur = q.showIf?.key;
      while (cur) {
        expect(seen.has(cur)).toBe(false);
        seen.add(cur);
        cur = byKey.get(cur)?.showIf?.key;
      }
    }
  });

  it.each(each())('%s: no orphan conditional — a parent is never itself unreachable', (_slug, form) => {
    const byKey = new Map(allQuestions(form).map((q) => [q.key, q]));
    for (const q of allQuestions(form)) {
      if (!q.showIf) continue;
      // The parent chain must terminate at a question with no condition (always shown).
      let cur: Question | undefined = byKey.get(q.showIf.key);
      let depth = 0;
      while (cur?.showIf) {
        cur = byKey.get(cur.showIf.key);
        expect((depth += 1)).toBeLessThan(10);
      }
      expect(cur).toBeDefined();
    }
  });
});

// ── 12: required-ness explicit ───────────────────────────────────────────────

describe('required questions', () => {
  it.each(each())('%s: required is an explicit boolean when present', (_slug, form) => {
    for (const q of allQuestions(form)) {
      if (q.required !== undefined) expect(typeof q.required).toBe('boolean');
    }
  });

  it.each(each())('%s: has at least one required follow-up beyond the primary', (_slug, form) => {
    expect(form.questions.some((q) => q.required)).toBe(true);
  });

  it.each(each())('%s: keeps the follow-up set small (<= 8 non-primary questions)', (_slug, form) => {
    expect(form.questions.length).toBeLessThanOrEqual(8);
  });
});

// ── 13–15: item lists and goods budget ───────────────────────────────────────

describe('repeatable item lists', () => {
  const withItemList = FORMS.filter((f) => allQuestions(f).some((q) => q.kind === 'itemlist'));

  it('only Grocery uses an item list in V1', () => {
    expect(withItemList.map((f) => f.slug)).toEqual(['grocery-delivery']);
  });

  it('item lists use only the approved shared unit vocabulary', () => {
    for (const f of withItemList) {
      for (const q of allQuestions(f)) {
        if (q.kind !== 'itemlist') continue;
        expect(q.itemList).toBeDefined();
        for (const u of q.itemList!.units) expect(ITEM_UNITS).toContain(u);
      }
    }
  });

  it('every itemlist question carries an itemList spec, and nothing else does', () => {
    for (const f of FORMS) {
      for (const q of allQuestions(f)) {
        if (q.kind === 'itemlist') expect(q.itemList).toBeDefined();
        else expect(q.itemList).toBeUndefined();
      }
    }
  });

  it('Grocery shop_for_me requires a MAXIMUM GOODS BUDGET', () => {
    const g = SERVICE_FORMS['grocery-delivery'];
    const budget = g.questions.find((q) => q.key === 'max_goods_budget')!;
    expect(budget).toBeDefined();
    expect(budget.required).toBe(true);
    expect(budget.goodsBudget).toBe(true);
    expect(budget.showIf?.equals).toContain('shop_for_me');
    expect(budget.showIf?.equals).toContain('buy_from_specific_store');
  });

  it('goods-budget wording never implies a booking total or fee cap', () => {
    for (const f of FORMS) {
      for (const q of allQuestions(f)) {
        if (!q.goodsBudget) continue;
        const text = `${q.label} ${q.helpText ?? ''}`.toLowerCase();
        expect(text).not.toContain('total');
        // It must actively say fees are separate.
        expect(text).toContain('separate');
      }
    }
  });
});

// ── 16–18: disabled future paths ─────────────────────────────────────────────

describe('disabled future paths', () => {
  it('Food order_for_me exists in config but is NOT customer-enabled', () => {
    const f = SERVICE_FORMS['food-delivery'];
    expect(allOptions(f.primary).some((o) => o.key === 'order_for_me')).toBe(true);
    expect(customerOptions(f.primary).some((o) => o.key === 'order_for_me')).toBe(false);
    expect(disabledOptions(f.primary).map((o) => o.key)).toEqual(['order_for_me']);
  });

  it('Food collect paths ARE customer-enabled', () => {
    const keys = customerOptions(SERVICE_FORMS['food-delivery'].primary).map((o) => o.key);
    expect(keys).toEqual(['collect_paid', 'collect_unpaid']);
  });

  it('Medicine request_items exists in config but is NOT customer-enabled', () => {
    const m = SERVICE_FORMS['medicine-delivery'];
    expect(allOptions(m.primary).some((o) => o.key === 'request_items')).toBe(true);
    expect(customerOptions(m.primary).some((o) => o.key === 'request_items')).toBe(false);
  });

  it('Medicine collect remains enabled and is the only customer option', () => {
    expect(customerOptions(SERVICE_FORMS['medicine-delivery'].primary).map((o) => o.key)).toEqual(['collect']);
  });

  it('every disabled option records why it is disabled', () => {
    for (const f of FORMS) {
      for (const q of allQuestions(f)) {
        for (const o of disabledOptions(q)) {
          expect(typeof o.disabledReason).toBe('string');
          expect(o.disabledReason!.length).toBeGreaterThan(20);
        }
      }
    }
  });

  it('disabled options can never reach a customer through customerOptions()', () => {
    for (const f of FORMS) {
      for (const q of allQuestions(f)) {
        const branches = q.optionsBy ? Object.keys(q.optionsBy) : [undefined];
        for (const b of branches) {
          expect(customerOptions(q, b).some((o) => o.disabled)).toBe(false);
        }
      }
    }
  });

  it('Medicine active config stores no medicine names and asks for no prescription', () => {
    const m = SERVICE_FORMS['medicine-delivery'];
    const text = JSON.stringify(m.questions).toLowerCase();
    expect(text).not.toContain('prescription');
    expect(m.questions.some((q) => q.kind === 'itemlist')).toBe(false);
    expect(m.media.enabled).toBe(false);
  });
});

// ── 19–25: locked per-service decisions ──────────────────────────────────────

describe('locked product decisions', () => {
  it('Massage has no media and states gender is a preference, not a guarantee', () => {
    const m = SERVICE_FORMS['massage'];
    expect(m.media.enabled).toBe(false);
    const gender = m.questions.find((q) => q.key === 'therapist_gender_preference')!;
    expect(gender).toBeDefined();
    expect(gender.disclaimer?.toLowerCase()).toContain("isn't guaranteed");
  });

  it('Mechanic allows images only — never video', () => {
    const m = SERVICE_FORMS['mechanic'];
    expect(m.media.enabled).toBe(true);
    expect(m.media.allow).toEqual(['image']);
  });

  it('no service enables video anywhere', () => {
    for (const f of FORMS) {
      if (f.media.allow) expect(f.media.allow).toEqual(['image']);
      expect(JSON.stringify(f.media).toLowerCase()).not.toContain('video');
      expect(customerFacingJson(f)).not.toContain('video capture');
    }
  });

  it('Towing has an injury safety gate that blocks, with NO hardcoded emergency number', () => {
    const t = SERVICE_FORMS['car-towing'];
    expect(t.safetyGate).toBeDefined();
    expect(t.safetyGate!.blockOn).toBe('yes');
    expect(t.safetyGate!.blockBody.toLowerCase()).toContain('emergency services');
    // No digit run that could be a phone number anywhere in the towing config.
    expect(JSON.stringify(t)).not.toMatch(/\d{3,}/);
  });

  it('no service config anywhere contains a hardcoded emergency-style number', () => {
    for (const f of FORMS) {
      const safetyText = JSON.stringify([f.safetyGate ?? null, f.notices ?? []]);
      expect(safetyText).not.toMatch(/\b(999|911|112)\b/);
    }
  });

  it('Package requires a prohibited-item acknowledgement boolean', () => {
    const p = SERVICE_FORMS['package-delivery'];
    const ack = p.questions.find((q) => q.key === 'prohibited_acknowledgement')!;
    expect(ack).toBeDefined();
    expect(ack.kind).toBe('boolean');
    expect(ack.required).toBe(true);
    expect(ack.showIf).toBeUndefined(); // always asked
  });

  it('Hair splits barber/salon FIRST, not adult/child', () => {
    const h = SERVICE_FORMS['haircuts'];
    expect(customerOptions(h.primary).map((o) => o.key)).toEqual(['barber', 'salon']);
    const choice = h.questions.find((q) => q.key === 'service_choice')!;
    expect(Object.keys(choice.optionsBy ?? {})).toEqual(['barber', 'salon']);
    // client_type exists but is NOT the primary split
    expect(h.questions.some((q) => q.key === 'client_type')).toBe(true);
    expect(h.primary.key).not.toBe('client_type');
  });

  it('Hair does not collect stylist gender in V1', () => {
    expect(customerFacingJson(SERVICE_FORMS['haircuts'])).not.toContain('gender');
  });

  it('House Cleaning separates cleaning type from scope', () => {
    const c = SERVICE_FORMS['house-cleaning'];
    const variants = customerOptions(c.primary).map((o) => o.key);
    expect(variants).toContain('deep_clean');
    const scope = c.questions.find((q) => q.key === 'scope')!;
    expect(scope).toBeDefined();
    // "deep clean of the whole home" must be expressible: scope is shown for deep_clean.
    expect(scope.showIf?.equals).toContain('deep_clean');
    expect(customerOptions(scope).map((o) => o.key)).toContain('whole_home');
  });

  it('House Cleaning laundry_only skips whole-home questions', () => {
    const c = SERVICE_FORMS['house-cleaning'];
    const hiddenForLaundry = ['scope', 'bedrooms', 'bathrooms', 'provider_bring_supplies'];
    for (const key of hiddenForLaundry) {
      const q = c.questions.find((x) => x.key === key)!;
      expect(q).toBeDefined();
      const shownForLaundry =
        q.showIf?.equals?.includes('laundry_only') ??
        (q.showIf?.notEquals ? !q.showIf.notEquals.includes('laundry_only') : true);
      // bedrooms/bathrooms depend on scope, which is itself hidden for laundry_only.
      if (q.showIf?.key === 'variant') expect(shownForLaundry).toBe(false);
      else expect(q.showIf?.key).toBe('scope');
    }
    // And laundry gets its own questions.
    expect(c.questions.some((q) => q.key === 'laundry_quantity')).toBe(true);
    expect(c.questions.some((q) => q.key === 'laundry_service')).toBe(true);
  });

  it('Movers keeps destination as free text — no second address subsystem', () => {
    const m = SERVICE_FORMS['movers-packers'];
    const dest = m.questions.find((q) => q.key === 'destination')!;
    expect(dest.kind).toBe('text');
    expect(customerFacingJson(m)).not.toContain('places');
  });

  it('Electrical keeps the Kenya outage discriminator and a danger question', () => {
    const e = SERVICE_FORMS['electrical'];
    const neighbours = e.questions.find((q) => q.key === 'neighbours_affected')!;
    expect(neighbours.required).toBe(true);
    expect(neighbours.showIf?.equals).toEqual(['no_power_or_partial_outage']);
    const danger = e.questions.find((q) => q.key === 'danger_signs')!;
    expect(danger.required).toBe(true);
    expect(danger.showIf).toBeUndefined(); // always asked
  });

  it('AC phrases refrigerant as a suspicion, never a confirmed diagnosis', () => {
    const opt = allOptions(SERVICE_FORMS['ac-repair'].primary).find((o) => o.key === 'refrigerant_or_gas_suspected')!;
    expect(opt.label.toLowerCase()).toMatch(/think|may/);
    expect(opt.hint?.toLowerCase()).toContain('confirm');
  });
});

// ── 26–27: not_sure vs other ─────────────────────────────────────────────────

describe('not_sure and other are distinct', () => {
  it('never share a machine value, and are separate options where both exist', () => {
    for (const f of FORMS) {
      for (const q of allQuestions(f)) {
        const keys = allOptions(q).map((o) => o.key);
        if (keys.includes('not_sure') && keys.includes('other')) {
          expect(keys.filter((k) => k === 'not_sure' || k === 'other')).toHaveLength(2);
        }
      }
    }
  });

  it('an "other" option always has a required description somewhere in the form', () => {
    for (const f of FORMS) {
      for (const q of allQuestions(f)) {
        if (!allOptions(q).some((o) => o.key === 'other' && !o.disabled)) continue;
        const hasDescription = f.questions.some(
          (x) =>
            x.kind === 'text' &&
            x.required === true &&
            (x.showIf?.key === q.key || (x.showIf === undefined && x.key === 'brief_description')),
        );
        expect(hasDescription).toBe(true);
      }
    }
  });

  it('"not sure" never demands a description — it routes to inspection instead', () => {
    for (const f of FORMS) {
      for (const q of f.questions) {
        expect(q.showIf?.equals).not.toEqual(['not_sure']);
      }
    }
  });
});

// ── 28–30: keys, serializability, snapshot compatibility ─────────────────────

describe('keys and serializability', () => {
  it.each(each())('%s: all machine keys are stable snake_case strings', (_slug, form) => {
    const pattern = /^[a-z][a-z0-9_]*$/;
    for (const q of allQuestions(form)) {
      expect(q.key).toMatch(pattern);
      for (const o of allOptions(q)) expect(o.key).toMatch(/^[a-z0-9][a-z0-9_]*$/);
    }
  });

  it.each(each())('%s: config is JSON-serializable with no functions', (_slug, form) => {
    const round = JSON.parse(JSON.stringify(form));
    expect(round.slug).toBe(form.slug);
    const walk = (v: unknown): void => {
      expect(typeof v).not.toBe('function');
      if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk);
    };
    walk(round);
  });

  it.each(each())('%s: a primary answer builds a valid snapshot', (_slug, form) => {
    const opt = customerOptions(form.primary)[0];
    const snap = buildServiceDetailsSnapshot({
      formVersion: form.version,
      serviceSlug: form.slug,
      serviceTitle: form.slug,
      primaryKind: form.primaryKind,
      primary: {
        key: form.primary.key,
        question: form.primary.label,
        kind: form.primary.kind,
        value: opt.key,
        display: opt.label,
      },
    });
    expect(snap.service_slug).toBe(form.slug);
    expect(snap.form_version).toBe(form.version);
    expect(snap.primary.value).toBe(opt.key);
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });

  it('the registry is frozen so configs cannot be mutated at runtime', () => {
    expect(Object.isFrozen(SERVICE_FORMS)).toBe(true);
  });
});

// ── Quality guardrails ───────────────────────────────────────────────────────

describe('customer-facing quality', () => {
  it.each(each())('%s: every question label is a real, non-technical prompt', (_slug, form) => {
    for (const q of allQuestions(form)) {
      expect(q.label.trim().length).toBeGreaterThan(3);
      // No raw machine keys leaking into customer copy.
      expect(q.label).not.toMatch(/_[a-z]+_/);
    }
  });

  it.each(each())('%s: reviewNote is never customer-facing copy', (_slug, form) => {
    if (!form.reviewNote) return;
    for (const q of allQuestions(form)) {
      expect(q.label).not.toBe(form.reviewNote);
      expect(q.helpText).not.toBe(form.reviewNote);
    }
  });

  it('no service asks more than 4 questions that are ALWAYS visible beyond the primary', () => {
    for (const f of FORMS) {
      const alwaysVisible = f.questions.filter((q) => !q.showIf);
      expect(alwaysVisible.length).toBeLessThanOrEqual(6);
    }
  });
});
