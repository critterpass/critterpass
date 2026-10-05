/**
 * Reads the records a corrections file names as the database holds them, with each one's item in
 * the live places release. Read-only: the transaction refuses writes.
 */
import { loadRelease } from '@cp/content';
import { withSystem } from '@cp/db';
import type pg from 'pg';

import { liveArtifact } from '../../db';
import { beforeRowSchema, type BeforeRow } from './corrections';

const SOURCES = ['editorial', 'fsq_os', 'overture'] as const;

interface Row {
  id: string;
  destination: string;
  name: string;
  name_local: string | null;
  category: string;
  lat: number;
  lng: number;
  address: string | null;
  tz: string | null;
  curated: boolean;
  must_see: boolean;
  essential: boolean;
  trip_refs: number;
  source_ids: Record<string, string>;
  target_ids: Record<string, string> | null;
}

const refsOf = (ids: Record<string, string>) =>
  SOURCES.flatMap((source) => (ids[source] === undefined ? [] : [`${source}:${ids[source]}`]));

/** `mayBeNew` names the refs the catalogue may not hold yet: those are left out when absent. */
export async function snapshotRows(
  pool: pg.Pool,
  refs: readonly string[],
  mayBeNew: ReadonlySet<string> = new Set(),
): Promise<BeforeRow[]> {
  const live = await liveArtifact(pool, 'places');
  const items = new Map(
    (live === undefined ? [] : loadRelease(live, 'places').items).map((item) => [item.ref, item]),
  );
  const found = await withSystem(pool, async (tx) => {
    await tx.query('SET TRANSACTION READ ONLY');
    const rows: Row[] = [];
    for (const source of SOURCES) {
      const wanted = refs
        .filter((ref) => ref.startsWith(`${source}:`))
        .map((ref) => ref.slice(source.length + 1));
      if (wanted.length === 0) continue;
      const result = await tx.query<Row>(
        `SELECT p.id, d.slug AS destination, p.name, p.name_local, p.category, p.lat, p.lng, p.address,
                p.timezone AS tz, p.curation = 'editorial' AS curated,
                coalesce((p.editorial->>'must_see')::boolean, false) AS must_see,
                coalesce((p.editorial->>'essential')::boolean, false) AS essential,
                ((SELECT count(*) FROM plan_items x WHERE x.poi_id = p.id)
                 + (SELECT count(*) FROM trip_ideas x WHERE x.poi_id = p.id)
                 + (SELECT count(*) FROM must_dos x WHERE x.poi_id = p.id))::int AS trip_refs,
                p.source_ids, target.source_ids AS target_ids
           FROM pois p
           JOIN destinations d ON d.id = p.destination_id
           LEFT JOIN pois target ON target.id = p.merged_into_id
          WHERE p.source_ids ? '${source}' AND p.source_ids ->> '${source}' = ANY($1::text[])
            AND p.status = 'active'`,
        [wanted],
      );
      rows.push(...result.rows);
    }
    return rows;
  });
  return refs.flatMap((ref) => {
    const row = found.find((candidate) => refsOf(candidate.source_ids).includes(ref));
    if (row === undefined && mayBeNew.has(ref)) return [];
    if (row === undefined) throw new Error(`${ref} is not an active place`);
    const { source_ids, target_ids, ...fields } = row;
    // A record two sources hold has one item; a second item under its other id would fight it.
    const stated = refsOf(source_ids).find((candidate) => items.has(candidate));
    if (stated !== undefined && stated !== ref) {
      throw new Error(`${ref} is in the live release as ${stated}: name it by that ref`);
    }
    return beforeRowSchema.parse({
      ...fields,
      ref,
      merged_into: target_ids === null ? null : (refsOf(target_ids)[0] ?? null),
      item: items.get(ref) ?? null,
    });
  });
}
