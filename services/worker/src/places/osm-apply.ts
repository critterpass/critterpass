/**
 * Writes OpenStreetMap places (`./osm-reader.ts`) into `pois` after the Overture and FSQ OS ingest
 * of the same bounds (docs/product-decisions.md D25). Each element, in chunks of `OSM_BATCH_SIZE`
 * inside one transaction per chunk:
 *
 * - already linked (`source_ids.osm`): its OSM hours are refreshed, and a row only OSM knows also
 *   takes the element's current name, category, point and address;
 * - else matched to the nearest active POI within 60 m whose name is trigram-similar (>= 0.6, the
 *   conflation threshold) and whose category is compatible: the POI gains the `osm` id, and fills
 *   its empty hours, website, phone and local name from OSM;
 * - else a sight (`kind: 'place'`) becomes a new POI of this destination; a business
 *   (`hours_only`) is dropped, so OSM never duplicates the open-data copy of a shop or restaurant.
 *
 * A linked or matched POI another destination owns (overlapping boxes, Hội An inside Đà Nẵng's)
 * is left to that destination's own ingest: neither updated nor added again.
 *
 * Hours are written only where the POI has none or they came from OSM before
 * (`hours_source = 'osm'`), so editorial and researched hours always win. Nothing is deactivated
 * or deleted.
 */
import { defaultVisitRadiusM, parseOsmOpeningHours } from '@cp/domain';
import { withSystem } from '@cp/db';
import type pg from 'pg';

import { allowIndexMaintenance } from './batch-sql';
import type { OsmPlaceRow } from './osm-reader';

export const OSM_BATCH_SIZE = 500;
const MATCH_DISTANCE_M = 60;
const NAME_SIMILARITY = 0.6;

export interface OsmApplyResult {
  readonly read: number;
  readonly inserted: number;
  /** Existing POIs that gained an OSM id in this run. */
  readonly linked: number;
  /** POIs that had no hours and got them from OSM (new OSM places included). */
  readonly hoursFilled: number;
}

interface OsmRecord {
  readonly source_id: string;
  readonly name: string;
  readonly name_local: string | null;
  readonly category: string;
  readonly kind: 'place' | 'hours_only';
  readonly lat: number;
  readonly lng: number;
  readonly address: string | null;
  readonly hours: unknown;
  readonly website: string | null;
  readonly phone: string | null;
  readonly visit_radius_m: number;
}

function toRecord(row: OsmPlaceRow): OsmRecord {
  return {
    source_id: row.sourceId,
    name: row.name,
    name_local: row.nameLocal ?? null,
    category: row.classification.category,
    kind: row.classification.kind,
    lat: row.lat,
    lng: row.lng,
    address: row.address ?? null,
    hours: parseOsmOpeningHours(row.openingHours),
    website: row.website ?? null,
    phone: row.phone ?? null,
    visit_radius_m: defaultVisitRadiusM(row.classification.category),
  };
}

const RECORDS = `jsonb_to_recordset($1::jsonb) AS v(
  source_id text, name text, name_local text, category text, kind text, lat double precision,
  lng double precision, address text, hours jsonb, website text, phone text, visit_radius_m integer)`;

/** The POI is OSM's own (no other source): OSM's name, category, point and address win. */
const OSM_ONLY = `p.source_ids = jsonb_build_object('osm', u.source_id)`;

/** Hours a POI has none of: the column default `{}` or an empty weekly schedule. */
const NO_HOURS = `(p.hours = '{}'::jsonb OR coalesce(p.hours->'weekly', '{}'::jsonb) = '{}'::jsonb)`;

/**
 * Each element with the POI it is linked to, or the one it matches, or neither. The linked lookup
 * repeats `pois_source_osm_uidx`'s partial predicate (`source_ids ? 'osm'`): without it the planner
 * hash-joins the chunk against a sequential scan of every POI, which at two million rows outlasts
 * the statement timeout.
 */
const RESOLVE_SQL = `
  SELECT v.source_id, linked.id AS linked_id, matched.id AS matched_id,
         coalesce(linked.destination_id, matched.destination_id) AS owner_id,
         coalesce(linked.no_hours, matched.no_hours, false) AS no_hours
  FROM ${RECORDS}
  LEFT JOIN LATERAL (
    SELECT p.id, p.destination_id, ${NO_HOURS} AS no_hours FROM pois p
    WHERE p.source_ids ? 'osm' AND p.source_ids->>'osm' = v.source_id
  ) linked ON true
  LEFT JOIN LATERAL (
    SELECT p.id, p.destination_id, ${NO_HOURS} AS no_hours FROM pois p
    WHERE linked.id IS NULL
      AND p.status = 'active' AND p.merged_into_id IS NULL AND NOT (p.source_ids ? 'osm')
      AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326)::geography, $2)
      AND (p.category = v.category OR p.category = 'other' OR v.category = 'other')
      AND greatest(similarity(lower(p.name), lower(v.name)),
                   similarity(lower(coalesce(p.name_local, '')), lower(coalesce(v.name_local, v.name))),
                   similarity(lower(p.name), lower(coalesce(v.name_local, '')))) >= $3
    ORDER BY p.location <-> ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326)::geography
    LIMIT 1
  ) matched ON true`;

async function applyChunk(
  tx: pg.PoolClient,
  destinationId: string,
  timezone: string | null,
  records: readonly OsmRecord[],
): Promise<Omit<OsmApplyResult, 'read'>> {
  const json = JSON.stringify(records);
  const { rows } = await tx.query<{
    source_id: string;
    linked_id: string | null;
    matched_id: string | null;
    owner_id: string | null;
    no_hours: boolean;
  }>(RESOLVE_SQL, [json, MATCH_DISTANCE_M, NAME_SIMILARITY]);
  const target = new Map<string, string>();
  const fresh = new Set<string>();
  const claimed = new Set<string>();
  const empty = new Set<string>();
  const ownedElsewhere = new Set<string>();
  for (const row of rows) {
    const id = row.linked_id ?? row.matched_id;
    // Two elements matching one POI: the first keeps it, the other is treated as unmatched.
    if (id === null || (row.linked_id === null && claimed.has(id))) continue;
    // A place another destination owns (overlapping boxes) is that destination's to update; it is
    // neither changed nor added again here.
    if (row.owner_id !== destinationId) {
      ownedElsewhere.add(row.source_id);
      continue;
    }
    claimed.add(id);
    target.set(row.source_id, id);
    if (row.linked_id === null) fresh.add(row.source_id);
    if (row.no_hours) empty.add(row.source_id);
  }
  const updates = records.flatMap((record) => {
    const id = target.get(record.source_id);
    return id === undefined ? [] : [{ ...record, id, link: fresh.has(record.source_id) }];
  });
  const inserts = records.filter(
    (record) =>
      record.kind === 'place' &&
      !target.has(record.source_id) &&
      !ownedElsewhere.has(record.source_id),
  );

  let hoursFilled = updates.filter(
    (update) => update.hours !== null && empty.has(update.source_id),
  ).length;
  if (updates.length > 0) {
    // The new values are worked out first, so an element that changes nothing (most of a rerun)
    // leaves its row and the row's indexes alone.
    await tx.query(
      `WITH n AS (
         SELECT p.id,
           p.source_ids || jsonb_build_object('osm', u.source_id) AS source_ids,
           CASE WHEN u.hours IS NOT NULL AND (${NO_HOURS} OR p.hours_source = 'osm')
                THEN u.hours ELSE p.hours END AS hours,
           CASE WHEN u.hours IS NOT NULL AND (${NO_HOURS} OR p.hours_source = 'osm')
                THEN 'osm' ELSE p.hours_source END AS hours_source,
           coalesce(p.website, u.website) AS website,
           coalesce(p.phone, u.phone) AS phone,
           coalesce(p.name_local, u.name_local) AS name_local,
           CASE WHEN ${OSM_ONLY} THEN u.name ELSE p.name END AS name,
           CASE WHEN ${OSM_ONLY} THEN u.category ELSE p.category END AS category,
           CASE WHEN ${OSM_ONLY} THEN u.lat ELSE p.lat END AS lat,
           CASE WHEN ${OSM_ONLY} THEN u.lng ELSE p.lng END AS lng,
           CASE WHEN ${OSM_ONLY} THEN u.address ELSE p.address END AS address
         FROM jsonb_to_recordset($1::jsonb) AS u(
           id uuid, source_id text, name text, name_local text, category text, lat double precision,
           lng double precision, address text, hours jsonb, website text, phone text)
         JOIN pois p ON p.id = u.id
       )
       UPDATE pois AS p SET
         source_ids = n.source_ids, hours = n.hours, hours_source = n.hours_source,
         website = n.website, phone = n.phone, name_local = n.name_local, name = n.name,
         category = n.category, lat = n.lat, lng = n.lng, address = n.address
       FROM n
       WHERE p.id = n.id
         AND (p.source_ids, p.hours, p.hours_source, p.website, p.phone, p.name_local, p.name,
              p.category, p.lat, p.lng, p.address)
             IS DISTINCT FROM
             (n.source_ids, n.hours, n.hours_source, n.website, n.phone, n.name_local, n.name,
              n.category, n.lat, n.lng, n.address)`,
      [JSON.stringify(updates)],
    );
  }
  if (inserts.length > 0) {
    await tx.query(
      `INSERT INTO pois (destination_id, name, name_local, category, lat, lng, address, source_ids,
                         hours, hours_source, website, phone, curation, visit_radius_m, timezone)
       SELECT $2, v.name, v.name_local, v.category, v.lat, v.lng, v.address,
              jsonb_build_object('osm', v.source_id), coalesce(v.hours, '{}'::jsonb),
              CASE WHEN v.hours IS NULL THEN NULL ELSE 'osm' END, v.website, v.phone, 'auto',
              v.visit_radius_m, $3
       FROM ${RECORDS}`,
      [JSON.stringify(inserts), destinationId, timezone],
    );
    hoursFilled += inserts.filter((record) => record.hours !== null).length;
  }
  return { inserted: inserts.length, linked: fresh.size, hoursFilled };
}

/** Applies every OSM element read for one destination's bounds (see file header). */
export async function applyOsmPlaces(
  pool: pg.Pool,
  destinationId: string,
  timezone: string | null,
  places: readonly OsmPlaceRow[],
): Promise<OsmApplyResult> {
  const records = places.map(toRecord);
  const total = { inserted: 0, linked: 0, hoursFilled: 0 };
  for (let index = 0; index < records.length; index += OSM_BATCH_SIZE) {
    const chunk = records.slice(index, index + OSM_BATCH_SIZE);
    const counts = await withSystem(pool, async (tx) => {
      await allowIndexMaintenance(tx);
      return applyChunk(tx, destinationId, timezone, chunk);
    });
    total.inserted += counts.inserted;
    total.linked += counts.linked;
    total.hoursFilled += counts.hoursFilled;
  }
  return { read: records.length, ...total };
}
