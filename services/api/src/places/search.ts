/**
 * Hybrid POI search (docs/api-contracts.md §5.5 `GET /v1/places/search`): FTS (`unaccent`) +
 * `pg_trgm`, `near` ranking, `open_at` filter. pgvector ranking stays flag-gated until an embedding
 * vendor is chosen — this ships FTS + trigram only for now. `saved`/`crew picks` filters need tables
 * that do not exist yet and are not implemented here.
 *
 * Quality: open data carries junk (online-only sellers, home services, mislabelled pages). Sampled
 * in Hội An, Mexico City and London, Overture rows under 0.5 confidence are mostly that, so an
 * auto-curated row below `LOW_CONFIDENCE` that FSQ OS does not also list ranks after every other
 * match and is left out of a no-query browse (the region pack's subset reads that browse). Rows
 * are never hidden from a name search or removed: trips and editorial reference POI ids. Editorial
 * places come first, then rows both sources list, then by confidence.
 */
import { knownHours, openAt, poiCategorySchema, type Hours, type PoiCategory } from '@cp/domain';
import type pg from 'pg';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
/** Fetched before an app-layer `open_at` filter narrows down to `limit`, since hours evaluation
 *  (tz-aware, overnight-span-aware) is not expressible as a single SQL predicate. */
const OPEN_AT_CANDIDATE_MULTIPLIER = 5;

/** Overture confidence under which an auto row FSQ does not also list counts as low quality. */
export const LOW_CONFIDENCE = 0.5;

/** True for an auto-curated, Overture-only row whose confidence is under `LOW_CONFIDENCE`. */
const LOW_QUALITY = `(p.curation <> 'editorial' AND NOT (p.source_ids ? 'fsq_os') AND coalesce(p.confidence < ${LOW_CONFIDENCE}, false))`;

/**
 * Non-editorial quality in about [0, 4]: listed by FSQ OS, by both sources, a mapped category, and
 * Overture's confidence (an unknown score counts as middling).
 */
const QUALITY_SCORE = `((p.source_ids ? 'fsq_os')::int + (p.source_ids ? 'fsq_os' AND p.source_ids ? 'overture')::int + (p.category <> 'other')::int + coalesce(p.confidence, 0.5))`;

/** Weight of `QUALITY_SCORE` next to text relevance: a tie-breaker, never louder than the match. */
const QUALITY_WEIGHT_WITH_QUERY = 0.05;

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
 * A destination covers its own rows and, where its place box overlaps another destination's, the
 * rows that destination owns inside the box: a source place is stored once, owned by the first
 * destination ingested. Without an overlap the filter stays a plain `destination_id` match, so a
 * metro's browse never pays for a spatial scan of its whole box.
 */
async function destinationCondition(
  tx: pg.PoolClient,
  destinationId: string,
  params: unknown[],
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `SELECT o.id FROM destinations d
     JOIN destinations o ON o.id <> d.id AND ST_Intersects(o.place_bounds, d.place_bounds)
     WHERE d.id = $1`,
    [destinationId],
  );
  params.push(destinationId);
  const destinationParam = params.length;
  if (rows.length === 0) return `p.destination_id = $${destinationParam}`;
  params.push(rows.map((row) => row.id));
  const overlapParam = params.length;
  return `(p.destination_id = $${destinationParam} OR (p.destination_id = ANY($${overlapParam}::uuid[])
    AND ST_Intersects(p.location, (SELECT place_bounds FROM destinations WHERE id = $${destinationParam}))))`;
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

  // A record merged into another is the same place under a second name: only the target shows.
  const conditions: string[] = ["p.status = 'active'", 'p.merged_into_id IS NULL'];
  const params: unknown[] = [];

  if (filters.destinationId !== undefined) {
    conditions.push(await destinationCondition(tx, filters.destinationId, params));
  }
  if (filters.category !== undefined) {
    params.push(filters.category);
    conditions.push(`p.category = $${params.length}`);
  }

  const hasQuery = filters.q !== undefined && filters.q.trim().length > 0;
  let orderExpression = `(p.curation = 'editorial') DESC, ${QUALITY_SCORE} DESC, p.name ASC`;
  if (!hasQuery) conditions.push(`NOT ${LOW_QUALITY}`);
  if (hasQuery) {
    params.push(filters.q);
    const qParam = params.length;
    conditions.push(
      `(p.fts @@ websearch_to_tsquery('simple', app.unaccent_immutable($${qParam})) OR p.name % $${qParam})`,
    );
    const words = (filters.q ?? '')
      .toLowerCase()
      .split(/\s+/u)
      .filter((word) => word !== '');
    params.push(words);
    const wordsParam = params.length;
    // A place whose own name has a word starting with each typed word comes before one that matches only by its
    // address or tags ("My Son" is the sanctuary, not every bar in Mỹ An, Sơn Trà). Within each,
    // curated places first: a query also matches every business on a street named after a sight.
    // Low-quality open data still matches, after every other match.
    const nameMatch = `(SELECT bool_and(app.unaccent_immutable(lower(p.name || ' ' || coalesce(p.name_local, '')))
        ~ ('(^|[^[:alnum:]])' || app.unaccent_immutable(w))) FROM unnest($${wordsParam}::text[]) AS w)`;
    orderExpression = `coalesce(${nameMatch}, false) DESC, (p.curation = 'editorial') DESC, ${LOW_QUALITY} ASC, ts_rank(p.fts, websearch_to_tsquery('simple', app.unaccent_immutable($${qParam}))) + similarity(p.name, $${qParam}) + ${QUALITY_WEIGHT_WITH_QUERY} * ${QUALITY_SCORE} DESC`;
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
