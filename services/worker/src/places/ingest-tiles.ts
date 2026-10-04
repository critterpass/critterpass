/**
 * Splits a destination's place box into ingest tiles, so a metro is ingested as a run of short
 * jobs (`./ingest-tile-run.ts`) rather than one job that outlives the deploys between its start and
 * its end.
 *
 * Tiles follow where the places are, not a fixed grid: the box is cut into `DENSITY_GRID` x
 * `DENSITY_GRID` cells weighted by the destination's stored FSQ OS rows, and a rectangle of cells
 * is halved (at its weighted median, across its longer side) until each holds at most
 * `MAX_TILE_FSQ_ROWS`. Sea and countryside stay a few large tiles; a city centre becomes many
 * small ones. A destination under the limit is a single tile.
 *
 * Tiles partition the box: each covers `[min, max)` on both axes, closed on the box's own outer
 * edge, so every point belongs to exactly one tile (`inTile`). Neighbouring tiles compute a shared
 * edge from the same cell index, so they agree on it to the last bit. A tile reads its sources
 * over a slightly larger box (`readBox`) so a place and its other-source twin across the edge are
 * conflated together, and keeps only the places whose point lies inside the tile.
 */
import type { BoundingBox } from './source-readers';

export interface IngestTile extends BoundingBox {
  /** True when the tile's top edge is the box's: points on it belong to this tile. */
  readonly closedMaxLat: boolean;
  /** True when the tile's right edge is the box's: points on it belong to this tile. */
  readonly closedMaxLng: boolean;
}

/** Cells per side of the density grid. */
export const DENSITY_GRID = 32;
/**
 * FSQ OS rows per tile. Overture holds one to two places per FSQ row, so a tile conflates and
 * upserts up to about 45k source rows: two to four minutes on the staging worker, which ingested
 * Rio de Janeiro's 204k rows (OSM included) in eleven.
 */
export const MAX_TILE_FSQ_ROWS = 15_000;
/** How far past its edges a tile reads: twice the 60 m conflation distance, plus slack. */
export const READ_MARGIN_M = 150;

/** FSQ OS rows per density cell, `counts[y][x]`, `DENSITY_GRID` cells on each axis. */
export type DensityGrid = readonly (readonly number[])[];

/** The whole box as one tile. */
export function singleTile(box: BoundingBox): IngestTile {
  return { ...box, closedMaxLat: true, closedMaxLng: true };
}

/** True when the point belongs to the tile (see file header). */
export function inTile(tile: IngestTile, lat: number, lng: number): boolean {
  const latIn =
    lat >= tile.minLat && (lat < tile.maxLat || (tile.closedMaxLat && lat <= tile.maxLat));
  const lngIn =
    lng >= tile.minLng && (lng < tile.maxLng || (tile.closedMaxLng && lng <= tile.maxLng));
  return latIn && lngIn;
}

const METERS_PER_DEGREE_LAT = 111_320;

/** The tile grown by `READ_MARGIN_M` on every side, kept inside the destination's box. */
export function readBox(tile: IngestTile, box: BoundingBox): BoundingBox {
  const dLat = READ_MARGIN_M / METERS_PER_DEGREE_LAT;
  const midLat = (tile.minLat + tile.maxLat) / 2;
  const dLng = dLat / Math.max(0.01, Math.cos((midLat * Math.PI) / 180));
  return {
    minLat: Math.max(box.minLat, tile.minLat - dLat),
    maxLat: Math.min(box.maxLat, tile.maxLat + dLat),
    minLng: Math.max(box.minLng, tile.minLng - dLng),
    maxLng: Math.min(box.maxLng, tile.maxLng + dLng),
  };
}

interface CellRect {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

function weightOf(grid: DensityGrid, rect: CellRect): number {
  let sum = 0;
  for (let y = rect.y0; y < rect.y1; y += 1) {
    const row = grid[y];
    for (let x = rect.x0; x < rect.x1; x += 1) sum += row?.[x] ?? 0;
  }
  return sum;
}

/** The split index along one axis that leaves the two halves' weights closest. */
function medianSplit(grid: DensityGrid, rect: CellRect, alongX: boolean): number {
  const start = alongX ? rect.x0 : rect.y0;
  const end = alongX ? rect.x1 : rect.y1;
  const total = weightOf(grid, rect);
  let best = start + 1;
  let bestGap = Infinity;
  for (let split = start + 1; split < end; split += 1) {
    const left = weightOf(grid, alongX ? { ...rect, x1: split } : { ...rect, y1: split });
    const gap = Math.abs(total - 2 * left);
    if (gap < bestGap) {
      bestGap = gap;
      best = split;
    }
  }
  return best;
}

/**
 * Tiles for `box` given its density grid (see file header). `maxWeight` is the most FSQ rows a
 * tile may hold unless it is a single cell.
 */
export function planTiles(
  box: BoundingBox,
  grid: DensityGrid,
  maxWeight: number = MAX_TILE_FSQ_ROWS,
): IngestTile[] {
  const n = DENSITY_GRID;
  const lngAt = (x: number) =>
    x === n ? box.maxLng : box.minLng + ((box.maxLng - box.minLng) * x) / n;
  const latAt = (y: number) =>
    y === n ? box.maxLat : box.minLat + ((box.maxLat - box.minLat) * y) / n;
  const cellWidth =
    ((box.maxLng - box.minLng) / n) * Math.cos((((box.minLat + box.maxLat) / 2) * Math.PI) / 180);
  const cellHeight = (box.maxLat - box.minLat) / n;

  const tiles: IngestTile[] = [];
  const split = (rect: CellRect): void => {
    const width = rect.x1 - rect.x0;
    const height = rect.y1 - rect.y0;
    if ((width === 1 && height === 1) || weightOf(grid, rect) <= maxWeight) {
      tiles.push({
        minLng: lngAt(rect.x0),
        maxLng: lngAt(rect.x1),
        minLat: latAt(rect.y0),
        maxLat: latAt(rect.y1),
        closedMaxLng: rect.x1 === n,
        closedMaxLat: rect.y1 === n,
      });
      return;
    }
    const alongX = height === 1 || (width > 1 && width * cellWidth >= height * cellHeight);
    const at = medianSplit(grid, rect, alongX);
    if (alongX) {
      split({ ...rect, x1: at });
      split({ ...rect, x0: at });
    } else {
      split({ ...rect, y1: at });
      split({ ...rect, y0: at });
    }
  };
  split({ x0: 0, x1: n, y0: 0, y1: n });
  return tiles;
}
