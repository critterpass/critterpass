/**
 * Open-data place readers for the POI ingest (`./ingest.ts`), one DuckDB instance per read with the
 * memory and thread budget capped.
 *
 * Overture places (CDLA-P-2.0) come from the public release bucket
 * `s3://overturemaps-us-west-2/release/<release>/theme=places/type=place/` through `httpfs`, with bbox
 * predicate pushdown (`bbox.xmin/ymin` are exact for a point). Fields read, checked with `DESCRIBE`
 * on release 2026-09-23.1: `id`, `names.primary`, `taxonomy.primary/alternates`,
 * `addresses[1].freeform`, `confidence` (DOUBLE in [0, 1]), `websites`, `phones` (VARCHAR[]),
 * `brand.names.primary` and `operating_status` (`open`, `temporarily_closed`, `permanently_closed`
 * or null). A permanently closed place is skipped. List columns need `getRowObjectsJson()`: the raw
 * `getRowObjects()` list wrapper stringifies as `{"items": [...]}`.
 *
 * FSQ OS Places (Apache-2.0, NOTICE attribution) live in the Foursquare Places Portal Iceberg
 * catalog (`fsq.datasets.places_os`), which needs `FSQ_PLACES_PORTAL_TOKEN`. Without the token a
 * parquet export with the same columns (`FSQ_OS_PLACES_PARQUET_URI`) is read instead, and with
 * neither the ingest is Overture-only. Both paths apply Foursquare's recommended filters: not
 * closed, no unresolved flags, refreshed within 365 days.
 */
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';

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
  /** Overture's existence score in [0, 1]; FSQ OS has none. */
  readonly confidence?: number | undefined;
  readonly website?: string | undefined;
  readonly phone?: string | undefined;
  readonly brand?: string | undefined;
}

export type PlaceSourceReader = (bbox: BoundingBox) => Promise<readonly PlaceSourceRow[]>;

export const DEFAULT_OVERTURE_RELEASE = '2026-09-23.1';
export const OVERTURE_S3_REGION = 'us-west-2';
export const OVERTURE_BUCKET = 'overturemaps-us-west-2';
export const FSQ_ICEBERG_ENDPOINT = 'https://catalog.h3-hub.foursquare.com/iceberg';
export const FSQ_ICEBERG_TABLE = 'fsq.datasets.places_os';

function repoRootPath(...segments: string[]): string {
  // services/worker/src/places -> src -> worker -> services -> repo root (4 levels up).
  return path.resolve(fileURLToPath(import.meta.url), '../../../../..', ...segments);
}

/**
 * DuckDB spill and export space: the git-ignored cache in a source checkout (the CLI), the system
 * temp dir in the bundled worker image.
 */
export const DUCKDB_TEMP_DIR = existsSync(repoRootPath('pnpm-workspace.yaml'))
  ? repoRootPath('node_modules/.cache/duckdb-places-tmp')
  : path.join(tmpdir(), 'cp-places-ingest');

export function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export async function withDuckDb<T>(run: (connection: DuckDBConnection) => Promise<T>): Promise<T> {
  await mkdir(DUCKDB_TEMP_DIR, { recursive: true });
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  try {
    // Shared host budget: one ingest read never takes more than this.
    await connection.run("SET memory_limit='1GB'");
    await connection.run('SET threads=2');
    await connection.run(`SET temp_directory=${sqlString(DUCKDB_TEMP_DIR)}`);
    await connection.run('INSTALL httpfs');
    await connection.run('LOAD httpfs');
    return await run(connection);
  } finally {
    connection.closeSync();
  }
}

function bboxParams(bbox: BoundingBox): number[] {
  return [bbox.minLng, bbox.maxLng, bbox.minLat, bbox.maxLat];
}

/** `getRowObjectsJson()` types every cell as the `Json` union; source id/name are always scalar. */
/** Open data holds the odd NUL character, which Postgres text cannot store. */
export function withoutNul(value: string): string {
  return value.includes('\u0000') ? value.replaceAll('\u0000', '') : value;
}

function asString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? withoutNul(String(value)) : '';
}

export function optionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = withoutNul(value).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Overture places for a bbox. `OVERTURE_RELEASE` overrides the default release without a code
 * change.
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
         addresses[1].freeform AS address,
         confidence,
         websites[1] AS website,
         phones[1] AS phone,
         brand.names.primary AS brand
       FROM read_parquet(${sqlString(uri)}, hive_partitioning = 1)
       WHERE bbox.xmin BETWEEN $1 AND $2 AND bbox.ymin BETWEEN $3 AND $4
         AND names.primary IS NOT NULL
         AND operating_status IS DISTINCT FROM 'permanently_closed'`,
      bboxParams(bbox),
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
      address: optionalText(row['address']),
      confidence: optionalNumber(row['confidence']),
      website: optionalText(row['website']),
      phone: optionalText(row['phone']),
      brand: optionalText(row['brand']),
    }));
  });
};

/** Which FSQ OS source an ingest would read right now. */
export type FsqOsSource = 'iceberg' | 'parquet' | 'none';

export function fsqOsSource(env: NodeJS.ProcessEnv = process.env): FsqOsSource {
  if ((env['FSQ_PLACES_PORTAL_TOKEN'] ?? '').length > 0) return 'iceberg';
  if ((env['FSQ_OS_PLACES_PARQUET_URI'] ?? '').length > 0) return 'parquet';
  return 'none';
}

export async function attachFsqCatalog(connection: DuckDBConnection, token: string): Promise<void> {
  await connection.run('INSTALL iceberg');
  await connection.run('LOAD iceberg');
  await connection.run(`CREATE SECRET fsq (TYPE iceberg, TOKEN ${sqlString(token)})`);
  await connection.run(
    `ATTACH 'places' AS fsq (TYPE iceberg, SECRET fsq, ENDPOINT ${sqlString(FSQ_ICEBERG_ENDPOINT)})`,
  );
}

/** Foursquare's recommended filters: not closed, no unresolved flags, refreshed within a year. */
export const FSQ_OS_ROW_FILTER = `name IS NOT NULL
  AND date_closed IS NULL
  AND coalesce(len(unresolved_flags), 0) = 0
  AND TRY_CAST(date_refreshed AS DATE) >= current_date - INTERVAL 365 DAY`;

/** The FSQ OS columns the ingest reads, plus the ones `FSQ_OS_ROW_FILTER` tests. */
export const FSQ_OS_COLUMNS = `fsq_place_id, name, fsq_category_labels, latitude, longitude, address,
  website, tel, date_closed, unresolved_flags, date_refreshed`;

/** Reads FSQ OS rows for a bbox from `from` (the catalog table or a `read_parquet(...)` call). */
export async function readFsqOsRows(
  connection: DuckDBConnection,
  from: string,
  bbox: BoundingBox,
): Promise<PlaceSourceRow[]> {
  const reader = await connection.runAndReadAll(
    `SELECT fsq_place_id AS id, name, fsq_category_labels AS category_labels, latitude AS lat,
            longitude AS lng, address, website, tel AS phone
     FROM ${from}
     WHERE longitude BETWEEN $1 AND $2 AND latitude BETWEEN $3 AND $4 AND ${FSQ_OS_ROW_FILTER}`,
    bboxParams(bbox),
  );
  return reader.getRowObjectsJson().map((row) => ({
    sourceId: asString(row['id']),
    name: asString(row['name']),
    categoryLabels: Array.isArray(row['category_labels'])
      ? (row['category_labels'] as string[])
      : [],
    lat: Number(row['lat']),
    lng: Number(row['lng']),
    address: optionalText(row['address']),
    website: optionalText(row['website']),
    phone: optionalText(row['phone']),
  }));
}

/**
 * FSQ OS Places for a bbox: the Places Portal Iceberg catalog when `FSQ_PLACES_PORTAL_TOKEN` is set,
 * else a parquet export at `FSQ_OS_PLACES_PARQUET_URI`, else no rows (Overture-only ingest). The
 * catalog table is not partitioned, so every read scans all of it: an ingest of many destinations
 * exports once for all of them (`./fsq-export.ts`) and reads those files instead.
 */
export const readFsqOsPlaces: PlaceSourceReader = async (bbox) => {
  const source = fsqOsSource();
  if (source === 'none') return [];

  return withDuckDb(async (connection) => {
    if (source === 'iceberg') {
      await attachFsqCatalog(connection, process.env['FSQ_PLACES_PORTAL_TOKEN'] ?? '');
      return readFsqOsRows(connection, FSQ_ICEBERG_TABLE, bbox);
    }
    const parquetUri = process.env['FSQ_OS_PLACES_PARQUET_URI'] ?? '';
    if (parquetUri.startsWith('s3://'))
      await connection.run(`SET s3_region='${OVERTURE_S3_REGION}'`);
    return readFsqOsRows(connection, `read_parquet(${sqlString(parquetUri)})`, bbox);
  });
};
