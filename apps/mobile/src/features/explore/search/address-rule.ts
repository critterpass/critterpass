/**
 * When a search should also look for a street address. Places are venues, so "12 Trần Phú", a
 * friend's house or a rental finds nothing among them; the api's address lookup (`/v1/geocode`)
 * answers those, under a monthly cap, so it is only asked when it can help: the text reads like an
 * address (a number, or a street word), or it is a short name that found no place at all and was
 * not read as a plain-words question. The api applies the same address rule before it spends a
 * lookup (services/api/src/geocoding/address-text.ts).
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

const MIN_QUERY_LENGTH = 3;
/** Longer than this reads as a question, not a name. */
const MAX_NAME_WORDS = 6;

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

export interface AddressAsk {
  readonly query: string;
  /** How many places our own search found; null while it runs. */
  readonly results: number | null;
  readonly offline: boolean;
  /**
   * Whether the text was read as a plain-words question (it parsed into chips): false while it is
   * only typed, null while a submitted question is still being read.
   */
  readonly question: boolean | null;
}

/**
 * Whether to ask for addresses: never offline or for a letter or two; always for text that reads
 * like an address; else only for six words or fewer that found no place and are not a question.
 */
export function wantsAddresses(ask: AddressAsk): boolean {
  const text = ask.query.trim();
  if (ask.offline || text.length < MIN_QUERY_LENGTH) return false;
  if (looksLikeAddress(text)) return true;
  return ask.results === 0 && ask.question === false && text.split(/\s+/u).length <= MAX_NAME_WORDS;
}
