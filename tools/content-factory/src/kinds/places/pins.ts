/**
 * Pinned places: named POIs a destination's curated set must hold whatever the model scores (a
 * trip's hotel, the sights its days are built around), including categories the selection buckets
 * leave out, such as stays. Open data often lists one name several times, some far from the real
 * place, so each pin takes the active POI of that name nearest its point, within about 1 km.
 */
import type pg from 'pg';

export interface PinnedPlace {
  /** The POI name as the open data spells it (case and diacritics are ignored). */
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
}

/** ~1 km at the equator, in degrees; generous enough for the sources' own position error. */
const MAX_OFFSET_DEG = 0.01;

export async function pinnedPoiIds(
  pool: pg.Pool,
  destinationId: string,
  pins: readonly PinnedPlace[],
  log: (line: string) => void = () => undefined,
): Promise<string[]> {
  if (pins.length === 0) return [];
  const { rows } = await pool.query<{ pin: number; id: string }>(
    `SELECT DISTINCT ON (pin.n) pin.n::int AS pin, p.id
       FROM unnest($2::text[], $3::float8[], $4::float8[]) WITH ORDINALITY AS pin(name, lat, lng, n)
       JOIN pois p ON p.destination_id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL
        AND app.unaccent_immutable(lower(p.name)) = app.unaccent_immutable(lower(pin.name))
        AND abs(p.lat - pin.lat) < $5 AND abs(p.lng - pin.lng) < $5
      ORDER BY pin.n, (p.lat - pin.lat) ^ 2 + (p.lng - pin.lng) ^ 2`,
    [
      destinationId,
      pins.map((pin) => pin.name),
      pins.map((pin) => pin.lat),
      pins.map((pin) => pin.lng),
      MAX_OFFSET_DEG,
    ],
  );
  const found = new Set(rows.map((row) => row.pin));
  pins.forEach((pin, index) => {
    if (!found.has(index + 1)) log(`pinned place not found near its point: ${pin.name}`);
  });
  return rows.map((row) => row.id);
}
