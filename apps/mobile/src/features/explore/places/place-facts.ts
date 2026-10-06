/**
 * What the list's rows and order read beyond the map's places: where each place stands in the
 * recommended order (the editors' must-sees, the rest of the curated set, then the machine picks by
 * rank; the order every reader shares) and the area its own address names. The phone's rows answer
 * first; a place only the api's browse holds ranks by what the browse says of it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and address words, never copy. */
import { useMemo } from 'react';

import { dataOf } from '@/data/travel-data/freshness';

import { useLiveRows } from '../data/live-rows';
import { useDestinationPlaces, type BrowsePlace } from '../map-queries';

const STREET =
  /^(jl\.?|jalan|gang|gg\.?|đường|duong|ngõ|hẻm|street|st\.?|road|rd\.?|avenue|ave\.?|lane|calle|rua|av\.?)\s/iu;
const STREET_SUFFIX = /\s(street|st\.?|road|rd\.?|avenue|ave\.?|lane|boulevard|blvd\.?)$/iu;
const ADMIN =
  /\b(regency|province|kabupaten|kota|prefecture|county|state|provinsi|tỉnh|tinh|thành phố)\b/iu;
const ADMIN_PREFIX = /^(kecamatan|kec\.|kelurahan|kel\.|desa|phường|phuong|quận|quan|xã|xa)\s+/iu;

const foldName = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/giu, 'd').toLowerCase().trim();

/**
 * The area a place is in ("Ubud", "Canggu"), read from its own address: the first comma part that
 * is a name rather than a street, a number or an administrative unit, and not the destination
 * itself. Null when the address has no such part; nothing is guessed from coordinates.
 */
export function areaOf(address: string | null, destinationName: string): string | null {
  if (address === null) return null;
  const destination = foldName(destinationName);
  for (const raw of address.split(',')) {
    const part = raw.trim().replace(ADMIN_PREFIX, '');
    if (part === '' || part.length > 40 || /\d/u.test(part)) continue;
    if (STREET.test(part) || STREET_SUFFIX.test(part) || ADMIN.test(part)) continue;
    if (destination !== '' && foldName(part) === destination) continue;
    return part;
  }
  return null;
}

export interface PlaceFacts {
  /** Lower comes first in the recommended order; null for a place nobody recommended. */
  readonly rank: number | null;
  readonly area: string | null;
}

/** Curated places rank before every machine pick; must-sees before the rest of the curated set. */
const CURATED_RANK = 1;
const PICK_BASE = 10;

export function recommendedRank(row: {
  readonly curation: string | null;
  readonly pick_rank: number | null;
  readonly must_see: boolean;
}): number | null {
  if (row.curation === 'editorial') return row.must_see ? 0 : CURATED_RANK;
  return row.pick_rank === null ? null : PICK_BASE + row.pick_rank;
}

const FACTS_SQL = `SELECT id, curation, pick_rank, address,
    coalesce(json_extract(editorial, '$.must_see'), 0) AS must_see
  FROM pois WHERE destination_id = ?`;
const FACTS_TABLES = ['pois'];

export interface FactsRow {
  readonly id: string;
  readonly curation: string | null;
  readonly pick_rank: number | null;
  readonly address: string | null;
  readonly must_see: number | string | null;
}

/**
 * A browse-only place in the same order as the phone's rows: must-sees first, then the recommended
 * places the pick job did not rank (the curated set), then the picks by rank.
 */
export function browsedRank(place: BrowsePlace): number | null {
  if (place.mustSee) return 0;
  if (place.pickRank !== null) return PICK_BASE + place.pickRank;
  return place.recommended ? CURATED_RANK : null;
}

/** The facts of the phone's rows, then of the browse's places the phone does not hold. */
export function placeFacts(
  rows: readonly FactsRow[],
  browsed: readonly BrowsePlace[],
  destinationName: string,
): ReadonlyMap<string, PlaceFacts> {
  const facts = new Map<string, PlaceFacts>(
    rows.map((row) => [
      row.id,
      {
        rank: recommendedRank({
          curation: row.curation,
          pick_rank: row.pick_rank,
          must_see: row.must_see === 1 || row.must_see === 'true',
        }),
        area: areaOf(row.address, destinationName),
      },
    ]),
  );
  browsed.forEach((place) => {
    if (facts.has(place.id)) return;
    facts.set(place.id, {
      rank: browsedRank(place),
      area: place.area ?? areaOf(place.address, destinationName),
    });
  });
  return facts;
}

export function usePlaceFacts(
  destinationId: string | null,
  destinationName: string,
): ReadonlyMap<string, PlaceFacts> {
  const { rows } = useLiveRows<FactsRow>(
    FACTS_SQL,
    destinationId === null ? null : [destinationId],
    FACTS_TABLES,
  );
  const browsed = dataOf(useDestinationPlaces(destinationId))?.results;
  return useMemo(
    () => placeFacts(rows, browsed ?? [], destinationName),
    [rows, browsed, destinationName],
  );
}
