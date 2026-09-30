import { describe, expect, it } from 'vitest';

import type { RgbaImage } from '../ci-device/png';
import { measureLabelOffsets } from './label-centring';

type Rgb = readonly [number, number, number];

function canvas(width: number, height: number) {
  const data = new Uint8Array(width * height * 4).fill(255);
  const fill = (x0: number, y0: number, x1: number, y1: number, [r, g, b]: Rgb) => {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const at = (y * width + x) * 4;
        data[at] = r;
        data[at + 1] = g;
        data[at + 2] = b;
      }
    }
  };
  const image: RgbaImage = { width, height, data };
  return { image, fill };
}

/**
 * A page at 2 px per pt: a 50 pt component (rows 100–199) whose ideal cap box is 10 pt, and a
 * label whose flat letters stand on `baseline`; one letter has a mark below the line.
 */
function page(baseline: number) {
  const { image, fill } = canvas(460, 300);
  fill(10, 10, 410, 18, [0, 255, 0]);
  fill(32, 100, 40, 200, [255, 0, 255]);
  fill(52, 100, 288, 200, [120, 120, 120]);
  fill(300, 140, 308, 160, [0, 255, 255]);
  for (const x0 of [110, 140, 170, 200]) fill(x0, baseline - 20, x0 + 20, baseline, [10, 10, 10]);
  fill(145, baseline + 3, 150, baseline + 7, [10, 10, 10]);
  return image;
}

describe('label centring', () => {
  it('reads the scale and a centred label as no offset', () => {
    const { scale, rows } = measureLabelOffsets(page(160));
    expect(scale).toBe(2);
    expect(rows).toEqual([
      { index: 0, top: 100, bottom: 200, baseline: 160, capPx: 20, inkTop: 140, offsetPt: 0 },
    ]);
  });

  it('reports a label that rides high as a negative offset, in points', () => {
    expect(measureLabelOffsets(page(155)).rows[0]?.offsetPt).toBe(-2.5);
  });

  it('reports a label that sits low as a positive offset', () => {
    expect(measureLabelOffsets(page(163)).rows[0]?.offsetPt).toBe(1.5);
  });
});
