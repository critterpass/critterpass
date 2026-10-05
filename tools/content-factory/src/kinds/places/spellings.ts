/**
 * Vietnamese names and addresses the open data holds without their accents ("Dinh Bao Dai III",
 * "Trieu Viet Vuong"), given the spelling another record carries: a record of the same place
 * (merged into it, or within 150 m under the same words) or, for a street, any record on the
 * spot whose address holds the same words. Accents are only ever copied from a record, never
 * guessed; a name with no accented record stays as the source wrote it.
 */
import type pg from 'pg';

import { PLAIN } from '../media/place-words';
import { tellingWords, typesOf, words } from '../media/place-match';

export const NEARBY_RECORD_M = 150;

export interface Spelling {
  readonly name: string;
  readonly nameLocal: string | null;
  readonly address: string | null;
}

export const hasAccents = (text: string) => /\p{M}|[đĐ]/u.test(text.normalize('NFD'));
const fold = (text: string) => words(text).join(' ');
const tokens = (text: string) => text.split(/\s+/u).filter(Boolean);
/** A token without the punctuation around it ("Vương," is "Vương"). */
const core = (token: string) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** `text` with each word spelt as in `accented`, when that holds exactly the same words. */
function sameWords(text: string, accented: string): string | null {
  const theirs = new Map(tokens(accented).map((token) => [fold(token), core(token)]));
  const ours = tokens(text);
  if ([...new Set(ours.map(fold))].sort().join(' ') !== [...theirs.keys()].sort().join(' ')) {
    return null;
  }
  return ours
    .map((token) => token.replace(core(token), theirs.get(fold(token)) ?? token))
    .join(' ');
}

/**
 * `text` with its words spelt as the run of `accented` that holds them in order, or null without
 * one. A number is never copied: "13 Nha Chung" takes "Nhà Chung" from "1 Nhà Chung" and keeps 13.
 * With `partly`, the longest run of two words or more will do when the words left over say
 * nothing of their own ("Ba Thang Hai Street"); a street spelt half with accents helps nobody.
 */
const FILLER = new Set([
  'street',
  'st',
  'road',
  'ward',
  'bis',
  'da lat',
  'city',
  'duong',
  'phuong',
]);
function runOf(text: string, accented: string, partly = false): string | null {
  const ours = tokens(text);
  const theirs = tokens(accented);
  const worded = (token: string) => /\p{L}/u.test(token) && !/\p{N}/u.test(token);
  const first = ours.findIndex(worded);
  if (first === -1) return null;
  let last = first;
  while (last + 1 < ours.length && worded(ours[last + 1] ?? '')) last += 1;
  for (let length = last - first + 1; length >= (partly ? 2 : last - first + 1); length -= 1) {
    for (let from = first; from + length - 1 <= last; from += 1) {
      const run = ours.slice(from, from + length);
      for (let start = 0; start + length <= theirs.length; start += 1) {
        const found = theirs.slice(start, start + length);
        const rest = [...ours.slice(first, from), ...ours.slice(from + length, last + 1)];
        if (
          rest.every((token) => FILLER.has(fold(token))) &&
          found.every((token, i) => fold(token) !== '' && fold(token) === fold(run[i] ?? ''))
        ) {
          return ours
            .map((token, i) =>
              i < from || i >= from + length
                ? token
                : token.replace(core(token), core(found[i - from] ?? token)),
            )
            .join(' ');
        }
      }
    }
  }
  return null;
}

/** The name without the words that only say where it is ("An Cafe thành phố Đà Lạt"). */
const bare = (text: string) =>
  words(text)
    .filter((word) => !PLAIN.has(word))
    .join(' ');

/**
 * The place with accents restored. `same` are records of the same place, `near` the records on
 * the spot. A name takes the spelling of a record with the same words, or of the run of a record's
 * name that holds them. Failing that, the place keeps its name and an accented name of a `same`
 * record becomes its local name, unless it is the same name with the town added or shares words
 * with it without sharing them all (the lake's park is not the lake).
 */
export function accented(
  place: Spelling,
  same: readonly Spelling[],
  near: readonly Spelling[],
): Spelling {
  const spelt = (records: readonly Spelling[]) =>
    records.flatMap((r) => [r.name, r.nameLocal]).filter((n): n is string => !!n && hasAccents(n));
  const everywhere = spelt([...same, ...near]);
  const respelt = (text: string) =>
    everywhere.map((n) => sameWords(text, n)).find((n) => n !== null) ??
    (tokens(text).length < 2
      ? null
      : (everywhere.map((n) => runOf(text, n)).find((n) => n !== null && hasAccents(n)) ?? null));
  const name = hasAccents(place.name) ? place.name : (respelt(place.name) ?? place.name);
  const local =
    place.nameLocal === null || hasAccents(place.nameLocal)
      ? place.nameLocal
      : (respelt(place.nameLocal) ?? place.nameLocal);
  const ours = new Set(tellingWords(name));
  const types = typesOf(words(name));
  const known =
    spelt(same)
      .filter((n) => {
        const theirs = tellingWords(n);
        const shared = theirs.filter((word) => ours.has(word)).length;
        const kinds = typesOf(words(n));
        const clash = kinds.size > 0 && types.size > 0 && ![...kinds].some((t) => types.has(t));
        return bare(n) !== bare(name) && (shared === 0 || (shared === ours.size && !clash));
      })
      .sort((a, b) => a.length - b.length)[0] ?? null;
  const nameLocal = local ?? (hasAccents(name) ? null : known);
  const address =
    place.address === null || hasAccents(place.address)
      ? place.address
      : ([...same, ...near]
          .flatMap((r) => (r.address !== null && hasAccents(r.address) ? [r.address] : []))
          .map((a) => runOf(place.address ?? '', a, true))
          .find((a) => a !== null && hasAccents(a)) ?? place.address);
  return { name, nameLocal: nameLocal === name ? null : nameLocal, address };
}

/** Every active record of the destination within 150 m of each of `poiIds`, whatever its source. */
export async function nearbyRecords(
  pool: pg.Pool,
  destinationId: string,
  poiIds: readonly string[],
): Promise<Map<string, Spelling[]>> {
  const { rows } = await pool.query<{
    id: string;
    name: string;
    name_local: string | null;
    address: string | null;
  }>(
    `SELECT a.id, b.name, b.name_local, b.address
     FROM pois a JOIN pois b ON b.destination_id = a.destination_id AND b.id <> a.id
       AND b.status = 'active' AND ST_DWithin(a.location, b.location, $3)
     WHERE a.destination_id = $1 AND a.id = ANY($2::uuid[])`,
    [destinationId, poiIds, NEARBY_RECORD_M],
  );
  const found = new Map<string, Spelling[]>();
  for (const row of rows) {
    const list = found.get(row.id) ?? [];
    list.push({ name: row.name, nameLocal: row.name_local, address: row.address });
    found.set(row.id, list);
  }
  return found;
}
