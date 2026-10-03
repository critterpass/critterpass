/**
 * One FSQ OS Places scan for many destinations. The Places Portal table (about 219M rows in 125
 * files) is not partitioned, so a bbox read touches all of it; reading it once per destination
 * would repeat that scan for every place. Instead one scan keeps the rows inside any destination's
 * box (an integer-degree grid join first, then the exact box) and writes one parquet directory per
 * destination (`<dir>/slug=<slug>/`), plus `manifest.json` naming every destination the export
 * covered. A destination in the manifest without a directory had no FSQ rows.
 *
 * The export keeps the columns `FSQ_OS_ROW_FILTER` tests, so reading an export applies the same
 * filters as reading the catalog.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  attachFsqCatalog,
  FSQ_ICEBERG_TABLE,
  FSQ_OS_COLUMNS,
  FSQ_OS_ROW_FILTER,
  readFsqOsRows,
  sqlString,
  withDuckDb,
  type BoundingBox,
  type PlaceSourceReader,
} from './source-readers';

export interface FsqExportTarget {
  readonly slug: string;
  readonly bbox: BoundingBox;
}

export interface FsqExportManifest {
  readonly exportedAt: string;
  readonly slugs: readonly string[];
}

const MANIFEST = 'manifest.json';
const SLUG_PATTERN = /^[a-z0-9-]+$/;

/**
 * Exports FSQ OS rows for every target box from `from` (defaults to the catalog, which needs
 * `FSQ_PLACES_PORTAL_TOKEN`) into `dir`, replacing what was there.
 */
export async function exportFsqOsForDestinations(
  targets: readonly FsqExportTarget[],
  dir: string,
  from?: string,
): Promise<FsqExportManifest> {
  for (const target of targets) {
    if (!SLUG_PATTERN.test(target.slug)) throw new Error(`unexpected slug ${target.slug}`);
  }
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  await withDuckDb(async (connection) => {
    let source = from;
    if (source === undefined) {
      await attachFsqCatalog(connection, process.env['FSQ_PLACES_PORTAL_TOKEN'] ?? '');
      source = FSQ_ICEBERG_TABLE;
    }
    await connection.run(
      'CREATE TEMP TABLE boxes (slug VARCHAR, min_lng DOUBLE, min_lat DOUBLE, max_lng DOUBLE, max_lat DOUBLE)',
    );
    for (const target of targets) {
      const { minLng, minLat, maxLng, maxLat } = target.bbox;
      await connection.run('INSERT INTO boxes VALUES ($1, $2, $3, $4, $5)', [
        target.slug,
        minLng,
        minLat,
        maxLng,
        maxLat,
      ]);
    }
    // Every integer-degree cell a box touches, so the scan joins on two integers before the exact
    // range test instead of testing every row against every box.
    await connection.run(
      `CREATE TEMP TABLE cells AS
       WITH ys AS (
         SELECT *, unnest(range(floor(min_lat)::BIGINT, floor(max_lat)::BIGINT + 1)) AS gy FROM boxes
       )
       SELECT *, unnest(range(floor(min_lng)::BIGINT, floor(max_lng)::BIGINT + 1)) AS gx FROM ys`,
    );
    await connection.run(
      `COPY (
         SELECT c.slug, p.*
         FROM (SELECT ${FSQ_OS_COLUMNS} FROM ${source} WHERE ${FSQ_OS_ROW_FILTER}) p
         JOIN cells c ON c.gy = floor(p.latitude)::BIGINT AND c.gx = floor(p.longitude)::BIGINT
         WHERE p.longitude BETWEEN c.min_lng AND c.max_lng
           AND p.latitude BETWEEN c.min_lat AND c.max_lat
       ) TO ${sqlString(dir)} (FORMAT parquet, PARTITION_BY (slug), OVERWRITE_OR_IGNORE)`,
    );
  });

  const manifest: FsqExportManifest = {
    exportedAt: new Date().toISOString(),
    slugs: targets.map((target) => target.slug),
  };
  await writeFile(path.join(dir, MANIFEST), JSON.stringify(manifest), 'utf8');
  return manifest;
}

/** The export's manifest, or null when `dir` holds no finished export. */
export async function readFsqExportManifest(dir: string): Promise<FsqExportManifest | null> {
  const file = path.join(dir, MANIFEST);
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, 'utf8')) as FsqExportManifest;
}

/**
 * A reader over one destination's slice of a finished export, or null when the export does not
 * cover `slug` (the caller then reads the catalog directly).
 */
export async function fsqExportReader(
  dir: string,
  slug: string,
): Promise<PlaceSourceReader | null> {
  const manifest = await readFsqExportManifest(dir);
  if (manifest === null || !manifest.slugs.includes(slug)) return null;
  const sliceDir = path.join(dir, `slug=${slug}`);
  if (!existsSync(sliceDir)) return () => Promise.resolve([]);
  return (bbox) =>
    withDuckDb((connection) =>
      readFsqOsRows(
        connection,
        `read_parquet(${sqlString(path.join(sliceDir, '*.parquet'))})`,
        bbox,
      ),
    );
}
