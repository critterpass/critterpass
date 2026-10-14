/**
 * One destination's ingest as a run of tile jobs (`src/jobs/places/ingest-tile.ts`): one Overture
 * pass per tile (`ingestTile`) and the destination-wide finish (`finishDestinationRun`):
 * OpenStreetMap and the active count. Places come from Overture and OpenStreetMap only
 * (docs/product-decisions.md D38): FSQ OS is never read, whatever the environment.
 *
 * A tile reads Overture over its read box, keeps the lean rows (`isLeanOvertureRow`), and upserts
 * only the places whose point lies inside the tile: a place on a tile edge is written once, by the
 * tile that owns its point. Upserts stay keyed by source id with the owned-elsewhere rule
 * (`./ingest-upsert.ts`).
 *
 * OpenStreetMap runs once, after every tile: it links its elements to the POIs within 60 m, so a
 * sight next to a tile edge must find its neighbour tile's POIs already written, and the extract
 * is downloaded and scanned once per run instead of once per tile.
 */
import type pg from 'pg';

import { conflatePlaces } from './conflate';
import {
  countActivePois,
  SPARSE_COVERAGE_THRESHOLD,
  toCandidate,
  uniqueBySourceId,
  upsertConflated,
  type UpsertCounts,
} from './ingest';
import { inTile, readBox, singleTile, type IngestTile } from './ingest-tiles';
import { applyOsmPlaces, type OsmApplyResult } from './osm-apply';
import type { OsmExtractListener } from './osm-extract';
import { readOsmPlaces, type OsmPlaceRow } from './osm-reader';
import type { DestinationPlaceBounds } from './place-bounds';
import {
  isLeanOvertureRow,
  readOverturePlaces,
  type BoundingBox,
  type PlaceSourceReader,
  type PlaceSourceRow,
} from './source-readers';

/** Source overrides for tests; each defaults to the real reader. */
export interface TileRunSources {
  readonly readOverturePlaces?: PlaceSourceReader;
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

/** The run's tiles: the destination's whole box, read once. */
export function planDestinationTiles(target: DestinationPlaceBounds): IngestTile[] {
  return [singleTile(target.bbox)];
}

export interface TileResult extends UpsertCounts {
  /** Source rows whose point lies in the tile. */
  readonly overtureRows: number;
}

function bySourceId(a: PlaceSourceRow, b: PlaceSourceRow): number {
  return a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0;
}

/** Ingests Overture for one tile (see file header). */
export async function ingestTile(
  pool: pg.Pool,
  target: DestinationPlaceBounds,
  tile: IngestTile,
  sources: TileRunSources = {},
  progress?: TileProgress,
): Promise<TileResult> {
  const box = readBox(tile, target.bbox);
  const readOverture = sources.readOverturePlaces ?? readOverturePlaces;
  const rows = (list: readonly PlaceSourceRow[]) => ({ rows: list.length });
  // Only lean rows are written; a stored row that no longer passes is left for the prune.
  const overture = uniqueBySourceId(
    await step(progress, 'overture read', () => readOverture(box), rows),
  )
    .filter(isLeanOvertureRow)
    .sort(bySourceId);

  const conflated = conflatePlaces([], overture.map(toCandidate)).filter((poi) =>
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
    ...counts,
  };
}

export interface FinishResult {
  /** What OpenStreetMap added and filled; null when it was not read. */
  readonly osm: OsmApplyResult | null;
  readonly activeCount: number;
  readonly sparseCoverage: boolean;
}

/** Finishes a run once every tile is done: applies OpenStreetMap over the whole box and counts the active POIs. */
export async function finishDestinationRun(
  pool: pg.Pool,
  target: DestinationPlaceBounds,
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
  const activeCount = await step(progress, 'active count', () => countActivePois(pool, target.id));
  return { osm, activeCount, sparseCoverage: activeCount < SPARSE_COVERAGE_THRESHOLD };
}
