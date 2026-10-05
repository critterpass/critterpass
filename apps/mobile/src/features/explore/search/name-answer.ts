/**
 * Whether a name search found the place she typed. The phone's search falls back to a kind of
 * place when no name has every word ("Zzyqx Warung Qqq" lists places to eat) and the server's adds
 * look-alikes ("12 Tran Phu" brings "Adi Tran"): neither is the place she asked for. When the
 * words beside the kind word, the small words and the numbers start no word of any row's name (or
 * of where it is: its area, its address, the trip's destination), the answer says so first; a kind's places may follow under their own heading, nearest first, and a
 * look-alike never stands in for an address.
 */
import { CATEGORY_WORDS, foldWords, STOP_WORDS } from '@/data/places/fold';
import type { PlaceCandidate } from '@/data/places/match-places';

import { looksLikeAddress } from './address-rule';
import { metresBetween } from './search-rows';

export type NameAnswer =
  /** A row carries the name (or only a kind was typed): the rows are the answer. */
  | { readonly kind: 'found' }
  /** No row carries the name; `below` says what the rows under the words are. */
  | {
      readonly kind: 'notFound';
      /** The text reads like a street address. */
      readonly address: boolean;
      /** `kind`: places of the kind she named (its category); `alike`: look-alikes; `none`: hide. */
      readonly below:
        | { readonly rows: 'kind'; readonly category: string }
        | { readonly rows: 'alike' }
        | { readonly rows: 'none' };
    };

/** The typed words that have to be in a name: not a kind word, a small word or a number. */
export function nameWords(query: string): string[] {
  return foldWords(query).filter(
    (word) => !STOP_WORDS.has(word) && !Object.hasOwn(CATEGORY_WORDS, word) && !/^\d+$/u.test(word),
  );
}

/** A row as the answer reads it: its names, and where it is (area and address) when known. */
export interface AnswerRow {
  readonly name: string;
  readonly nameLocal: string | null;
  readonly where?: string | null | undefined;
}

const starts = (tokens: readonly string[], word: string) =>
  tokens.some((token) => token.startsWith(word));

/**
 * Whether a row is the place typed: every word starts a word of its name, or says where it is
 * (people add the city or the area: "Tanah Lot Bali", "Starbucks Ubud"), and at least one word is
 * in the name itself.
 */
function named(row: AnswerRow, words: readonly string[], destination: readonly string[]): boolean {
  const name = foldWords(`${row.name} ${row.nameLocal ?? ''}`);
  const where = [...destination, ...foldWords(row.where ?? '')];
  return (
    words.some((word) => starts(name, word)) &&
    words.every((word) => starts(name, word) || starts(where, word))
  );
}

export function nameAnswer(
  query: string,
  rows: readonly AnswerRow[],
  /** The trip's destination: its name in a query is where, not what. */
  destination = '',
): NameAnswer {
  const place = foldWords(destination);
  const words = nameWords(query);
  // Only a kind, or only the destination itself, was typed: a browse.
  const asked = words.filter((word) => !starts(place, word));
  if (asked.length === 0 || rows.some((row) => named(row, words, place))) return { kind: 'found' };
  const address = looksLikeAddress(query);
  const kindWord = foldWords(query).find((word) => Object.hasOwn(CATEGORY_WORDS, word));
  const category = kindWord === undefined ? undefined : CATEGORY_WORDS[kindWord]?.category;
  if (category !== undefined) {
    return { kind: 'notFound', address, below: { rows: 'kind', category } };
  }
  return { kind: 'notFound', address, below: { rows: address ? 'none' : 'alike' } };
}

/** Rows nearest first from `from`; rows with no spot keep their order at the end. */
export function nearestFirst<T extends Pick<PlaceCandidate, 'lat' | 'lng'>>(
  rows: readonly T[],
  from: { readonly lat: number; readonly lng: number } | null,
): T[] {
  if (from === null) return [...rows];
  const far = Number.MAX_SAFE_INTEGER;
  const metres = (row: T) =>
    row.lat === null || row.lng === null
      ? far
      : metresBetween(from, { lat: row.lat, lng: row.lng });
  return rows
    .map((row, index) => ({ row, index, metres: metres(row) }))
    .sort((a, b) => a.metres - b.metres || a.index - b.index)
    .map((entry) => entry.row);
}
