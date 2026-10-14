/**
 * Ingests many destinations from their `place_bounds` (`./place-bounds.ts`), one after another,
 * from Overture and OpenStreetMap only (docs/product-decisions.md D38): FSQ OS is never read,
 * whatever the environment, and only lean Overture rows are written. Used by the ingest CLI's
 * `--all` mode; the monthly `places.ingest` job runs the same sources with one job per destination.
 */
import type pg from 'pg';

import { ingestDestination, type IngestDestinationResult } from './ingest';
import { loadPlaceBounds, type DestinationPlaceBounds } from './place-bounds';
import { readOsmPlaces } from './osm-reader';
import { isLeanOvertureRow, readOverturePlaces } from './source-readers';

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

/** Ingests one destination from lean Overture rows and OpenStreetMap; FSQ OS is never read. */
export async function ingestPlaceDestination(
  pool: pg.Pool,
  target: DestinationPlaceBounds,
): Promise<IngestDestinationResult> {
  return ingestDestination(
    pool,
    {
      destinationId: target.id,
      bbox: target.bbox,
      ...(target.tz !== null ? { timezone: target.tz } : {}),
    },
    {
      readOverturePlaces: async (bbox) =>
        (await readOverturePlaces(bbox)).filter(isLeanOvertureRow),
      readFsqOsPlaces: () => Promise.resolve([]),
      readOsmPlaces,
    },
  );
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
  const outcomes: IngestAllProgress[] = [];
  for (const target of targets) {
    let outcome: IngestAllProgress;
    try {
      outcome = {
        slug: target.slug,
        result: await ingestPlaceDestination(pool, target),
      };
    } catch (error) {
      outcome = { slug: target.slug, error };
    }
    outcomes.push(outcome);
    options.onProgress?.(outcome);
  }
  return outcomes;
}
