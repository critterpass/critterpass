/**
 * One curated place the loader found no row for, looked up in OpenStreetMap (`./osm-lookup.ts`)
 * and written the way the ingest writes an OSM place: one `pois` row of the destination with the
 * element's id in `source_ids.osm`, its name, local name, point and address, a category from the
 * OSM mapping, its hours, website and phone. The curated note is then attached exactly as a
 * matched place's is. Idempotent: the row of the same OSM id is reused, and a place a row now
 * matches (a sibling lookup or an ingest added it) is written there without asking OSM.
 *
 * A row of that OSM id another destination owns is left alone (`owned_elsewhere`).
 */
import { defaultVisitRadiusM, parseOsmOpeningHours } from '@cp/domain';
import { withSystem } from '@cp/db';
import type pg from 'pg';

import { allowIndexMaintenance } from '../batch-sql';
import { plainWords } from '../pick/match';
import { writeCuratedNote } from './load';
import { chooseCuratedMatch, curatedCandidates, type CuratedLead } from './match';
import { findOsmPlace, type NominatimSearch, type OsmPlace } from './osm-lookup';
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

/** The row of this OSM id (reused), or a new row of the destination; null when another owns it. */
export async function attachOsmPlace(
  tx: pg.PoolClient,
  destinationId: string,
  place: OsmPlace,
): Promise<{ readonly id: string; readonly inserted: boolean } | null> {
  const existing = await tx.query<{ id: string; destination_id: string }>(
    `SELECT id, destination_id FROM pois WHERE source_ids ? 'osm' AND source_ids->>'osm' = $1`,
    [place.sourceId],
  );
  const found = existing.rows[0];
  if (found !== undefined) {
    return found.destination_id === destinationId ? { id: found.id, inserted: false } : null;
  }
  const hours = parseOsmOpeningHours(place.openingHours);
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, name_local, category, lat, lng, address, source_ids,
                       hours, hours_source, website, phone, curation, visit_radius_m, timezone)
     SELECT d.id, $2, $3, $4, $5, $6, $7, jsonb_build_object('osm', $8::text),
            coalesce($9::jsonb, '{}'::jsonb), CASE WHEN $9::jsonb IS NULL THEN NULL ELSE 'osm' END,
            $10, $11, 'auto', $12, d.tz
       FROM destinations d WHERE d.id = $1
     RETURNING id`,
    [
      destinationId,
      place.name,
      place.nameLocal,
      place.category,
      place.lat,
      place.lng,
      place.address,
      place.sourceId,
      hours === null ? null : JSON.stringify(hours),
      place.website,
      place.phone,
      defaultVisitRadiusM(place.category),
    ],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`destination ${destinationId} is gone`);
  return { id, inserted: true };
}

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
  const lookup = await findOsmPlace(place, plain, search);
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
