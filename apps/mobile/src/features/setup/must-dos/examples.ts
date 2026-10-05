/**
 * Must-dos to tap when the list is empty: a few of the guide's best-ranked places at the
 * destination, read from what the phone already holds. Something to eat comes first when the
 * guide has one (a dish is the must-do most people name), then the top sights, each under the
 * name the reader's language uses where the place has one.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and category keys, never copy. */
import { toCountryCode } from '@cp/domain';

import { useLiveRows } from '../data/rows';

export interface ExamplePlaceRow {
  readonly id: string;
  readonly name: string;
  readonly name_local: string | null;
  readonly category: string | null;
}

export interface ExamplePlace {
  readonly id: string;
  readonly name: string;
}

export const EXAMPLES_SHOWN = 3;
const FOOD = new Set(['food']);
/** Never a must-do on their own: where she sleeps, how she gets there, a pharmacy. */
const NOT_A_MUST_DO = new Set(['stay', 'transit', 'health']);

const EXAMPLES_SQL = `SELECT p.id, p.name, p.name_local, p.category, d.country FROM pois p
  JOIN destinations d ON d.id = p.destination_id
  WHERE p.destination_id = ? AND p.status = 'active' AND p.merged_into_id IS NULL
    AND p.pick_rank IS NOT NULL
  ORDER BY p.pick_rank, p.name LIMIT 24`;

/** `rows` best first. `localNames`: the reader reads the place's own language. */
export function examplePlaces(
  rows: readonly ExamplePlaceRow[],
  localNames: boolean,
  limit = EXAMPLES_SHOWN,
): ExamplePlace[] {
  const usable = rows.filter((row) => !NOT_A_MUST_DO.has(row.category ?? ''));
  const food = usable.find((row) => FOOD.has(row.category ?? ''));
  const sights = usable.filter((row) => !FOOD.has(row.category ?? ''));
  const chosen = [
    ...sights.slice(0, food === undefined ? limit : limit - 1),
    ...(food === undefined ? [] : [food]),
  ];
  // Short of sights, the rest of the list fills in.
  for (const row of usable) {
    if (chosen.length >= limit) break;
    if (!chosen.includes(row)) chosen.push(row);
  }
  return chosen.slice(0, limit).map((row) => ({
    id: row.id,
    name:
      localNames && row.name_local !== null && row.name_local !== '' ? row.name_local : row.name,
  }));
}

/**
 * The examples for the trip's destination. A place's own-language name is used only for a reader
 * of that language (a Vietnamese reader in Vietnam), never a Japanese name for her in Kyoto.
 */
export function useExamplePlaces(
  destinationId: string | null,
  locale: string,
): readonly ExamplePlace[] {
  const { rows } = useLiveRows<ExamplePlaceRow & { readonly country: string | null }>(
    EXAMPLES_SQL,
    destinationId === null ? null : [destinationId],
    ['pois', 'destinations'],
  );
  const reads = locale.toLowerCase().startsWith('vi') ? 'VN' : null;
  const localNames = reads !== null && toCountryCode(rows[0]?.country ?? null) === reads;
  return examplePlaces(rows, localNames);
}
