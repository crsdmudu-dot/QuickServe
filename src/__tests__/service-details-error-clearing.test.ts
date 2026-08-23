/**
 * Item G — stale field-level validation errors.
 *
 * `validate` runs only on Continue, so `errors` was a frozen snapshot while `answers` moved on.
 * Answering a field that had failed left its "This is required." visible until Continue was
 * pressed again — the form showing a valid selected answer AND a required error at once.
 * Reproduced on the physical Samsung S24 against two independent required questions (`variant`
 * and `provider_bring_supplies`), which is what established it as shared error state rather than
 * one misbehaving control.
 *
 * These tests pin the invariant: an error belongs to the answer that produced it, and clearing
 * feedback must never weaken validation itself.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { getServiceForm } from '@/constants/service-forms';
import {
  clearResolvedErrors,
  setAnswer,
  validate,
  type Errors,
  type FormState,
} from '@/booking/service-details-form';

const houseCleaning = getServiceForm('house-cleaning')!;
const towing = getServiceForm('car-towing')!;

const emptyState = (): FormState => ({ answers: {}, lines: [] });

describe('Item G — a resolved field clears its own error immediately', () => {
  it('Continue on an unanswered required field reports that field', () => {
    const errors = validate(houseCleaning, emptyState());
    expect(errors.variant).toBeTruthy();
  });

  it('answering the field clears ITS error without another Continue press', () => {
    const before = emptyState();
    const errors = validate(houseCleaning, before);
    expect(errors.variant).toBeTruthy();

    const after: FormState = {
      ...before,
      answers: setAnswer(houseCleaning, before.answers, 'variant', 'deep_clean'),
    };
    const next = clearResolvedErrors(houseCleaning, errors, before, after);

    expect(next.variant).toBeUndefined();
  });

  it('errors belonging to OTHER unanswered fields are preserved', () => {
    // Disclose scope + its children, then fail validation with several fields outstanding.
    const s1: FormState = { ...emptyState(), answers: setAnswer(houseCleaning, {}, 'variant', 'deep_clean') };
    const s2: FormState = { ...s1, answers: setAnswer(houseCleaning, s1.answers, 'scope', 'whole_home') };

    const errors = validate(houseCleaning, s2);
    expect(Object.keys(errors).length).toBeGreaterThan(1);
    expect(errors.bedrooms).toBeTruthy();
    expect(errors.bathrooms).toBeTruthy();

    const s3: FormState = { ...s2, answers: setAnswer(houseCleaning, s2.answers, 'bedrooms', 4) };
    const next = clearResolvedErrors(houseCleaning, errors, s2, s3);

    expect(next.bedrooms).toBeUndefined();   // resolved
    expect(next.bathrooms).toBeTruthy();     // still outstanding — must survive
  });

  it('Continue still BLOCKS while another required field is unanswered', () => {
    const s1: FormState = { ...emptyState(), answers: setAnswer(houseCleaning, {}, 'variant', 'deep_clean') };
    const s2: FormState = { ...s1, answers: setAnswer(houseCleaning, s1.answers, 'scope', 'whole_home') };
    const s3: FormState = { ...s2, answers: setAnswer(houseCleaning, s2.answers, 'bedrooms', 4) };

    // bathrooms + supplies still missing — clearing feedback must not make the form passable.
    expect(Object.keys(validate(houseCleaning, s3)).length).toBeGreaterThan(0);
  });

  it('a pruned question does not keep an error for a question that no longer exists', () => {
    const s1: FormState = { ...emptyState(), answers: setAnswer(houseCleaning, {}, 'variant', 'deep_clean') };
    const s2: FormState = { ...s1, answers: setAnswer(houseCleaning, s1.answers, 'scope', 'whole_home') };
    const errors = validate(houseCleaning, s2);
    expect(errors.bedrooms).toBeTruthy();

    // kitchen_only prunes bedrooms/bathrooms entirely.
    const s3: FormState = { ...s2, answers: setAnswer(houseCleaning, s2.answers, 'scope', 'kitchen_only') };
    const next = clearResolvedErrors(houseCleaning, errors, s2, s3);

    expect(next.bedrooms).toBeUndefined();
    expect(next.bathrooms).toBeUndefined();
  });

  it('the safety gate clears its own error too (it lives outside answers)', () => {
    const before: FormState = emptyState();
    const errors = validate(towing, before);
    expect(errors[towing.safetyGate!.key]).toBeTruthy();

    const after: FormState = { ...before, gate: 'no' };
    const next = clearResolvedErrors(towing, errors, before, after);

    expect(next[towing.safetyGate!.key]).toBeUndefined();
  });

  it('an unrelated change clears nothing', () => {
    const before: FormState = emptyState();
    const errors: Errors = { variant: 'This is required.' };
    const after: FormState = { ...before };   // nothing changed
    expect(clearResolvedErrors(houseCleaning, errors, before, after)).toBe(errors);
  });
});

/**
 * The rule above is pure and well covered — but a pure rule nobody calls fixes nothing. Mutation
 * testing found exactly that hole: reverting the screen's `onChange` to bare `setState` left every
 * test green. These pin the WIRING, so the fix cannot be silently disconnected.
 */
describe('Item G — the screen actually applies the rule', () => {
  const screenSource = readFileSync(
    join(__dirname, '..', 'app', 'booking', 'service-details.tsx'),
    'utf8',
  );

  it('routes form changes through the clearing handler, not bare setState', () => {
    expect(screenSource).toContain('clearResolvedErrors');
    expect(screenSource).toContain('onChange={handleFormChange}');
    expect(screenSource).not.toContain('onChange={setState}');
  });

  it('routes the safety-gate answer through the same handler', () => {
    expect(screenSource).toMatch(/onPress=\{\(\) => handleFormChange\(\{ \.\.\.state, gate: o\.key \}\)\}/);
    expect(screenSource).not.toMatch(/onPress=\{\(\) => setState\(\{ \.\.\.state, gate: o\.key \}\)\}/);
  });

  it('still validates on Continue — clearing feedback must not replace validation', () => {
    expect(screenSource).toContain('const found = validate(form!, state);');
    expect(screenSource).toContain('setErrors(found);');
  });
});
