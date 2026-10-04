/**
 * Whether search text reads like a street address rather than a venue name: it carries a number
 * ("12 Trần Phú") or a street word. Deliberately loose: a false positive only spends one capped
 * address lookup. The app applies the same rule before it asks
 * (apps/mobile/src/features/explore/search/address-rule.ts).
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
