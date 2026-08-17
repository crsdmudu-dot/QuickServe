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
import { join, dirname } from 'path';

import { SERVICES } from '@/constants/services';

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
    expect(source).toContain('index: 1'); // a genuine second item line
    expect(source).toContain('input-max_goods_budget');
    expect(source).toContain('option-substitution-');
    expect(source).toContain('Maximum to spend on the goods');
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

  it('never dismisses the iOS keyboard by tapping a heading that was scrolled off-screen', () => {
    // Run 32021907035 failed here: the flow scrolled DOWN to reach a text input, typed, then
    // tapped the screen heading to dismiss the keyboard — but that scroll had pushed the heading
    // out of view, so "Element not found: House Cleaning". address-journey.yaml gets this right by
    // scrolling UP to the heading first. This pins that order for the Service Details flows, which
    // scroll far enough for it to matter; the older flows type near the top and are grandfathered.
    const offenders: string[] = [];
    for (const file of flowFiles().filter((f) => /service-details-.*\.yaml$/.test(f))) {
      const lines = commandLines(read(file));
      lines.forEach((line, i) => {
        if (!line.startsWith('- inputText:')) return;
        const next = lines[i + 1] ?? '';
        const tap = /^- tapOn: "([^"]+)"/.exec(next);
        if (!tap) return; // not a keyboard-dismiss tap
        offenders.push(`${file}:${i + 2} taps "${tap[1]}" straight after inputText, with no scroll UP`);
      });
    }
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
    ['booking-address-back', 'src/app/booking/address.tsx'],
  ];

  it.each(OWNED)('the app still renders testID "%s" (in %s)', (testId, file) => {
    const source = readFileSync(join(__dirname, '..', '..', file), 'utf8');
    expect(source).toContain(`"${testId}"`);
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
