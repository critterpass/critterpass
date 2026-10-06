/**
 * The places a draft is built from: every recommended place of the destination (the curated set,
 * or the machine picks where our editors have curated nothing; never a cut by row order: the
 * planner narrows them), plus every must-do's own place. Any other open-data place joins only as
 * a must-do, picked from search or named by a hand-typed must-do (`loadWishCandidates`). Rows
 * merged into another are never read.
 *
 * While the server key `planner.typed_places` is on (no row = off), each place also carries its
 * typed facts: its ready profile's best times, visit length, meal role and dish, else its kind's
 * (`withTypedFacts`), and its rank among the essentials. Off, the editors' text fills the place
 * as before and the planner reads that.
 */
import { recommendedOrderSql, recommendedSql, withSystem } from '@cp/db';
import { hoursSchema, PLACE_BEST_TIMES, PLACE_MEAL_ROLES, type PlaceBestTime } from '@cp/domain';
import {
  derivedDurationMin,
  nameTokens,
  withOpenDataDefaults,
  withTypedFacts,
  type DraftPoi,
  type ProfileFacts,
} from '@cp/planner';
import type pg from 'pg';

export const TYPED_PLACES_KEY = 'planner.typed_places';

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
  /** The place's ready profile, when it has one. */
  readonly best_times: string[] | null;
  readonly visit_min: number | null;
  readonly meal_role: string | null;
  readonly dish: string | null;
}

/** The columns every draft place query reads (`p` the place, `d` its destination). */
const PLACE_COLUMNS = `p.id, p.name, p.name_local, p.category, p.lat, p.lng,
       coalesce(p.timezone, d.tz) AS timezone, p.hours, p.price_level, p.tags, p.editorial,
       p.curation, p.pick_source, pp.best_times, pp.visit_min, pp.meal_role, pp.dish`;
/** A place of the destination, or one another destination owns inside its place box. */
const BORROWED_SQL = `(p.destination_id = $1 OR ST_Intersects(p.location,
  (SELECT b.place_bounds FROM destinations b WHERE b.id = $1)))`;
const PROFILE_JOIN = `LEFT JOIN place_profiles pp ON pp.poi_id = p.id AND pp.status = 'ready'`;

/** Whether drafts read places' typed facts (`ops.ops_config`). */
export async function typedPlacesOn(pool: pg.Pool): Promise<boolean> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ value: unknown }>('SELECT value FROM ops.ops_config WHERE key = $1', [
      TYPED_PLACES_KEY,
    ]),
  );
  return rows[0]?.value === true;
}

/**
 * The destination's recommended places (the editors' first), plus every must-do's place. With
 * `borrow` (a later stop or a day-trip area), also the recommended places another destination
 * owns inside this one's place box: a place is filed under the first destination that read it, so
 * Hội An's old town belongs to Đà Nẵng.
 */
export async function loadDraftPlaces(
  pool: pg.Pool,
  destinationId: string,
  mustDoPoiIds: readonly string[],
  options: { readonly borrow?: boolean } = {},
): Promise<DraftPoi[]> {
  const typed = await typedPlacesOn(pool);
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<PoiRow>(
      `(SELECT ${PLACE_COLUMNS}
          FROM pois p JOIN destinations d ON d.id = p.destination_id ${PROFILE_JOIN}
         WHERE ${options.borrow === true ? BORROWED_SQL : 'p.destination_id = $1'}
           AND p.status = 'active' AND ${recommendedSql('p')}
           AND p.merged_into_id IS NULL
           AND p.category NOT IN ('transit', 'stay', 'health')
         ORDER BY ${recommendedOrderSql('p')}, p.id
         LIMIT $3)
       UNION
       (SELECT ${PLACE_COLUMNS}
          FROM pois p JOIN destinations d ON d.id = p.destination_id ${PROFILE_JOIN}
         WHERE p.id = ANY($2::uuid[]) AND p.status = 'active')`,
      [destinationId, mustDoPoiIds, MAX_DRAFT_PLACES],
    ),
  );
  return rows.map((row) => toDraftPoi(row, typed));
}

function toDraftPoi(row: PoiRow, typed: boolean): DraftPoi {
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
  const editorsMin =
    typeof editorial.time_needed_min === 'number' && editorial.time_needed_min > 0
      ? Math.round(editorial.time_needed_min)
      : null;
  // With typed facts the visit length is set below; the notes are not read for it.
  const poi = withOpenDataDefaults({
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
      editorsMin ??
      (typed
        ? 0
        : derivedDurationMin(row.category, row.tags ?? [], [
            text(editorial.why_go),
            text(editorial.best_time),
          ])),
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
  if (!typed) return poi;
  return withTypedFacts(poi, {
    profile: profileFacts(row),
    editorsVisitMin: editorsMin,
    // The editors' essentials (unranked today: each is first).
    essentialRank: editorial.essential === true ? 1 : null,
  });
}

function profileFacts(row: PoiRow): ProfileFacts | null {
  if (row.best_times === null) return null;
  const roles: readonly string[] = PLACE_MEAL_ROLES;
  const times: readonly string[] = PLACE_BEST_TIMES;
  return {
    bestTimes: row.best_times.filter((time): time is PlaceBestTime => times.includes(time)),
    visitMin: row.visit_min,
    mealRole:
      row.meal_role !== null && roles.includes(row.meal_role)
        ? (row.meal_role as ProfileFacts['mealRole'])
        : null,
    dish: row.dish,
  };
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
  const typed = wishes.length > 0 && (await typedPlacesOn(pool));
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
           (SELECT ${PLACE_COLUMNS}
              FROM pois p JOIN destinations d ON d.id = p.destination_id ${PROFILE_JOIN}
             WHERE p.destination_id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL
               AND p.curation = 'editorial' AND p.category NOT IN ('transit', 'stay', 'health')
               AND p.fts @@ to_tsquery('simple', $2)
             ORDER BY ts_rank(p.fts, to_tsquery('simple', $2)) DESC, p.id LIMIT $3)
           UNION ALL
           (SELECT ${PLACE_COLUMNS}
              FROM pois p JOIN destinations d ON d.id = p.destination_id ${PROFILE_JOIN}
             WHERE p.destination_id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL
               AND p.curation <> 'editorial' AND p.category NOT IN ('transit', 'stay', 'health')
               AND p.fts @@ to_tsquery('simple', $2)
             ORDER BY ts_rank(p.fts, to_tsquery('simple', $2)) DESC, p.id LIMIT $3)
         ) candidates`,
        [destinationId, query, MAX_WISH_CANDIDATES],
      ),
    );
    for (const row of rows) found.set(row.id, toDraftPoi(row, typed));
  }
  return [...found.values()];
}
