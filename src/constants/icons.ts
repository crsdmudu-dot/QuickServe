// icons.ts — Predefined service icons for QuickServe.
// Icons are emoji glyphs that render identically on iOS, Android, and web.
// There is NO upload path — all icons come from this curated list.

/**
 * A curated set of emoji icons used across the app.
 * Each entry has:
 *   - `name`  — a stable slug (used in DB and admin UI)
 *   - `glyph` — the emoji character to render
 */
export const PREDEFINED_ICONS: { name: string; glyph: string }[] = [
  // ── 19 service-specific icons ─────────────────────────────────────────────
  { name: 'broom',        glyph: '🧹' }, // House Cleaning
  { name: 'wrench',       glyph: '🔧' }, // Plumbing / generic repair
  { name: 'bolt',         glyph: '⚡' }, // Electrical Repairs
  { name: 'snowflake',    glyph: '❄️' }, // AC Repair & Servicing
  { name: 'palette',      glyph: '🎨' }, // Home Painting
  { name: 'bug',          glyph: '🐜' }, // Pest Control
  { name: 'hammer',       glyph: '🛠️' }, // Handyman Services
  { name: 'plug',         glyph: '🔌' }, // Appliance Repair
  { name: 'box',          glyph: '📦' }, // Movers & Packers / Package
  { name: 'car',          glyph: '🚗' }, // Mechanic On Demand
  { name: 'wheel',        glyph: '🛞' }, // Tire Replacement
  { name: 'tow-truck',    glyph: '🚙' }, // Car Towing
  { name: 'cart',         glyph: '🛒' }, // Grocery Delivery
  { name: 'burger',       glyph: '🍔' }, // Food Delivery
  { name: 'pill',         glyph: '💊' }, // Medicine Delivery
  { name: 'mailbox',      glyph: '📮' }, // Package Delivery
  { name: 'scissors',     glyph: '✂️' }, // Haircuts
  { name: 'lipstick',     glyph: '💄' }, // Makeup
  { name: 'massage',      glyph: '💆' }, // Massage
  // ── Generic / utility extras ──────────────────────────────────────────────
  { name: 'sparkles',     glyph: '✨' }, // highlight / premium
  { name: 'star',         glyph: '⭐' }, // rating / featured
  { name: 'house',        glyph: '🏠' }, // home category
  { name: 'delivery',     glyph: '🚚' }, // delivery category
  { name: 'person',       glyph: '💇' }, // personal care category
  { name: 'tools',        glyph: '🧰' }, // generic tools
  // ── Fallback ───────────────────────────────────────────────────────────────
  { name: 'puzzle',       glyph: '🧩' }, // unknown / fallback
];

/**
 * Returns the glyph for a predefined icon `name`.
 * Falls back to '🧩' (puzzle piece) when the name is not found.
 */
export function iconGlyphByName(name: string): string {
  const entry = PREDEFINED_ICONS.find((i) => i.name === name);
  return entry ? entry.glyph : '🧩';
}

/**
 * Returns true when `nameOrGlyph` is either a known icon name or a known glyph.
 * Useful for admin-UI validation to ensure only curated icons are saved to the DB.
 */
export function isPredefinedIcon(nameOrGlyph: string): boolean {
  return PREDEFINED_ICONS.some(
    (i) => i.name === nameOrGlyph || i.glyph === nameOrGlyph,
  );
}
