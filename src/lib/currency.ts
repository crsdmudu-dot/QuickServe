/** Format a number of Kenyan shillings as "KES 1,500" (no decimals, comma grouping). */
export function formatKes(amount: number): string {
  const grouped = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `KES ${grouped}`;
}
