/**
 * Hybrid POI search (docs/api-contracts.md §5.5 `GET /v1/places/search`): FTS (`unaccent`) +
 * `pg_trgm`, `near` ranking, `open_at` filter. pgvector ranking stays flag-gated until an embedding
 * vendor is chosen — this ships FTS + trigram only for now. `saved`/`crew picks` filters need tables
 * that do not exist yet and are not implemented here.
 */
import { knownHours, openAt, poiCategorySchema, type Hours, type PoiCategory } from '@cp/domain';
import type pg from 'pg';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
/** Fetched before an app-layer `open_at` filter narrows down to `limit`, since hours evaluation
 *  (tz-aware, overnight-span-aware) is not expressible as a single SQL predicate. */
const OPEN_AT_CANDIDATE_MULTIPLIER = 5;

export interface PlaceSearchFilters {
  readonly q?: string;
  readonly near?: { readonly lat: number; readonly lng: number };
  readonly category?: PoiCategory;
  readonly destinationId?: string;
  readonly openAt?: Date;
  readonly limit?: number;
}

export interface PlaceSearchResultItem {
  readonly id: string;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: PoiCategory;
  readonly lat: number;
  readonly lng: number;
  readonly address: string | null;
  readonly priceLevel: number | null;
  readonly tags: readonly string[];
  readonly distanceM: number | null;
  readonly openNow: boolean | null;
}

interface PlaceSearchRow {
  readonly id: string;
  readonly name: string;
  readonly name_local: string | null;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly address: string | null;
  readonly price_level: number | null;
  readonly tags: string[];
  readonly hours: Hours;
  readonly timezone: string | null;
  readonly destination_tz: string | null;
  readonly distance_m: number | null;
  readonly is_open_now: boolean | null;
}

function toResultItem(row: PlaceSearchRow): PlaceSearchResultItem {
  return {
    id: row.id,
    name: row.name,
    nameLocal: row.name_local,
    category: poiCategorySchema.parse(row.category),
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    priceLevel: row.price_level,
    tags: row.tags,
    distanceM: row.distance_m,
    openNow: row.is_open_now,
  };
}

/** Evaluates the stored weekly-hours schedule; `null` (unknown) when no tz resolves or no hours are known. */
function isOpenAtInstant(row: PlaceSearchRow, instant: Date): boolean | null {
  const tz = row.timezone ?? row.destination_tz;
  const hours = knownHours(row.hours);
  if (tz === null || hours === null) return null;
  return openAt(hours, tz, instant);
}

/**
 * Runs inside the caller's own `withUser`/`withGuideReader` transaction (docs/code-standards.md §13:
 * never a bare pool query in a handler) — `tx` is that transaction's client, not a fresh pool checkout.
 */
export async function searchPlaces(
  tx: pg.PoolClient,
  filters: PlaceSearchFilters,
): Promise<readonly PlaceSearchResultItem[]> {
  const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const needsOpenAtFilter = filters.openAt !== undefined;
  const fetchLimit = needsOpenAtFilter ? limit * OPEN_AT_CANDIDATE_MULTIPLIER : limit;

  const conditions: string[] = ["p.status = 'active'"];
  const params: unknown[] = [];

  if (filters.destinationId !== undefined) {
    params.push(filters.destinationId);
    conditions.push(`p.destination_id = $${params.length}`);
  }
  if (filters.category !== undefined) {
    params.push(filters.category);
    conditions.push(`p.category = $${params.length}`);
  }

  let orderExpression = 'p.name ASC';
  const hasQuery = filters.q !== undefined && filters.q.trim().length > 0;
  if (hasQuery) {
    params.push(filters.q);
    const qParam = params.length;
    conditions.push(
      `(p.fts @@ websearch_to_tsquery('simple', app.unaccent_immutable($${qParam})) OR p.name % $${qParam})`,
    );
    orderExpression = `ts_rank(p.fts, websearch_to_tsquery('simple', app.unaccent_immutable($${qParam}))) DESC, similarity(p.name, $${qParam}) DESC`;
  }

  let distanceSelect = 'NULL::double precision AS distance_m';
  if (filters.near !== undefined) {
    params.push(filters.near.lng, filters.near.lat);
    const lngParam = params.length - 1;
    const latParam = params.length;
    distanceSelect = `ST_Distance(p.location, ST_SetSRID(ST_MakePoint($${lngParam}, $${latParam}), 4326)::geography) AS distance_m`;
    if (!hasQuery) orderExpression = 'distance_m ASC';
  }

  params.push(fetchLimit);
  const limitParam = params.length;

  const { rows } = await tx.query<PlaceSearchRow>(
    `SELECT p.id, p.name, p.name_local, p.category, p.lat, p.lng, p.address, p.price_level, p.tags,
            p.hours, p.timezone, d.tz AS destination_tz, lc.is_open_now,
            ${distanceSelect}
     FROM pois p
     JOIN destinations d ON d.id = p.destination_id
     LEFT JOIN poi_live_checks lc ON lc.poi_id = p.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${orderExpression}
     LIMIT $${limitParam}`,
    params,
  );

  const results = needsOpenAtFilter
    ? rows.filter((row) => isOpenAtInstant(row, filters.openAt as Date) === true)
    : rows;

  return results.slice(0, limit).map(toResultItem);
}
