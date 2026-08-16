/**
 * service-forms.ts — Service Details V1.2 configuration for all 19 services.
 *
 * CONFIG-AS-CODE. One typed definition per service slug, rendered later (V1.3) by a single
 * generic renderer. No per-service screens, no DB form CMS, no admin form builder.
 *
 * Design rules enforced throughout:
 *  - ONE primary question (a `variant` = what is bought, or an `issue` = symptom reported),
 *    then roughly 2–4 essential follow-ups. Never a questionnaire.
 *  - `showIf` holds ONE parent key and a simple value test. No nesting, no expressions.
 *    Chains are allowed (bedrooms → scope → variant); a question whose parent is hidden is
 *    itself hidden, which the renderer resolves transitively.
 *  - Machine keys are STABLE and never reused for a different meaning. Labels may change
 *    freely — every answer is snapshotted with its label at booking time.
 *  - `not_sure` and `other` are DISTINCT: `not_sure` routes to inspection/triage; `other`
 *    means the option list cannot describe the request and therefore REQUIRES a description.
 *  - Customers are never asked to diagnose. Symptoms, not causes.
 *  - Options may be `disabled` — present for a future phase, never offered to a customer.
 *
 * V1.2 is configuration + validation only. No UI, no renderer, no routing, no schema change.
 */

import type { ItemListKind, ItemUnit, PrimaryKind, QuestionKind } from '@/lib/service-details';

// ── Config model ──────────────────────────────────────────────────────────────

export type Option = {
  key: string;
  label: string;
  /** Short clarifier shown under the label. */
  hint?: string;
  /**
   * Present in config for a FUTURE phase but never offered to customers. The renderer must
   * filter these out; `customerOptions()` below is the single supported way to read them.
   */
  disabled?: boolean;
  /** Why it is disabled — recorded for reviewers, never shown to customers. */
  disabledReason?: string;
};

/** One-level visibility rule. Exactly one parent key, one simple test. */
export type ShowIf = {
  key: string;
  /** Visible when the parent's value is any of these. */
  equals?: string[];
  /** Visible when the parent's value is none of these. */
  notEquals?: string[];
  /** Visible when the parent boolean is true. */
  isTrue?: boolean;
};

/** Which line fields a repeatable request list shows, and which are required. */
export type ItemListSpec = {
  kind: ItemListKind;
  units: readonly ItemUnit[];
  fields: { brand: boolean; note: boolean; unit: boolean };
  requiredFields: ('name' | 'qty')[];
  minLines: number;
  addLabel: string;
};

export type Question = {
  key: string;
  label: string;
  kind: QuestionKind;
  options?: Option[];
  /** Branch options keyed by the PRIMARY answer (used by Hair: barber vs salon). */
  optionsBy?: Record<string, Option[]>;
  min?: number;
  max?: number;
  placeholder?: string;
  required?: boolean;
  showIf?: ShowIf;
  helpText?: string;
  /** Wording that must be shown with the control (e.g. a preference is not a guarantee). */
  disclaimer?: string;
  itemList?: ItemListSpec;
  /** Currency-capped numeric input (maximum GOODS budget only — never a booking total). */
  goodsBudget?: boolean;
};

/**
 * A question asked BEFORE the form, whose blocking answer stops the booking entirely.
 * Wording is generic by decision — no emergency telephone number is hardcoded anywhere.
 */
export type SafetyGate = {
  key: string;
  label: string;
  options: Option[];
  blockOn: string;
  blockTitle: string;
  blockBody: string;
};

/** Inline guidance shown when a condition matches. Never blocks progression. */
export type Notice = {
  key: string;
  showIf: ShowIf;
  tone: 'info' | 'warn';
  title: string;
  body: string;
  /** Marks the booking for dispatch attention when shown. */
  flagsPriority?: boolean;
};

export type MediaSpec = {
  enabled: boolean;
  /** Only 'image' is supported in V1 — video is explicitly out of scope. */
  allow?: readonly 'image'[];
  prompt?: string;
  /** Prompt the customer prominently; still always skippable. */
  strong?: boolean;
};

export type ServiceForm = {
  slug: string;
  /** Bump on ANY change to this form. Snapshotted with every booking. */
  version: number;
  primaryKind: PrimaryKind;
  primary: Question;
  questions: Question[];
  addons?: Question;
  media: MediaSpec;
  safetyGate?: SafetyGate;
  notices?: Notice[];
  /** Reviewer-facing note. Never rendered to customers. */
  reviewNote?: string;
};

// ── Shared fragments ──────────────────────────────────────────────────────────

const IMAGES_ONLY = ['image'] as const;

const NOT_SURE: Option = { key: 'not_sure', label: 'Not sure', hint: 'We will send someone to check' };
const OTHER: Option = { key: 'other', label: 'Something else' };

/** The "other" escape always demands a description — otherwise it carries no information. */
const otherDescription = (parentKey: string, label = 'Please describe what you need'): Question => ({
  key: 'other_description',
  label,
  kind: 'text',
  required: true,
  showIf: { key: parentKey, equals: ['other'] },
  placeholder: 'A sentence or two is enough',
});

const YES_NO: Option[] = [
  { key: 'yes', label: 'Yes' },
  { key: 'no', label: 'No' },
];

const YES_NO_UNSURE: Option[] = [...YES_NO, { key: 'not_sure', label: 'Not sure' }];

const GROCERY_ITEMS: ItemListSpec = {
  kind: 'grocery',
  units: ['pcs', 'kg', 'g', 'litres', 'ml', 'packs', 'bottles', 'bunches'],
  fields: { brand: true, note: true, unit: true },
  requiredFields: ['name', 'qty'],
  minLines: 1,
  addLabel: 'Add another item',
};

const SUBSTITUTION: Question = {
  key: 'substitution',
  label: 'If something is unavailable',
  kind: 'single',
  required: true,
  options: [
    { key: 'substitute', label: 'Choose something similar' },
    { key: 'skip', label: 'Skip that item' },
    { key: 'call', label: 'Call me first' },
  ],
};

// ── HOME ──────────────────────────────────────────────────────────────────────

const houseCleaning: ServiceForm = {
  slug: 'house-cleaning',
  version: 1,
  primaryKind: 'variant',
  primary: {
    key: 'variant',
    label: 'What kind of cleaning do you need?',
    kind: 'single',
    required: true,
    options: [
      { key: 'standard_clean', label: 'Standard cleaning' },
      { key: 'deep_clean', label: 'Deep cleaning', hint: 'More thorough, takes longer' },
      { key: 'move_in_out', label: 'Move-in / move-out cleaning' },
      { key: 'laundry_only', label: 'Laundry / clothes washing only' },
      OTHER,
    ],
  },
  questions: [
    {
      key: 'scope',
      label: 'How much of the home?',
      kind: 'single',
      required: true,
      showIf: { key: 'variant', equals: ['standard_clean', 'deep_clean', 'move_in_out'] },
      options: [
        { key: 'whole_home', label: 'The whole home' },
        { key: 'specific_rooms', label: 'Specific rooms or areas' },
        { key: 'kitchen_only', label: 'Kitchen only' },
        { key: 'bathrooms_only', label: 'Bathrooms only' },
        { key: 'other_area', label: 'Another area' },
      ],
    },
    {
      key: 'bedrooms',
      label: 'How many bedrooms?',
      kind: 'number',
      required: true,
      min: 0,
      max: 10,
      showIf: { key: 'scope', equals: ['whole_home'] },
    },
    {
      key: 'bathrooms',
      label: 'How many bathrooms?',
      kind: 'number',
      required: true,
      min: 1,
      max: 10,
      showIf: { key: 'scope', equals: ['whole_home'] },
    },
    {
      key: 'rooms_description',
      label: 'Which rooms or areas?',
      kind: 'text',
      required: true,
      showIf: { key: 'scope', equals: ['specific_rooms', 'other_area'] },
      placeholder: 'e.g. 2 bedrooms and the living room',
    },
    {
      key: 'provider_bring_supplies',
      label: 'Should the cleaner bring cleaning supplies?',
      kind: 'single',
      required: true,
      showIf: { key: 'variant', notEquals: ['laundry_only'] },
      options: YES_NO,
    },
    {
      key: 'laundry_quantity',
      label: 'Roughly how much laundry?',
      kind: 'single',
      required: true,
      showIf: { key: 'variant', equals: ['laundry_only'] },
      options: [
        { key: 'small', label: 'Small', hint: 'About one basket' },
        { key: 'medium', label: 'Medium', hint: 'Two to three baskets' },
        { key: 'large', label: 'Large', hint: 'More than three baskets' },
      ],
    },
    {
      key: 'laundry_service',
      label: 'What do you need done?',
      kind: 'single',
      required: true,
      showIf: { key: 'variant', equals: ['laundry_only'] },
      options: [
        { key: 'wash_only', label: 'Washing only' },
        { key: 'wash_and_fold', label: 'Wash and fold' },
        { key: 'wash_and_iron', label: 'Wash and iron' },
      ],
    },
    otherDescription('variant', 'What kind of cleaning do you need?'),
  ],
  addons: {
    key: 'addons',
    label: 'Anything extra?',
    kind: 'multi',
    showIf: { key: 'variant', notEquals: ['laundry_only', 'other'] },
    options: [
      { key: 'inside_fridge', label: 'Inside the fridge' },
      { key: 'inside_oven', label: 'Inside the oven' },
      { key: 'interior_windows', label: 'Interior windows' },
      { key: 'ironing', label: 'Ironing' },
    ],
  },
  media: { enabled: false },
  reviewNote:
    'Cleaning TYPE and SCOPE are deliberately separate questions so "deep clean of the whole home" ' +
    'is expressible. laundry_only skips scope/bedrooms/bathrooms/supplies entirely and is a clean ' +
    'seam if Laundry is ever promoted to its own top-level service.',
};

const plumbing: ServiceForm = {
  slug: 'plumbing',
  version: 1,
  primaryKind: 'issue',
  primary: {
    key: 'issue',
    label: 'What problem are you having?',
    kind: 'single',
    required: true,
    options: [
      { key: 'leaking_tap_or_pipe', label: 'Leaking tap or pipe' },
      { key: 'blocked_drain_or_toilet', label: 'Blocked drain or toilet' },
      { key: 'toilet_problem', label: 'Toilet not working properly' },
      { key: 'shower_or_bath_problem', label: 'Shower or bath problem' },
      { key: 'sink_problem', label: 'Sink problem' },
      { key: 'water_tank_or_pump', label: 'Water tank or pump' },
      { key: 'low_or_no_water_pressure', label: 'Low or no water pressure' },
      { key: 'installation_or_replacement', label: 'Installation or replacement' },
      { key: 'leak_detection', label: 'I can see damp but not the leak' },
      NOT_SURE,
      OTHER,
    ],
  },
  questions: [
    {
      key: 'location_of_issue',
      label: 'Where in the property?',
      kind: 'single',
      required: true,
      options: [
        { key: 'kitchen', label: 'Kitchen' },
        { key: 'bathroom', label: 'Bathroom' },
        { key: 'toilet', label: 'Toilet' },
        { key: 'outside', label: 'Outside' },
        { key: 'whole_property', label: 'Whole property' },
        { key: 'not_sure', label: 'Not sure' },
      ],
    },
    {
      key: 'actively_leaking',
      label: 'Is water leaking right now?',
      kind: 'single',
      required: true,
      showIf: { key: 'issue', notEquals: ['installation_or_replacement', 'low_or_no_water_pressure'] },
      options: YES_NO,
    },
    {
      key: 'mains_shut_off',
      label: 'Have you turned the water off at the mains?',
      kind: 'single',
      required: true,
      showIf: { key: 'actively_leaking', equals: ['yes'] },
      options: [...YES_NO, { key: 'dont_know_how', label: "I don't know how" }],
    },
    otherDescription('issue', 'Please describe the problem'),
  ],
  media: {
    enabled: true,
    allow: IMAGES_ONLY,
    strong: true,
    prompt: 'A photo helps the plumber bring the right parts',
  },
  notices: [
    {
      key: 'active_leak_guidance',
      showIf: { key: 'actively_leaking', equals: ['yes'] },
      tone: 'warn',
      title: 'Water is still running',
      body: 'If you can do so safely, turn the water off at the mains while you wait. We will treat this as urgent.',
      flagsPriority: true,
    },
  ],
};

const electrical: ServiceForm = {
  slug: 'electrical',
  version: 1,
  primaryKind: 'issue',
  primary: {
    key: 'issue',
    label: 'What problem are you having?',
    kind: 'single',
    required: true,
    options: [
      { key: 'lights', label: 'Lights or light fittings' },
      { key: 'sockets_or_switches', label: 'Sockets or switches' },
      { key: 'no_power_or_partial_outage', label: 'No power, or power in part of the property' },
      { key: 'breaker_or_fuse', label: 'Breaker keeps tripping, or a fuse' },
      { key: 'wiring_issue', label: 'Wiring' },
      { key: 'appliance_power_connection', label: 'Connecting an appliance' },
      { key: 'installation', label: 'New installation' },
      { key: 'inspection_or_diagnosis', label: 'Inspection or check-up' },
      NOT_SURE,
      OTHER,
    ],
  },
  questions: [
    {
      key: 'outage_extent',
      label: 'How much of the property is affected?',
      kind: 'single',
      required: true,
      showIf: { key: 'issue', equals: ['no_power_or_partial_outage'] },
      options: [
        { key: 'whole_property', label: 'The whole property' },
        { key: 'part_of_property', label: 'Only part of it' },
      ],
    },
    {
      key: 'neighbours_affected',
      label: 'Do your neighbours have power?',
      kind: 'single',
      required: true,
      showIf: { key: 'issue', equals: ['no_power_or_partial_outage'] },
      helpText: 'This tells us whether it is a supply problem or something inside your property',
      options: [
        { key: 'yes', label: 'Yes, they have power' },
        { key: 'no', label: 'No, they are also without power' },
        { key: 'dont_know', label: "I don't know" },
      ],
    },
    {
      key: 'danger_signs',
      label: 'Can you see or smell any of these?',
      kind: 'single',
      required: true,
      helpText: 'Sparking, burning smell, smoke, or scorch marks',
      options: [
        { key: 'none', label: 'No, none of these' },
        { key: 'sparking', label: 'Sparking' },
        { key: 'burning_smell', label: 'A burning smell' },
        { key: 'smoke_or_fire', label: 'Smoke or fire' },
      ],
    },
    {
      key: 'affected_points',
      label: 'How many lights or sockets are affected?',
      kind: 'single',
      required: true,
      showIf: { key: 'issue', equals: ['lights', 'sockets_or_switches'] },
      options: [
        { key: 'one', label: 'Just one' },
        { key: 'two_or_three', label: 'Two or three' },
        { key: 'four_plus', label: 'Four or more' },
      ],
    },
    otherDescription('issue', 'Please describe the problem'),
  ],
  media: { enabled: true, allow: IMAGES_ONLY, strong: true, prompt: 'A photo of the fitting or board helps' },
  notices: [
    {
      key: 'danger_guidance',
      showIf: { key: 'danger_signs', equals: ['sparking', 'burning_smell', 'smoke_or_fire'] },
      tone: 'warn',
      title: 'Please stay safe',
      body:
        'If it is safe to do so, switch the power off at the breaker and stop using that circuit. ' +
        'If there is smoke or fire, or anyone is in immediate danger, please contact emergency services first.',
      flagsPriority: true,
    },
    {
      key: 'supply_outage_guidance',
      showIf: { key: 'neighbours_affected', equals: ['no'] },
      tone: 'info',
      title: 'This may be a supply outage',
      body:
        'If your neighbours are also without power, this is likely an area-wide supply problem rather ' +
        'than a fault in your property, and an electrician may not be able to restore it. You can still book.',
    },
  ],
  reviewNote:
    'The neighbours-have-power question is the single highest-value triage input for this market: it ' +
    'separates a supply outage (no job exists) from an internal fault, and every customer can answer it.',
};

const acRepair: ServiceForm = {
  slug: 'ac-repair',
  version: 1,
  primaryKind: 'issue',
  primary: {
    key: 'issue',
    label: 'What do you need?',
    kind: 'single',
    required: true,
    options: [
      { key: 'routine_service', label: 'Routine service' },
      { key: 'cleaning', label: 'Cleaning' },
      { key: 'not_cooling', label: 'Not cooling properly' },
      { key: 'leaking_water', label: 'Leaking water' },
      { key: 'unusual_noise', label: 'Making an unusual noise' },
      { key: 'not_turning_on', label: 'Not turning on' },
      { key: 'installation', label: 'New installation' },
      {
        key: 'refrigerant_or_gas_suspected',
        label: 'I think it may need gas / refrigerant',
        hint: 'The technician will confirm on site',
      },
      NOT_SURE,
      OTHER,
    ],
  },
  questions: [
    {
      key: 'number_of_units',
      label: 'How many units?',
      kind: 'number',
      required: true,
      min: 1,
      max: 20,
    },
    {
      key: 'ac_type',
      label: 'What type of unit is it?',
      kind: 'single',
      required: true,
      options: [
        { key: 'split', label: 'Split unit' },
        { key: 'window', label: 'Window unit' },
        { key: 'portable', label: 'Portable' },
        { key: 'cassette_or_ducted', label: 'Cassette or ducted' },
        { key: 'dont_know', label: "I don't know" },
      ],
    },
    {
      key: 'when_issue_started',
      label: 'When did it start?',
      kind: 'single',
      showIf: { key: 'issue', notEquals: ['routine_service', 'cleaning', 'installation'] },
      options: [
        { key: 'today', label: 'Today' },
        { key: 'this_week', label: 'This week' },
        { key: 'longer', label: 'Longer ago' },
      ],
    },
    { key: 'brand', label: 'Brand (if you know it)', kind: 'text', placeholder: 'e.g. LG, Samsung, Daikin' },
    otherDescription('issue', 'Please describe what you need'),
  ],
  media: { enabled: true, allow: IMAGES_ONLY, prompt: 'A photo of the unit helps us bring the right parts' },
  reviewNote:
    'Refrigerant is offered as a customer SUSPICION, never a confirmed diagnosis — the label and hint ' +
    'both say the technician confirms on site.',
};

const painting: ServiceForm = {
  slug: 'painting',
  version: 1,
  primaryKind: 'variant',
  primary: {
    key: 'variant',
    label: 'What needs painting?',
    kind: 'single',
    required: true,
    options: [
      { key: 'whole_home', label: 'The whole home' },
      { key: 'one_or_more_rooms', label: 'One or more rooms' },
      { key: 'interior_walls', label: 'Interior walls' },
      { key: 'exterior_walls', label: 'Exterior walls' },
      { key: 'ceiling', label: 'Ceiling' },
      { key: 'doors_or_windows', label: 'Doors or windows' },
      { key: 'touch_up', label: 'Touch-ups' },
      OTHER,
    ],
  },
  questions: [
    {
      key: 'number_of_rooms',
      label: 'How many rooms?',
      kind: 'number',
      required: true,
      min: 1,
      max: 20,
      showIf: { key: 'variant', equals: ['one_or_more_rooms', 'whole_home', 'interior_walls', 'ceiling'] },
    },
    {
      key: 'surface_condition',
      label: 'What condition are the surfaces in?',
      kind: 'single',
      required: true,
      options: [
        { key: 'good', label: 'Good — just needs painting' },
        { key: 'minor_repair', label: 'Some cracks or peeling' },
        { key: 'poor', label: 'Needs a lot of preparation' },
        { key: 'not_sure', label: 'Not sure' },
      ],
    },
    {
      key: 'paint_supply',
      label: 'Who will supply the paint?',
      kind: 'single',
      required: true,
      options: [
        { key: 'customer_has_paint', label: 'I already have the paint' },
        { key: 'provider_to_supply', label: 'Please supply it' },
        { key: 'not_decided', label: 'Not decided yet' },
      ],
    },
    {
      key: 'colour_selected',
      label: 'Have you chosen a colour?',
      kind: 'single',
      showIf: { key: 'paint_supply', equals: ['provider_to_supply', 'not_decided'] },
      options: [...YES_NO, { key: 'need_advice', label: 'I would like advice' }],
    },
    otherDescription('variant', 'What needs painting?'),
  ],
  media: { enabled: true, allow: IMAGES_ONLY, strong: true, prompt: 'Photos of the space help us quote accurately' },
  reviewNote:
    'Area/size in square metres was deliberately NOT asked — customers cannot answer it. Room count ' +
    'plus photos carries the same information reliably.',
};

const pestControl: ServiceForm = {
  slug: 'pest-control',
  version: 1,
  primaryKind: 'issue',
  primary: {
    key: 'issue',
    label: 'What are you dealing with?',
    kind: 'single',
    required: true,
    options: [
      { key: 'cockroaches', label: 'Cockroaches' },
      { key: 'ants', label: 'Ants' },
      { key: 'termites', label: 'Termites' },
      { key: 'bedbugs', label: 'Bedbugs' },
      { key: 'mosquitoes', label: 'Mosquitoes' },
      { key: 'rodents', label: 'Rats or mice' },
      { key: 'fleas', label: 'Fleas' },
      NOT_SURE,
      OTHER,
    ],
  },
  questions: [
    {
      key: 'property_type',
      label: 'What kind of property?',
      kind: 'single',
      required: true,
      options: [
        { key: 'apartment', label: 'Apartment' },
        { key: 'house', label: 'House' },
        { key: 'business', label: 'Business premises' },
      ],
    },
    {
      key: 'room_count',
      label: 'How many rooms or areas are affected?',
      kind: 'single',
      required: true,
      options: [
        { key: 'one', label: 'One' },
        { key: 'two_or_three', label: 'Two or three' },
        { key: 'four_plus', label: 'Four or more' },
        { key: 'whole_property', label: 'The whole property' },
      ],
    },
    {
      key: 'severity',
      label: 'How bad is it?',
      kind: 'single',
      required: true,
      options: [
        { key: 'light', label: 'Light — I see them occasionally' },
        { key: 'moderate', label: 'Moderate — I see them daily' },
        { key: 'heavy', label: 'Heavy — they are everywhere' },
        { key: 'not_sure', label: 'Not sure' },
      ],
    },
    {
      key: 'how_long',
      label: 'How long has this been going on?',
      kind: 'single',
      required: true,
      options: [
        { key: 'just_noticed', label: 'Just noticed it' },
        { key: 'weeks', label: 'A few weeks' },
        { key: 'months_or_more', label: 'Months or longer' },
      ],
    },
    {
      key: 'previous_treatment',
      label: 'Has it been treated before?',
      kind: 'single',
      options: YES_NO_UNSURE,
    },
    {
      key: 'pets_or_children',
      label: 'Are there pets or young children at home?',
      kind: 'single',
      required: true,
      helpText: 'This affects which treatment the technician can use',
      options: YES_NO,
    },
    otherDescription('issue', 'What are you dealing with?'),
  ],
  media: { enabled: true, allow: IMAGES_ONLY, prompt: 'A photo helps identify the pest' },
};

const handyman: ServiceForm = {
  slug: 'handyman',
  version: 1,
  primaryKind: 'variant',
  primary: {
    key: 'variant',
    label: 'What kind of job do you need?',
    kind: 'single',
    required: true,
    options: [
      { key: 'furniture_assembly', label: 'Furniture assembly' },
      { key: 'mounting_or_hanging', label: 'Mounting or hanging something' },
      { key: 'minor_repairs', label: 'Minor repairs' },
      { key: 'door_or_lock', label: 'Door or lock' },
      { key: 'shelving', label: 'Shelving' },
      { key: 'curtains_or_blinds', label: 'Curtains or blinds' },
      { key: 'minor_carpentry', label: 'Minor carpentry' },
      NOT_SURE,
      OTHER,
    ],
  },
  questions: [
    {
      key: 'brief_description',
      label: 'Briefly, what needs doing?',
      kind: 'text',
      required: true,
      placeholder: 'e.g. mount a TV on a concrete wall',
    },
    {
      key: 'number_of_items',
      label: 'How many items or tasks?',
      kind: 'single',
      required: true,
      options: [
        { key: 'one', label: 'One' },
        { key: 'two_or_three', label: 'Two or three' },
        { key: 'four_plus', label: 'Four or more' },
      ],
    },
  ],
  media: { enabled: true, allow: IMAGES_ONLY, strong: true, prompt: 'A photo saves a lot of explaining' },
  reviewNote:
    'Deliberately the lightest form: one description, one count, and a strong photo prompt. Handyman ' +
    'covers too broad a range for a useful option tree, so the photo does the work. Note there is no ' +
    'separate other_description here — brief_description is already required for every option.',
};

const applianceRepair: ServiceForm = {
  slug: 'appliance-repair',
  version: 1,
  primaryKind: 'variant',
  primary: {
    key: 'variant',
    label: 'Which appliance?',
    kind: 'single',
    required: true,
    options: [
      { key: 'refrigerator', label: 'Fridge or freezer' },
      { key: 'washing_machine', label: 'Washing machine' },
      { key: 'cooker_or_oven', label: 'Cooker or oven' },
      { key: 'microwave', label: 'Microwave' },
      { key: 'dishwasher', label: 'Dishwasher' },
      { key: 'water_dispenser', label: 'Water dispenser' },
      { key: 'dryer', label: 'Dryer' },
      { key: 'television', label: 'Television' },
      { key: 'other_appliance', label: 'Another appliance' },
    ],
  },
  questions: [
    {
      key: 'appliance_name',
      label: 'Which appliance is it?',
      kind: 'text',
      required: true,
      showIf: { key: 'variant', equals: ['other_appliance'] },
    },
    {
      key: 'symptom',
      label: "What's it doing?",
      kind: 'single',
      required: true,
      options: [
        { key: 'not_working_at_all', label: 'Not working at all' },
        { key: 'not_performing', label: 'Working, but not properly' },
        { key: 'noise', label: 'Making an unusual noise' },
        { key: 'leaking', label: 'Leaking' },
        { key: 'smell_or_smoke', label: 'Burning smell or smoke' },
        NOT_SURE,
      ],
    },
    {
      key: 'powers_on',
      label: 'Does it turn on?',
      kind: 'single',
      required: true,
      options: YES_NO_UNSURE,
    },
    { key: 'brand', label: 'Brand (if you know it)', kind: 'text' },
    {
      key: 'approximate_age',
      label: 'Roughly how old is it?',
      kind: 'single',
      options: [
        { key: 'under_2', label: 'Under 2 years' },
        { key: 'two_to_five', label: '2–5 years' },
        { key: 'over_5', label: 'Over 5 years' },
        { key: 'not_sure', label: 'Not sure' },
      ],
    },
  ],
  media: {
    enabled: true,
    allow: IMAGES_ONLY,
    strong: true,
    prompt: 'A photo of the model plate helps us bring the right part',
  },
};

const moversPackers: ServiceForm = {
  slug: 'movers-packers',
  version: 1,
  primaryKind: 'variant',
  primary: {
    key: 'variant',
    label: 'What are you moving?',
    kind: 'single',
    required: true,
    options: [
      { key: 'home', label: 'A home' },
      { key: 'office', label: 'An office' },
      { key: 'few_items', label: 'Just a few items' },
      { key: 'furniture_only', label: 'Furniture only' },
      OTHER,
    ],
  },
  questions: [
    {
      key: 'move_size',
      label: 'How big is the move?',
      kind: 'single',
      required: true,
      showIf: { key: 'variant', equals: ['home', 'office'] },
      options: [
        { key: 'bedsitter', label: 'Bedsitter / studio' },
        { key: 'one_bedroom', label: '1 bedroom' },
        { key: 'two_bedroom', label: '2 bedrooms' },
        { key: 'three_bedroom', label: '3 bedrooms' },
        { key: 'four_plus', label: '4 bedrooms or more' },
        { key: 'small_office', label: 'Small office' },
        { key: 'large_office', label: 'Large office' },
      ],
    },
    {
      key: 'destination',
      label: 'Where are you moving to?',
      kind: 'text',
      required: true,
      placeholder: 'Area, estate or building name',
      helpText: 'A rough description is fine — the driver will call to confirm',
    },
    {
      key: 'pickup_access',
      label: 'Access at pickup',
      kind: 'single',
      required: true,
      options: [
        { key: 'ground_floor', label: 'Ground floor' },
        { key: 'lift_available', label: 'Upper floor, lift available' },
        { key: 'stairs_only', label: 'Upper floor, stairs only' },
      ],
    },
    {
      key: 'destination_access',
      label: 'Access at the destination',
      kind: 'single',
      required: true,
      options: [
        { key: 'ground_floor', label: 'Ground floor' },
        { key: 'lift_available', label: 'Upper floor, lift available' },
        { key: 'stairs_only', label: 'Upper floor, stairs only' },
        { key: 'not_sure', label: 'Not sure' },
      ],
    },
    otherDescription('variant', 'What are you moving?'),
  ],
  addons: {
    key: 'addons',
    label: 'Do you need any of these?',
    kind: 'multi',
    options: [
      { key: 'packing', label: 'Packing' },
      { key: 'unpacking', label: 'Unpacking' },
      { key: 'dismantle_reassemble', label: 'Dismantling and reassembling furniture' },
      { key: 'packing_materials', label: 'Packing materials' },
    ],
  },
  media: { enabled: true, allow: IMAGES_ONLY, prompt: 'Photos of large items help us send the right vehicle' },
  reviewNote:
    'Destination is FREE TEXT by locked decision — no second Places/address subsystem in V1. Access is ' +
    'asked at BOTH ends, which is the most common source of moving-quote disputes.',
};

// ── AUTO ──────────────────────────────────────────────────────────────────────

const mechanic: ServiceForm = {
  slug: 'mechanic',
  version: 1,
  primaryKind: 'issue',
  primary: {
    key: 'issue',
    label: "What's happening with the vehicle?",
    kind: 'single',
    required: true,
    options: [
      { key: 'vehicle_wont_start', label: "It won't start" },
      { key: 'engine_or_warning_light', label: 'Engine trouble or a warning light' },
      { key: 'battery', label: 'Battery' },
      { key: 'brakes', label: 'Brakes' },
      { key: 'overheating', label: 'Overheating' },
      { key: 'suspension_or_steering', label: 'Suspension or steering' },
      { key: 'oil_or_fluid_leak', label: 'Oil or fluid leak' },
      { key: 'routine_service', label: 'Routine service' },
      { key: 'inspection', label: 'Inspection' },
      NOT_SURE,
      OTHER,
    ],
  },
  questions: [
    { key: 'vehicle_make', label: 'Make', kind: 'text', required: true, placeholder: 'e.g. Toyota' },
    { key: 'vehicle_model', label: 'Model', kind: 'text', required: true, placeholder: 'e.g. Fielder' },
    { key: 'vehicle_year', label: 'Year', kind: 'number', min: 1950, max: 2100 },
    {
      key: 'vehicle_starts',
      label: 'Does the vehicle start?',
      kind: 'single',
      required: true,
      options: YES_NO_UNSURE,
    },
    {
      key: 'safe_to_drive',
      label: 'Is it safe to drive?',
      kind: 'single',
      required: true,
      options: YES_NO_UNSURE,
    },
    otherDescription('issue', "What's happening with the vehicle?"),
  ],
  media: { enabled: true, allow: IMAGES_ONLY, prompt: 'A photo of the warning light or the problem area helps' },
  reviewNote: 'Images only — video capture is explicitly out of scope for V1 (locked decision OD2).',
};

const tireReplacement: ServiceForm = {
  slug: 'tire-replacement',
  version: 1,
  primaryKind: 'variant',
  primary: {
    key: 'variant',
    label: 'What do you need?',
    kind: 'single',
    required: true,
    options: [
      { key: 'flat_or_puncture', label: 'Flat tire or puncture' },
      { key: 'one_tire_replacement', label: 'Replace one tire' },
      { key: 'multiple_tire_replacement', label: 'Replace several tires' },
      { key: 'spare_installation', label: 'Fit my spare' },
      { key: 'tire_inspection', label: 'Check my tires' },
      NOT_SURE,
      OTHER,
    ],
  },
  questions: [
    { key: 'vehicle_make_model', label: 'Vehicle make and model', kind: 'text', required: true },
    {
      key: 'number_of_tires',
      label: 'How many tires?',
      kind: 'number',
      required: true,
      min: 1,
      max: 6,
      showIf: { key: 'variant', equals: ['multiple_tire_replacement'] },
    },
    {
      key: 'spare_available',
      label: 'Do you have a spare?',
      kind: 'single',
      required: true,
      showIf: { key: 'variant', equals: ['flat_or_puncture', 'spare_installation'] },
      options: YES_NO_UNSURE,
    },
    {
      key: 'replacement_tires_available',
      label: 'Do you already have the replacement tires?',
      kind: 'single',
      required: true,
      showIf: { key: 'variant', equals: ['one_tire_replacement', 'multiple_tire_replacement'] },
      options: [...YES_NO, { key: 'please_supply', label: 'No — please supply them' }],
    },
    {
      key: 'tire_size',
      label: 'Tire size (if you know it)',
      kind: 'text',
      helpText: 'Or just photograph the writing on the tire wall',
      placeholder: 'e.g. 195/65 R15',
    },
    otherDescription('variant', 'What do you need?'),
  ],
  media: {
    enabled: true,
    allow: IMAGES_ONLY,
    strong: true,
    prompt: 'A photo of the tire wall shows us the size',
  },
};

const carTowing: ServiceForm = {
  slug: 'car-towing',
  version: 1,
  primaryKind: 'issue',
  safetyGate: {
    key: 'injury_check',
    label: 'Is anyone injured or in immediate danger?',
    options: YES_NO,
    blockOn: 'yes',
    blockTitle: 'Please contact emergency services first',
    blockBody:
      'If anyone is injured or in immediate danger, please contact emergency services before requesting a tow. ' +
      'QuickServe is not an emergency service. Once everyone is safe, come back and we will arrange the tow.',
  },
  primary: {
    key: 'issue',
    label: 'Why do you need a tow?',
    kind: 'single',
    required: true,
    options: [
      { key: 'breakdown', label: 'Breakdown' },
      { key: 'accident', label: 'After an accident' },
      { key: 'wont_start', label: "Won't start" },
      { key: 'tire_or_wheel_issue', label: 'Tire or wheel problem' },
      { key: 'vehicle_stuck', label: 'Vehicle is stuck' },
      { key: 'transport_non_running_vehicle', label: 'Transport a vehicle that does not run' },
      OTHER,
    ],
  },
  questions: [
    { key: 'vehicle_make_model', label: 'Vehicle make and model', kind: 'text', required: true },
    {
      key: 'destination',
      label: 'Where should we take it?',
      kind: 'text',
      required: true,
      placeholder: 'Garage, home or area name',
    },
    {
      key: 'can_roll_or_steer',
      label: 'Do the wheels roll and steer?',
      kind: 'single',
      required: true,
      helpText: 'This tells us which kind of tow truck to send',
      options: YES_NO_UNSURE,
    },
    {
      key: 'difficult_access',
      label: 'Is the vehicle hard to reach?',
      kind: 'single',
      required: true,
      helpText: 'For example a basement car park, a ditch, or soft ground',
      options: YES_NO_UNSURE,
    },
    otherDescription('issue', 'Why do you need a tow?'),
  ],
  media: { enabled: true, allow: IMAGES_ONLY, prompt: 'A photo of the vehicle and where it is standing helps' },
  reviewNote:
    'The injury gate runs BEFORE the form and blocks the booking. Wording is generic by locked decision ' +
    'OD3 — no emergency telephone number is hardcoded anywhere in this configuration.',
};

// ── DELIVERY ──────────────────────────────────────────────────────────────────

const groceryDelivery: ServiceForm = {
  slug: 'grocery-delivery',
  version: 1,
  primaryKind: 'variant',
  primary: {
    key: 'variant',
    label: 'How would you like to shop?',
    kind: 'single',
    required: true,
    options: [
      {
        key: 'shop_for_me',
        label: 'Shop for me',
        hint: 'Tell us what you need and we will source it',
      },
      { key: 'buy_from_specific_store', label: 'Buy from a specific shop' },
      { key: 'collect_existing_order', label: "Collect an order I've already placed" },
    ],
  },
  questions: [
    {
      key: 'store_name',
      label: 'Which shop?',
      kind: 'text',
      required: true,
      showIf: { key: 'variant', equals: ['buy_from_specific_store', 'collect_existing_order'] },
    },
    {
      key: 'items',
      label: 'What do you need?',
      kind: 'itemlist',
      required: true,
      showIf: { key: 'variant', equals: ['shop_for_me', 'buy_from_specific_store'] },
      itemList: GROCERY_ITEMS,
    },
    {
      key: 'max_goods_budget',
      label: 'Maximum to spend on the goods',
      kind: 'number',
      required: true,
      goodsBudget: true,
      min: 1,
      showIf: { key: 'variant', equals: ['shop_for_me', 'buy_from_specific_store'] },
      helpText: 'The most we may spend buying your items. Delivery and service fees are separate.',
    },
    { ...SUBSTITUTION, showIf: { key: 'variant', equals: ['shop_for_me', 'buy_from_specific_store'] } },
    {
      key: 'order_reference',
      label: 'Order number or name on the order',
      kind: 'text',
      required: true,
      showIf: { key: 'variant', equals: ['collect_existing_order'] },
    },
    {
      key: 'already_paid',
      label: 'Have you already paid?',
      kind: 'single',
      required: true,
      showIf: { key: 'variant', equals: ['collect_existing_order'] },
      options: YES_NO,
    },
  ],
  media: { enabled: true, allow: IMAGES_ONLY, prompt: 'You can photograph a handwritten list instead of typing it' },
  reviewNote:
    'shop_for_me deliberately captures NO sourcing decision — the customer never needs to know whether ' +
    'we fulfil from an affiliated shop, a partner or elsewhere. Sourcing, pricing and margin are ops ' +
    'concerns handled later against the immutable request, which is what keeps this form stable.',
};

const foodDelivery: ServiceForm = {
  slug: 'food-delivery',
  version: 1,
  primaryKind: 'variant',
  primary: {
    key: 'variant',
    label: 'What do you need?',
    kind: 'single',
    required: true,
    options: [
      { key: 'collect_paid', label: "Collect an order I've placed and paid for" },
      { key: 'collect_unpaid', label: "Collect an order I've placed but not paid for" },
      {
        key: 'order_for_me',
        label: 'Order it for me',
        disabled: true,
        disabledReason:
          'Locked decision OD4 — not enabled in V1. Restaurant ordering brings payment, preparation-time, ' +
          'refund and food-quality exposure without the strategic sourcing rationale that justifies it for ' +
          'Grocery. Config path retained so it can be enabled later without redesign.',
      },
    ],
  },
  questions: [
    { key: 'restaurant', label: 'Which restaurant?', kind: 'text', required: true },
    {
      key: 'order_reference',
      label: 'Order number or name on the order',
      kind: 'text',
      required: true,
    },
    {
      key: 'max_goods_budget',
      label: 'Maximum to spend paying for the order',
      kind: 'number',
      required: true,
      goodsBudget: true,
      min: 1,
      showIf: { key: 'variant', equals: ['collect_unpaid'] },
      helpText: 'The most we may pay the restaurant. Delivery and service fees are separate.',
    },
    { key: 'pickup_instructions', label: 'Anything the rider should know?', kind: 'text' },
  ],
  media: { enabled: false },
};

const medicineDelivery: ServiceForm = {
  slug: 'medicine-delivery',
  version: 1,
  primaryKind: 'variant',
  primary: {
    key: 'variant',
    label: 'What do you need?',
    kind: 'single',
    required: true,
    options: [
      { key: 'collect', label: 'Collect an order my pharmacy already has ready' },
      {
        key: 'request_items',
        label: 'Request items from a pharmacy',
        disabled: true,
        disabledReason:
          'Locked decision OD5 — NOT customer-enabled pending regulatory verification RA1–RA6 ' +
          '(prescription-only vs OTC handling; whether a non-pharmacist courier may deliver dispensed ' +
          'medicines; whether routing requests constitutes dealing/supplying; record-keeping and handover ' +
          'requirements; health-data protection for medicine names; categories needing outright exclusion). ' +
          'The shared item-list model can serve this path unchanged once those are answered.',
      },
    ],
  },
  questions: [
    { key: 'pharmacy_name', label: 'Which pharmacy?', kind: 'text', required: true },
    {
      key: 'order_reference',
      label: 'Order number or name on the order',
      kind: 'text',
      required: true,
    },
    { key: 'already_paid', label: 'Have you already paid?', kind: 'single', required: true, options: YES_NO },
    { key: 'pickup_instructions', label: 'Anything the pharmacy or rider should know?', kind: 'text' },
  ],
  media: { enabled: false },
  reviewNote:
    'Collect-only in V1. No prescription upload, no medicine names captured, no medical information ' +
    'stored by the active configuration — the customer names a pharmacy and an order the pharmacy already ' +
    'holds. No legal claim of any kind appears in customer-visible copy.',
};

const packageDelivery: ServiceForm = {
  slug: 'package-delivery',
  version: 1,
  primaryKind: 'variant',
  primary: {
    key: 'variant',
    label: 'What are you sending?',
    kind: 'single',
    required: true,
    options: [
      { key: 'documents', label: 'Documents or an envelope' },
      { key: 'small_package', label: 'Small package' },
      { key: 'medium_package', label: 'Medium package' },
      { key: 'large_package', label: 'Large package' },
      { key: 'multiple_packages', label: 'Several packages' },
      OTHER,
    ],
  },
  questions: [
    { key: 'recipient_name', label: "Recipient's name", kind: 'text', required: true },
    { key: 'recipient_phone', label: "Recipient's phone number", kind: 'text', required: true },
    {
      key: 'fragile',
      label: 'Is it fragile?',
      kind: 'single',
      required: true,
      options: YES_NO,
    },
    {
      key: 'approximate_weight',
      label: 'Roughly how heavy is it?',
      kind: 'single',
      showIf: { key: 'variant', notEquals: ['documents'] },
      options: [
        { key: 'under_2kg', label: 'Under 2 kg' },
        { key: 'two_to_ten', label: '2–10 kg' },
        { key: 'ten_to_thirty', label: '10–30 kg' },
        { key: 'over_thirty', label: 'Over 30 kg' },
        { key: 'not_sure', label: 'Not sure' },
      ],
    },
    { key: 'pickup_instructions', label: 'Anything the rider should know?', kind: 'text' },
    otherDescription('variant', 'What are you sending?'),
    {
      key: 'prohibited_acknowledgement',
      label: 'I confirm this package contains no cash, illegal items, hazardous materials or live animals',
      kind: 'boolean',
      required: true,
    },
  ],
  media: { enabled: true, allow: IMAGES_ONLY, prompt: 'A photo of the package helps the rider identify it' },
};

// ── PERSONAL CARE ─────────────────────────────────────────────────────────────

const haircuts: ServiceForm = {
  slug: 'haircuts',
  version: 1,
  primaryKind: 'variant',
  primary: {
    key: 'variant',
    label: 'What kind of service?',
    kind: 'single',
    required: true,
    options: [
      { key: 'barber', label: 'Barber', hint: 'Cuts, fades and beard grooming' },
      { key: 'salon', label: 'Salon', hint: 'Styling, braiding and treatments' },
    ],
  },
  questions: [
    {
      key: 'service_choice',
      label: 'What would you like?',
      kind: 'single',
      required: true,
      optionsBy: {
        barber: [
          { key: 'haircut', label: 'Haircut' },
          { key: 'trim', label: 'Trim' },
          { key: 'beard_trim', label: 'Beard trim' },
          { key: 'haircut_and_beard', label: 'Haircut and beard' },
          { key: 'styling', label: 'Styling' },
          OTHER,
        ],
        salon: [
          { key: 'haircut_or_trim', label: 'Haircut or trim' },
          { key: 'styling', label: 'Styling' },
          { key: 'blow_dry', label: 'Blow-dry' },
          { key: 'braiding', label: 'Braiding' },
          { key: 'treatment', label: 'Treatment' },
          OTHER,
        ],
      },
    },
    {
      key: 'client_type',
      label: 'Who is it for?',
      kind: 'single',
      required: true,
      options: [
        { key: 'adult', label: 'An adult' },
        { key: 'child', label: 'A child' },
      ],
    },
    {
      key: 'number_of_people',
      label: 'How many people?',
      kind: 'number',
      required: true,
      min: 1,
      max: 10,
    },
    { key: 'style_description', label: 'Describe the style you want', kind: 'text' },
    {
      key: 'other_description',
      label: 'What would you like?',
      kind: 'text',
      required: true,
      showIf: { key: 'service_choice', equals: ['other'] },
    },
  ],
  media: { enabled: true, allow: IMAGES_ONLY, prompt: 'A reference photo is the clearest way to show a style' },
  reviewNote:
    'Barber vs salon is the FIRST split by locked decision — they are different trades with different ' +
    'providers. Adult/child comes second. Stylist gender is deliberately NOT collected in V1.',
};

const makeup: ServiceForm = {
  slug: 'makeup',
  version: 1,
  primaryKind: 'variant',
  primary: {
    key: 'variant',
    label: "What's the occasion?",
    kind: 'single',
    required: true,
    options: [
      { key: 'everyday_or_natural', label: 'Everyday / natural' },
      { key: 'evening_or_event', label: 'Evening or event' },
      { key: 'bridal', label: 'Bridal' },
      { key: 'bridal_party', label: 'Bridal party' },
      { key: 'photoshoot', label: 'Photoshoot' },
      OTHER,
    ],
  },
  questions: [
    {
      key: 'number_of_people',
      label: 'How many people?',
      kind: 'number',
      required: true,
      min: 1,
      max: 20,
    },
    {
      key: 'ready_by_time',
      label: 'What time do you need to be ready?',
      kind: 'time',
      required: true,
      helpText: 'The artist works backwards from this',
    },
    { key: 'desired_look', label: 'Describe the look you want', kind: 'text' },
    otherDescription('variant', "What's the occasion?"),
  ],
  addons: {
    key: 'addons',
    label: 'Anything extra?',
    kind: 'multi',
    options: [
      { key: 'lashes', label: 'Lashes' },
      { key: 'touch_up', label: 'Touch-up later in the day' },
      { key: 'hair_styling', label: 'Hair styling' },
    ],
  },
  media: { enabled: true, allow: IMAGES_ONLY, strong: true, prompt: 'A reference image helps enormously' },
  reviewNote:
    'Bridal stays a variant rather than a separate top-level service in V1; it is a clean seam if it is ' +
    'ever promoted, since trial/timing/travel fields would attach to that variant alone.',
};

const massage: ServiceForm = {
  slug: 'massage',
  version: 1,
  primaryKind: 'variant',
  primary: {
    key: 'variant',
    label: 'What kind of massage?',
    kind: 'single',
    required: true,
    options: [
      { key: 'full_body', label: 'Full body' },
      { key: 'back_and_shoulders', label: 'Back and shoulders' },
      { key: 'neck_and_shoulders', label: 'Neck and shoulders' },
      { key: 'legs_and_feet', label: 'Legs and feet' },
      OTHER,
    ],
  },
  questions: [
    {
      key: 'duration_minutes',
      label: 'How long?',
      kind: 'single',
      required: true,
      options: [
        { key: '30', label: '30 minutes' },
        { key: '60', label: '60 minutes' },
        { key: '90', label: '90 minutes' },
        { key: '120', label: '120 minutes' },
      ],
    },
    {
      key: 'number_of_people',
      label: 'How many people?',
      kind: 'number',
      required: true,
      min: 1,
      max: 4,
    },
    {
      key: 'therapist_gender_preference',
      label: 'Do you have a preference for the therapist?',
      kind: 'single',
      required: true,
      disclaimer: "We'll do our best to match your preference — it isn't guaranteed.",
      options: [
        { key: 'female', label: 'Female therapist' },
        { key: 'male', label: 'Male therapist' },
        { key: 'no_preference', label: 'No preference' },
      ],
    },
    otherDescription('variant', 'What kind of massage?'),
  ],
  media: { enabled: false },
  reviewNote:
    'Media is disabled by locked decision. Gender is stored as a PREFERENCE with mandatory wording that ' +
    'it is not a guarantee. Deliberately no clinical or medical massage categories.',
};

// ── Registry ──────────────────────────────────────────────────────────────────

const FORMS: ServiceForm[] = [
  houseCleaning,
  plumbing,
  electrical,
  acRepair,
  painting,
  pestControl,
  handyman,
  applianceRepair,
  moversPackers,
  mechanic,
  tireReplacement,
  carTowing,
  groceryDelivery,
  foodDelivery,
  medicineDelivery,
  packageDelivery,
  haircuts,
  makeup,
  massage,
];

/** All Service Details forms, keyed by service slug (matches `bookings.service_id`). */
export const SERVICE_FORMS: Readonly<Record<string, ServiceForm>> = Object.freeze(
  Object.fromEntries(FORMS.map((f) => [f.slug, f])),
);

/** Every slug that has a configured form. */
export const CONFIGURED_SERVICE_SLUGS: readonly string[] = FORMS.map((f) => f.slug);

/**
 * The form for a service, or `undefined` when none is configured.
 *
 * FAIL-CLOSED: a service with no form must NOT silently skip Service Details. V1.3 must block
 * booking and show an "unavailable" message rather than create a structurally incomplete booking.
 */
export function getServiceForm(slug: string): ServiceForm | undefined {
  return SERVICE_FORMS[slug];
}

/** True when the service can be booked — i.e. it has a Service Details configuration. */
export function isServiceBookable(slug: string): boolean {
  return getServiceForm(slug) !== undefined;
}

/**
 * The options a CUSTOMER may choose from — disabled (future-phase) options are removed.
 * This is the only supported way to read options for rendering.
 */
export function customerOptions(question: Question, primaryValue?: string): Option[] {
  const raw = question.optionsBy && primaryValue ? (question.optionsBy[primaryValue] ?? []) : (question.options ?? []);
  return raw.filter((o) => !o.disabled);
}

/** Options present in config but withheld from customers, with the reason. */
export function disabledOptions(question: Question): Option[] {
  const all = [...(question.options ?? []), ...Object.values(question.optionsBy ?? {}).flat()];
  return all.filter((o) => o.disabled);
}
