/**
 * `places_search` and `place_details` AI tool executors (docs/api-contracts.md §6). Exported as
 * plain typed functions rather than registered via `registerToolExecutor`: the AI tool registry does
 * not exist yet. Whichever work builds it imports these and registers them unchanged — the
 * input/output shapes here already match the documented tool contract exactly.
 *
 * Both run as `guide_reader` against `llm.pois` only (docs/api-contracts.md §6 global rule: "tools
 * run server-side... C3 data excluded (tools run as guide_reader)"), never `public.pois` directly,
 * and never persist anything.
 */
import { knownHours, openAt, poiCategorySchema, type Hours, type PoiCategory } from '@cp/domain';
import { withGuideReader } from '@cp/db';
import type pg from 'pg';
import { z } from 'zod';

const NEAR_SCHEMA = z.object({ lat: z.number(), lng: z.number() });

export const placesSearchToolInputSchema = z
  .object({
    query: z.string().min(1).optional(),
    near: NEAR_SCHEMA.optional(),
    place_id: z.uuid().optional(),
    category: z.string().optional(),
    open_at: z.iso.datetime({ offset: true }).optional(),
    limit: z.number().int().positive().max(20).optional(),
  })
  .strict();
export type PlacesSearchToolInput = z.infer<typeof placesSearchToolInputSchema>;

export interface PlacesSearchToolResultItem {
  readonly poi_id: string;
  readonly name: string;
  readonly category: PoiCategory;
  readonly distance_m: number | null;
  readonly open_now: boolean | null;
  readonly price_level: number | null;
  readonly tags: readonly string[];
}

interface ToolPoiRow {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly price_level: number | null;
  readonly tags: string[];
  readonly hours: Hours;
  readonly timezone: string | null;
  readonly is_open_now: boolean | null;
  readonly distance_m: number | null;
}

const DEFAULT_TOOL_LIMIT = 10;

/**
 * `places_search` (docs/api-contracts.md §6): "only returned `poi_id`s may be named" — the guide
 * must not describe a place this tool did not return.
 */
export async function placesSearchTool(
  pool: pg.Pool,
  uid: string,
  tripId: string,
  rawInput: PlacesSearchToolInput,
): Promise<readonly PlacesSearchToolResultItem[]> {
  const input = placesSearchToolInputSchema.parse(rawInput);
  const category =
    input.category !== undefined ? poiCategorySchema.parse(input.category) : undefined;
  const limit = input.limit ?? DEFAULT_TOOL_LIMIT;

  return withGuideReader(pool, uid, tripId, async (tx) => {
    let near = input.near;
    if (near === undefined && input.place_id !== undefined) {
      const { rows } = await tx.query<{ lat: number; lng: number }>(
        'SELECT lat, lng FROM llm.pois WHERE id = $1',
        [input.place_id],
      );
      near = rows[0];
    }

    const conditions: string[] = ['true'];
    const params: unknown[] = [];
    if (category !== undefined) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    if (input.query !== undefined) {
      params.push(input.query);
      conditions.push(`(name % $${params.length} OR name ILIKE '%' || $${params.length} || '%')`);
    }

    let distanceSelect = 'NULL::double precision AS distance_m';
    let orderExpression = 'name ASC';
    if (near !== undefined) {
      params.push(near.lng, near.lat);
      const lngParam = params.length - 1;
      const latParam = params.length;
      // llm.pois is a plain view without the PostGIS `location` generated column, so distance is
      // computed straight from its lat/lng columns (identical geography cast the base table uses).
      distanceSelect = `ST_Distance(ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, ST_SetSRID(ST_MakePoint($${lngParam}, $${latParam}), 4326)::geography) AS distance_m`;
      orderExpression = 'distance_m ASC';
    }

    params.push(limit * (input.open_at !== undefined ? 5 : 1));
    const limitParam = params.length;

    const { rows } = await tx.query<ToolPoiRow>(
      `SELECT id, name, category, price_level, tags, hours, timezone, is_open_now, ${distanceSelect}
       FROM llm.pois
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderExpression}
       LIMIT $${limitParam}`,
      params,
    );

    const filtered =
      input.open_at !== undefined
        ? rows.filter((row) => {
            const hours = knownHours(row.hours);
            return (
              row.timezone !== null &&
              hours !== null &&
              openAt(hours, row.timezone, new Date(input.open_at as string))
            );
          })
        : rows;

    return filtered.slice(0, limit).map((row) => ({
      poi_id: row.id,
      name: row.name,
      category: poiCategorySchema.parse(row.category),
      distance_m: row.distance_m,
      open_now: row.is_open_now,
      price_level: row.price_level,
      tags: row.tags,
    }));
  });
}

export const placeDetailsToolInputSchema = z
  .object({
    poi_id: z.uuid(),
    fields: z.array(z.string()).optional(),
  })
  .strict();
export type PlaceDetailsToolInput = z.infer<typeof placeDetailsToolInputSchema>;

export interface PlaceDetailsToolResult {
  readonly hours: readonly {
    readonly day: string;
    readonly spans: readonly { start: string; end: string }[];
  }[];
  readonly price_level: number | null;
  readonly indoor: boolean | null;
  readonly verified_at: string | null;
}

/**
 * `place_details` (docs/api-contracts.md §6): "hours quoted only with `verified_at`" — `hours` comes
 * back empty whenever `hours_verified_at` is unset, regardless of what `pois.hours` actually holds,
 * so the model can never quote unverified hours even if it ignores `verified_at` in the output.
 */
export async function placeDetailsTool(
  pool: pg.Pool,
  uid: string,
  tripId: string,
  rawInput: PlaceDetailsToolInput,
): Promise<PlaceDetailsToolResult> {
  const input = placeDetailsToolInputSchema.parse(rawInput);

  return withGuideReader(pool, uid, tripId, async (tx) => {
    const { rows } = await tx.query<{
      hours: Hours;
      hours_verified_at: Date | null;
      price_level: number | null;
    }>('SELECT hours, hours_verified_at, price_level FROM llm.pois WHERE id = $1', [input.poi_id]);
    const row = rows[0];
    if (row === undefined) {
      return { hours: [], price_level: null, indoor: null, verified_at: null };
    }

    const verified = row.hours_verified_at !== null;
    return {
      hours: verified
        ? Object.entries(row.hours.weekly).map(([day, spans]) => ({ day, spans: spans ?? [] }))
        : [],
      price_level: row.price_level,
      // No structured "indoor"/accessibility field exists on `pois` yet (editorial jsonb has no
      // fixed shape for it); left null rather than guessed.
      indoor: null,
      verified_at: row.hours_verified_at?.toISOString() ?? null,
    };
  });
}
