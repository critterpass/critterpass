/**
 * One curated place the loader found no row for, looked up in OpenStreetMap (`./osm-lookup.ts`)
 * and written the way the ingest writes an OSM place (`attachOsmPlace` in `@cp/db`: the element's
 * id in `source_ids.osm`, its name, local name, point and address, a category from the OSM
 * mapping, its hours, website and phone). The curated note is then attached exactly as a
 * matched place's is. Idempotent: the row of the same OSM id is reused, and a place a row now
 * matches (a sibling lookup or an ingest added it) is written there without asking OSM.
 *
 * A row another destination owns may be the place too: a claimable one moves here with the note,
 * any other resolves the place and keeps its owner's note (`./match.ts`). A row of the looked-up
 * OSM id another destination owns, or one we hid, is left alone (`owned_elsewhere`), and so is
 * one another curated place of the file holds (`held`: its note stays). A reused row whose name does not
 * carry the place's name ("Diwali on Trafalgar Square" for OSM's Trafalgar Square) takes OSM's
 * name, local name and category: OSM stays the source of what the row is called and is.
 */
import { attachOsmPlace, withSystem } from '@cp/db';
import type { NominatimSearch } from '@cp/suppliers';
import type { OsmPlace } from '@cp/planner';
import type pg from 'pg';

import { allowIndexMaintenance } from '../batch-sql';
import { plainWords } from '../pick/match';
import { writeCuratedNote } from './load';
import { chooseCuratedMatch, findCuratedRow, type CuratedLead } from './match';
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
      readonly outcome: 'inserted' | 'reused' | 'held' | 'owned_elsewhere' | 'checked';
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
    subtype: place.subtype ?? null,
  };
  const verdict = await withSystem(pool, async (tx) => {
    await allowIndexMaintenance(tx);
    // Rows another curated place of the file holds are not this place.
    const { rows } = await tx.query<{ id: string }>(
      `SELECT id FROM pois WHERE destination_id = $1 AND editorial ? 'curated'
          AND (editorial->'curated'->>'rank')::int <> $2`,
      [destination.id, rank],
    );
    return findCuratedRow(tx, destination.id, lead, plain, new Set(rows.map((row) => row.id)));
  });
  if (verdict.kind === 'match') {
    // A row its owner keeps resolves the place; the note stays the owner's (`./match.ts`).
    if (input.dryRun !== true && verdict.hold !== 'shared') {
      const claimFor = verdict.hold === 'claim' ? destination.id : null;
      await writeCuratedNote(pool, verdict.row.id, note, place.busy_windows, claimFor);
    }
    return { outcome: 'matched', poi_id: verdict.row.id, row: verdict.row.name };
  }
  const lookup = await findCuratedOsmPlace(place, plain, search, destination.name);
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
          const row = await attachOsmPlace(tx, destination.id, found);
          if (row === null || row.inserted) return row && { ...row, held: false };
          return { ...row, held: await settleReusedRow(tx, row.id, lead, found, rank, plain) };
        });
  if (attached && !attached.held) {
    await writeCuratedNote(pool, attached.id, note, place.busy_windows);
  }
  const outcome =
    attached === undefined
      ? 'checked'
      : attached === null
        ? 'owned_elsewhere'
        : attached.inserted
          ? 'inserted'
          : attached.held
            ? 'held'
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

/**
 * A row of the looked-up OSM id this destination already has: whether another curated place of
 * the file holds it (its note stays), else, when its names do not carry the place's name, it takes
 * OSM's name, local name and category (see the file header).
 */
async function settleReusedRow(
  tx: pg.PoolClient,
  id: string,
  lead: CuratedLead,
  found: OsmPlace,
  rank: number,
  plain: ReadonlySet<string>,
): Promise<boolean> {
  const { rows } = await tx.query<{
    name: string;
    name_local: string | null;
    category: string;
    rank: string | null;
  }>(
    `SELECT name, name_local, category, editorial->'curated'->>'rank' AS rank
       FROM pois WHERE id = $1 FOR UPDATE`,
    [id],
  );
  const row = rows[0];
  if (row === undefined) return false;
  if (row.rank !== null && Number(row.rank) !== rank) return true;
  const named = chooseCuratedMatch(
    lead,
    [
      {
        id,
        name: row.name,
        nameLocal: row.name_local,
        category: row.category,
        lat: found.lat,
        lng: found.lng,
        address: null,
        quality: 0,
        distanceM: 0,
        similarity: 0,
      },
    ],
    plain,
  );
  if (named.kind === 'none') {
    await tx.query(
      `UPDATE pois SET name = $2, name_local = $3, category = $4, updated_at = now() WHERE id = $1`,
      [id, found.name, found.nameLocal, found.category],
    );
  }
  return false;
}
