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
 * are never hidden from a name search or removed: trips and editorial reference POI ids. Among
 * the places named for the query, the ones we recommend (the curated set, or the machine picks
 * where nothing is curated) come first, then rows both sources list, then by confidence. Rows that
 * are one place under several names or sources (a villa, its hotel listing and its museum listing)
 * answer as the first of them.
 */
import { LOW_CONFIDENCE, LOW_QUALITY, QUALITY_SCORE, recommendedSql } from '@cp/db';
import { knownHours, openAt, poiCategorySchema, type Hours, type PoiCategory } from '@cp/domain';
import type pg from 'pg';

import { areaFromAddress } from '../planning/search/area';
import { withBrowseDetails, type PlaceBrowseDetails } from './browse-details';
import { onePerPlace } from './same-place';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
/** A destination's no-query browse fills a map: one page holds this many places. */
export const MAX_BROWSE_LIMIT = 300;
/** Fetched before an app-layer `open_at` filter narrows down to `limit`, since hours evaluation
 *  (tz-aware, overnight-span-aware) is not expressible as a single SQL predicate. */
const OPEN_AT_CANDIDATE_MULTIPLIER = 5;
/** Extra rows read so a page stays full after duplicates of one place are dropped. */
const SAME_PLACE_ROOM = 30;

/**
 * The open-data quality fragments are shared with the worker's pick job (`@cp/db`). They are
 * repeated verbatim in the `pois_destination_browse_idx` migration: the planner uses that index
 * for a no-query browse only while the texts match.
 */
export { LOW_CONFIDENCE, LOW_QUALITY, QUALITY_SCORE };

/** An editor's must-see: the destination's essentials. */
const MUST_SEE = "(p.curation = 'editorial' AND (p.editorial->>'must_see')::boolean IS TRUE)";

/** Weight of `QUALITY_SCORE` next to text relevance: a tie-breaker, never louder than the match. */
const QUALITY_WEIGHT_WITH_QUERY = 0.05;

export interface PlaceSearchFilters {
  readonly q?: string;
  readonly near?: { readonly lat: number; readonly lng: number };
  readonly category?: PoiCategory;
  /** Any of these categories (a plain-words search's kinds of place). */
  readonly categories?: readonly PoiCategory[];
  /** Price level at most this; places with no known price stay in. */
  readonly priceMax?: number;
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
  /** The part of town its address names ("Ubud"), never the destination itself. */
  readonly area: string | null;
  /** In the curated set, or a machine pick where nothing is curated. */
  readonly recommended: boolean;
  readonly priceLevel: number | null;
  readonly tags: readonly string[];
  readonly distanceM: number | null;
  readonly openNow: boolean | null;
}

/** A match with what the planning filters read: its hours and the zone they are in. */
export interface PlaceSearchCandidate {
  readonly item: PlaceSearchResultItem;
  readonly hours: Hours | null;
  readonly tz: string | null;
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
  readonly destination_name: string | null;
  readonly recommended: boolean;
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
    area: areaFromAddress(row.address, row.destination_name),
    recommended: row.recommended,
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

const foldWord = (word: string) =>
  word.replace(/[đĐ]/gu, 'd').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The words of a destination's name, folded ("da", "lat"); none without a destination. */
async function destinationWords(
  tx: pg.PoolClient,
  destinationId: string | undefined,
): Promise<ReadonlySet<string>> {
  if (destinationId === undefined) return new Set();
  const { rows } = await tx.query<{ name: string }>('SELECT name FROM destinations WHERE id = $1', [
    destinationId,
  ]);
  return new Set(
    (rows[0]?.name ?? '')
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .map(foldWord),
  );
}

/**
 * Runs inside the caller's own `withUser`/`withGuideReader` transaction (docs/code-standards.md §13:
 * never a bare pool query in a handler) — `tx` is that transaction's client, not a fresh pool checkout.
 */
export async function searchPlaces(
  tx: pg.PoolClient,
  filters: PlaceSearchFilters,
): Promise<readonly (PlaceSearchResultItem & PlaceBrowseDetails)[]> {
  const browse = filters.destinationId !== undefined && (filters.q ?? '').trim() === '';
  const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, browse ? MAX_BROWSE_LIMIT : MAX_LIMIT);
  const needsOpenAtFilter = filters.openAt !== undefined;
  const fetchLimit = needsOpenAtFilter ? limit * OPEN_AT_CANDIDATE_MULTIPLIER : limit;
  const rows = await queryPlaceRows(tx, filters, fetchLimit);
  const results = needsOpenAtFilter
    ? rows.filter((row) => isOpenAtInstant(row, filters.openAt as Date) === true)
    : rows;
  return withBrowseDetails(tx, results.slice(0, limit).map(toResultItem));
}

/**
 * Up to `fetchLimit` matches in search order, with their hours, for the planning filters to narrow
 * (`open_at` is not applied here). Same transaction rule as `searchPlaces`.
 */
export async function searchPlaceCandidates(
  tx: pg.PoolClient,
  filters: Omit<PlaceSearchFilters, 'openAt' | 'limit'>,
  fetchLimit: number,
): Promise<readonly PlaceSearchCandidate[]> {
  const rows = await queryPlaceRows(tx, filters, fetchLimit);
  return rows.map((row) => ({
    item: toResultItem(row),
    hours: knownHours(row.hours),
    tz: row.timezone ?? row.destination_tz,
  }));
}

async function queryPlaceRows(
  tx: pg.PoolClient,
  filters: PlaceSearchFilters,
  fetchLimit: number,
): Promise<readonly PlaceSearchRow[]> {
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
  if (filters.categories !== undefined && filters.categories.length > 0) {
    params.push(filters.categories);
    conditions.push(`p.category = ANY($${params.length}::text[])`);
  }
  if (filters.priceMax !== undefined) {
    params.push(filters.priceMax);
    conditions.push(`(p.price_level IS NULL OR p.price_level <= $${params.length})`);
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
    const typed = (filters.q ?? '')
      .toLowerCase()
      .split(/\s+/u)
      .filter((word) => word !== '');
    // People add the city after a name ("Tanah Lot Bali"): the destination's own words say where,
    // not what, so they are not asked of the name (unless they are all she typed).
    const place = await destinationWords(tx, filters.destinationId);
    const named = typed.filter((word) => !place.has(foldWord(word)));
    const words = named.length === 0 ? typed : named;
    params.push(words);
    const wordsParam = params.length;
    // A place whose own name has a word starting with each typed word comes before one that matches only by its
    // address or tags ("My Son" is the sanctuary, not every bar in Mỹ An, Sơn Trà). Within each,
    // recommended places first, the editors' must-sees ahead of the rest: a query also matches every
    // business on a street named after a sight, and a well-known sight's hotel shares its name (a
    // picked "The Marble Mountain Hotel" is a better text match for "Marble Mountain" than the
    // Marble Mountains). Low-quality open data still matches, after every other match, and a hotel
    // comes after a place of the same standing that is not one.
    const nameMatch = `(SELECT bool_and(app.unaccent_immutable(lower(p.name || ' ' || coalesce(p.name_local, '')))
        ~ ('(^|[^[:alnum:]])' || app.unaccent_immutable(w))) FROM unnest($${wordsParam}::text[]) AS w)`;
    orderExpression = `coalesce(${nameMatch}, false) DESC, ${recommendedSql('p')} DESC, ${MUST_SEE} DESC, ${LOW_QUALITY} ASC, (p.category = 'stay') ASC, ts_rank(p.fts, websearch_to_tsquery('simple', app.unaccent_immutable($${qParam}))) + similarity(p.name, $${qParam}) + ${QUALITY_WEIGHT_WITH_QUERY} * ${QUALITY_SCORE} DESC`;
  }

  let distanceSelect = 'NULL::double precision AS distance_m';
  if (filters.near !== undefined) {
    params.push(filters.near.lng, filters.near.lat);
    const lngParam = params.length - 1;
    const latParam = params.length;
    const point = `ST_SetSRID(ST_MakePoint($${lngParam}, $${latParam}), 4326)::geography`;
    distanceSelect = `ST_Distance(p.location, ${point}) AS distance_m`;
    // `<->` walks the location GiST index nearest-first, so a browse reads only the rows it returns
    // instead of measuring and sorting every row in the destination.
    if (!hasQuery) orderExpression = `p.location <-> ${point}`;
  }

  // Room for the rows dropped as another row's place.
  params.push(fetchLimit + Math.min(fetchLimit, SAME_PLACE_ROOM));
  const limitParam = params.length;

  const { rows } = await tx.query<PlaceSearchRow>(
    `SELECT p.id, p.name, p.name_local, p.category, p.lat, p.lng, p.address, p.price_level, p.tags,
            p.hours, p.timezone, d.tz AS destination_tz, d.name AS destination_name,
            ${recommendedSql('p')} AS recommended, lc.is_open_now,
            ${distanceSelect}
     FROM pois p
     JOIN destinations d ON d.id = p.destination_id
     LEFT JOIN poi_live_checks lc ON lc.poi_id = p.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${orderExpression}
     LIMIT $${limitParam}`,
    params,
  );
  return onePerPlace(rows, rows[0]?.destination_name ?? '').slice(0, fetchLimit);
}
