/**
 * FSQ OS Places export that survives worker restarts, for the monthly multi-destination ingest.
 *
 * The Places Portal table (`fsq.datasets.places_os`, about 219M rows in 125 data files) is not
 * partitioned, so any bbox read scans all of it, and one whole-table scan from the worker outlives
 * the deploys between it and the end. A run instead lists the table's data files and splits them
 * into chunks; each chunk job reads only its files (DuckDB prunes the scan on `filename`), keeps the
 * rows inside any target destination's box, and writes them with its progress row in one
 * transaction (`fsq_os_export_rows`, `fsq_os_export_chunks`). A restart costs one chunk. When the
 * last chunk lands, `completeChunk` reports the run ready exactly once and the caller queues one
 * ingest per destination; each reads its rows (`fsqRunReader`) and deletes them once ingested. A new
 * run deletes older ones.
 */
import { withSystem } from '@cp/db';
import type { DuckDBConnection } from '@duckdb/node-api';
import type pg from 'pg';

import { chunk } from './batch-sql';
import {
  attachFsqCatalog,
  FSQ_ICEBERG_TABLE,
  FSQ_OS_ROW_FILTER,
  optionalText,
  sqlString,
  withDuckDb,
  withoutNul,
  type BoundingBox,
  type PlaceSourceReader,
  type PlaceSourceRow,
} from './source-readers';

export interface FsqRunTarget extends BoundingBox {
  readonly slug: string;
}

/** Data files per chunk job: about 25M rows scanned, a few minutes from the worker. */
export const FILES_PER_CHUNK = 5;
const INSERT_BATCH = 2_000;

/** The catalog table's current data files, in a stable order. */
export async function listFsqDataFiles(): Promise<string[]> {
  return withDuckDb(async (connection) => {
    await attachFsqCatalog(connection, process.env['FSQ_PLACES_PORTAL_TOKEN'] ?? '');
    const reader = await connection.runAndReadAll(
      `SELECT DISTINCT file_path FROM iceberg_metadata(${FSQ_ICEBERG_TABLE})
       WHERE manifest_content = 'DATA' ORDER BY file_path`,
    );
    return reader.getRowObjectsJson().map((row) => String(row['file_path'] as string));
  });
}

/** Creates a run over `files` for `targets` and deletes every older run; returns the run id and chunk count. */
export async function startFsqExportRun(
  pool: pg.Pool,
  targets: readonly FsqRunTarget[],
  files: readonly string[],
): Promise<{ readonly runId: string; readonly chunks: number }> {
  const groups = chunk(files, FILES_PER_CHUNK);
  return withSystem(pool, async (tx) => {
    await tx.query('DELETE FROM fsq_os_export_runs');
    const { rows } = await tx.query<{ id: string }>(
      'INSERT INTO fsq_os_export_runs (targets, chunk_count) VALUES ($1, $2) RETURNING id',
      [JSON.stringify(targets), groups.length],
    );
    const runId = rows[0]?.id;
    if (runId === undefined) throw new Error('fsq export run was not created');
    for (const [index, group] of groups.entries()) {
      await tx.query(
        'INSERT INTO fsq_os_export_chunks (run_id, chunk, files) VALUES ($1, $2, $3)',
        [runId, index, group],
      );
    }
    return { runId, chunks: groups.length };
  });
}

interface ChunkWork {
  readonly targets: readonly FsqRunTarget[];
  readonly files: readonly string[];
  readonly done: boolean;
}

async function loadChunk(pool: pg.Pool, runId: string, index: number): Promise<ChunkWork | null> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ targets: FsqRunTarget[]; files: string[]; done: boolean }>(
      `SELECT r.targets, c.files, c.done_at IS NOT NULL AS done
       FROM fsq_os_export_chunks c JOIN fsq_os_export_runs r ON r.id = c.run_id
       WHERE c.run_id = $1 AND c.chunk = $2`,
      [runId, index],
    ),
  );
  const row = rows[0];
  return row === undefined ? null : { targets: row.targets, files: row.files, done: row.done };
}

export type ExportedRow = PlaceSourceRow & { readonly slug: string };

/**
 * Reads the rows of `from` (restricted to `files` when given) inside any target box, tagged with
 * the destination slug. A place inside two boxes is kept once per destination.
 */
export async function readRowsForTargets(
  connection: DuckDBConnection,
  from: string,
  targets: readonly FsqRunTarget[],
  files?: readonly string[],
): Promise<ExportedRow[]> {
  if (targets.length === 0) return [];
  const boxes = targets
    .map((t) => `(${sqlString(t.slug)}, ${t.minLng}, ${t.minLat}, ${t.maxLng}, ${t.maxLat})`)
    .join(', ');
  const fileFilter =
    files === undefined ? '' : `AND filename IN (${files.map(sqlString).join(', ')})`;
  const reader = await connection.runAndReadAll(
    `WITH boxes(slug, min_lng, min_lat, max_lng, max_lat) AS (VALUES ${boxes}),
     p AS (
       SELECT fsq_place_id, name, fsq_category_labels, latitude, longitude, address, website, tel
       FROM ${from}
       WHERE ${FSQ_OS_ROW_FILTER} ${fileFilter}
     )
     SELECT b.slug, p.fsq_place_id AS id, p.name, p.fsq_category_labels AS category_labels,
            p.latitude AS lat, p.longitude AS lng, p.address, p.website, p.tel AS phone
     FROM p JOIN boxes b
       ON p.longitude BETWEEN b.min_lng AND b.max_lng AND p.latitude BETWEEN b.min_lat AND b.max_lat`,
  );
  return reader.getRowObjectsJson().map((row) => ({
    slug: String(row['slug'] as string),
    sourceId: withoutNul(String(row['id'] as string)),
    name: withoutNul(String(row['name'] as string)),
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
 * Exports one chunk (see file header) unless it already landed. `from` overrides the catalog
 * table (tests read a local parquet). Returns the rows written, or null when the chunk was done.
 */
export async function exportFsqChunk(
  pool: pg.Pool,
  runId: string,
  index: number,
  from?: string,
): Promise<number | null> {
  const work = await loadChunk(pool, runId, index);
  if (work === null) throw new Error(`fsq export run ${runId} has no chunk ${index}`);
  if (work.done) return null;

  const rows = await withDuckDb(async (connection) => {
    if (from !== undefined) return readRowsForTargets(connection, from, work.targets);
    await attachFsqCatalog(connection, process.env['FSQ_PLACES_PORTAL_TOKEN'] ?? '');
    return readRowsForTargets(connection, FSQ_ICEBERG_TABLE, work.targets, work.files);
  });

  await withSystem(pool, async (tx) => {
    for (const batch of chunk(rows, INSERT_BATCH)) {
      await tx.query(
        `INSERT INTO fsq_os_export_rows
           (run_id, slug, fsq_place_id, name, category_labels, lat, lng, address, website, phone)
         SELECT $1, r.slug, r.id, r.name,
                ARRAY(SELECT jsonb_array_elements_text(r.labels)), r.lat, r.lng, r.address, r.website, r.phone
         FROM jsonb_to_recordset($2::jsonb)
           AS r(slug text, id text, name text, labels jsonb, lat double precision, lng double precision,
                address text, website text, phone text)
         ON CONFLICT DO NOTHING`,
        [
          runId,
          JSON.stringify(
            batch.map((row) => ({
              slug: row.slug,
              id: row.sourceId,
              name: row.name,
              labels: row.categoryLabels,
              lat: row.lat,
              lng: row.lng,
              address: row.address ?? null,
              website: row.website ?? null,
              phone: row.phone ?? null,
            })),
          ),
        ],
      );
    }
    await tx.query(
      `UPDATE fsq_os_export_chunks SET done_at = now(), row_count = $3
       WHERE run_id = $1 AND chunk = $2`,
      [runId, index, rows.length],
    );
  });
  return rows.length;
}

/**
 * Marks the run fanned out when every chunk has landed; true exactly once per run, so only one
 * caller queues the destination ingests.
 */
export async function claimFanOut(pool: pg.Pool, runId: string): Promise<boolean> {
  const { rowCount } = await withSystem(pool, (tx) =>
    tx.query(
      `UPDATE fsq_os_export_runs r SET fanned_out_at = now()
       WHERE r.id = $1 AND r.fanned_out_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM fsq_os_export_chunks c WHERE c.run_id = r.id AND c.done_at IS NULL)`,
      [runId],
    ),
  );
  return (rowCount ?? 0) > 0;
}

/** The destinations a run covers. */
export async function runSlugs(pool: pg.Pool, runId: string): Promise<string[]> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ slug: string }>(
      "SELECT t ->> 'slug' AS slug FROM fsq_os_export_runs, jsonb_array_elements(targets) t WHERE id = $1",
      [runId],
    ),
  );
  return rows.map((row) => row.slug);
}

/** A reader over a destination's rows in a run, or null when the run no longer exists. */
export async function fsqRunReader(
  pool: pg.Pool,
  runId: string,
  slug: string,
): Promise<PlaceSourceReader | null> {
  const { rows: runs } = await withSystem(pool, (tx) =>
    tx.query('SELECT 1 FROM fsq_os_export_runs WHERE id = $1', [runId]),
  );
  if (runs.length === 0) return null;
  return async (bbox) => {
    const { rows } = await withSystem(pool, (tx) =>
      tx.query<{
        fsq_place_id: string;
        name: string;
        category_labels: string[];
        lat: number;
        lng: number;
        address: string | null;
        website: string | null;
        phone: string | null;
      }>(
        `SELECT fsq_place_id, name, category_labels, lat, lng, address, website, phone
         FROM fsq_os_export_rows
         WHERE run_id = $1 AND slug = $2 AND lng BETWEEN $3 AND $4 AND lat BETWEEN $5 AND $6`,
        [runId, slug, bbox.minLng, bbox.maxLng, bbox.minLat, bbox.maxLat],
      ),
    );
    return rows.map((row) => ({
      sourceId: row.fsq_place_id,
      name: row.name,
      categoryLabels: row.category_labels,
      lat: row.lat,
      lng: row.lng,
      address: row.address ?? undefined,
      website: row.website ?? undefined,
      phone: row.phone ?? undefined,
    }));
  };
}

/** Deletes a destination's rows from a run once it has been ingested. */
export async function releaseRunRows(pool: pg.Pool, runId: string, slug: string): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query('DELETE FROM fsq_os_export_rows WHERE run_id = $1 AND slug = $2', [runId, slug]),
  );
}
