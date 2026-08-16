/**
 * service-details.ts — Service Details V1 data model.
 *
 * The customer answers a short set of structured questions about the job before choosing an
 * address. Those answers are frozen into an immutable SNAPSHOT at submission time and stored in
 * `bookings.service_details` (jsonb, migration 0037).
 *
 * Two rules drive the whole design:
 *
 *  1. Every stored answer carries BOTH a machine key/value (for future pricing, dispatch,
 *     matching and analytics) AND a human-readable question + display label.
 *  2. Rendering NEVER re-resolves labels from the current configuration. A booking taken today
 *     must read identically in a year, after the question set has been rewritten. This mirrors
 *     the existing convention on `bookings` of snapshotting `assigned_provider_name`/`_phone`
 *     rather than joining live.
 *
 * V1.1 is the data foundation only: types, the snapshot builder, and read helpers. The 19
 * service form configurations (V1.2) and the renderer / booking step (V1.3) build on top of it.
 */

// ── Versions ──────────────────────────────────────────────────────────────────

/**
 * Snapshot ENVELOPE version. Bump only when the shape below changes structurally, never for a
 * question wording or option change (that is `form_version`).
 */
export const SERVICE_DETAILS_SCHEMA_VERSION = 1;

// ── Question / answer primitives ──────────────────────────────────────────────

/** The input kinds a service question may use. `itemlist` is the repeatable request list. */
export type QuestionKind = 'single' | 'multi' | 'number' | 'text' | 'boolean' | 'time' | 'itemlist';

/**
 * What the primary question means internally. Never shown to the customer.
 *  - `variant` — what the customer is buying/requesting (House Cleaning, Massage, Package).
 *  - `issue`   — the symptom being reported (Plumbing, Electrical, Mechanic).
 * They are separated because only a variant is directly priceable; an issue is a triage input.
 */
export type PrimaryKind = 'variant' | 'issue';

/** A stored answer value. JSON-safe by construction — no undefined, functions, or class values. */
export type AnswerValue = string | string[] | number | boolean | null;

/** One answered question, carrying machine value AND the labels needed to render it forever. */
export type AnsweredQuestion = {
  /** Stable machine key — never reused for a different meaning. */
  key: string;
  /** The question text exactly as the customer saw it. */
  question: string;
  kind: QuestionKind;
  value: AnswerValue;
  /** Human-readable rendering of `value` as the customer saw it. */
  display: string;
};

/** A selected optional extra. */
export type SelectedAddon = { key: string; label: string };

// ── Repeatable request item lists (Grocery / Medicine / future Food) ───────────

/**
 * Fixed unit vocabulary for requested lines (V1). Deliberately small and concrete: units a
 * customer in this market would actually use when writing a shopping list.
 */
export const ITEM_UNITS = ['pcs', 'kg', 'g', 'litres', 'ml', 'packs', 'bottles', 'bunches'] as const;
export type ItemUnit = (typeof ITEM_UNITS)[number];

/** Which product domain a request list belongs to. Drives later routing, never the shape. */
export type ItemListKind = 'grocery' | 'medicine' | 'food';

/**
 * One requested line. `line_id` is STABLE for the life of the booking: later phases (sourcing,
 * line pricing, substitution, stock status, reconciliation) attach to a line by this id and
 * write to SEPARATE structures — the customer's original request is never mutated.
 */
export type ItemLine = {
  line_id: string;
  name: string;
  qty: number;
  unit: ItemUnit | null;
  brand: string | null;
  note: string | null;
};

/**
 * MAXIMUM GOODS BUDGET — the ceiling the customer authorises for PURCHASING THE GOODS.
 *
 * Deliberately NOT named `budget`, `total`, or `cap`, and deliberately not a bare number: it is
 * NOT the final booking total, NOT a delivery fee, NOT a QuickServe service fee, and NOT a
 * sourcing/handling fee. Future pricing composes those separately (goods subtotal + delivery /
 * service fee + any sourcing fee). Keeping the name explicit prevents the concepts collapsing.
 */
export type GoodsBudget = {
  currency: 'KES';
  max_goods_amount: number;
};

/** What to do when a requested item is unavailable. Snapshotted with its display label. */
export type SubstitutionChoice = { value: string; display: string };

/** A repeatable request list. One shape shared by Grocery, Medicine and (later) Food. */
export type ItemList = {
  kind: ItemListKind;
  /** Required wherever QuickServe purchases goods on the customer's behalf; null when collecting. */
  goods_budget: GoodsBudget | null;
  substitution: SubstitutionChoice | null;
  lines: ItemLine[];
};

// ── Snapshot ──────────────────────────────────────────────────────────────────

/** Operational flags derived at submission (e.g. a safety answer that warrants priority). */
export type SnapshotFlags = {
  /** Dispatch attention warranted (e.g. an active leak, visible electrical hazard signs). */
  priority?: boolean;
  /** The customer explicitly acknowledged a required notice (e.g. prohibited items). */
  safety_ack?: boolean;
};

/** The immutable record of what the customer asked for. Stored in bookings.service_details. */
export type ServiceDetailsSnapshot = {
  schema: number;
  /** The ServiceForm.version in force when this booking was submitted. */
  form_version: number;
  /** Matches bookings.service_id (a service slug). */
  service_slug: string;
  /** Snapshotted so a later catalogue rename cannot alter historical bookings. */
  service_title: string;
  primary_kind: PrimaryKind;
  primary: AnsweredQuestion;
  answers: AnsweredQuestion[];
  addons: SelectedAddon[];
  items: ItemList | null;
  flags: SnapshotFlags;
};

// ── Builder ───────────────────────────────────────────────────────────────────

/** What a caller supplies to build a snapshot. Optional parts default to empty, never undefined. */
export type ServiceDetailsInput = {
  formVersion: number;
  serviceSlug: string;
  serviceTitle: string;
  primaryKind: PrimaryKind;
  primary: AnsweredQuestion;
  /** Only VISIBLE, ANSWERED questions. Hidden/unanswered ones must never be passed. */
  answers?: (AnsweredQuestion | null | undefined)[];
  addons?: (SelectedAddon | null | undefined)[];
  items?: ItemList | null;
  flags?: SnapshotFlags;
};

/** True when a value is a real answer. `undefined`/`NaN` mean "not answered" and are dropped. */
function isAnswered(a: AnsweredQuestion | null | undefined): a is AnsweredQuestion {
  if (!a) return false;
  if (a.value === undefined) return false;
  if (typeof a.value === 'number' && Number.isNaN(a.value)) return false;
  return true;
}

/** Normalise one line so the stored list is deterministic and fully JSON-safe. */
function normaliseLine(line: ItemLine): ItemLine {
  return {
    line_id: line.line_id,
    name: line.name,
    qty: line.qty,
    unit: line.unit ?? null,
    brand: line.brand ?? null,
    note: line.note ?? null,
  };
}

/** Normalise a request list; drops nothing but guarantees explicit nulls over undefined. */
function normaliseItems(items: ItemList | null | undefined): ItemList | null {
  if (!items) return null;
  return {
    kind: items.kind,
    goods_budget: items.goods_budget
      ? { currency: items.goods_budget.currency, max_goods_amount: items.goods_budget.max_goods_amount }
      : null,
    substitution: items.substitution
      ? { value: items.substitution.value, display: items.substitution.display }
      : null,
    lines: items.lines.map(normaliseLine),
  };
}

/** Recursively freeze so a built snapshot cannot be mutated after the fact. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

/**
 * Build the immutable snapshot written to `bookings.service_details`.
 *
 * Guarantees:
 *  - unanswered/hidden questions are DROPPED (never stored as undefined or empty placeholders);
 *  - answer and add-on ORDER is preserved exactly as presented to the customer;
 *  - duplicate keys are collapsed to the LAST occurrence (a re-answered question wins);
 *  - the result contains only JSON-safe values and is deeply frozen.
 */
export function buildServiceDetailsSnapshot(input: ServiceDetailsInput): ServiceDetailsSnapshot {
  const answered = (input.answers ?? []).filter(isAnswered);

  // Collapse duplicates by key, keeping the last occurrence but the FIRST position — so a
  // re-answered question keeps its place in the customer's reading order.
  const order: string[] = [];
  const byKey = new Map<string, AnsweredQuestion>();
  for (const a of answered) {
    if (!byKey.has(a.key)) order.push(a.key);
    byKey.set(a.key, { key: a.key, question: a.question, kind: a.kind, value: a.value, display: a.display });
  }

  const addons: SelectedAddon[] = [];
  const seenAddons = new Set<string>();
  for (const addon of input.addons ?? []) {
    if (!addon || seenAddons.has(addon.key)) continue;
    seenAddons.add(addon.key);
    addons.push({ key: addon.key, label: addon.label });
  }

  const flags: SnapshotFlags = {};
  if (input.flags?.priority !== undefined) flags.priority = input.flags.priority;
  if (input.flags?.safety_ack !== undefined) flags.safety_ack = input.flags.safety_ack;

  return deepFreeze({
    schema: SERVICE_DETAILS_SCHEMA_VERSION,
    form_version: input.formVersion,
    service_slug: input.serviceSlug,
    service_title: input.serviceTitle,
    primary_kind: input.primaryKind,
    primary: {
      key: input.primary.key,
      question: input.primary.question,
      kind: input.primary.kind,
      value: input.primary.value,
      display: input.primary.display,
    },
    answers: order.map((k) => byKey.get(k)!),
    addons,
    items: normaliseItems(input.items),
    flags,
  });
}

// ── Read helpers (historical-safe) ────────────────────────────────────────────

/**
 * Narrow an unknown `bookings.service_details` value read from the database.
 *
 * Deliberately permissive about future/unknown fields and about `schema` version: a snapshot
 * written by a LATER app version must still be recognised and rendered by an older client from
 * its own labels, rather than being discarded. Only the fields we actually read are required.
 */
export function isServiceDetailsSnapshot(value: unknown): value is ServiceDetailsSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const primary = v.primary as Record<string, unknown> | undefined;
  return (
    typeof v.schema === 'number' &&
    typeof v.service_slug === 'string' &&
    !!primary &&
    typeof primary === 'object' &&
    typeof primary.key === 'string' &&
    Array.isArray(v.answers)
  );
}

/**
 * The primary answer's machine value, or null when a booking predates Service Details.
 * Read-only accessor — used later (V1.5) to stop the duplicate-booking warning firing for two
 * genuinely different requests for the same service at the same address.
 */
export function serviceDetailsPrimaryValue(value: unknown): string | null {
  if (!isServiceDetailsSnapshot(value)) return null;
  const raw = value.primary.value;
  return typeof raw === 'string' ? raw : null;
}

/** A stable id for a new request line. Prefixed so ids are recognisable in stored JSON. */
export function newItemLineId(): string {
  // globalThis.crypto is available in Hermes (Expo SDK 52+) and in Node 19+ used by Jest.
  const uuid = globalThis.crypto?.randomUUID?.();
  return `line_${uuid ?? Math.random().toString(36).slice(2, 10)}`;
}
