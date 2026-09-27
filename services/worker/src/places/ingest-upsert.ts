/**
 * Batched conflated-POI upsert for `./ingest.ts`: chunks of `INGEST_BATCH_SIZE` conflated POIs go
 * through one transaction, one existing-id lookup query, one multi-row `INSERT` for new POIs and one
 * multi-row `UPDATE ... FROM (VALUES ...)` for existing ones — replacing what used to be a `SELECT`
 * plus an `INSERT`/`UPDATE` per POI (tens of thousands of sequential round trips at a metro-wide
 * bbox). Idempotent: a rerun with the same source id(s) updates the existing row rather than
 * inserting a duplicate. Without an overlay this run, an existing row's
 * editorial/tags/hours/curation are left exactly as they were: a later plain re-ingest must never
 * erase a previous editorial pass.
 */
import {
  defaultVisitRadiusM,
  editorialOverlaySchema,
  parseOpeningHours,
  type EditorialOverlay,
  type PoiCuration,
} from '@cp/domain';
import { withSystem } from '@cp/db';
import type pg from 'pg';

import type { ConflatedPoi } from './conflate';

export interface EditorialOverlayInput {
  readonly editorial?: EditorialOverlay;
  readonly tags?: readonly string[];
  /** OSM `opening_hours` subset text; parsed via `parseOpeningHours` before storage. */
  readonly hoursOsm?: string;
  readonly hoursVerifiedAt?: Date;
}

/** Key a POI's overlay entry by whichever source id it carries: `fsq_os:<id>` or `overture:<id>`. */
export function editorialOverlayKey(poi: ConflatedPoi): string {
  return poi.sourceIds.fsq_os !== undefined
    ? `fsq_os:${poi.sourceIds.fsq_os}`
    : `overture:${poi.sourceIds.overture}`;
}

interface PreparedPoiRow {
  readonly poi: ConflatedPoi;
  readonly hasOverlay: boolean;
  readonly editorial: EditorialOverlay;
  readonly tags: readonly string[];
  readonly hours: { readonly weekly?: unknown };
  readonly hoursVerifiedAt: Date | null;
  readonly curation: PoiCuration;
  readonly visitRadiusM: number;
}

function preparePoiRow(
  poi: ConflatedPoi,
  overlay: EditorialOverlayInput | undefined,
): PreparedPoiRow {
  const hasOverlay = overlay !== undefined;
  return {
    poi,
    hasOverlay,
    editorial: editorialOverlaySchema.parse(overlay?.editorial ?? {}),
    tags: overlay?.tags ?? [],
    hours: overlay?.hoursOsm !== undefined ? { weekly: parseOpeningHours(overlay.hoursOsm) } : {},
    hoursVerifiedAt: overlay?.hoursVerifiedAt ?? null,
    curation: hasOverlay ? 'editorial' : 'auto',
    visitRadiusM: defaultVisitRadiusM(poi.category),
  };
}

/**
 * Builds a parameterised multi-row `VALUES (...), (...)` clause: `casts[i]` (when set) is appended to
 * every row's column `i`. Used to batch what used to be one round trip per POI into one round trip
 * per chunk (docs/code-standards.md §13 "parameterised only" — every value is still a bound param,
 * only the placeholder count grows).
 */
function buildValuesClause(
  rows: readonly (readonly unknown[])[],
  casts: readonly (string | undefined)[],
): { readonly clause: string; readonly params: unknown[] } {
  const params: unknown[] = [];
  const rowClauses = rows.map((row) => {
    const cells = row.map((value, columnIndex) => {
      params.push(value);
      const cast = casts[columnIndex];
      return cast !== undefined ? `$${params.length}::${cast}` : `$${params.length}`;
    });
    return `(${cells.join(', ')})`;
  });
  return { clause: rowClauses.join(', '), params };
}

/** One query per chunk instead of one per POI: matches a POI to an existing row by either source id. */
async function findExistingPoiIds(
  tx: pg.PoolClient,
  rows: readonly PreparedPoiRow[],
): Promise<ReadonlyMap<string, string>> {
  const fsqIds = rows
    .map((row) => row.poi.sourceIds.fsq_os)
    .filter((id): id is string => id !== undefined);
  const overtureIds = rows
    .map((row) => row.poi.sourceIds.overture)
    .filter((id): id is string => id !== undefined);
  if (fsqIds.length === 0 && overtureIds.length === 0) return new Map();

  const { rows: existing } = await tx.query<{ id: string; source_ids: ConflatedPoi['sourceIds'] }>(
    `SELECT id, source_ids FROM pois
     WHERE (source_ids ->> 'fsq_os') = ANY($1::text[]) OR (source_ids ->> 'overture') = ANY($2::text[])`,
    [fsqIds, overtureIds],
  );
  const byKey = new Map<string, string>();
  for (const row of existing) {
    if (row.source_ids.fsq_os !== undefined) byKey.set(`fsq_os:${row.source_ids.fsq_os}`, row.id);
    if (row.source_ids.overture !== undefined)
      byKey.set(`overture:${row.source_ids.overture}`, row.id);
  }
  return byKey;
}

function lookupExistingId(
  byKey: ReadonlyMap<string, string>,
  sourceIds: ConflatedPoi['sourceIds'],
): string | undefined {
  const byFsq =
    sourceIds.fsq_os !== undefined ? byKey.get(`fsq_os:${sourceIds.fsq_os}`) : undefined;
  if (byFsq !== undefined) return byFsq;
  return sourceIds.overture !== undefined ? byKey.get(`overture:${sourceIds.overture}`) : undefined;
}

const INSERT_CASTS = [
  'uuid',
  undefined,
  undefined,
  'double precision',
  'double precision',
  undefined,
  'jsonb',
  'jsonb',
  'text[]',
  'jsonb',
  'timestamptz',
  undefined,
  'integer',
  undefined,
] as const;

async function insertPoiRows(
  tx: pg.PoolClient,
  destinationId: string,
  timezone: string | undefined,
  rows: readonly PreparedPoiRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const { clause, params } = buildValuesClause(
    rows.map((row) => [
      destinationId,
      row.poi.name,
      row.poi.category,
      row.poi.lat,
      row.poi.lng,
      row.poi.address ?? null,
      JSON.stringify(row.poi.sourceIds),
      JSON.stringify(row.editorial),
      row.tags,
      JSON.stringify(row.hours),
      row.hoursVerifiedAt,
      row.curation,
      row.visitRadiusM,
      timezone ?? null,
    ]),
    INSERT_CASTS,
  );
  await tx.query(
    `INSERT INTO pois
       (destination_id, name, category, lat, lng, address, source_ids, editorial, tags,
        hours, hours_verified_at, curation, visit_radius_m, timezone)
     VALUES ${clause}`,
    params,
  );
}

const UPDATE_CASTS = [
  'uuid',
  undefined,
  undefined,
  'double precision',
  'double precision',
  undefined,
  'jsonb',
  'boolean',
  'jsonb',
  'text[]',
  'jsonb',
  'timestamptz',
  undefined,
] as const;

async function updatePoiRows(
  tx: pg.PoolClient,
  rows: readonly (PreparedPoiRow & { readonly existingId: string })[],
): Promise<void> {
  if (rows.length === 0) return;
  const { clause, params } = buildValuesClause(
    rows.map((row) => [
      row.existingId,
      row.poi.name,
      row.poi.category,
      row.poi.lat,
      row.poi.lng,
      row.poi.address ?? null,
      JSON.stringify(row.poi.sourceIds),
      row.hasOverlay,
      JSON.stringify(row.editorial),
      row.tags,
      JSON.stringify(row.hours),
      row.hoursVerifiedAt,
      row.curation,
    ]),
    UPDATE_CASTS,
  );
  await tx.query(
    `UPDATE pois AS p SET
       name = v.name, category = v.category, lat = v.lat, lng = v.lng, address = v.address,
       source_ids = v.source_ids,
       editorial = CASE WHEN v.has_overlay THEN v.editorial ELSE p.editorial END,
       tags = CASE WHEN v.has_overlay THEN v.tags ELSE p.tags END,
       hours = CASE WHEN v.has_overlay THEN v.hours ELSE p.hours END,
       hours_verified_at = CASE WHEN v.has_overlay THEN v.hours_verified_at ELSE p.hours_verified_at END,
       curation = CASE WHEN v.has_overlay THEN v.curation ELSE p.curation END
     FROM (VALUES ${clause})
       AS v(id, name, category, lat, lng, address, source_ids, has_overlay, editorial, tags, hours,
            hours_verified_at, curation)
     WHERE p.id = v.id`,
    params,
  );
}

export const INGEST_BATCH_SIZE = 500;

export function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * Upserts one chunk (≤`INGEST_BATCH_SIZE`) of conflated POIs inside a single transaction. See file
 * header for the batching rationale and the editorial-overlay preservation rule.
 */
export async function batchUpsertConflatedPois(
  pool: pg.Pool,
  destinationId: string,
  timezone: string | undefined,
  pois: readonly ConflatedPoi[],
  editorialBySourceKey: ReadonlyMap<string, EditorialOverlayInput> | undefined,
): Promise<void> {
  const prepared = pois.map((poi) =>
    preparePoiRow(poi, editorialBySourceKey?.get(editorialOverlayKey(poi))),
  );

  await withSystem(pool, async (tx) => {
    const existingByKey = await findExistingPoiIds(tx, prepared);
    const toInsert: PreparedPoiRow[] = [];
    const toUpdate: (PreparedPoiRow & { existingId: string })[] = [];
    for (const row of prepared) {
      const existingId = lookupExistingId(existingByKey, row.poi.sourceIds);
      if (existingId === undefined) toInsert.push(row);
      else toUpdate.push({ ...row, existingId });
    }
    await insertPoiRows(tx, destinationId, timezone, toInsert);
    await updatePoiRows(tx, toUpdate);
  });
}
