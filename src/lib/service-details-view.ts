/**
 * service-details-view.ts — Service Details V1.4 read model.
 *
 * Turns a raw `bookings.service_details` value (typed `unknown`, possibly null, possibly written
 * by a NEWER app version) into a small, fully-rendered view model that any surface can display.
 *
 * THE ONE RULE THIS FILE ENFORCES: display comes from the SNAPSHOT, never from the current
 * configuration. This module deliberately does not import SERVICE_FORMS. A booking taken today
 * must read identically in a year, after the question set has been rewritten — so we render the
 * `question` / `display` / `label` strings the customer actually saw at submission time, and we
 * never look up a machine key against today's options.
 *
 * The second rule is that nothing internal leaks: machine keys, `schema`, `form_version`,
 * `primary_kind` and config metadata are never part of the view model. When a value cannot be
 * rendered meaningfully (no saved label), the field is OMITTED rather than shown raw.
 */

import { formatKes } from '@/lib/currency';
import { isServiceDetailsSnapshot } from '@/lib/service-details';

// ── View model ────────────────────────────────────────────────────────────────

/** One label/value pair. `id` is a React key only — it is never displayed. */
export type ServiceDetailRow = { id: string; label: string; value: string };

/** One requested line from a Grocery / Medicine / Food request list. */
export type ServiceDetailItem = {
  id: string;
  name: string;
  /** "2 bottles", "5 kg", "3" — empty when the quantity was not usable. */
  quantity: string;
  brand: string | null;
  note: string | null;
};

/** A rendered request list. Absent sections are null so surfaces render nothing for them. */
export type ServiceDetailItems = {
  lines: ServiceDetailItem[];
  /**
   * The MAXIMUM the customer authorised for buying the goods, already formatted ("KES 5,000").
   * This is NOT an order total, booking total, amount due or final charge — QuickServe service
   * and delivery fees are separate and are not part of Service Details at all.
   */
  goodsBudget: string | null;
  substitution: string | null;
};

/** Operational flags. Surfaces decide who sees them; the model just reports what was captured. */
export type ServiceDetailFlags = { priority: boolean; safetyAck: boolean };

/** Everything a surface needs to render a booking's Service Details. */
export type ServiceDetailsView = {
  /** Snapshotted service title. Surfaces that already show the service above may ignore it. */
  serviceTitle: string | null;
  primary: ServiceDetailRow | null;
  answers: ServiceDetailRow[];
  addons: string[];
  items: ServiceDetailItems | null;
  flags: ServiceDetailFlags;
};

// ── Safe readers ──────────────────────────────────────────────────────────────

/** A non-empty trimmed string, or null. Everything else (number, object, '') is not a label. */
function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** A finite number, or null. Strings are NOT coerced — a stored string is not a number. */
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The human-readable rendering of one answer.
 *
 * The saved `display` always wins — that is the whole point of the snapshot. It is only when a
 * snapshot is missing that string (a malformed row, or a future shape we do not know) that we
 * fall back, and then only for values that are self-describing: a boolean becomes Yes/No and a
 * number becomes its digits. A bare machine string like `deep_clean` is NOT self-describing, so
 * the row is dropped rather than leaking an internal key to the customer.
 */
function answerDisplay(row: Record<string, unknown>): string | null {
  const saved = text(row.display);
  if (saved) return saved;
  if (typeof row.value === 'boolean') return row.value ? 'Yes' : 'No';
  const n = num(row.value);
  if (n !== null) return String(n);
  return null;
}

/** One answered question → a row, or null when it cannot be rendered without leaking internals. */
function toRow(value: unknown, index: number): ServiceDetailRow | null {
  const row = record(value);
  if (!row) return null;
  // The question text the customer saw. A machine key is never used as a fallback label.
  const label = text(row.question);
  if (!label) return null;
  const display = answerDisplay(row);
  if (!display) return null;
  return { id: `${text(row.key) ?? 'answer'}-${index}`, label, value: display };
}

/** Format a goods amount. Known currency uses the app formatter; anything else stays explicit. */
function formatGoodsAmount(currency: string | null, amount: number): string {
  if (currency === null || currency === 'KES') return formatKes(amount);
  return `${currency} ${amount}`;
}

function toItems(value: unknown): ServiceDetailItems | null {
  const items = record(value);
  if (!items) return null;

  const rawLines = Array.isArray(items.lines) ? items.lines : [];
  const lines: ServiceDetailItem[] = [];
  rawLines.forEach((raw, index) => {
    const line = record(raw);
    if (!line) return;
    const name = text(line.name);
    if (!name) return; // an unnamed line says nothing useful — omit it
    const qty = num(line.qty);
    const unit = text(line.unit);
    const quantity = qty === null ? '' : unit ? `${qty} ${unit}` : String(qty);
    lines.push({
      id: text(line.line_id) ?? `line-${index}`,
      name,
      quantity,
      brand: text(line.brand),
      note: text(line.note),
    });
  });

  const budget = record(items.goods_budget);
  const amount = budget ? num(budget.max_goods_amount) : null;
  const goodsBudget = amount === null ? null : formatGoodsAmount(budget ? text(budget.currency) : null, amount);

  const substitution = text(record(items.substitution)?.display);

  // A request list with nothing in it is not worth a section.
  if (lines.length === 0 && goodsBudget === null && substitution === null) return null;
  return { lines, goodsBudget, substitution };
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Build the view model for a booking's `service_details`.
 *
 * Returns null — meaning "this booking has no Service Details" — for a legacy booking (null),
 * for anything malformed, and for a snapshot whose every field turned out unrenderable. Callers
 * then omit the section or show a legacy-friendly line; they must never surface raw data.
 * Never throws, and never mutates the value passed in.
 */
export function toServiceDetailsView(value: unknown): ServiceDetailsView | null {
  if (!isServiceDetailsSnapshot(value)) return null;
  const snapshot = value as unknown as Record<string, unknown>;

  const primary = toRow(snapshot.primary, 0);

  const rawAnswers = Array.isArray(snapshot.answers) ? snapshot.answers : [];
  const answers = rawAnswers
    .map((a, i) => toRow(a, i + 1))
    .filter((r): r is ServiceDetailRow => r !== null);

  const rawAddons = Array.isArray(snapshot.addons) ? snapshot.addons : [];
  const addons = rawAddons
    .map((a) => text(record(a)?.label)) // a machine key is never shown as an add-on name
    .filter((l): l is string => l !== null);

  const items = toItems(snapshot.items);

  const flagRecord = record(snapshot.flags) ?? {};
  const flags: ServiceDetailFlags = {
    priority: flagRecord.priority === true,
    safetyAck: flagRecord.safety_ack === true,
  };

  // Nothing renderable at all (e.g. a future shape we cannot read) — treat as "no details"
  // rather than showing an empty card. Flags alone are not a summary.
  if (!primary && answers.length === 0 && addons.length === 0 && !items) return null;

  return {
    serviceTitle: text(snapshot.service_title),
    primary,
    answers,
    addons,
    items,
    flags,
  };
}

/** True when a booking has Service Details worth showing. Cheap guard for conditional sections. */
export function hasServiceDetails(value: unknown): boolean {
  return toServiceDetailsView(value) !== null;
}
