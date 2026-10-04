/**
 * One destination's ingest as a run of tile jobs (`src/jobs/places/ingest-tile.ts`): the plan
 * (`planDestinationTiles`, tiles from `./ingest-tiles.ts`), one Overture and FSQ OS pass per tile
 * (`ingestTile`), and the destination-wide finish (`finishDestinationRun`): OpenStreetMap, the
 * stored FSQ rows released, the active count.
 *
 * A tile reads its sources over its read box, conflates them exactly as a whole-box ingest would
 * (candidates in source id order, so two overlapping views pair the same rows), and upserts only
 * the places whose point lies inside the tile: a place on a tile edge is written once, by the tile
 * that owns its point, and a pair split by the edge is conflated in both views but written by one.
 * Upserts stay keyed by source id with the owned-elsewhere rule (`./ingest-upsert.ts`).
 *
 * OpenStreetMap runs once, after every tile: it links its elements to the POIs within 60 m, so a
 * sight next to a tile edge must find its neighbour tile's POIs already written, and the extract
 * is downloaded and scanned once per run instead of once per tile.
 */
import { withSystem } from '@cp/db';
import type pg from 'pg';

import { conflatePlaces } from './conflate';
import { fsqRunReader, releaseRunRows } from './fsq-export-runs';
import {
  countActivePois,
  SPARSE_COVERAGE_THRESHOLD,
  toCandidate,
  uniqueBySourceId,
  upsertConflated,
  type UpsertCounts,
} from './ingest';
import {
  DENSITY_GRID,
  inTile,
  MAX_TILE_FSQ_ROWS,
  planTiles,
  readBox,
  singleTile,
  type DensityGrid,
  type IngestTile,
} from './ingest-tiles';
import { applyOsmPlaces, type OsmApplyResult } from './osm-apply';
import type { OsmExtractListener } from './osm-extract';
import { readOsmPlaces, type OsmPlaceRow } from './osm-reader';
import type { DestinationPlaceBounds } from './place-bounds';
import {
  readFsqOsPlaces,
  readOverturePlaces,
  type BoundingBox,
  type PlaceSourceReader,
  type PlaceSourceRow,
} from './source-readers';

/** Source overrides for tests; each defaults to the real reader. */
export interface TileRunSources {
  readonly readOverturePlaces?: PlaceSourceReader;
  /** Replaces FSQ OS entirely; otherwise a run reads its stored export rows. */
  readonly readFsqOsPlaces?: PlaceSourceReader;
  /** Defaults to the Geofabrik reader only when Overture is also read for real. */
  readonly readOsmPlaces?: (
    bbox: BoundingBox,
    onExtract?: OsmExtractListener,
  ) => Promise<readonly OsmPlaceRow[]>;
}

/** Hears each step of a tile or finish as it starts and ends, so a stalled job shows its step. */
export type TileProgress = (step: string, details: Readonly<Record<string, unknown>>) => void;

/** Runs one step between a start and an end progress line; the end line carries its duration. */
async function step<T>(
  progress: TileProgress | undefined,
  name: string,
  run: () => Promise<T>,
  summary: (result: T) => Record<string, unknown> = () => ({}),
): Promise<T> {
  progress?.(name, { phase: 'start' });
  const started = Date.now();
  const result = await run();
  progress?.(name, { phase: 'done', ms: Date.now() - started, ...summary(result) });
  return result;
}

/**
 * FSQ OS rows per density cell of the destination's box in a stored export run; null when the run
 * no longer exists.
 */
export async function loadFsqDensity(
  pool: pg.Pool,
  fsqRunId: string,
  target: DestinationPlaceBounds,
): Promise<DensityGrid | null> {
  const { bbox } = target;
  const n = DENSITY_GRID;
  const cellLng = (bbox.maxLng - bbox.minLng) / n || 1;
  const cellLat = (bbox.maxLat - bbox.minLat) / n || 1;
  return withSystem(pool, async (tx) => {
    const run = await tx.query('SELECT 1 FROM fsq_os_export_runs WHERE id = $1', [fsqRunId]);
    if (run.rows.length === 0) return null;
    const { rows } = await tx.query<{ x: number; y: number; n: number }>(
      `SELECT least(greatest(floor((lng - $3) / $4), 0), $7 - 1)::int AS x,
              least(greatest(floor((lat - $5) / $6), 0), $7 - 1)::int AS y,
              count(*)::int AS n
       FROM fsq_os_export_rows WHERE run_id = $1 AND slug = $2
       GROUP BY 1, 2`,
      [fsqRunId, target.slug, bbox.minLng, cellLng, bbox.minLat, cellLat, n],
    );
    const grid = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
    for (const row of rows) {
      const line = grid[row.y];
      if (line !== undefined) line[row.x] = row.n;
    }
    return grid;
  });
}

/**
 * The run's tiles. Only a run that reads FSQ OS from a stored export is split: without one, every
 * tile would scan the whole FSQ OS catalog again, so the destination stays one tile.
 */
export async function planDestinationTiles(
  pool: pg.Pool,
  target: DestinationPlaceBounds,
  fsqRunId: string | undefined,
  maxTileFsqRows: number = MAX_TILE_FSQ_ROWS,
): Promise<IngestTile[]> {
  const grid = fsqRunId === undefined ? null : await loadFsqDensity(pool, fsqRunId, target);
  return grid === null ? [singleTile(target.bbox)] : planTiles(target.bbox, grid, maxTileFsqRows);
}

export interface TileResult extends UpsertCounts {
  /** Source rows whose point lies in the tile. */
  readonly overtureRows: number;
  readonly fsqOsRows: number;
}

function bySourceId(a: PlaceSourceRow, b: PlaceSourceRow): number {
  return a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0;
}

/** Ingests Overture and FSQ OS for one tile (see file header). */
export async function ingestTile(
  pool: pg.Pool,
  target: DestinationPlaceBounds,
  tile: IngestTile,
  fsqRunId: string | undefined,
  sources: TileRunSources = {},
  progress?: TileProgress,
): Promise<TileResult> {
  const box = readBox(tile, target.bbox);
  const readOverture = sources.readOverturePlaces ?? readOverturePlaces;
  let readFsq = sources.readFsqOsPlaces ?? readFsqOsPlaces;
  if (sources.readFsqOsPlaces === undefined && fsqRunId !== undefined) {
    // A run a newer export replaced yields no FSQ rows rather than a whole-catalog scan.
    readFsq = (await fsqRunReader(pool, fsqRunId, target.slug)) ?? (() => Promise.resolve([]));
  }
  // One source at a time: each read holds its own DuckDB instance and memory budget.
  const rows = (list: readonly PlaceSourceRow[]) => ({ rows: list.length });
  const overture = uniqueBySourceId(
    await step(progress, 'overture read', () => readOverture(box), rows),
  ).sort(bySourceId);
  const fsq = uniqueBySourceId(await step(progress, 'fsq read', () => readFsq(box), rows)).sort(
    bySourceId,
  );

  const conflated = conflatePlaces(fsq.map(toCandidate), overture.map(toCandidate)).filter((poi) =>
    inTile(tile, poi.lat, poi.lng),
  );
  const counts = await step(
    progress,
    'upsert',
    () =>
      upsertConflated(
        pool,
        {
          destinationId: target.id,
          bbox: target.bbox,
          ...(target.tz !== null ? { timezone: target.tz } : {}),
        },
        conflated,
      ),
    (result) => ({ ...result }),
  );
  const inside = (row: PlaceSourceRow) => inTile(tile, row.lat, row.lng);
  return {
    overtureRows: overture.filter(inside).length,
    fsqOsRows: fsq.filter(inside).length,
    ...counts,
  };
}

export interface FinishResult {
  /** What OpenStreetMap added and filled; null when it was not read. */
  readonly osm: OsmApplyResult | null;
  readonly activeCount: number;
  readonly sparseCoverage: boolean;
}

/**
 * Finishes a run once every tile is done: applies OpenStreetMap over the whole box, deletes the
 * destination's stored FSQ rows when `releaseFsqRows` (a run with a failed tile keeps them for the
 * rerun), and counts the active POIs.
 */
export async function finishDestinationRun(
  pool: pg.Pool,
  target: DestinationPlaceBounds,
  options: { readonly fsqRunId: string | undefined; readonly releaseFsqRows: boolean },
  sources: TileRunSources = {},
  progress?: TileProgress,
): Promise<FinishResult> {
  const readOsm =
    sources.readOsmPlaces ?? (sources.readOverturePlaces === undefined ? readOsmPlaces : undefined);
  let osm: OsmApplyResult | null = null;
  if (readOsm !== undefined) {
    const places = await step(
      progress,
      'osm read',
      () => readOsm(target.bbox, (event) => progress?.(`osm extract ${event.step}`, { ...event })),
      (list) => ({ rows: list.length }),
    );
    osm = await step(
      progress,
      'osm apply',
      () => applyOsmPlaces(pool, target.id, target.tz, places),
      (result) => ({ ...result }),
    );
  }
  const { fsqRunId } = options;
  if (fsqRunId !== undefined && options.releaseFsqRows) {
    await step(progress, 'fsq release', () => releaseRunRows(pool, fsqRunId, target.slug));
  }
  const activeCount = await step(progress, 'active count', () => countActivePois(pool, target.id));
  return { osm, activeCount, sparseCoverage: activeCount < SPARSE_COVERAGE_THRESHOLD };
}
