/**
 * Tests for src/components/booking/service-details-summary.tsx — the shared Service Details
 * renderer used by Review, Customer Booking Detail, Provider Job Detail and both Admin views.
 *
 * The theme underpinning covers HISTORICAL INTEGRITY: this component must render a booking from
 * its own snapshot forever, so changing today's SERVICE_FORMS configuration can never change how
 * an old booking reads.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { render, screen } from '@testing-library/react-native';

import { ServiceDetailsSummary } from '@/components/booking/service-details-summary';
import { SERVICE_FORMS } from '@/constants/service-forms';

/**
 * Every VISIBLE string in the last render(), joined — for "must NOT appear" assertions.
 * Walks the tree's text children only, so component props and style values never count as
 * something the user can read.
 */
function renderedText(): string {
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      parts.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(screen.toJSON());
  return parts.join(' | ');
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    schema: 1,
    form_version: 3,
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
    answers: [
      { key: 'scope', question: 'Scope', kind: 'single', value: 'whole_home', display: 'Whole home' },
      { key: 'bedrooms', question: 'Bedrooms', kind: 'number', value: 4, display: '4' },
      { key: 'supplies', question: 'Provider brings supplies', kind: 'boolean', value: true, display: 'Yes' },
      {
        key: 'focus_areas',
        question: 'Anywhere needing extra attention?',
        kind: 'multi',
        value: ['kitchen', 'bathroom'],
        display: 'Kitchen, Bathroom',
      },
    ],
    addons: [
      { key: 'ironing', label: 'Ironing' },
      { key: 'windows', label: 'Interior windows' },
    ],
    items: null,
    flags: {},
    ...overrides,
  };
}

const grocerySnapshot = {
  schema: 1,
  form_version: 1,
  service_slug: 'grocery-delivery',
  service_title: 'Grocery Delivery',
  primary_kind: 'variant',
  primary: {
    key: 'variant',
    question: 'How would you like to shop?',
    kind: 'single',
    value: 'shop_for_me',
    display: 'Shop for me',
  },
  answers: [],
  addons: [],
  items: {
    kind: 'grocery',
    goods_budget: { currency: 'KES', max_goods_amount: 5000 },
    substitution: { value: 'ask_first', display: 'Contact me before substituting' },
    lines: [
      { line_id: 'line_a', name: 'Milk', qty: 2, unit: 'bottles', brand: 'Brookside', note: null },
      { line_id: 'line_b', name: 'Rice', qty: 5, unit: 'kg', brand: null, note: null },
      { line_id: 'line_c', name: 'Cooking oil', qty: 2, unit: 'litres', brand: null, note: 'Any brand is fine' },
    ],
  },
  flags: {},
};

describe('ServiceDetailsSummary — a valid snapshot', () => {
  it('renders the primary answer from its saved question and saved label', () => {
    render(<ServiceDetailsSummary details={snapshot()} />);
    expect(screen.getByTestId('service-details-summary')).toBeOnTheScreen();
    expect(screen.getByText('What kind of cleaning do you need?')).toBeOnTheScreen();
    expect(screen.getByText('Deep cleaning')).toBeOnTheScreen();
  });

  it('renders every follow-up answer from its saved label', () => {
    render(<ServiceDetailsSummary details={snapshot()} />);
    expect(screen.getByText('Scope')).toBeOnTheScreen();
    expect(screen.getByText('Whole home')).toBeOnTheScreen();
  });

  it('renders booleans as Yes / No, never true / false', () => {
    render(
      <ServiceDetailsSummary
        details={snapshot({
          answers: [
            { key: 'supplies', question: 'Provider brings supplies', kind: 'boolean', value: true, display: 'Yes' },
            { key: 'pets', question: 'Any pets at home', kind: 'boolean', value: false, display: 'No' },
          ],
        })}
      />,
    );
    expect(screen.getByText('Yes')).toBeOnTheScreen();
    expect(screen.getByText('No')).toBeOnTheScreen();
    expect(renderedText()).not.toMatch(/\btrue\b|\bfalse\b/);
  });

  it('renders numbers cleanly and never invents a unit that was not captured', () => {
    render(<ServiceDetailsSummary details={snapshot()} />);
    expect(screen.getByText('Bedrooms')).toBeOnTheScreen();
    expect(screen.getByText('4')).toBeOnTheScreen();
  });

  it('renders a multi-select answer from its saved display', () => {
    render(<ServiceDetailsSummary details={snapshot()} />);
    expect(screen.getByText('Kitchen, Bathroom')).toBeOnTheScreen();
  });

  it('renders selected add-ons under an Add-ons heading', () => {
    render(<ServiceDetailsSummary details={snapshot()} />);
    expect(screen.getByText('Add-ons')).toBeOnTheScreen();
    expect(screen.getByText('• Ironing')).toBeOnTheScreen();
    expect(screen.getByText('• Interior windows')).toBeOnTheScreen();
  });

  it('omits empty sections entirely rather than showing empty headings', () => {
    render(<ServiceDetailsSummary details={snapshot({ addons: [], items: null })} />);
    expect(screen.queryByText('Add-ons')).toBeNull();
    expect(screen.queryByText('Requested items')).toBeNull();
    expect(screen.queryByText('Maximum goods budget')).toBeNull();
    expect(screen.queryByText('Substitutions')).toBeNull();
  });

  it('never shows machine keys, schema or form_version', () => {
    render(<ServiceDetailsSummary details={snapshot()} audience="admin" />);
    const text = renderedText();
    for (const internal of ['deep_clean', 'whole_home', 'form_version', 'primary_kind', 'house-cleaning']) {
      expect(text).not.toContain(internal);
    }
    expect(screen.queryByText('variant')).toBeNull();
    expect(screen.queryByText('schema')).toBeNull();
  });
});

describe('ServiceDetailsSummary — grocery request list', () => {
  it('renders each requested item with quantity, brand and note', () => {
    render(<ServiceDetailsSummary details={grocerySnapshot} audience="admin" />);
    expect(screen.getByText('Requested items')).toBeOnTheScreen();
    expect(screen.getByText('Milk')).toBeOnTheScreen();
    expect(screen.getByText('2 bottles')).toBeOnTheScreen();
    expect(screen.getByText('Brand: Brookside')).toBeOnTheScreen();
    expect(screen.getByText('Rice')).toBeOnTheScreen();
    expect(screen.getByText('5 kg')).toBeOnTheScreen();
    expect(screen.getByText('Cooking oil')).toBeOnTheScreen();
    expect(screen.getByText('Any brand is fine')).toBeOnTheScreen();
  });

  it('labels the spend ceiling as a maximum GOODS budget', () => {
    render(<ServiceDetailsSummary details={grocerySnapshot} audience="admin" />);
    expect(screen.getByText('Maximum goods budget')).toBeOnTheScreen();
    expect(screen.getByText('KES 5,000')).toBeOnTheScreen();
  });

  it('never presents the goods budget as an order total, amount due or final charge', () => {
    render(<ServiceDetailsSummary details={grocerySnapshot} audience="admin" />);
    expect(renderedText()).not.toMatch(/total|amount due|final charge|you pay|payable/i);
    // ...and it says plainly that fees sit outside it.
    expect(screen.getByText(/Delivery and service fees are separate/i)).toBeOnTheScreen();
  });

  it('renders the substitution preference', () => {
    render(<ServiceDetailsSummary details={grocerySnapshot} audience="admin" />);
    expect(screen.getByText('Substitutions')).toBeOnTheScreen();
    expect(screen.getByText('Contact me before substituting')).toBeOnTheScreen();
  });
});

describe('ServiceDetailsSummary — legacy, malformed and future snapshots', () => {
  it('shows a legacy-friendly line, not raw data, when a booking has no details', () => {
    render(<ServiceDetailsSummary details={null} />);
    expect(screen.getByTestId('service-details-summary-empty')).toBeOnTheScreen();
    expect(screen.getByText('Service details were not captured for this booking.')).toBeOnTheScreen();
    expect(renderedText()).not.toMatch(/null|undefined|invalid|error/i);
  });

  it('renders nothing at all when the surface asks to omit the empty state', () => {
    render(<ServiceDetailsSummary details={null} emptyText={null} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('does not crash on malformed data of any shape', () => {
    for (const bad of [undefined, 42, 'nope', [], {}, { schema: 1 }, { schema: 1, service_slug: 'x', primary: { key: 'k' }, answers: 'no' }]) {
      const view = render(<ServiceDetailsSummary details={bad} />);
      expect(screen.getByTestId('service-details-summary-empty')).toBeOnTheScreen();
      view.unmount();
    }
  });

  it('renders a newer-schema snapshot safely from its own saved labels', () => {
    render(
      <ServiceDetailsSummary
        details={snapshot({
          schema: 99,
          answers: [
            {
              key: 'unknown_future_question',
              question: 'A question this build has never seen',
              kind: 'single',
              value: 'future_value',
              display: 'Its saved answer',
            },
          ],
          future_block: { nested: true },
        })}
      />,
    );
    expect(screen.getByText('A question this build has never seen')).toBeOnTheScreen();
    expect(screen.getByText('Its saved answer')).toBeOnTheScreen();
    expect(renderedText()).not.toContain('future_value');
  });
});

describe('ServiceDetailsSummary — historical integrity', () => {
  it('renders an OLD booking from its saved label even after the current config renames it', () => {
    // The live configuration for this service today...
    const currentLabel = SERVICE_FORMS['house-cleaning'].primary.label;

    // ...and an older booking that captured different wording at the time.
    const historical = snapshot({
      form_version: 1,
      primary: {
        key: 'variant',
        question: 'What kind of clean is this?', // the question as it read back then
        kind: 'single',
        value: 'deep_clean',
        display: 'Deep cleaning', // the label as it read back then
      },
      answers: [],
      addons: [],
    });

    render(<ServiceDetailsSummary details={historical} />);

    expect(screen.getByText('What kind of clean is this?')).toBeOnTheScreen();
    expect(screen.getByText('Deep cleaning')).toBeOnTheScreen();
    // The current wording is NOT substituted in — nothing was re-resolved from config.
    expect(renderedText()).not.toContain(currentLabel);
  });

  it('renders a saved label the current configuration no longer contains at all', () => {
    render(
      <ServiceDetailsSummary
        details={snapshot({
          primary: {
            key: 'variant',
            question: 'Cleaning type',
            kind: 'single',
            value: 'deep_clean',
            // A label that has since been renamed to something else in SERVICE_FORMS.
            display: 'Intensive cleaning (retired wording)',
          },
          answers: [],
          addons: [],
        })}
      />,
    );
    expect(screen.getByText('Intensive cleaning (retired wording)')).toBeOnTheScreen();
  });

  it('the renderer and its read model never import the live form configuration', () => {
    // A structural guarantee: if these modules cannot see SERVICE_FORMS, they cannot
    // re-resolve a historical answer against it.
    const files = [
      join(__dirname, 'service-details-summary.tsx'),
      join(__dirname, '..', '..', 'lib', 'service-details-view.ts'),
    ];
    for (const file of files) {
      // Comments are stripped first — these files EXPLAIN the rule in prose, they just must
      // never execute against the configuration.
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(/from '@\/constants\/service-forms'/);
      expect(code).not.toMatch(/SERVICE_FORMS|getServiceForm|customerOptions/);
    }
  });
});

describe('ServiceDetailsSummary — audience and immutability', () => {
  const flagged = snapshot({ flags: { priority: true, safety_ack: true } });

  it('does not repeat safety/priority wording on the customer surface', () => {
    render(<ServiceDetailsSummary details={flagged} audience="customer" />);
    expect(screen.queryByTestId('service-details-summary-priority')).toBeNull();
    expect(screen.queryByText(/acknowledged the safety notice/i)).toBeNull();
  });

  it('shows the priority flag to the provider', () => {
    render(<ServiceDetailsSummary details={flagged} audience="provider" />);
    expect(screen.getByText('Priority attention')).toBeOnTheScreen();
    // The acknowledgement is an audit detail, not something the provider acts on.
    expect(screen.queryByText(/acknowledged the safety notice/i)).toBeNull();
  });

  it('shows the priority flag and the safety acknowledgement to admin', () => {
    render(<ServiceDetailsSummary details={flagged} audience="admin" />);
    expect(screen.getByText('Priority attention')).toBeOnTheScreen();
    expect(screen.getByText(/acknowledged the safety notice/i)).toBeOnTheScreen();
  });

  it('invents no flag that the snapshot did not capture', () => {
    render(<ServiceDetailsSummary details={snapshot()} audience="admin" />);
    expect(screen.queryByText('Priority attention')).toBeNull();
  });

  it('offers no way to edit the snapshot on any surface', () => {
    // Display-only by construction: the component source has no input, no press handler and no
    // state, so no surface can accidentally grow an edit affordance through it.
    const source = readFileSync(join(__dirname, 'service-details-summary.tsx'), 'utf8');
    expect(source).not.toMatch(/TextInput|onPress|onChange|useState|Button/);
  });

  it('does not mutate the snapshot it renders', () => {
    const input = snapshot();
    const before = JSON.stringify(input);
    render(<ServiceDetailsSummary details={input} audience="admin" />);
    expect(JSON.stringify(input)).toBe(before);
  });
});
