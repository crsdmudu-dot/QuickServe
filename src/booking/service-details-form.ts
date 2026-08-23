/**
 * service-details-form.ts — pure logic behind the generic Service Details step.
 *
 * Everything here is a pure function over (ServiceForm, answers). No React, no navigation, no
 * database. The screen (src/app/booking/service-details.tsx) and the renderer component hold the
 * UI; this module decides what is visible, what is valid, and what gets snapshotted.
 *
 * Keeping it separate is deliberate: visibility resolution, pruning and validation are where the
 * subtle bugs live, and they are far easier to test without a component tree.
 */

import {
  customerOptions,
  type Notice,
  type Option,
  type Question,
  type ServiceForm,
} from '@/constants/service-forms';
import {
  buildServiceDetailsSnapshot,
  newItemLineId,
  type AnsweredQuestion,
  type AnswerValue,
  type ItemLine,
  type ItemList,
  type ItemUnit,
  type ServiceDetailsSnapshot,
} from '@/lib/service-details';

/** A single request line while the customer is still editing (qty/unit may be blank). */
export type DraftItemLine = {
  line_id: string;
  name: string;
  qty: string;
  unit: ItemUnit | null;
  brand: string;
  note: string;
};

/** Working answers. `undefined` means "not answered yet" — never stored in a snapshot. */
export type AnswerMap = Record<string, AnswerValue | undefined>;

/** The complete editable state of the step. */
export type FormState = {
  answers: AnswerMap;
  lines: DraftItemLine[];
  /** The safety-gate answer, when the form declares a gate. */
  gate?: string;
};

export function newDraftLine(): DraftItemLine {
  return { line_id: newItemLineId(), name: '', qty: '', unit: null, brand: '', note: '' };
}

export function initialFormState(form: ServiceForm): FormState {
  return { answers: {}, lines: hasItemList(form) ? [newDraftLine()] : [], gate: undefined };
}

// ── Question lookup ───────────────────────────────────────────────────────────

/** Every question in display order: primary, follow-ups, then add-ons. */
export function orderedQuestions(form: ServiceForm): Question[] {
  return [form.primary, ...form.questions, ...(form.addons ? [form.addons] : [])];
}

export function findQuestion(form: ServiceForm, key: string): Question | undefined {
  return orderedQuestions(form).find((q) => q.key === key);
}

export function hasItemList(form: ServiceForm): boolean {
  return orderedQuestions(form).some((q) => q.kind === 'itemlist');
}

/** The options a customer may pick, resolving `optionsBy` against the primary answer. */
export function optionsFor(form: ServiceForm, q: Question, answers: AnswerMap): Option[] {
  const primaryValue = answers[form.primary.key];
  return customerOptions(q, typeof primaryValue === 'string' ? primaryValue : undefined);
}

// ── Visibility ────────────────────────────────────────────────────────────────

/** Does this question's OWN condition pass? Does not consider ancestors. */
function ownConditionPasses(q: Question, answers: AnswerMap): boolean {
  const c = q.showIf;
  if (!c) return true;
  const parent = answers[c.key];
  if (parent === undefined || parent === null) return false;
  if (c.isTrue !== undefined) return parent === c.isTrue;
  const value = String(parent);
  if (c.equals) return c.equals.includes(value);
  if (c.notEquals) return !c.notEquals.includes(value);
  return true;
}

/**
 * Is the question visible? TRANSITIVE — a question whose parent is hidden is itself hidden,
 * even if its own condition would pass. Depth is bounded so a malformed chain cannot hang.
 */
export function isVisible(form: ServiceForm, q: Question, answers: AnswerMap): boolean {
  let current: Question | undefined = q;
  let depth = 0;
  while (current && depth < 12) {
    if (!ownConditionPasses(current, answers)) return false;
    if (!current.showIf) return true;
    current = findQuestion(form, current.showIf.key);
    depth += 1;
  }
  return true;
}

/** Questions the customer should currently see, in display order. */
export function visibleQuestions(form: ServiceForm, answers: AnswerMap): Question[] {
  return orderedQuestions(form).filter((q) => isVisible(form, q, answers));
}

/** Notices whose condition currently matches. Never blocking. */
export function visibleNotices(form: ServiceForm, answers: AnswerMap): Notice[] {
  return (form.notices ?? []).filter((n) => {
    const parent = answers[n.showIf.key];
    if (parent === undefined || parent === null) return false;
    const value = String(parent);
    if (n.showIf.isTrue !== undefined) return parent === n.showIf.isTrue;
    if (n.showIf.equals) return n.showIf.equals.includes(value);
    if (n.showIf.notEquals) return !n.showIf.notEquals.includes(value);
    return false;
  });
}

/**
 * Drop answers whose question is no longer visible, so a stale value from an abandoned branch
 * can never reach the snapshot. Called after every answer change.
 */
export function pruneHidden(form: ServiceForm, answers: AnswerMap): AnswerMap {
  const next: AnswerMap = {};
  for (const q of orderedQuestions(form)) {
    if (answers[q.key] === undefined) continue;
    if (isVisible(form, q, answers)) next[q.key] = answers[q.key];
  }
  return next;
}

/** Apply one answer and prune anything it just hid. */
export function setAnswer(form: ServiceForm, answers: AnswerMap, key: string, value: AnswerValue): AnswerMap {
  return pruneHidden(form, { ...answers, [key]: value });
}

/** Toggle one value of a multi-select, preserving the config's option order. */
export function toggleMulti(form: ServiceForm, answers: AnswerMap, q: Question, optionKey: string): AnswerMap {
  const current = Array.isArray(answers[q.key]) ? (answers[q.key] as string[]) : [];
  const wanted = new Set(current.includes(optionKey) ? current.filter((k) => k !== optionKey) : [...current, optionKey]);
  const ordered = optionsFor(form, q, answers)
    .map((o) => o.key)
    .filter((k) => wanted.has(k));
  return setAnswer(form, answers, q.key, ordered);
}

// ── Safety gate ───────────────────────────────────────────────────────────────

/** True when the gate has been answered with its blocking value — progression must stop. */
export function isSafetyBlocked(form: ServiceForm, state: FormState): boolean {
  return form.safetyGate !== undefined && state.gate === form.safetyGate.blockOn;
}

/** True when a gate exists and has not been answered yet. */
export function isGateUnanswered(form: ServiceForm, state: FormState): boolean {
  return form.safetyGate !== undefined && state.gate === undefined;
}

// ── Validation ────────────────────────────────────────────────────────────────

export type Errors = Record<string, string>;

/** Per-line errors keyed by line_id, plus a form-level `items` message. */
export type ItemErrors = { lines: Record<string, string>; list?: string };

function isBlank(v: AnswerValue | undefined): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export function validateItems(q: Question, lines: DraftItemLine[]): ItemErrors {
  const spec = q.itemList!;
  const errors: ItemErrors = { lines: {} };
  if (lines.length < spec.minLines) errors.list = `Please add at least ${spec.minLines} item.`;
  for (const line of lines) {
    if (spec.requiredFields.includes('name') && line.name.trim().length === 0) {
      errors.lines[line.line_id] = 'Item name is required.';
      continue;
    }
    if (spec.requiredFields.includes('qty')) {
      const n = Number(line.qty);
      if (line.qty.trim().length === 0 || !Number.isFinite(n) || n <= 0) {
        errors.lines[line.line_id] = 'Enter a quantity greater than zero.';
        continue;
      }
    }
    if (line.unit !== null && !spec.units.includes(line.unit)) {
      errors.lines[line.line_id] = 'Choose a valid unit.';
    }
  }
  return errors;
}

/** Validate every VISIBLE question. Hidden questions are never required. */
/**
 * Drop the validation errors whose answer has since changed.
 *
 * `validate` runs only when the customer presses Continue, so `errors` is a snapshot of that
 * moment while `answers` keeps moving. Without this the form contradicts itself: a required
 * question shows a green selected answer AND "This is required." until Continue is pressed again.
 * Observed on the physical S24 against two independent required fields (variant and
 * provider_bring_supplies), which is what proved it was the shared error state rather than one
 * control.
 *
 * An error belongs to the answer that produced it: once that answer changes, the message is stale.
 * Errors for OTHER fields are deliberately preserved, so pressing Continue with several fields
 * missing still shows every outstanding one. This clears feedback only — `validate` remains the
 * sole authority on whether the form may advance.
 */
export function clearResolvedErrors(
  form: ServiceForm,
  prev: Errors,
  before: FormState,
  after: FormState,
): Errors {
  const keys = Object.keys(prev);
  if (keys.length === 0) return prev;

  const itemListKey = orderedQuestions(form).find((q) => q.kind === 'itemlist')?.key;
  const gateKey = form.safetyGate?.key;
  // Questions still on screen after the change. An error for a question that is no longer
  // rendered is unreachable: the customer cannot act on it and must not be blocked by it.
  const stillVisible = new Set(visibleQuestions(form, after.answers).map((q) => q.key));

  const next: Errors = { ...prev };
  let changed = false;

  for (const key of keys) {
    // Answer changed — including becoming undefined, which is how pruning removes a hidden
    // question's answer, so a pruned field never keeps an error for a question that is gone.
    const answerChanged = !Object.is(before.answers[key], after.answers[key]);
    // The item-list error keys off its question; any edit to the lines resolves it.
    const linesChanged = key === itemListKey && before.lines !== after.lines;
    // The safety gate lives outside `answers`.
    const gateChanged = key === gateKey && before.gate !== after.gate;

    // Pruning removes a question without its answer ever changing (it was never answered),
    // so visibility must be checked as well as value.
    const noLongerShown = key !== gateKey && !stillVisible.has(key);

    if (answerChanged || linesChanged || gateChanged || noLongerShown) {
      delete next[key];
      changed = true;
    }
  }

  return changed ? next : prev;
}

export function validate(form: ServiceForm, state: FormState): Errors {
  const errors: Errors = {};
  const { answers, lines } = state;

  if (isGateUnanswered(form, state)) errors[form.safetyGate!.key] = 'Please answer this before continuing.';

  for (const q of visibleQuestions(form, answers)) {
    const value = answers[q.key];

    if (q.kind === 'itemlist') {
      const itemErrors = validateItems(q, lines);
      const first = itemErrors.list ?? Object.values(itemErrors.lines)[0];
      if (first) errors[q.key] = first;
      continue;
    }

    if (q.kind === 'boolean') {
      // A required boolean is an ACKNOWLEDGEMENT — it must be explicitly true. There is no
      // implicit acceptance (e.g. the Package prohibited-items confirmation).
      if (q.required && value !== true) errors[q.key] = 'Please confirm to continue.';
      continue;
    }

    if (q.required && isBlank(value)) {
      errors[q.key] = 'This is required.';
      continue;
    }

    if (q.kind === 'number' && !isBlank(value)) {
      const n = Number(value);
      if (!Number.isFinite(n)) errors[q.key] = 'Enter a number.';
      else if (q.min !== undefined && n < q.min) errors[q.key] = `Enter ${q.min} or more.`;
      else if (q.max !== undefined && n > q.max) errors[q.key] = `Enter ${q.max} or less.`;
    }
  }

  return errors;
}

export function isComplete(form: ServiceForm, state: FormState): boolean {
  return !isSafetyBlocked(form, state) && Object.keys(validate(form, state)).length === 0;
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

/** Human-readable rendering of an answer, exactly as the customer saw it. */
function displayFor(form: ServiceForm, q: Question, answers: AnswerMap): string {
  const value = answers[q.key];
  if (value === undefined || value === null) return '';
  if (q.kind === 'boolean') return value ? 'Yes' : 'No';
  if (q.kind === 'single') {
    const opt = optionsFor(form, q, answers).find((o) => o.key === String(value));
    return opt?.label ?? String(value);
  }
  if (q.kind === 'multi' && Array.isArray(value)) {
    const opts = optionsFor(form, q, answers);
    return value.map((k) => opts.find((o) => o.key === k)?.label ?? k).join(', ');
  }
  return String(value);
}

function toItemLines(lines: DraftItemLine[]): ItemLine[] {
  return lines.map((l) => ({
    line_id: l.line_id,
    name: l.name.trim(),
    qty: Number(l.qty),
    unit: l.unit,
    brand: l.brand.trim() === '' ? null : l.brand.trim(),
    note: l.note.trim() === '' ? null : l.note.trim(),
  }));
}

/**
 * Build the immutable snapshot from the current state.
 *
 * Item-list services fold three answers into `items`: the lines, the maximum GOODS budget, and
 * the substitution preference. Those keys are then excluded from `answers` so nothing is stored
 * twice. A service with a goods budget but NO item list (Food collect_unpaid) keeps its budget as
 * an ordinary answer rather than inventing an empty item list for it.
 */
export function toSnapshot(form: ServiceForm, serviceTitle: string, state: FormState): ServiceDetailsSnapshot {
  const { answers, lines } = state;
  const visible = visibleQuestions(form, answers);

  const itemQuestion = visible.find((q) => q.kind === 'itemlist');
  const budgetQuestion = visible.find((q) => q.goodsBudget);
  const substitutionQuestion = visible.find((q) => q.key === 'substitution');

  const consumed = new Set<string>();
  let items: ItemList | null = null;
  if (itemQuestion) {
    consumed.add(itemQuestion.key);
    if (budgetQuestion) consumed.add(budgetQuestion.key);
    if (substitutionQuestion) consumed.add(substitutionQuestion.key);
    const budgetValue = budgetQuestion ? Number(answers[budgetQuestion.key]) : NaN;
    items = {
      kind: itemQuestion.itemList!.kind,
      goods_budget: Number.isFinite(budgetValue) ? { currency: 'KES', max_goods_amount: budgetValue } : null,
      substitution: substitutionQuestion
        ? { value: String(answers[substitutionQuestion.key]), display: displayFor(form, substitutionQuestion, answers) }
        : null,
      lines: toItemLines(lines),
    };
  }

  const answered: AnsweredQuestion[] = visible
    .filter((q) => q.key !== form.primary.key && q.key !== form.addons?.key && !consumed.has(q.key))
    .filter((q) => answers[q.key] !== undefined)
    .map((q) => ({
      key: q.key,
      question: q.label,
      kind: q.kind,
      value: answers[q.key] as AnswerValue,
      display: displayFor(form, q, answers),
    }));

  const addonKeys = form.addons && Array.isArray(answers[form.addons.key]) ? (answers[form.addons.key] as string[]) : [];
  const addonOptions = form.addons ? optionsFor(form, form.addons, answers) : [];

  const priority = visibleNotices(form, answers).some((n) => n.flagsPriority);

  return buildServiceDetailsSnapshot({
    formVersion: form.version,
    serviceSlug: form.slug,
    serviceTitle,
    primaryKind: form.primaryKind,
    primary: {
      key: form.primary.key,
      question: form.primary.label,
      kind: form.primary.kind,
      value: (answers[form.primary.key] ?? null) as AnswerValue,
      display: displayFor(form, form.primary, answers),
    },
    answers: answered,
    addons: addonKeys.map((k) => ({ key: k, label: addonOptions.find((o) => o.key === k)?.label ?? k })),
    items,
    flags: {
      ...(priority ? { priority: true } : {}),
      ...(form.safetyGate ? { safety_ack: true } : {}),
    },
  });
}

/**
 * Rebuild editable state from a previously-built snapshot, so pressing Back from Address and
 * returning does not lose what the customer typed.
 */
export function stateFromSnapshot(form: ServiceForm, snapshot: ServiceDetailsSnapshot | null): FormState {
  if (!snapshot || snapshot.service_slug !== form.slug) return initialFormState(form);

  const answers: AnswerMap = { [snapshot.primary.key]: snapshot.primary.value };
  for (const a of snapshot.answers) answers[a.key] = a.value;
  if (form.addons && snapshot.addons.length > 0) answers[form.addons.key] = snapshot.addons.map((a) => a.key);

  const itemQuestion = orderedQuestions(form).find((q) => q.kind === 'itemlist');
  if (itemQuestion && snapshot.items) {
    const budgetQuestion = orderedQuestions(form).find((q) => q.goodsBudget);
    if (budgetQuestion && snapshot.items.goods_budget) {
      answers[budgetQuestion.key] = snapshot.items.goods_budget.max_goods_amount;
    }
    if (snapshot.items.substitution) answers['substitution'] = snapshot.items.substitution.value;
  }

  const lines: DraftItemLine[] = snapshot.items
    ? snapshot.items.lines.map((l) => ({
        line_id: l.line_id,
        name: l.name,
        qty: String(l.qty),
        unit: l.unit,
        brand: l.brand ?? '',
        note: l.note ?? '',
      }))
    : hasItemList(form)
      ? [newDraftLine()]
      : [];

  return {
    answers,
    lines: lines.length > 0 || !hasItemList(form) ? lines : [newDraftLine()],
    // The safety gate is deliberately NOT restored — a safety question is re-asked every time
    // the customer returns to this step rather than silently remembered.
    gate: undefined,
  };
}
