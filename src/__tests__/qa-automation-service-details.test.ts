/**
 * Static validation of the native (Maestro) QA automation — Service Details V1.5.
 *
 * Maestro flows cannot run in Jest: they need a booted simulator and a build. What CAN be checked
 * here, cheaply and on every commit, is that the flows still describe the CURRENT booking flow.
 * The failure this guards against is the one V1.5 exists to fix: V1.3 inserted Service Details as
 * step 1, and four flows silently kept expecting Address immediately after a service tap. Nothing
 * caught that until a build was made.
 *
 * These are deliberately simple text scans over the YAML rather than a parser — the properties
 * being asserted are textual (a screen name, a step counter, a referenced file path), and a real
 * parser would be more code to maintain than the thing it validates.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname, basename } from 'path';

import { SERVICES } from '@/constants/services';
import { SERVICE_FORMS } from '@/constants/service-forms';

const FLOW_DIR = join(__dirname, '..', '..', 'qa', 'native', 'flows');

/** Every active flow file (top level; `steps/` holds reusable subflows, checked separately). */
function flowFiles(): string[] {
  return readdirSync(FLOW_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => join(FLOW_DIR, f));
}

function subflowFiles(): string[] {
  const dir = join(FLOW_DIR, 'steps');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => join(dir, f));
}

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

/** Lines that actually do something — comments and blanks are not flow steps. */
function commandLines(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
}

/** True when the line taps a top-level service (a home card or a search result card). */
function isServiceTap(line: string): boolean {
  if (!line.includes('tapOn')) return false;
  return SERVICES.some((s) => line.includes(s.title)) || /KES\s*[\d,]+/.test(line);
}

describe('Maestro flows describe the CURRENT booking flow', () => {
  it('finds the real flow directory (qa/maestro is only a placeholder)', () => {
    expect(existsSync(FLOW_DIR)).toBe(true);
    expect(flowFiles().length).toBeGreaterThan(0);
  });

  it('no flow expects Address immediately after selecting a service', () => {
    // Service Details (V1.3) sits between them. A flow may cross that step inline or via a
    // subflow — but it has to cross it. Walking straight from a service card to "Your Address"
    // is exactly the stale V1.2-era pattern this phase removed.
    const crossesServiceDetails = (line: string) =>
      line.includes('service-details') || line.includes('Step 1 of 5') || line.includes('gate-');
    // Only a POSITIVE expectation counts; `assertNotVisible: "Your Address"` is the opposite.
    const expectsAddress = (line: string) =>
      line.includes('Your Address') && !/assertNotVisible|notVisible/.test(line);

    const stale: string[] = [];
    for (const file of [...flowFiles(), ...subflowFiles()]) {
      const lines = commandLines(read(file));
      lines.forEach((line, i) => {
        if (!isServiceTap(line)) return;
        for (const next of lines.slice(i + 1, i + 4)) {
          if (crossesServiceDetails(next)) return; // the step was crossed — fine
          if (expectsAddress(next)) {
            stale.push(`${file}: ${line} -> ${next}`);
            return;
          }
        }
      });
    }
    expect(stale).toEqual([]);
  });

  it('no flow asserts a 4-step booking flow', () => {
    const stale: string[] = [];
    for (const file of [...flowFiles(), ...subflowFiles()]) {
      const source = read(file);
      if (/Step\s+\d\s+of\s+4/.test(source)) stale.push(file);
    }
    expect(stale).toEqual([]);
  });

  it('every step counter a flow asserts is a real one from the app', () => {
    // The app renders exactly these five; anything else is a typo that would fail only at runtime.
    const allowed = new Set(['Step 1 of 5', 'Step 2 of 5', 'Step 3 of 5', 'Step 4 of 5', 'Step 5 of 5']);
    for (const file of [...flowFiles(), ...subflowFiles()]) {
      for (const found of read(file).match(/Step\s+\d\s+of\s+\d/g) ?? []) {
        expect(allowed.has(found)).toBe(true);
      }
    }
  });

  it('every runFlow subflow reference resolves to a file that exists', () => {
    const missing: string[] = [];
    for (const file of [...flowFiles(), ...subflowFiles()]) {
      for (const m of read(file).matchAll(/runFlow:\s*\{\s*file:\s*([^\s,}]+)/g)) {
        const target = join(dirname(file), m[1]);
        if (!existsSync(target)) missing.push(`${file} -> ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every flow that creates a booking through the UI crosses Service Details', () => {
    // "Place Booking" only exists on Review, so a flow containing it walked the whole flow.
    const offenders: string[] = [];
    for (const file of flowFiles()) {
      const source = read(file);
      if (!source.includes('Place Booking')) continue;
      const crosses = source.includes('Step 1 of 5') || /service-details/.test(source);
      if (!crosses) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

describe('Representative Service Details coverage exists', () => {
  const flow = (name: string) => join(FLOW_DIR, name);

  it.each([
    ['service-details-house-cleaning.yaml'],
    ['service-details-grocery.yaml'],
    ['service-details-massage.yaml'],
    ['service-details-towing-safety.yaml'],
    ['service-details-address-back.yaml'],
    ['booking-duplicate-distinct.yaml'],
  ])('%s exists', (name) => {
    expect(existsSync(flow(name))).toBe(true);
  });

  it('the House Cleaning flow covers disclosure, pruning and the Review read-back', () => {
    const source = read(flow('service-details-house-cleaning.yaml'));
    expect(source).toContain('option-variant-deep_clean');
    expect(source).toContain('option-scope-whole_home');
    expect(source).toContain('input-bedrooms');
    expect(source).toContain('input-bathrooms');
    expect(source).toContain('option-provider_bring_supplies-yes');
    // Pruning: a parent change must remove the children.
    expect(source).toContain('option-scope-kitchen_only');
    expect(source).toMatch(/notVisible:\s*\{\s*id:\s*"question-bedrooms"/);
    // V1.4 read-back on Review.
    expect(source).toContain('Service Details');
  });

  it('the Grocery flow covers two items and labels the ceiling as a GOODS budget', () => {
    const source = read(flow('service-details-grocery.yaml'));
    expect(source).toContain('option-variant-shop_for_me');
    expect(source).toContain('add-item');
    // A genuine second item line, addressed by its own visible header rather than a positional
    // index — the index only holds while every card stays in the hierarchy as the list scrolls.
    expect(source).toContain('below: { text: "Item 2" }');
    expect(source).not.toContain('index:');
    expect(source).toContain('input-max_goods_budget');
    expect(source).toContain('option-substitution-');
    expect(source).toContain('Maximum to spend on the goods');
    // Brand must be targeted by the field's OWN testID. Tapping its label cannot focus it — an
    // Input's label is a plain Text sibling of the TextInput — which is what made this a silent
    // no-op through runs 32021907035..32035890869.
    expect(source).toContain('id: "item-brand-line_.*"');
    expect(source).not.toMatch(/- tapOn: "Brand or preference \(optional\)"/);
    // ...and the captured value must be PROVEN, not assumed from inputText completing.
    expect(source).toContain('- assertVisible: "Brookside"');
    expect(source).toMatch(/assertNotVisible:\s*".\*Order total/);
    expect(source).toMatch(/assertNotVisible:\s*".\*Amount due/);
  });

  it('the Massage flow pins the one-person rule, the preference wording and no media', () => {
    const source = read(flow('service-details-massage.yaml'));
    expect(source).toMatch(/assertNotVisible:.*number_of_people/);
    expect(source).toMatch(/assertNotVisible:.*How many people/);
    expect(source).toContain('option-duration_minutes-60');
    expect(source).toContain('disclaimer-therapist_gender_preference');
    expect(source).toMatch(/assertNotVisible:\s*\{\s*id:\s*"service-details-media"/);
  });

  it('scrolls to content revealed below the fold before asserting it', () => {
    // Two sites in the same class, both found the expensive way. Run 32125271205 asserted
    // question-vehicle_make_model visible the moment the towing safety block cleared — but the
    // form is restored below the gate and seven issue options, so it was off-screen. The Address
    // Back flow has the same shape after returning from Address: Service Details stays mounted,
    // so its ScrollView can still hold the position it had when we left it.
    //
    // Deliberately site-specific: it pins the two targets known to be revealed below the fold,
    // rather than forcing every assertVisible in every flow to scroll.
    const towing = read(flow('service-details-towing-safety.yaml'));
    expect(towing).toMatch(
      /scrollUntilVisible: \{ element: \{ id: "question-vehicle_make_model" \}[^\n]*\n- assertVisible: \{ id: "question-vehicle_make_model" \}/,
    );

    const back = commandLines(read(flow('service-details-address-back.yaml')));
    back.forEach((line, i) => {
      if (!line.includes('booking-address-back') || !line.startsWith('- tapOn:')) return;
      const next = back[i + 1] ?? '';
      expect(next).toMatch(/scrollUntilVisible.*Step 1 of 5/);
    });
  });

  it('reaches a service buried in the Home grid via Search, not a deep Home scroll', () => {
    // Run 32120724458 died before Towing even started: scrolling Home to reach Car Towing left
    // the screen stopped mid-grid with an accessibility hierarchy holding no app content. Car
    // Towing carries no badge, so it appears only in the Auto category grid far down the page.
    // Search reaches any service in one step and customer-nav-search.yaml has proven that entry
    // in every run. Narrow by design: this pins the ONE flow whose target is known to be buried.
    // House Cleaning (badge "Popular", first in the catalogue) and Massage (badge "New") surface
    // near the top of Home and their scroll entries are runtime-proven, so they are left alone.
    const source = read(flow('service-details-towing-safety.yaml'));
    expect(source).toContain('- tapOn: "Search services"');
    expect(source).toContain('- inputText: "Car Towing"');
    expect(source).not.toMatch(/scrollUntilVisible: \{ element: \{ text: "\.\*Car Towing\.\*" \}, direction: DOWN/);
  });

  it('the Towing flow covers the blocking gate AND the non-blocking path', () => {
    const source = read(flow('service-details-towing-safety.yaml'));
    expect(source).toContain('gate-option-yes');
    expect(source).toContain('gate-option-no');
    expect(source).toContain('safety-block');
    expect(source).toContain('QuickServe is not an emergency service');
    // Locked decision OD3 — no emergency number may be presented.
    expect(source).toMatch(/assertNotVisible:\s*".\*999/);
    expect(source).toMatch(/assertNotVisible:\s*".\*112/);
    expect(source).toMatch(/assertNotVisible:\s*".\*911/);
    // The block must actually block, not merely warn.
    expect(source).toMatch(/assertNotVisible:\s*\{\s*id:\s*"service-details-continue"/);
  });

  it('the Address Back flow proves the return lands on a populated Service Details', () => {
    const source = read(flow('service-details-address-back.yaml'));
    expect(source).toContain('booking-address-back');
    expect(source).toContain('Step 1 of 5');
    expect(source).toMatch(/assertNotVisible:\s*"What service do you need today\?"/);
    expect(source).toContain('question-bathrooms');
  });

  // RETIRED GUARD — "every keyboard-dismiss tap must be preceded by a scroll UP to the heading".
  // It encoded the scroll-to-heading MECHANISM, which runs 32031583358 and 32035890869 showed to be
  // structurally unreliable at the deepest Grocery position. Dismissal now taps a nearby static
  // label with no scroll at all, so that rule would forbid the correct behaviour. Its intent lives
  // on, per-site, in "uses the keyboard-dismiss strategy proven at each site" below, which
  // permits BOTH mechanisms and forbids each only where runtime showed it fails. Do not reinstate.

  it('never assumes the whole Review card fits one viewport', () => {
    // Run 32026499557 failed here: the flow scrolled once to the "Service Details" header, then
    // asserted several values in a batch. On an iPhone SE only the first row was on screen, so
    // "The whole home" — rendered correctly, one row further down — reported as not visible.
    //
    // The rule: from the moment a flow reaches Review, every assertVisible must be immediately
    // preceded by a scrollUntilVisible for the SAME target. Step counters are exempt: they render
    // at the top of each step screen and are on screen the moment it appears.
    const target = (line: string): string | null => {
      const text = /^- assertVisible: "([^"]+)"/.exec(line);
      if (text) return text[1];
      const id = /^- assertVisible: \{ id: "([^"]+)"/.exec(line);
      return id ? id[1] : null;
    };

    const offenders: string[] = [];
    for (const file of flowFiles().filter((f) => /service-details-.*\.yaml$|booking-duplicate-distinct\.yaml$/.test(f))) {
      const lines = commandLines(read(file));
      const reviewStart = lines.findIndex((l) => l.includes('Review your booking'));
      if (reviewStart === -1) continue; // this flow never reaches Review
      lines.slice(reviewStart + 1).forEach((line, offset) => {
        const wanted = target(line);
        if (!wanted || /^Step \d of \d$/.test(wanted)) return;
        const prev = lines[reviewStart + offset] ?? '';
        const guarded = prev.includes('scrollUntilVisible') && prev.includes(wanted);
        if (!guarded) offenders.push(`${file}: asserts "${wanted}" on Review with no scroll to it`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('uses the keyboard-dismiss strategy proven at each site, not one global mechanism', () => {
    // Neither dismissal method works everywhere, and runtime proved both halves:
    //
    //   HEADING-SCROLL (inputText -> scroll to service title -> tap it) passed House Cleaning
    //   end to end in runs 32031583358 and 32035890869, and passed all five Grocery ITEM-field
    //   dismissals in 32035890869. But it failed 2/2 at Grocery's goods-budget field, the deepest
    //   point in the longest form, where Maestro's accessibility snapshot goes stale mid-scroll.
    //
    //   OWN-LABEL (inputText -> tap the field's own label, no scroll) removes that long scroll,
    //   but the label sits directly above its input and does not reliably blur it: run
    //   32114392487 left "48" in a bedrooms field capped at 10, so the app correctly refused to
    //   continue.
    //
    // So the rule is per-site, encoded by flow and field class rather than by line number.
    const offenders: string[] = [];

    // A. Short numeric forms — heading-scroll is proven here; own-label caused the regression.
    //    Every text entry must be followed by a scroll-then-tap, never a bare tap.
    for (const name of ['service-details-house-cleaning.yaml', 'service-details-address-back.yaml']) {
      const lines = commandLines(read(join(FLOW_DIR, name)));
      lines.forEach((line, i) => {
        if (!line.startsWith('- inputText:')) return;
        const next = lines[i + 1] ?? '';
        if (!next.startsWith('- scrollUntilVisible')) {
          offenders.push(`${name}: ${line} is dismissed without the proven scroll-then-tap`);
        }
      });
    }

    // B. Grocery's goods budget — the one site where the heading round trip demonstrably fails.
    const grocery = commandLines(read(join(FLOW_DIR, 'service-details-grocery.yaml')));
    grocery.forEach((line, i) => {
      if (!/^- inputText:/.test(line)) return;
      const typedIntoBudget = grocery.slice(Math.max(0, i - 2), i).some((l) => l.includes('input-max_goods_budget'));
      if (!typedIntoBudget) return;
      const after = grocery.slice(i + 1, i + 3).join(' | ');
      if (after.includes('scrollUntilVisible') && after.includes('"Grocery Delivery"')) {
        offenders.push('service-details-grocery.yaml: budget dismissal must not scroll back to the service heading');
      }
    });

    expect(offenders).toEqual([]);
  });

  it('the distinct-duplicate flow uses two genuinely different primary answers', () => {
    const source = read(flow('booking-duplicate-distinct.yaml'));
    expect(source).toContain('option-variant-laundry_only');
    expect(source).toMatch(/assertNotVisible:\s*".\*already have an active/);
    expect(source).toMatch(/assertNotVisible:\s*"Book another anyway"/);
  });
});

describe('Flow selectors match testIDs the app actually renders', () => {
  /** testIDs the flows depend on, with the file that owns each one. */
  const OWNED: [string, string][] = [
    ['service-details-continue', 'src/app/booking/service-details.tsx'],
    ['service-details-back', 'src/app/booking/service-details.tsx'],
    ['safety-block', 'src/app/booking/service-details.tsx'],
    ['service-details-media', 'src/components/booking/service-details-form.tsx'],
    ['add-item', 'src/components/booking/service-details-form.tsx'],
    ['item-brand-', 'src/components/booking/service-details-form.tsx'],
    ['booking-address-back', 'src/app/booking/address.tsx'],
  ];

  it.each(OWNED)('the app still renders testID "%s" (in %s)', (testId, file) => {
    const source = readFileSync(join(__dirname, '..', '..', file), 'utf8');
    // Some testIDs are literals (testID="add-item"), others are template literals built per row
    // (testID={`item-brand-${line.line_id}`}) — accept either quoting.
    expect(source).toMatch(new RegExp(`["\`]${testId.replace(/[-]/g, '\\-')}`));
  });

  it('the app renders the five step counters the flows assert', () => {
    const screens: [string, string][] = [
      ['src/app/booking/service-details.tsx', 'Step 1 of 5'],
      ['src/app/booking/address.tsx', 'Step 2 of 5'],
      ['src/app/booking/schedule.tsx', 'Step 3 of 5'],
      ['src/app/booking/notes.tsx', 'Step 4 of 5'],
      ['src/app/booking/review.tsx', 'Step 5 of 5'],
    ];
    for (const [file, label] of screens) {
      expect(readFileSync(join(__dirname, '..', '..', file), 'utf8')).toContain(label);
    }
  });
});


// Service Details V1.4 added a section to the customer Booking Detail screen, which is correct
// product behaviour and made that screen longer. The legacy Phase 3F review flow had been
// tapping the comment field with no scroll of its own, relying on it happening to sit on screen
// after the star scroll — and run 32135248465 failed there. Screen length is owned by the
// product and will keep growing, so the flow must reach each review target on its own terms.
describe('The legacy review flow does not assume a fixed Booking Detail screen length', () => {
  const source = read(join(FLOW_DIR, 'customer-review.yaml'));
  const lines = commandLines(source);
  const PLACEHOLDER = 'Share your experience…';

  it('scrolls to the comment field before tapping it, rather than riding the star scroll', () => {
    const tapIndex = lines.findIndex((l) => l.startsWith('- tapOn:') && l.includes(PLACEHOLDER));
    expect(tapIndex).toBeGreaterThan(-1);

    const scrollIndex = lines.findIndex(
      (l) => l.includes('scrollUntilVisible') && l.includes(PLACEHOLDER),
    );
    expect(scrollIndex).toBeGreaterThan(-1);
    expect(scrollIndex).toBeLessThan(tapIndex);
  });

  it('still submits a real review — the fix must not trade coverage for a green run', () => {
    expect(source).toContain('- inputText: "${COMMENT}"');
    expect(source).toMatch(/scrollUntilVisible.*Submit review/);
    expect(source).toContain('- tapOn: "Submit review"');
    expect(source).toMatch(/extendedWaitUntil:.*"Edit review"/);
  });
});


// Run 32150749532 (House Cleaning, option-scope-kitchen_only): a preceding DOWN scroll left the
// option above the ScrollView viewport but still inside screen bounds. Maestro's visibility model
// is frame-vs-screen and models no occlusion, so it reported the option 100% visible, performed
// zero scroll gestures (302 ms vs 2462 ms in the run that passed) and tapped a point underneath the
// fixed Back header — a no-op. scope stayed whole_home, bedrooms never pruned, the assertion failed
// and the product was never at fault. centerElement makes an UP scroll continue until the element's
// centre clears the top 30% of the screen, which is far below the header; when the target is
// already clear it changes nothing. The rule is the mechanism, not a list of known-bad sites.
describe('UP-scroll targets that are then tapped are brought clear of the fixed header', () => {
  it('every UP scroll whose target is tapped next uses centerElement', () => {
    const offenders: string[] = [];

    for (const file of flowFiles()) {
      const lines = commandLines(read(file));
      lines.forEach((line, i) => {
        if (!line.includes('scrollUntilVisible') || !/direction:\s*UP/.test(line)) return;
        const target = /id:\s*"([^"]+)"/.exec(line)?.[1];
        if (!target) return; // heading round-trips select by text and are handled separately

        const next = lines[i + 1] ?? '';
        const tapsSameTarget = next.startsWith('- tapOn') && next.includes(`"${target}"`);
        if (!tapsSameTarget) return; // scrolled to assert, not to tap — occlusion cannot mislead it

        if (!/centerElement:\s*true/.test(line)) {
          offenders.push(`${basename(file)}: UP scroll to ${target} is tapped without centerElement`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});


// Run 32183656801 (Grocery, substitution): the flow selected the question label with the bare
// string "If something is unavailable". Required questions render their label with a trailing
// " *", and Maestro matches text selectors as a FULL-match regex, so the bare pattern could never
// match "If something is unavailable *". The screenshot and hierarchy both showed the question,
// its three options, the media block and Continue rendered correctly — the product was fine and
// the selector simply could not match. Every other label selector in that flow is already wrapped.
// Scoped deliberately to REQUIRED question labels: those are the ones that carry the asterisk.
// Service titles, step counters, item headings and typed values are matched bare on purpose.
describe('Required-field question labels are not selected with bare full-match text', () => {
  it('every required label selector allows for the trailing asterisk', () => {
    const requiredLabels = new Set<string>();
    for (const form of Object.values(SERVICE_FORMS)) {
      const questions = [form.primary, ...form.questions];
      for (const q of questions) {
        if (q?.required && typeof q.label === 'string') requiredLabels.add(q.label);
      }
    }
    expect(requiredLabels.size).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of flowFiles()) {
      commandLines(read(file)).forEach((line) => {
        // Only bare selectors matter — a wrapped ".*…*" pattern already tolerates the asterisk.
        const quoted = line.match(/"([^"]+)"/g) ?? [];
        for (const raw of quoted) {
          const value = raw.slice(1, -1);
          if (value.includes('.*')) continue;
          if (!requiredLabels.has(value)) continue;
          offenders.push(`${basename(file)}: "${value}" is a required label and cannot full-match its " *" suffix`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});


// Android CORE run 2026-08-19 failed asserting question-bathrooms straight after whole_home
// disclosed it. The product was correct — a manual scroll screenshot shows bedrooms AND bathrooms
// rendered — but they sit below the fold: the hierarchy held question-bedrooms as a 1px sliver at
// [72,2919][1272,2920] on a 2992px screen, and question-bathrooms not at all. iOS reports frames
// for nodes scrolled outside the ScrollView clip, so the same assertions passed there; Android
// reports only what is on screen, so it caught an assumption that was never true on either.
//
// Scoped to the targets MEASURED below the fold, not to conditional questions in general. Sites
// with a single disclosed block above them (question-scope, question-duration_minutes,
// question-laundry_quantity) were measured on-screen and are deliberately left alone — a blanket
// rule would force churn at sites the audit proved safe.
describe('Targets disclosed below the fold are scrolled to before being asserted', () => {
  const BELOW_FOLD = ['question-bedrooms', 'question-bathrooms', 'input-bedrooms'];

  it('every visibility assertion on a below-fold target is preceded by a scroll to it', () => {
    const offenders: string[] = [];

    for (const file of flowFiles()) {
      const lines = commandLines(read(file));
      lines.forEach((line, i) => {
        const isAssertion =
          line.startsWith('- assertVisible') ||
          (line.startsWith('- extendedWaitUntil') && line.includes('visible:') && !line.includes('notVisible'));
        if (!isAssertion) return;

        for (const target of BELOW_FOLD) {
          if (!line.includes(`"${target}"`)) continue;
          // The scroll must REACH this target first. Scrolling DOWN to input-X also reaches
          // question-X: the label renders directly above its field, so an element entering from
          // the bottom arrives after its own label. Flows that assert the field VALUE must target
          // the input, so accepting the pair is modelling the mechanism, not loosening the rule.
          const pair = target.startsWith('question-')
            ? target.replace('question-', 'input-')
            : target.replace('input-', 'question-');
          const reached = lines
            .slice(Math.max(0, i - 3), i)
            .some(
              (l) =>
                l.includes('scrollUntilVisible') &&
                (l.includes(`"${target}"`) || l.includes(`"${pair}"`)),
            );
          if (!reached) {
            offenders.push(`${basename(file)}: "${target}" is asserted without first scrolling to it`);
          }
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});


// The Android runners drive a LOCAL emulator, unlike the iOS ones which run on a CI macOS host
// with a single simulator. Two things must hold or a "certification" run means nothing: every
// Maestro invocation must state the platform, and it must state WHICH device — a second emulator
// or a plugged-in phone would otherwise make the target ambiguous. The third rule keeps the
// non-push runner honest: this APK was built without GOOGLE_SERVICES_JSON, so a push-dependent
// flow appearing there would be an unbacked certification claim, not a coverage improvement.
describe('Android runners target an explicit device and stay non-push', () => {
  const RUNNER_DIR = join(__dirname, '..', '..', 'qa', 'native');
  const androidRunners = () =>
    readdirSync(RUNNER_DIR)
      .filter((f) => f.startsWith('android-') && f.endsWith('.sh'))
      .map((f) => join(RUNNER_DIR, f));

  /** Lines that actually invoke Maestro to run a flow. */
  const maestroInvocations = (source: string) =>
    source
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => !l.startsWith('#'))
      .filter((l) => l.includes('maestro ') && l.includes('test'));

  it('there is at least one Android runner to check', () => {
    expect(androidRunners().length).toBeGreaterThan(0);
  });

  it('every Maestro invocation names the platform and an explicit device', () => {
    const offenders: string[] = [];
    for (const file of androidRunners()) {
      const source = read(file);
      // A helper (mt(), run()) may carry the flags on behalf of the calls that use it.
      const helperCovers = source.includes('--platform android') && source.includes('--device "$DEVICE"');
      for (const line of maestroInvocations(source)) {
        const own = line.includes('--platform android') && line.includes('--device');
        if (!own && !helperCovers) {
          offenders.push(`${basename(file)}: maestro invoked without explicit platform/device`);
        }
      }
      // The ASSIGNMENT, not the word: ANDROID_DEVICE also appears in the failure message, so a
      // bare substring check would pass even with the override deleted.
      if (!source.includes('${ANDROID_DEVICE:-}')) offenders.push(`${basename(file)}: no ANDROID_DEVICE override`);
      if (!source.includes('pm list packages')) offenders.push(`${basename(file)}: no installed-package precondition`);
      if (!source.includes('set -euo pipefail')) offenders.push(`${basename(file)}: missing set -euo pipefail`);
      // Code only — the runners discuss `continue-on-error` in prose precisely to explain why
      // they do not use it, and a guard that cannot tell comment from command is worse than none.
      const code = source
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
      if (code.some((l) => l.includes('continue-on-error'))) {
        offenders.push(`${basename(file)}: continue-on-error is never acceptable here`);
      }
      if (code.some((l) => l.includes('maestro ') && l.includes('|| true'))) {
        offenders.push(`${basename(file)}: a certification command must not be || true`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no Android runner exercises a push-dependent flow', () => {
    const PUSH_FLOWS = ['push-delivery', 'push-token', 'terminated-push', 'push-routing'];
    const offenders: string[] = [];
    for (const file of androidRunners()) {
      const source = read(file);
      for (const flow of PUSH_FLOWS) {
        if (source.includes(`${flow}.yaml`)) offenders.push(`${basename(file)}: references push-dependent ${flow}.yaml`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// Phase 3F, 2026-08-19: the third provider-advance tapped the job card, then failed waiting for
// "Job Detail" because Android's location-consent dialog ("... use Location ... No thanks / Turn
// on") was on top for the whole 20s window. Job Detail renders a provider live-location section,
// which is what raises it. The flow already had a "No thanks" guard — ordered AFTER the assertion
// it was meant to protect, so it could never run. iOS raises no such dialog there, which is why
// the ordering survived on that platform. A dismissal guard is only useful before the assertion
// that the dialog can block.
describe('System-dialog guards run before the assertion they protect', () => {
  const flowPath = join(__dirname, '..', '..', 'qa', 'native', 'flows', 'provider-advance.yaml');

  it('the job-card tap is followed by a dialog guard before the Job Detail wait', () => {
    const lines = commandLines(read(flowPath));

    const tapIndex = lines.findIndex((l) => l.startsWith('- tapOn') && l.includes('House Cleaning'));
    expect(tapIndex).toBeGreaterThan(-1);

    const jobDetailIndex = lines.findIndex(
      (l, i) => i > tapIndex && l.includes('visible: "Job Detail"'),
    );
    expect(jobDetailIndex).toBeGreaterThan(tapIndex);

    const guardBetween = lines
      .slice(tapIndex + 1, jobDetailIndex)
      .some((l) => l.includes('runFlow') && (l.includes('No thanks') || l.includes('Allow')));

    expect(guardBetween).toBe(true);
  });

  it('still waits for Job Detail on its own terms — the fix must not drop the assertion', () => {
    const source = read(flowPath);
    expect(source).toContain('- extendedWaitUntil: { visible: "Job Detail", timeout: 20000 }');
  });
});
