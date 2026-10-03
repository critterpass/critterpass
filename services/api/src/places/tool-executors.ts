/**
 * `places_search` and `place_details` AI tool executors (docs/api-contracts.md §6), registered with
 * the gateway's tool registry by src/ai/tool-executors.ts.
 *
 * Both run as `guide_reader` against `llm.pois` only (docs/api-contracts.md §6 global rule: "tools
 * run server-side... C3 data excluded (tools run as guide_reader)"), never `public.pois` directly,
 * and never persist anything.
 */
import { knownHours, openAt, poiCategorySchema, type Hours, type PoiCategory } from '@cp/domain';
import { withGuideReader } from '@cp/db';
import type pg from 'pg';
import { z } from 'zod';

import { parseGuidePlaceQuery } from './guide-place-query';
import { RECOMMENDED, resolveReference, tripDestination } from './guide-place-reference';

const NEAR_SCHEMA = z.object({ lat: z.number(), lng: z.number() });

export const placesSearchToolInputSchema = z
  .object({
    query: z.string().min(1).optional(),
    near: NEAR_SCHEMA.optional(),
    place_id: z.uuid().optional(),
    near_name: z.string().min(1).optional(),
    near_stay: z.boolean().optional(),
    recommended_only: z.boolean().optional(),
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
  readonly distance_from: string | null;
  readonly match: 'exact' | 'close' | null;
  readonly recommended: boolean;
  readonly why_go: string | null;
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
  readonly exact: boolean | null;
  readonly recommended: boolean;
  readonly why_go: string | null;
}

const DEFAULT_TOOL_LIMIT = 10;

/**
 * `places_search` (docs/api-contracts.md §6): "only returned `poi_id`s may be named" — the guide
 * must not describe a place this tool did not return. Searches stay in the trip's destination; a
 * name is matched however it was typed (./guide-place-query.ts), and distances are measured from a
 * point, a place, a place named as typed, or the trip's stay. The catalogue has no ratings, so
 * `recommended` (curated by the content factory) and `why_go` are the only quality it reports.
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
    const trip = await tripDestination(tx);
    const reference = await resolveReference(tx, trip, tripId, input);
    // A place named as the reference that is not in the catalogue: nothing to measure from.
    if (reference === null) return [];
    const text =
      input.query === undefined ? undefined : parseGuidePlaceQuery(input.query, trip?.name);

    const params: unknown[] = [];
    const param = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const conditions: string[] = ['true'];
    if (trip !== undefined) conditions.push(`destination_id = ${param(trip.id)}`);
    const kind = category ?? (text?.words.length === 0 ? text.kind : undefined);
    if (kind !== undefined) conditions.push(`category = ${param(kind)}`);
    if (input.recommended_only === true) conditions.push(RECOMMENDED);
    // The place distances are measured from is not one of its own neighbours.
    if (reference?.id != null && input.place_id === undefined)
      conditions.push(`id <> ${param(reference.id)}`);

    let exact = 'NULL::boolean';
    const ranks: string[] = [];
    if (text !== undefined && text.any !== null && text.all !== null) {
      const any = `to_tsquery('simple', ${param(text.any)})`;
      const raw = param(input.query);
      exact = `fts @@ to_tsquery('simple', ${param(text.all)})`;
      conditions.push(`(fts @@ ${any} OR name % ${raw})`);
      ranks.push('exact DESC');
      if (text.kind !== undefined) ranks.push(`(category = ${param(text.kind)}) DESC`);
      if (reference === undefined)
        ranks.push(
          `${RECOMMENDED} DESC`,
          `ts_rank(fts, ${any}) DESC`,
          `similarity(name, ${raw}) DESC`,
        );
    }

    let distance = 'NULL::double precision';
    if (reference !== undefined) {
      // llm.pois is a plain view without the PostGIS `location` column, so distance is computed
      // from its lat/lng (the same geography cast the base table uses).
      distance = `ST_Distance(ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, ST_SetSRID(ST_MakePoint(${param(reference.lng)}, ${param(reference.lat)}), 4326)::geography)`;
      ranks.push('distance_m ASC');
    } else if (text === undefined) {
      ranks.push(`${RECOMMENDED} DESC`);
    }
    ranks.push('name ASC');

    const { rows } = await tx.query<ToolPoiRow>(
      `SELECT id, name, category, price_level, tags, hours, timezone, is_open_now, why_go,
              ${RECOMMENDED} AS recommended, ${exact} AS exact, ${distance} AS distance_m
         FROM llm.pois
        WHERE ${conditions.join(' AND ')}
        ORDER BY ${ranks.join(', ')}
        LIMIT ${param(limit * (input.open_at !== undefined ? 5 : 1))}`,
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
      distance_m: row.distance_m === null ? null : Math.round(row.distance_m),
      open_now: row.is_open_now,
      price_level: row.price_level,
      tags: row.tags,
      distance_from: reference?.name ?? null,
      match: row.exact === null ? null : row.exact ? 'exact' : 'close',
      recommended: row.recommended,
      why_go: row.why_go,
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
