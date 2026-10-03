/**
 * Stored-row lookup for the batched POI upsert (`./ingest-upsert.ts`). A source place is stored once
 * (the per-source unique indexes; the content writers match on them too), so when destination
 * boxes overlap (Hội An inside Đà Nẵng's, Reykjavík inside Iceland's) the first destination to
 * ingest a place owns its row, and an ingest of the other destination leaves that row untouched.
 * Place search finds it there anyway: a destination covers every row inside its `place_bounds`.
 */
import type pg from 'pg';

import type { ConflatedPoi } from './conflate';

export interface ExistingPoi {
  readonly id: string;
  readonly destinationId: string;
}

/**
 * One query per chunk: matches each POI to a stored row by either source id. Each branch repeats
 * its unique index's partial predicate (`source_ids ? '<source>'`) so the index serves it instead of
 * a scan over every destination's POIs.
 */
export async function findExistingPois(
  tx: pg.PoolClient,
  pois: readonly ConflatedPoi[],
): Promise<ReadonlyMap<string, ExistingPoi>> {
  const fsqIds = pois
    .map((poi) => poi.sourceIds.fsq_os)
    .filter((id): id is string => id !== undefined);
  const overtureIds = pois
    .map((poi) => poi.sourceIds.overture)
    .filter((id): id is string => id !== undefined);
  if (fsqIds.length === 0 && overtureIds.length === 0) return new Map();

  const { rows } = await tx.query<{
    id: string;
    destination_id: string;
    source_ids: ConflatedPoi['sourceIds'];
  }>(
    `SELECT id, destination_id, source_ids FROM pois
     WHERE source_ids ? 'fsq_os' AND (source_ids ->> 'fsq_os') = ANY($1::text[])
     UNION
     SELECT id, destination_id, source_ids FROM pois
     WHERE source_ids ? 'overture' AND (source_ids ->> 'overture') = ANY($2::text[])`,
    [fsqIds, overtureIds],
  );
  const byKey = new Map<string, ExistingPoi>();
  for (const row of rows) {
    const existing = { id: row.id, destinationId: row.destination_id };
    if (row.source_ids.fsq_os !== undefined) byKey.set(`fsq_os:${row.source_ids.fsq_os}`, existing);
    if (row.source_ids.overture !== undefined)
      byKey.set(`overture:${row.source_ids.overture}`, existing);
  }
  return byKey;
}

/** The stored row for a POI, by its FSQ id first, then its Overture id. */
export function lookupExisting(
  byKey: ReadonlyMap<string, ExistingPoi>,
  sourceIds: ConflatedPoi['sourceIds'],
): ExistingPoi | undefined {
  const byFsq =
    sourceIds.fsq_os !== undefined ? byKey.get(`fsq_os:${sourceIds.fsq_os}`) : undefined;
  if (byFsq !== undefined) return byFsq;
  return sourceIds.overture !== undefined ? byKey.get(`overture:${sourceIds.overture}`) : undefined;
}
