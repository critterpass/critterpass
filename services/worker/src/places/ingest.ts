/**
 * Curated POI ingest for one destination bbox: reads Overture
 * places (public S3, no auth) and FSQ OS Places, conflates (`./conflate.ts`), and upserts into
 * `pois` keyed by source id so a rerun updates existing rows instead of creating new ones.
 *
 * Data sources and licences:
 * - Overture places (CDLA-P-2.0): `s3://overturemaps-us-west-2/release/<release>/theme=places/type=place/`,
 *   read directly via DuckDB's `httpfs` extension with bbox predicate pushdown (`bbox.xmin/ymin` are
 *   exact for a point geometry, so no `spatial` extension is needed just to get lat/lng). Verified
 *   against the live bucket: `names.primary`, `taxonomy.primary`, `taxonomy.alternates` (not
 *   `alternate` — a binder error from a first attempt confirmed the real struct fields),
 *   `addresses[1].freeform` and `bbox.{xmin,ymin}` (matching Overture's own quickstart docs). Reading
 *   list-typed columns needs `getRowObjectsJson()`, not `getRowObjects()`: the latter's raw
 *   `DuckDBListValue` wrapper stringifies as `{"items": [...]}`, which briefly looked like a nested
 *   `addresses.items[].entries.freeform` struct shape until a binder error against the real column
 *   type (`addresses` is a plain `LIST(STRUCT(...))`) disproved it.
 * - FSQ OS Places (Apache-2.0, NOTICE attribution): moved off its public S3 bucket onto the
 *   Foursquare Places Portal's Iceberg catalog, which needs an account
 *   (docs.foursquare.com/data-products/docs/access-fsq-os-places, verified). This project has no
 *   such account, so `readFsqOsPlaces` reads a configured parquet export instead
 *   (`FSQ_OS_PLACES_PARQUET_URI`) and returns no rows when that is unset — Overture-only ingest,
 *   exactly the documented fallback — rather than fabricating POIs. The reader itself is fully
 *   implemented against FSQ's real documented schema (fsq_place_id, name, latitude, longitude,
 *   address, fsq_category_labels, date_closed) and tested against a small recorded-shape fixture.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  defaultVisitRadiusM,
  editorialOverlaySchema,
  parseOpeningHours,
  type EditorialOverlay,
  type PoiCuration,
} from '@cp/domain';
import { withSystem } from '@cp/db';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import type pg from 'pg';

import { conflatePlaces, type ConflatedPoi, type ConflationCandidate } from './conflate';

export interface BoundingBox {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
}

export interface PlaceSourceRow {
  readonly sourceId: string;
  readonly name: string;
  /** Raw source category labels/slugs, most-specific first. */
  readonly categoryLabels: readonly string[];
  readonly lat: number;
  readonly lng: number;
  readonly address?: string | undefined;
}

export type PlaceSourceReader = (bbox: BoundingBox) => Promise<readonly PlaceSourceRow[]>;

const DEFAULT_OVERTURE_RELEASE = '2026-09-23.1';
const OVERTURE_S3_REGION = 'us-west-2';
const OVERTURE_BUCKET = 'overturemaps-us-west-2';

function repoRootPath(...segments: string[]): string {
  // services/worker/src/places -> src -> worker -> services -> repo root (4 levels up).
  return path.resolve(fileURLToPath(import.meta.url), '../../../../..', ...segments);
}

const DUCKDB_TEMP_DIR = repoRootPath('node_modules/.cache/duckdb-places-tmp');

async function withDuckDb<T>(run: (connection: DuckDBConnection) => Promise<T>): Promise<T> {
  await mkdir(DUCKDB_TEMP_DIR, { recursive: true });
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  try {
    // Environment budget (shared host, 16 GB / 6 agents): never let one ingest run take more.
    await connection.run("SET memory_limit='1GB'");
    await connection.run('SET threads=2');
    await connection.run(`SET temp_directory='${DUCKDB_TEMP_DIR.replaceAll("'", "''")}'`);
    await connection.run('INSTALL httpfs');
    await connection.run('LOAD httpfs');
    return await run(connection);
  } finally {
    connection.closeSync();
  }
}

function bboxParams(bbox: BoundingBox): readonly number[] {
  return [bbox.minLng, bbox.maxLng, bbox.minLat, bbox.maxLat];
}

/** `getRowObjectsJson()` types every cell as the `Json` union; source id/name are always scalar. */
function asString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/**
 * Reads Overture places for a bbox from the public release bucket (no credentials needed). The
 * release version defaults to the latest confirmed available at the time this file was written
 * (`OVERTURE_RELEASE` env var overrides it for a later release without a code change).
 */
export const readOverturePlaces: PlaceSourceReader = async (bbox) => {
  const release = process.env['OVERTURE_RELEASE'] ?? DEFAULT_OVERTURE_RELEASE;
  return withDuckDb(async (connection) => {
    await connection.run(`SET s3_region='${OVERTURE_S3_REGION}'`);
    const uri = `s3://${OVERTURE_BUCKET}/release/${release}/theme=places/type=place/*`;
    const reader = await connection.runAndReadAll(
      `SELECT
         id,
         names.primary AS name,
         taxonomy.primary AS category,
         taxonomy.alternates AS alt_categories,
         bbox.xmin AS lng,
         bbox.ymin AS lat,
         addresses[1].freeform AS address
       FROM read_parquet('${uri.replaceAll("'", "''")}', hive_partitioning = 1)
       WHERE bbox.xmin BETWEEN $1 AND $2 AND bbox.ymin BETWEEN $3 AND $4 AND names.primary IS NOT NULL`,
      bboxParams(bbox) as unknown as number[],
    );
    return reader.getRowObjectsJson().map((row) => ({
      sourceId: asString(row['id']),
      name: asString(row['name']),
      categoryLabels: [
        ...(typeof row['category'] === 'string' ? [row['category']] : []),
        ...(Array.isArray(row['alt_categories']) ? (row['alt_categories'] as string[]) : []),
      ],
      lat: Number(row['lat']),
      lng: Number(row['lng']),
      address: typeof row['address'] === 'string' ? row['address'] : undefined,
    }));
  });
};

/**
 * Reads FSQ OS Places for a bbox from a configured parquet export (see file header: the Iceberg
 * catalog needs an account this project does not have). Returns no rows when unconfigured.
 */
export const readFsqOsPlaces: PlaceSourceReader = async (bbox) => {
  const parquetUri = process.env['FSQ_OS_PLACES_PARQUET_URI'];
  if (parquetUri === undefined || parquetUri.length === 0) return [];

  return withDuckDb(async (connection) => {
    if (parquetUri.startsWith('s3://'))
      await connection.run(`SET s3_region='${OVERTURE_S3_REGION}'`);
    const reader = await connection.runAndReadAll(
      `SELECT
         fsq_place_id AS id,
         name,
         fsq_category_labels AS category_labels,
         latitude AS lat,
         longitude AS lng,
         address
       FROM read_parquet('${parquetUri.replaceAll("'", "''")}')
       WHERE longitude BETWEEN $1 AND $2 AND latitude BETWEEN $3 AND $4
         AND name IS NOT NULL AND date_closed IS NULL`,
      bboxParams(bbox) as unknown as number[],
    );
    return reader.getRowObjectsJson().map((row) => ({
      sourceId: asString(row['id']),
      name: asString(row['name']),
      categoryLabels: Array.isArray(row['category_labels'])
        ? (row['category_labels'] as string[])
        : [],
      lat: Number(row['lat']),
      lng: Number(row['lng']),
      address: typeof row['address'] === 'string' ? row['address'] : undefined,
    }));
  });
};

function toCandidate(row: PlaceSourceRow): ConflationCandidate {
  return {
    sourceId: row.sourceId,
    name: row.name,
    categoryLabels: row.categoryLabels,
    lat: row.lat,
    lng: row.lng,
    address: row.address,
  };
}

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

async function findExistingPoiId(
  tx: pg.PoolClient,
  sourceIds: ConflatedPoi['sourceIds'],
): Promise<string | undefined> {
  const { rows } = await tx.query<{ id: string }>(
    `SELECT id FROM pois
     WHERE (source_ids ->> 'fsq_os' = $1) OR (source_ids ->> 'overture' = $2)
     LIMIT 1`,
    [sourceIds.fsq_os ?? null, sourceIds.overture ?? null],
  );
  return rows[0]?.id;
}

/**
 * Upserts one conflated POI. A rerun with the same source id(s) updates the existing row (idempotent:
 * no new id) rather than inserting a duplicate. Without an overlay this run, an existing row's
 * `editorial`/`hours`/`curation` are left untouched — a later run without editorial content must
 * never erase a previous editorial pass.
 */
async function upsertConflatedPoi(
  pool: pg.Pool,
  destinationId: string,
  timezone: string | undefined,
  poi: ConflatedPoi,
  overlay: EditorialOverlayInput | undefined,
): Promise<void> {
  const hasOverlay = overlay !== undefined;
  const editorial = editorialOverlaySchema.parse(overlay?.editorial ?? {});
  const tags = overlay?.tags ?? [];
  const hours =
    overlay?.hoursOsm !== undefined ? { weekly: parseOpeningHours(overlay.hoursOsm) } : {};
  const hoursVerifiedAt = overlay?.hoursVerifiedAt ?? null;
  const curation: PoiCuration = hasOverlay ? 'editorial' : 'auto';
  const visitRadiusM = defaultVisitRadiusM(poi.category);

  await withSystem(pool, async (tx) => {
    const existingId = await findExistingPoiId(tx, poi.sourceIds);

    if (existingId === undefined) {
      await tx.query(
        `INSERT INTO pois
           (destination_id, name, category, lat, lng, address, source_ids, editorial, tags,
            hours, hours_verified_at, curation, visit_radius_m, timezone)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10::jsonb, $11, $12, $13, $14)`,
        [
          destinationId,
          poi.name,
          poi.category,
          poi.lat,
          poi.lng,
          poi.address ?? null,
          JSON.stringify(poi.sourceIds),
          JSON.stringify(editorial),
          tags,
          JSON.stringify(hours),
          hoursVerifiedAt,
          curation,
          visitRadiusM,
          timezone ?? null,
        ],
      );
      return;
    }

    // Without an overlay this run, an existing row's editorial/tags/hours/curation are left exactly
    // as they were: a later plain re-ingest must never erase a previous editorial pass.
    await tx.query(
      `UPDATE pois SET
         name = $2, category = $3, lat = $4, lng = $5, address = $6, source_ids = $7::jsonb,
         editorial = CASE WHEN $8 THEN $9::jsonb ELSE editorial END,
         tags = CASE WHEN $8 THEN $10 ELSE tags END,
         hours = CASE WHEN $8 THEN $11::jsonb ELSE hours END,
         hours_verified_at = CASE WHEN $8 THEN $12 ELSE hours_verified_at END,
         curation = CASE WHEN $8 THEN $13 ELSE curation END
       WHERE id = $1`,
      [
        existingId,
        poi.name,
        poi.category,
        poi.lat,
        poi.lng,
        poi.address ?? null,
        JSON.stringify(poi.sourceIds),
        hasOverlay,
        JSON.stringify(editorial),
        tags,
        JSON.stringify(hours),
        hoursVerifiedAt,
        curation,
      ],
    );
  });
}

const SPARSE_COVERAGE_THRESHOLD = 50;

export interface IngestDestinationInput {
  readonly destinationId: string;
  readonly bbox: BoundingBox;
  readonly timezone?: string;
  /** Content-factory editorial overlays (that pipeline is not built yet), keyed by `editorialOverlayKey`. */
  readonly editorialBySourceKey?: ReadonlyMap<string, EditorialOverlayInput>;
}

export interface IngestSources {
  readonly readOverturePlaces?: PlaceSourceReader;
  readonly readFsqOsPlaces?: PlaceSourceReader;
}

export interface IngestDestinationResult {
  readonly upserted: number;
  readonly activeCount: number;
  /** True when the real FSQ OS Places source was used and returned nothing because it is gated. */
  readonly fsqOsGated: boolean;
  /** Triggers the "no curated places yet" UI state: fewer than 50 active POIs after this ingest. */
  readonly sparseCoverage: boolean;
}

/** Ingests one destination bbox: reads both sources, conflates, and upserts (see file header). */
export async function ingestDestination(
  pool: pg.Pool,
  input: IngestDestinationInput,
  sources: IngestSources = {},
): Promise<IngestDestinationResult> {
  const readOverture = sources.readOverturePlaces ?? readOverturePlaces;
  const readFsq = sources.readFsqOsPlaces ?? readFsqOsPlaces;
  const usingRealFsqReader = sources.readFsqOsPlaces === undefined;

  const [overtureRows, fsqRows] = await Promise.all([
    readOverture(input.bbox),
    readFsq(input.bbox),
  ]);
  const fsqOsGated =
    usingRealFsqReader &&
    fsqRows.length === 0 &&
    (process.env['FSQ_OS_PLACES_PARQUET_URI'] === undefined ||
      process.env['FSQ_OS_PLACES_PARQUET_URI'] === '');

  const conflated = conflatePlaces(fsqRows.map(toCandidate), overtureRows.map(toCandidate));

  for (const poi of conflated) {
    const overlay = input.editorialBySourceKey?.get(editorialOverlayKey(poi));
    // Sequential: each upsert is its own small transaction, and ingest runs monthly per destination,
    // not on a latency-sensitive path — a batched multi-row upsert would only add complexity here.
    await upsertConflatedPoi(pool, input.destinationId, input.timezone, poi, overlay);
  }

  const activeCount = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ count: string }>(
      "SELECT count(*) FROM pois WHERE destination_id = $1 AND status = 'active'",
      [input.destinationId],
    );
    return Number(rows[0]?.count ?? 0);
  });

  return {
    upserted: conflated.length,
    activeCount,
    fsqOsGated,
    sparseCoverage: activeCount < SPARSE_COVERAGE_THRESHOLD,
  };
}

export interface AttributionNoticeInput {
  readonly destinationSlug: string;
  readonly overtureRelease: string;
  readonly fsqOsIncluded: boolean;
  readonly generatedAt: Date;
}

/**
 * NOTICE text for one destination's ingest: Apache-2.0 requires FSQ OS Places attribution when
 * included; CDLA-P-2.0 requires crediting Overture regardless.
 */
export function generateAttributionNotice(input: AttributionNoticeInput): string {
  const lines = [
    `# Attribution: ${input.destinationSlug}`,
    '',
    `Generated ${input.generatedAt.toISOString()}.`,
    '',
    `- Map data (c) OpenStreetMap contributors and Overture Maps Foundation, release ${input.overtureRelease}, licensed under CDLA-Permissive-2.0 (https://cdla.dev/permissive-2-0/).`,
  ];
  if (input.fsqOsIncluded) {
    lines.push(
      '- Places data (c) Foursquare Labs, Inc., from FSQ OS Places, licensed under Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0). This product includes software developed by Foursquare Labs, Inc. (https://foursquare.com).',
    );
  }
  return `${lines.join('\n')}\n`;
}
