/**
 * Ingests many destinations from their `place_bounds` (`./place-bounds.ts`): FSQ OS is exported
 * once for all of them (`./fsq-export.ts`) when the Places Portal catalog is configured, then each
 * destination is ingested on its own, one after another, reading its slice of that export. Used by
 * the ingest CLI's `--all` mode; the monthly `places.ingest` job runs the same steps with one job
 * per destination.
 */
import path from 'node:path';

import type pg from 'pg';

import { exportFsqOsForDestinations, fsqExportReader } from './fsq-export';
import { fsqRunReader, releaseRunRows } from './fsq-export-runs';
import { ingestDestination, type IngestDestinationResult } from './ingest';
import { loadPlaceBounds, type DestinationPlaceBounds } from './place-bounds';
import { DUCKDB_TEMP_DIR, fsqOsSource, type PlaceSourceReader } from './source-readers';

/** Where a multi-destination run keeps its FSQ OS export by default. */
export const DEFAULT_FSQ_EXPORT_DIR = path.join(DUCKDB_TEMP_DIR, 'fsq-os-export');

export interface IngestTargetsOptions {
  /** Only these slugs; every destination with bounds when unset. */
  readonly slugs?: readonly string[];
  /** Slugs to leave out of this run. */
  readonly except?: readonly string[];
}

/** Destinations a run covers: those with place bounds, narrowed by `slugs` and `except`. */
export async function ingestTargets(
  pool: pg.Pool,
  options: IngestTargetsOptions,
): Promise<DestinationPlaceBounds[]> {
  const except = new Set(options.except ?? []);
  const targets = await loadPlaceBounds(pool, options.slugs);
  return targets.filter((target) => !except.has(target.slug));
}

/**
 * Exports FSQ OS once for `targets` when the catalog is configured; returns the export directory,
 * or undefined when the ingest reads FSQ OS some other way (parquet override) or not at all.
 */
export async function prepareFsqExport(
  targets: readonly DestinationPlaceBounds[],
  dir: string = DEFAULT_FSQ_EXPORT_DIR,
): Promise<string | undefined> {
  if (fsqOsSource() !== 'iceberg' || targets.length === 0) return undefined;
  await exportFsqOsForDestinations(
    targets.map((target) => ({ slug: target.slug, bbox: target.bbox })),
    dir,
  );
  return dir;
}

/** Where a destination's FSQ OS rows come from when a multi-destination run prepared them. */
export interface PreparedFsqSource {
  /** A local export directory (`./fsq-export.ts`, the CLI's `--all`). */
  readonly exportDir?: string | undefined;
  /** A stored export run (`./fsq-export-runs.ts`, the worker's monthly job). */
  readonly runId?: string | undefined;
}

/**
 * Ingests one destination, reading FSQ OS from what the run prepared. A local export can be gone
 * after a restart: the destination then reads the catalog itself. A stored run that a newer run
 * replaced yields no FSQ rows this time rather than a whole-catalog scan for one destination.
 */
export async function ingestPlaceDestination(
  pool: pg.Pool,
  target: DestinationPlaceBounds,
  fsq: PreparedFsqSource = {},
): Promise<IngestDestinationResult> {
  let readFsq: PlaceSourceReader | null = null;
  if (fsq.runId !== undefined) {
    readFsq = (await fsqRunReader(pool, fsq.runId, target.slug)) ?? (() => Promise.resolve([]));
  } else if (fsq.exportDir !== undefined) {
    readFsq = await fsqExportReader(fsq.exportDir, target.slug);
  }
  const result = await ingestDestination(
    pool,
    {
      destinationId: target.id,
      bbox: target.bbox,
      ...(target.tz !== null ? { timezone: target.tz } : {}),
    },
    readFsq === null ? {} : { readFsqOsPlaces: readFsq },
  );
  if (fsq.runId !== undefined) await releaseRunRows(pool, fsq.runId, target.slug);
  return result;
}

export interface IngestAllProgress {
  readonly slug: string;
  readonly result?: IngestDestinationResult;
  readonly error?: unknown;
}

/** Runs every target in turn; one destination failing never stops the rest. */
export async function ingestAllDestinations(
  pool: pg.Pool,
  options: IngestTargetsOptions & { readonly onProgress?: (progress: IngestAllProgress) => void },
): Promise<IngestAllProgress[]> {
  const targets = await ingestTargets(pool, options);
  const fsqExportDir = await prepareFsqExport(targets);
  const outcomes: IngestAllProgress[] = [];
  for (const target of targets) {
    let outcome: IngestAllProgress;
    try {
      outcome = {
        slug: target.slug,
        result: await ingestPlaceDestination(pool, target, { exportDir: fsqExportDir }),
      };
    } catch (error) {
      outcome = { slug: target.slug, error };
    }
    outcomes.push(outcome);
    options.onProgress?.(outcome);
  }
  return outcomes;
}
