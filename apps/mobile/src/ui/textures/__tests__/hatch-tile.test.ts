/**
 * The hatch tile repeats without a seam: every point of the stripe field is as far from a stripe
 * as the same point one tile over (right or down), at every density the app runs at, and the
 * stripe period stays within a percent of the token's.
 */
import { describe, expect, it } from '@jest/globals';

import { hatchTileGeometry, tilesSquare, type HatchTileLine } from '../hatch-tile';

function distance(x: number, y: number, line: HatchTileLine): number {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  return Math.abs(dy * (x - line.x1) - dx * (y - line.y1)) / Math.hypot(dx, dy);
}

function nearest(x: number, y: number, lines: readonly HatchTileLine[]): number {
  return Math.min(...lines.map((line) => distance(x, y, line)));
}

const SCALES = [1, 2, 2.625, 3, 3.5];

describe('hatch tile', () => {
  for (const angleDeg of [135, 45]) {
    it(`repeats without a seam at ${angleDeg}° at every density`, () => {
      for (const scale of SCALES) {
        const tile = hatchTileGeometry({
          angleDeg,
          stripePt: 2,
          gapPt: 6,
          color: '#fff',
          base: '#000',
          scale,
        });
        expect(Number.isInteger(tile.sizePx)).toBe(true);
        const t = tile.sizePx;
        for (let i = 0; i < 200; i += 1) {
          const x = (i * 37.3) % t;
          const y = (i * 19.7) % t;
          const here = nearest(x, y, tile.lines);
          expect(nearest(x + t, y, tile.lines)).toBeCloseTo(here, 6);
          expect(nearest(x, y + t, tile.lines)).toBeCloseTo(here, 6);
        }
      }
    });
  }

  it("keeps the token's stripe period to within a percent", () => {
    for (const scale of SCALES) {
      const tile = hatchTileGeometry({
        angleDeg: 135,
        stripePt: 2,
        gapPt: 6,
        color: '#fff',
        base: '#000',
        scale,
      });
      const [a, b] = tile.lines;
      if (a === undefined || b === undefined) throw new Error('no lines');
      // Perpendicular distance between neighbouring stripes, in points.
      const periodPt = distance(b.x1, b.y1, a) / scale;
      expect(Math.abs(periodPt - 8) / 8).toBeLessThan(0.01);
      expect(tile.strokePx).toBeCloseTo(2 * scale, 6);
    }
  });

  it('tiles squarely only at 45° and 135°', () => {
    expect(tilesSquare(135)).toBe(true);
    expect(tilesSquare(-45)).toBe(true);
    expect(tilesSquare(225)).toBe(true);
    expect(tilesSquare(60)).toBe(false);
    expect(tilesSquare(0)).toBe(false);
  });
});
