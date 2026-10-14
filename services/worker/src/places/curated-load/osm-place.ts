/**
 * One curated place the loader found no row for, looked up in OpenStreetMap (`./osm-lookup.ts`)
 * and written the way the ingest writes an OSM place (`attachOsmPlace` in `@cp/db`: the element's
 * id in `source_ids.osm`, its name, local name, point and address, a category from the OSM
 * mapping, its hours, website and phone). The curated note is then attached exactly as a
 * matched place's is. Idempotent: the row of the same OSM id is reused, and a place a row now
 * matches (a sibling lookup or an ingest added it) is written there without asking OSM.
 *
 * A row of that OSM id another destination owns is left alone (`owned_elsewhere`).
 */
import { attachOsmPlace, withSystem } from '@cp/db';
import type { NominatimSearch } from '@cp/suppliers';
import type pg from 'pg';

import { allowIndexMaintenance } from '../batch-sql';
import { plainWords } from '../pick/match';
import { writeCuratedNote } from './load';
import { chooseCuratedMatch, curatedCandidates, type CuratedLead } from './match';
import { findCuratedOsmPlace } from './osm-lookup';
import { curatedNoteLines, type CuratedPlaceRow } from './rows';

export type CuratedOsmOutcome =
  | { readonly outcome: 'unknown_destination' }
  | { readonly outcome: 'matched'; readonly poi_id: string; readonly row: string }
  | {
      readonly outcome: 'unmatched';
      readonly queries: number;
      readonly nearest_rejected: { readonly name: string; readonly distanceM: number } | null;
    }
  | {
      readonly outcome: 'inserted' | 'reused' | 'owned_elsewhere' | 'checked';
      readonly poi_id: string | null;
      readonly osm: string;
      readonly name: string;
      readonly name_local: string | null;
      readonly address: string | null;
      readonly lat: number;
      readonly lng: number;
      readonly distance_m: number;
      readonly queries: number;
    };

/**
 * Looks one curated place up and writes it (see the file header). `rank` is the place's line in
 * its destination's file, as the loader numbers it; `dryRun` asks OSM and writes nothing.
 */
export async function lookUpCuratedPlace(
  pool: pg.Pool,
  input: { readonly rank: number; readonly place: CuratedPlaceRow; readonly dryRun?: boolean },
  search: NominatimSearch,
): Promise<CuratedOsmOutcome> {
  const { place, rank } = input;
  const destination = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ id: string; name: string; country: string | null }>(
      'SELECT id, name, country FROM destinations WHERE slug = $1',
      [place.destination],
    );
    return rows[0];
  });
  if (destination === undefined) return { outcome: 'unknown_destination' };
  const plain = plainWords(destination.name, destination.country);
  const note = curatedNoteLines(place, rank);
  const lead: CuratedLead = {
    name: place.name_en,
    localName: place.name_local ?? null,
    category: place.category,
    lat: place.lat,
    lng: place.lng,
  };
  const verdict = await withSystem(pool, async (tx) => {
    await allowIndexMaintenance(tx);
    const candidates = await curatedCandidates(tx, destination.id, lead, plain);
    // Rows another curated place of the file holds are not this place.
    const { rows } = await tx.query<{ id: string }>(
      `SELECT id FROM pois WHERE destination_id = $1 AND editorial ? 'curated'
          AND (editorial->'curated'->>'rank')::int <> $2`,
      [destination.id, rank],
    );
    return chooseCuratedMatch(lead, candidates, plain, new Set(rows.map((row) => row.id)));
  });
  if (verdict.kind === 'match') {
    if (input.dryRun !== true) await writeCuratedNote(pool, verdict.row.id, note);
    return { outcome: 'matched', poi_id: verdict.row.id, row: verdict.row.name };
  }
  const lookup = await findCuratedOsmPlace(place, plain, search);
  const found = lookup.place;
  if (found === null) {
    return {
      outcome: 'unmatched',
      queries: lookup.queries,
      nearest_rejected: lookup.nearestRejected,
    };
  }
  const attached =
    input.dryRun === true
      ? undefined
      : await withSystem(pool, async (tx) => {
          await allowIndexMaintenance(tx);
          return attachOsmPlace(tx, destination.id, found);
        });
  if (attached) await writeCuratedNote(pool, attached.id, note);
  const outcome =
    attached === undefined
      ? 'checked'
      : attached === null
        ? 'owned_elsewhere'
        : attached.inserted
          ? 'inserted'
          : 'reused';
  return {
    outcome,
    poi_id: attached?.id ?? null,
    osm: found.sourceId,
    name: found.name,
    name_local: found.nameLocal,
    address: found.address,
    lat: found.lat,
    lng: found.lng,
    distance_m: Math.round(found.distanceM),
    queries: lookup.queries,
  };
}
