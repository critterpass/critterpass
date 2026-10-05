/**
 * One row per place in a search answer. Open data lists a well-known place several times: a villa
 * as a sight, as a hotel and as a museum, a temple under five spellings. Two rows are the same
 * place when their names say the same thing once accents and generic words are dropped and they
 * lie within 300 m (2 km for beaches and nature, which run long), or when one name's words are all
 * in the other's (at least two words), they are within 75 m of each other (2 km for beaches and
 * nature) and the longer name adds
 * no word for another business ("Kamo River Guesthouse" is not the Kamo River). The first row in
 * search order answers for the place; a hotel listing gives way to a row of the same name that is
 * not one (the sight, not its guest rooms).
 */
import { placeNameKey } from '@cp/domain';

export interface PlaceRowIdentity {
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  /** In the curated set or a machine pick, when the caller knows. */
  readonly recommended?: boolean;
}

const SAME_NAME_M = 300;
const LONG_SAME_NAME_M = 2_000;
const PART_NAME_M = 75;
const LONG = new Set(['beach', 'nature']);

function metres(a: PlaceRowIdentity, b: PlaceRowIdentity): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Words that make a longer name another business at the same spot, not the place again. */
const BUSINESS_WORDS = new Set(
  (
    'guesthouse guest hotel hostel homestay resort inn lodge rooms suites apartment apartments ' +
    'cafe coffee restaurant resto warung bar pub bistro kitchen grill bakery ' +
    'spa massage salon shop store market mart boutique gallery studio tour tours travel ' +
    'parking ticket tickets office rental atm terrace club school'
  ).split(' '),
);

/** Every word of `smaller` is in `larger`, and what `larger` adds names no other business. */
function within(smaller: readonly string[], larger: readonly string[]): boolean {
  if (smaller.length < 2) return false;
  const has = new Set(larger);
  if (!smaller.every((word) => has.has(word))) return false;
  const own = new Set(smaller);
  return !larger.some((word) => !own.has(word) && BUSINESS_WORDS.has(word));
}

/** Whether two search rows are one place. */
export function sameSearchPlace(
  a: PlaceRowIdentity,
  b: PlaceRowIdentity,
  destination = '',
): boolean {
  const keyA = placeNameKey(a.name, destination);
  const keyB = placeNameKey(b.name, destination);
  if (keyA === '' || keyB === '') return false;
  const apart = metres(a, b);
  const long = LONG.has(a.category) && LONG.has(b.category);
  if (keyA === keyB) return apart <= (long ? LONG_SAME_NAME_M : SAME_NAME_M);
  // A mountain or a beach is pinned wherever each source put it ("Mount Batur Volcano").
  if (apart > (long ? LONG_SAME_NAME_M : PART_NAME_M)) return false;
  const wordsA = keyA.split(' ');
  const wordsB = keyB.split(' ');
  return wordsA.length <= wordsB.length ? within(wordsA, wordsB) : within(wordsB, wordsA);
}

/**
 * An open-data row that only repeats a recommended place's name ("Tanah Lot" pinned a few
 * kilometres from Tanah Lot Temple, or on the far coast) is the same place badly pinned, wherever
 * it lies in the destination: the recommended row, listed before it, answers.
 */
function repeatsRecommended(
  listed: PlaceRowIdentity,
  row: PlaceRowIdentity,
  destination: string,
): boolean {
  if (listed.recommended !== true || row.recommended !== false) return false;
  const words = placeNameKey(row.name, destination).split(' ').filter(Boolean);
  return within(words, placeNameKey(listed.name, destination).split(' '));
}

/**
 * `rows` in order with one row per place. A later row of a place already listed is dropped, unless
 * the listed row is a hotel listing (`stay`) and the later one has the same name and is not: then
 * the place itself takes the listing's position.
 */
export function onePerPlace<T extends PlaceRowIdentity>(rows: readonly T[], destination = ''): T[] {
  const kept: T[] = [];
  for (const row of rows) {
    if (kept.some((other) => repeatsRecommended(other, row, destination))) continue;
    const at = kept.findIndex((other) => sameSearchPlace(other, row, destination));
    const listed = kept[at];
    if (listed === undefined) kept.push(row);
    else if (
      listed.category === 'stay' &&
      row.category !== 'stay' &&
      placeNameKey(listed.name, destination) === placeNameKey(row.name, destination)
    ) {
      kept[at] = row;
    }
  }
  return kept;
}
