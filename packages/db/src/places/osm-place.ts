/**
 * One OpenStreetMap place written the way the ingest writes an OSM place (`osm-apply` in the
 * worker): a `pois` row of the destination with the element's id in `source_ids.osm`, its name,
 * local name, point, address, category, hours, website and phone, `curation = 'auto'`, and the
 * destination's time zone. Used when a place no row carries is found in OSM on demand (a curated
 * place, a place search with no answer). Idempotent: the row of the same OSM id is reused; one
 * another destination owns, or one we hid, is left alone (null): a later
 * lookup never brings a hidden row back or writes a note on it. Runs in a system transaction.
 */
import { defaultVisitRadiusM, parseOsmOpeningHours, type PoiCategory } from '@cp/domain';
import type pg from 'pg';

export interface OsmPlaceInput {
  /** `n<id>`, `w<id>` or `r<id>`. */
  readonly sourceId: string;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: PoiCategory;
  readonly lat: number;
  readonly lng: number;
  readonly address: string | null;
  /** OSM `opening_hours`, parsed here as the ingest does. */
  readonly openingHours: string | null;
  readonly website: string | null;
  readonly phone: string | null;
}

export async function attachOsmPlace(
  tx: pg.PoolClient,
  destinationId: string,
  place: OsmPlaceInput,
): Promise<{ readonly id: string; readonly inserted: boolean } | null> {
  const existing = await tx.query<{ id: string; destination_id: string; status: string }>(
    `SELECT id, destination_id, status FROM pois
      WHERE source_ids ? 'osm' AND source_ids->>'osm' = $1`,
    [place.sourceId],
  );
  const found = existing.rows[0];
  if (found !== undefined) {
    const ours = found.destination_id === destinationId && found.status !== 'hidden';
    return ours ? { id: found.id, inserted: false } : null;
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
