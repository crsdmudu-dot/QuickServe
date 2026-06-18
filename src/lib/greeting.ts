/**
 * Returns a time-based greeting string with an emoji.
 * Pure function — easy to test and reuse anywhere.
 *
 * @param date - The date to derive the hour from. Defaults to now.
 */
export function getGreeting(date: Date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Good Morning ☀️';
  if (h >= 12 && h < 17) return 'Good Afternoon 🌤️';
  return 'Good Evening 🌙';
}
