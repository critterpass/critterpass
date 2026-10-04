/**
 * Pinned places: named POIs a destination's curated set must hold whatever the model scores (a
 * trip's hotel, the sights its days are built around), including categories the selection buckets
 * leave out, such as stays. Open data often lists one name several times, some far from the real
 * place, so each pin takes the active POI of that name nearest its point, within about 1 km, the
 * record spelt as the pin (with its diacritics) before one that only folds to it.
 */
import type { PoiCategory } from '@cp/domain';
import type pg from 'pg';

export interface PinnedPlace {
  /** The POI name as the open data spells it (case and diacritics are ignored). */
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  /** The local name another record of the place or its Wikidata item carries, where the pinned
   *  record has only an English one. */
  readonly nameLocal?: string;
  /** What the place is ("a café", "a soy-milk stall"), for the note writer. */
  readonly kind?: string;
  /** The category, where the open data files the place under a wrong one. */
  readonly category?: PoiCategory;
}

/**
 * A place a release can name: content refs are `editorial:`, `fsq_os:` or `overture:` ids, so a
 * place only OpenStreetMap holds cannot be curated; its record under another source is taken.
 */
export const HAS_CONTENT_REF = "p.source_ids ?| array['editorial', 'fsq_os', 'overture']";

/** A record the curator keeps out of the set, with the reason the review page gives. */
export interface LeftOutPlace extends PinnedPlace {
  readonly why: string;
}

/** ~1 km at the equator, in degrees; generous enough for the sources' own position error. */
const MAX_OFFSET_DEG = 0.01;

export async function pinnedPoiIds(
  pool: pg.Pool,
  destinationId: string,
  pins: readonly PinnedPlace[],
  log: (line: string) => void = () => undefined,
): Promise<string[]> {
  return [...(await pinnedPois(pool, destinationId, pins, log)).keys()];
}

/** Each pin's POI id with the pin, for what the pin says of the place (kind, category). */
export async function pinnedPois<P extends PinnedPlace>(
  pool: pg.Pool,
  destinationId: string,
  pins: readonly P[],
  log: (line: string) => void = () => undefined,
): Promise<Map<string, P>> {
  if (pins.length === 0) return new Map();
  const { rows } = await pool.query<{ pin: number; id: string }>(
    `SELECT DISTINCT ON (pin.n) pin.n::int AS pin, p.id
       FROM unnest($2::text[], $3::float8[], $4::float8[]) WITH ORDINALITY AS pin(name, lat, lng, n)
       JOIN pois p ON p.destination_id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL
        AND ${HAS_CONTENT_REF}
        AND app.unaccent_immutable(lower(p.name)) = app.unaccent_immutable(lower(pin.name))
        AND abs(p.lat - pin.lat) < $5 AND abs(p.lng - pin.lng) < $5
      ORDER BY pin.n, p.name = pin.name DESC, (p.lat - pin.lat) ^ 2 + (p.lng - pin.lng) ^ 2`,
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
  return new Map(
    rows
      .flatMap((row) => [[row.id, pins[row.pin - 1]] as const])
      .flatMap(([id, pin]) => (pin === undefined ? [] : [[id, pin] as const])),
  );
}
