/**
 * The places a draft is built from: every recommended place of the destination (the curated set,
 * or the machine picks where our editors have curated nothing; never a cut by row order: the
 * planner narrows them), plus every must-do's own place. Any other open-data place joins only as
 * a must-do, picked from search or named by a hand-typed must-do (`loadWishCandidates`). Rows
 * merged into another are never read.
 */
import { recommendedOrderSql, recommendedSql, withSystem } from '@cp/db';
import { hoursSchema } from '@cp/domain';
import { defaultDurationMin, nameTokens, withOpenDataDefaults, type DraftPoi } from '@cp/planner';
import type pg from 'pg';

/**
 * Recommended places read per destination before the planner narrows them into pools. Every one
 * of a city must be read: a cut-off here would decide the trip by row order.
 */
export const MAX_DRAFT_PLACES = 800;

/** Places read per hand-typed must-do, curated and open-data each. */
const MAX_WISH_CANDIDATES = 120;

interface PoiRow {
  readonly id: string;
  readonly name: string;
  readonly name_local: string | null;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly timezone: string;
  readonly hours: unknown;
  readonly price_level: number | null;
  readonly tags: string[] | null;
  readonly editorial: unknown;
  readonly curation: string;
  readonly pick_source: string | null;
}

/** The destination's recommended places (the editors' first), plus every must-do's place. */
export async function loadDraftPlaces(
  pool: pg.Pool,
  destinationId: string,
  mustDoPoiIds: readonly string[],
): Promise<DraftPoi[]> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<PoiRow>(
      `(SELECT p.id, p.name, p.name_local, p.category, p.lat, p.lng, coalesce(p.timezone, d.tz) AS timezone,
               p.hours, p.price_level, p.tags, p.editorial, p.curation, p.pick_source
          FROM pois p JOIN destinations d ON d.id = p.destination_id
         WHERE p.destination_id = $1 AND p.status = 'active' AND ${recommendedSql('p')}
           AND p.merged_into_id IS NULL
           AND p.category NOT IN ('transit', 'stay', 'health')
         ORDER BY ${recommendedOrderSql('p')}, p.id
         LIMIT $3)
       UNION
       (SELECT p.id, p.name, p.name_local, p.category, p.lat, p.lng, coalesce(p.timezone, d.tz) AS timezone,
               p.hours, p.price_level, p.tags, p.editorial, p.curation, p.pick_source
          FROM pois p JOIN destinations d ON d.id = p.destination_id
         WHERE p.id = ANY($2::uuid[]) AND p.status = 'active')`,
      [destinationId, mustDoPoiIds, MAX_DRAFT_PLACES],
    ),
  );
  return rows.map(toDraftPoi);
}

function toDraftPoi(row: PoiRow): DraftPoi {
  const editorial = (row.editorial ?? {}) as {
    time_needed_min?: unknown;
    must_see?: unknown;
    essential?: unknown;
    why_go?: unknown;
    best_time?: unknown;
  };
  const text = (value: unknown) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, 160) : null;
  const hours = hoursSchema.safeParse(row.hours);
  const known = hours.success && Object.keys(hours.data.weekly).length > 0;
  const filled = Object.values(row.editorial ?? {}).filter(
    (value) => value !== null && value !== '',
  ).length;
  return withOpenDataDefaults({
    id: row.id,
    name: row.name,
    nameLocal: row.name_local,
    category: row.category,
    lat: row.lat,
    lng: row.lng,
    tz: row.timezone,
    hours: hours.success && Object.keys(hours.data.weekly).length > 0 ? hours.data : null,
    // Free places carry a `free` tag (price levels start at 1).
    priceLevel: (row.tags ?? []).includes('free') ? 0 : row.price_level,
    tags: row.tags ?? [],
    durationMin:
      typeof editorial.time_needed_min === 'number' && editorial.time_needed_min > 0
        ? Math.round(editorial.time_needed_min)
        : defaultDurationMin(row.category),
    editorial: row.curation === 'editorial',
    // Where nothing is curated, the well-known places the model named stand in for must-sees, so
    // the sights a town is known for take their seats before the open-data fill.
    mustSee: editorial.must_see === true || row.pick_source === 'named',
    // The handful a first visit should hold (our editors flag at most fifteen a destination).
    ...(editorial.essential === true ? { essential: true } : {}),
    detail: filled + (known ? 1 : 0),
    whyGo: text(editorial.why_go),
    bestTime: text(editorial.best_time),
  });
}

/**
 * Places a hand-typed must-do might name: rows of the destination whose name shares a word with
 * the text, curated rows and open-data rows read apart (most words in common first) so neither
 * crowds the other out. The planner decides which, if any, the text really names.
 */
export async function loadWishCandidates(
  pool: pg.Pool,
  destinationId: string,
  wishes: readonly string[],
  ignore: readonly (readonly string[])[],
): Promise<DraftPoi[]> {
  const skip = new Set(ignore.flat());
  const found = new Map<string, DraftPoi>();
  for (const wish of wishes) {
    // Raw and folded forms: the stored names are not stemmed ("mountains" and "mountain").
    const raw = wish
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .replace(/[đĐ]/gu, 'd')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 0);
    const words = [...new Set([...raw, ...nameTokens(wish)])].filter((word) => !skip.has(word));
    if (words.length === 0) continue;
    const query = words.join(' | ');
    const { rows } = await withSystem(pool, (tx) =>
      tx.query<PoiRow>(
        `SELECT * FROM (
           (SELECT p.id, p.name, p.name_local, p.category, p.lat, p.lng, coalesce(p.timezone, d.tz) AS timezone,
                   p.hours, p.price_level, p.tags, p.editorial, p.curation, p.pick_source
              FROM pois p JOIN destinations d ON d.id = p.destination_id
             WHERE p.destination_id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL
               AND p.curation = 'editorial' AND p.category NOT IN ('transit', 'stay', 'health')
               AND p.fts @@ to_tsquery('simple', $2)
             ORDER BY ts_rank(p.fts, to_tsquery('simple', $2)) DESC, p.id LIMIT $3)
           UNION ALL
           (SELECT p.id, p.name, p.name_local, p.category, p.lat, p.lng, coalesce(p.timezone, d.tz) AS timezone,
                   p.hours, p.price_level, p.tags, p.editorial, p.curation, p.pick_source
              FROM pois p JOIN destinations d ON d.id = p.destination_id
             WHERE p.destination_id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL
               AND p.curation <> 'editorial' AND p.category NOT IN ('transit', 'stay', 'health')
               AND p.fts @@ to_tsquery('simple', $2)
             ORDER BY ts_rank(p.fts, to_tsquery('simple', $2)) DESC, p.id LIMIT $3)
         ) candidates`,
        [destinationId, query, MAX_WISH_CANDIDATES],
      ),
    );
    for (const row of rows) found.set(row.id, toDraftPoi(row));
  }
  return [...found.values()];
}
