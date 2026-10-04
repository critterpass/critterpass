/**
 * When a search should also look for a street address. Places are venues, so "12 Trần Phú", a
 * friend's house or a rental finds nothing among them; the api's address lookup (`/v1/geocode`)
 * answers those, under a monthly cap, so it is only asked when it can help: our own results are
 * few, or the text reads like an address (a number, or a street word). The api applies the same
 * rule before it spends a lookup (services/api/src/geocoding/address-text.ts).
 */
const STREET_WORDS: ReadonlySet<string> = new Set([
  'duong',
  'hem',
  'kiet',
  'ngo',
  'ngach',
  'street',
  'st',
  'road',
  'rd',
  'avenue',
  'ave',
  'lane',
  'alley',
  'soi',
  'jalan',
  'jl',
]);

const WEAK_RESULT_COUNT = 5;
const MIN_QUERY_LENGTH = 3;

/** Lower case without tone marks, so "Đường" and "duong" read the same. */
function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

export function looksLikeAddress(text: string): boolean {
  if (/\p{Nd}/u.test(text)) return true;
  return plain(text)
    .split(/[^\p{L}]+/u)
    .some((word) => STREET_WORDS.has(word));
}

/**
 * Whether to ask for addresses: never offline or for a word or two of typing; else when the text
 * reads like an address, or our own finished search (`results`, null while it runs) found few.
 */
export function wantsAddresses(query: string, results: number | null, offline: boolean): boolean {
  const text = query.trim();
  if (offline || text.length < MIN_QUERY_LENGTH) return false;
  return looksLikeAddress(text) || (results !== null && results < WEAK_RESULT_COUNT);
}
