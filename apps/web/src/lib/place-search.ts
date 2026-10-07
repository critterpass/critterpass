/**
 * The places a visitor can pick as "where are you headed first" beyond the six chips, and the
 * type-ahead over them. Two bundled lists, no free text: the critter catalogue's cities (each
 * with its local) and the cities of the airports dataset for everywhere else. Pure: the same
 * functions rank results on the server and are unit-tested in Node.
 *
 * The lists stay on the server: a catalogue row names the critter of its city, and the open web
 * gets rows only as the few results of a search (`/api/waitlist/search`), never the whole list.
 */

/**
 * One place, as a compact row so the list stays small on the wire. `rank` is 0 for a catalogue
 * city and the airport's size rank (1 largest to 3) otherwise; catalogue rows carry their local,
 * and the city's original name when the page's language calls it something else (`京都`, `Kyoto`).
 */
export type PlaceRow =
  | readonly [key: string, city: string, country: string, rank: 1 | 2 | 3]
  | readonly [
      key: string,
      city: string,
      country: string,
      rank: 0,
      critterName: string,
      species: string,
      critterKind: string,
      critterNo: number,
      original?: string,
    ];

export interface SearchablePlace {
  readonly row: PlaceRow;
  /** City name lowercased without diacritics (`Đà Nẵng` → `da nang`). */
  readonly folded: string;
  /** `folded` without spaces or punctuation, so `hanoi` meets `Hà Nội`. */
  readonly compact: string;
  /** The original name folded the same two ways, when the row carries one. */
  readonly originalFolded: string;
  readonly originalCompact: string;
  readonly critterFolded: string;
}

export const SEARCH_RESULT_LIMIT = 8;
/** Shorter queries (after folding) are not searched: one letter would list a slice of the catalogue. */
export const SEARCH_QUERY_MIN_LENGTH = 2;

/** Whether a typed query is long enough to search. */
export function isSearchable(rawQuery: string): boolean {
  return foldPlaceText(rawQuery).length >= SEARCH_QUERY_MIN_LENGTH;
}

/** Lowercase, diacritics stripped, đ → d, inner whitespace collapsed. */
export function foldPlaceText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();
}

export function compactPlaceText(folded: string): string {
  return folded.replace(/[^\p{L}\p{N}]+/gu, '');
}

export function indexPlaces(rows: readonly PlaceRow[]): SearchablePlace[] {
  return rows.map((row) => {
    const folded = foldPlaceText(row[1]);
    const originalFolded = row[3] === 0 && row[8] !== undefined ? foldPlaceText(row[8]) : '';
    return {
      row,
      folded,
      compact: compactPlaceText(folded),
      originalFolded,
      originalCompact: compactPlaceText(originalFolded),
      critterFolded: row[3] === 0 ? foldPlaceText(row[4]) : '',
    };
  });
}

function nameClass(folded: string, compact: string, query: string, compactQuery: string): number {
  if (folded === '') return 3;
  if (folded.startsWith(query)) return 0;
  if (compactQuery.length > 0 && compact.startsWith(compactQuery)) return 0;
  if (folded.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(query))) return 1;
  if (query.length >= 3 && folded.includes(query)) return 2;
  return 3;
}

/**
 * 0: the city starts with the query; 1: a later word (or the local's name) does; 2: it appears
 * inside. The page's name for the city and its original name both count: `kyoto` and `京都`.
 */
function matchClass(place: SearchablePlace, query: string, compactQuery: string): number | null {
  const best = Math.min(
    nameClass(place.folded, place.compact, query, compactQuery),
    nameClass(place.originalFolded, place.originalCompact, query, compactQuery),
    place.critterFolded !== '' && place.critterFolded.startsWith(query) ? 1 : 3,
  );
  return best === 3 ? null : best;
}

/**
 * Best matches first: a city-name prefix beats a later-word prefix beats a match inside the name;
 * within each, catalogue cities come before airport cities, bigger airports before smaller, then
 * shorter names. Never more than `limit` rows.
 */
export function searchPlaces(
  places: readonly SearchablePlace[],
  rawQuery: string,
  limit: number = SEARCH_RESULT_LIMIT,
): PlaceRow[] {
  const query = foldPlaceText(rawQuery);
  if (query.length < SEARCH_QUERY_MIN_LENGTH) return [];
  const compactQuery = compactPlaceText(query);
  const hits: { place: SearchablePlace; cls: number }[] = [];
  for (const place of places) {
    const cls = matchClass(place, query, compactQuery);
    if (cls !== null) hits.push({ place, cls });
  }
  hits.sort(
    (a, b) =>
      a.cls - b.cls ||
      a.place.row[3] - b.place.row[3] ||
      a.place.folded.length - b.place.folded.length ||
      a.place.folded.localeCompare(b.place.folded),
  );
  return hits.slice(0, limit).map((hit) => hit.place.row);
}
