/**
 * Tile planning for the tiled place ingest: tiles follow the density, stay under the row limit,
 * and partition the box so every point, edges included, belongs to exactly one tile.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  DENSITY_GRID,
  inTile,
  planTiles,
  readBox,
  READ_MARGIN_M,
  type DensityGrid,
} from '../../src/places/ingest-tiles';

const LONDON = { minLat: 51.373, maxLat: 51.642, minLng: -0.344, maxLng: 0.0887 };

function grid(weight: (x: number, y: number) => number): DensityGrid {
  return Array.from({ length: DENSITY_GRID }, (_, y) =>
    Array.from({ length: DENSITY_GRID }, (_, x) => weight(x, y)),
  );
}

/** A dense centre fading out to the edges, like a metro. */
const metro = grid((x, y) => {
  const d = Math.hypot(x - DENSITY_GRID / 2, y - DENSITY_GRID / 2);
  return Math.round(4_000 / (1 + d * d));
});

function weightInside(tile: ReturnType<typeof planTiles>[number], counts: DensityGrid): number {
  let sum = 0;
  counts.forEach((row, y) =>
    row.forEach((count, x) => {
      const lng = LONDON.minLng + ((LONDON.maxLng - LONDON.minLng) * (x + 0.5)) / DENSITY_GRID;
      const lat = LONDON.minLat + ((LONDON.maxLat - LONDON.minLat) * (y + 0.5)) / DENSITY_GRID;
      if (inTile(tile, lat, lng)) sum += count;
    }),
  );
  return sum;
}

describe('planTiles', { timeout: 60_000 }, () => {
  it('keeps a destination under the limit as one tile over its whole box', () => {
    const tiles = planTiles(
      LONDON,
      grid(() => 1),
      DENSITY_GRID * DENSITY_GRID,
    );
    expect(tiles).toEqual([{ ...LONDON, closedMaxLat: true, closedMaxLng: true }]);
  });

  it('splits a metro so no tile holds more than the limit', () => {
    const tiles = planTiles(LONDON, metro, 15_000);
    expect(tiles.length).toBeGreaterThan(1);
    for (const tile of tiles) expect(weightInside(tile, metro)).toBeLessThanOrEqual(15_000);
  });

  it('gives every point of the box, edges and corners included, to exactly one tile', () => {
    const tiles = planTiles(LONDON, metro, 15_000);
    const edgesLng = [...new Set(tiles.flatMap((tile) => [tile.minLng, tile.maxLng]))];
    const edgesLat = [...new Set(tiles.flatMap((tile) => [tile.minLat, tile.maxLat]))];
    const coordinate = (min: number, max: number, edges: number[]) =>
      fc.oneof(fc.double({ min, max, noNaN: true }), fc.constantFrom(...edges));
    fc.assert(
      fc.property(
        coordinate(LONDON.minLat, LONDON.maxLat, edgesLat),
        coordinate(LONDON.minLng, LONDON.maxLng, edgesLng),
        (lat, lng) => tiles.filter((tile) => inTile(tile, lat, lng)).length === 1,
      ),
      { numRuns: 2_000 },
    );
  });

  it('reads past the tile edges by the margin, never outside the box', () => {
    const [tile] = planTiles(LONDON, metro, 15_000);
    const box = readBox(tile!, LONDON);
    expect(box.minLat).toBeGreaterThanOrEqual(LONDON.minLat);
    expect(box.minLng).toBeGreaterThanOrEqual(LONDON.minLng);
    const marginLat = READ_MARGIN_M / 111_320;
    expect(box.maxLat).toBeCloseTo(Math.min(LONDON.maxLat, tile!.maxLat + marginLat), 9);
  });
});
