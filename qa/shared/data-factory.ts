/** Deterministic PRNG (mulberry32): same seed → same sequence. No DB, no network. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type BookingDraft = { service: string; note: string; amount: number };
export type DataFactory = {
  email: () => string;
  fullName: () => string;
  uuid: () => string;
  bookingDraft: () => BookingDraft;
};

const FIRST = ['Amina', 'Brian', 'Chege', 'Dalia', 'Emeka', 'Faith', 'Grace', 'Hassan'];
const LAST = ['Otieno', 'Kamau', 'Mwangi', 'Achieng', 'Wanjiru', 'Njoroge'];
const SERVICES = ['house-cleaning', 'plumbing', 'ac-repair', 'handyman', 'massage'];

export function createDataFactory(seed = 1): DataFactory {
  const rng = createRng(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rng() * 16).toString(16)).join('');
  return {
    email: () => `qa+${hex(8)}@example.com`,
    fullName: () => `${pick(FIRST)} ${pick(LAST)}`,
    uuid: () => `${hex(8)}-${hex(4)}-4${hex(3)}-${hex(4)}-${hex(12)}`,
    bookingDraft: () => ({ service: pick(SERVICES), note: `QA note ${hex(4)}`, amount: int(500, 5000) }),
  };
}
