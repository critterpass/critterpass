/**
 * Batched conflated-POI upsert for `./ingest.ts`: chunks of `INGEST_BATCH_SIZE` conflated POIs go
 * through one transaction, one existing-id lookup query, one multi-row `INSERT` for new POIs and one
 * multi-row `UPDATE ... FROM (VALUES ...)` for existing ones — replacing what used to be a `SELECT`
 * plus an `INSERT`/`UPDATE` per POI (tens of thousands of sequential round trips at a metro-wide
 * bbox). Idempotent: a rerun with the same source id(s) updates the existing row rather than
 * inserting a duplicate. Without an overlay this run, an existing row's
 * editorial/tags/hours/curation are left exactly as they were: a later plain re-ingest must never
 * erase a previous editorial pass, and a rerun that misses one source (FSQ OS unavailable) keeps the
 * source ids it already had.
 *
 * A new Overture-only place below `MIN_INSERT_CONFIDENCE` is not inserted: sampled in Hội An,
 * Mexico City and London, rows under 0.3 are mostly online-only sellers, home services and
 * mislabelled pages. A row already stored is still updated (its score lands, and search ranks it
 * last), and nothing is ever deleted, since trips, must-dos, spawns and editorial reference POI ids.
 */
import {
  canonicalTz,
  defaultVisitRadiusM,
  editorialOverlaySchema,
  parseOpeningHours,
  type EditorialOverlay,
  type PoiCuration,
} from '@cp/domain';
import { withSystem } from '@cp/db';
import type pg from 'pg';

import { buildValuesClause } from './batch-sql';
import type { ConflatedPoi } from './conflate';
import { findExistingPois, lookupExisting } from './existing-pois';

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

export const MIN_INSERT_CONFIDENCE = 0.3;

/** Whether a POI with no stored row yet is worth inserting (see file header). */
export function worthInserting(row: Pick<PreparedPoiRow, 'poi' | 'hasOverlay'>): boolean {
  if (row.hasOverlay || row.poi.sourceIds.fsq_os !== undefined) return true;
  return row.poi.confidence === undefined || row.poi.confidence >= MIN_INSERT_CONFIDENCE;
}

/** The open-data columns in insert/update order: confidence, website, phone, brand. */
function openDataValues(poi: ConflatedPoi): unknown[] {
  return [poi.confidence ?? null, poi.website ?? null, poi.phone ?? null, poi.brand ?? null];
}
const OPEN_DATA_CASTS = ['real', undefined, undefined, undefined] as const;

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
  ...OPEN_DATA_CASTS,
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
      timezone === undefined ? null : canonicalTz(timezone),
      ...openDataValues(row.poi),
    ]),
    INSERT_CASTS,
  );
  await tx.query(
    `INSERT INTO pois
       (destination_id, name, category, lat, lng, address, source_ids, editorial, tags,
        hours, hours_verified_at, curation, visit_radius_m, timezone,
        confidence, website, phone, brand)
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
  ...OPEN_DATA_CASTS,
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
      ...openDataValues(row.poi),
    ]),
    UPDATE_CASTS,
  );
  await tx.query(
    `UPDATE pois AS p SET
       name = v.name, category = v.category, lat = v.lat, lng = v.lng, address = v.address,
       source_ids = p.source_ids || v.source_ids,
       editorial = CASE WHEN v.has_overlay THEN v.editorial ELSE p.editorial END,
       tags = CASE WHEN v.has_overlay THEN v.tags ELSE p.tags END,
       hours = CASE WHEN v.has_overlay THEN v.hours ELSE p.hours END,
       hours_verified_at = CASE WHEN v.has_overlay THEN v.hours_verified_at ELSE p.hours_verified_at END,
       curation = CASE WHEN v.has_overlay THEN v.curation ELSE p.curation END,
       confidence = v.confidence, website = v.website, phone = v.phone, brand = v.brand
     FROM (VALUES ${clause})
       AS v(id, name, category, lat, lng, address, source_ids, has_overlay, editorial, tags, hours,
            hours_verified_at, curation, confidence, website, phone, brand)
     WHERE p.id = v.id`,
    params,
  );
}

export const INGEST_BATCH_SIZE = 500;

export interface BatchUpsertCounts {
  readonly inserted: number;
  readonly updated: number;
  /** New low-confidence places left out (see `worthInserting`). */
  readonly skipped: number;
  /** Places another destination owns, left untouched (`./existing-pois.ts`). */
  readonly ownedElsewhere: number;
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
): Promise<BatchUpsertCounts> {
  const prepared = pois.map((poi) =>
    preparePoiRow(poi, editorialBySourceKey?.get(editorialOverlayKey(poi))),
  );

  return withSystem(pool, async (tx) => {
    const existingByKey = await findExistingPois(tx, pois);
    const toInsert: PreparedPoiRow[] = [];
    const toUpdate: (PreparedPoiRow & { existingId: string })[] = [];
    let ownedElsewhere = 0;
    for (const row of prepared) {
      const existing = lookupExisting(existingByKey, row.poi.sourceIds);
      if (existing === undefined) {
        if (worthInserting(row)) toInsert.push(row);
      } else if (existing.destinationId === destinationId) {
        toUpdate.push({ ...row, existingId: existing.id });
      } else {
        ownedElsewhere += 1;
      }
    }
    await insertPoiRows(tx, destinationId, timezone, toInsert);
    await updatePoiRows(tx, toUpdate);
    return {
      inserted: toInsert.length,
      updated: toUpdate.length,
      skipped: prepared.length - toInsert.length - toUpdate.length - ownedElsewhere,
      ownedElsewhere,
    };
  });
}
