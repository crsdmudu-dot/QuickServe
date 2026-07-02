/** The address-bearing subset shared by Booking rows and the booking draft.
 *  All structured fields optional/nullable; `address` is the required human string. */
export type DestinationInput = {
  address: string;
  address_label?: string | null;
  building_name?: string | null;
  floor?: string | null;
  door_number?: string | null;
  landmark?: string | null;
  access_notes?: string | null;
};

export type FormattedDestination = { primary: string; lines: string[] };

/** Human-readable destination. `primary` = the label or the address text; `lines` = the present
 *  apartment/access details as labeled strings (empties skipped). Pure; never throws.
 *  Fallback: when no structured fields exist, `primary` = address and `lines` = []. */
export function formatDestination(input: DestinationInput): FormattedDestination {
  const trimmed = (v: string | null | undefined): string =>
    typeof v === 'string' ? v.trim() : '';

  const label = trimmed(input.address_label);
  const address = trimmed(input.address);
  const primary = label || address;   // label preferred; else the address text (fallback)

  const lines: string[] = [];
  const push = (prefix: string, v: string | null | undefined) => {
    const t = trimmed(v);
    if (t) lines.push(`${prefix}: ${t}`);
  };
  push('Building', input.building_name);
  push('Floor', input.floor);
  push('Door/Unit', input.door_number);
  push('Landmark', input.landmark);
  push('Access', input.access_notes);

  return { primary, lines };
}
