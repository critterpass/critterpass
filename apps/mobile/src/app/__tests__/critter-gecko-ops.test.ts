import { describe, expect, it, jest } from '@jest/globals';

// Native-runtime boundary double (code-standards.md §17): @shopify/react-native-skia needs a real
// JSI/GPU host Jest cannot provide. Name must start with "mock" — jest hoists the factory above
// this declaration.
import * as mockSkia from '../__mocks__/mock-skia';

jest.mock('@shopify/react-native-skia', () => mockSkia);

import { buildRibbonPolygon, catmullRomSpline, ellipsePoints } from '../(dev)/spikes/critter-geometry';
import { buildGeckoDrawing } from '../(dev)/spikes/critter-gecko-ops';
import { buildGeckoPaintOps } from '../(dev)/spikes/critter-skia-paint';

describe('critter-geometry', () => {
  it('resamples a short open path into a denser catmull-rom spline', () => {
    const spline = catmullRomSpline(
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      false,
    );
    expect(spline.length).toBeGreaterThan(3);
    expect(spline[0]).toEqual([0, 0]);
    expect(spline[spline.length - 1]).toEqual([10, 10]);
  });

  it('generates the requested number of ellipse points', () => {
    expect(ellipsePoints(0, 0, 5, 5, 8)).toHaveLength(8);
  });

  it('is deterministic: the same seed produces the same ribbon polygon', () => {
    const points: [number, number][] = [
      [0, 0],
      [5, 2],
      [10, 0],
    ];
    const a = buildRibbonPolygon(points, points.length, { w: 3, minW: 1, taper: true, close: false, seed: 3, amp: 0.4 });
    const b = buildRibbonPolygon(points, points.length, { w: 3, minW: 1, taper: true, close: false, seed: 3, amp: 0.4 });
    expect(a).toEqual(b);
  });
});

describe('buildGeckoDrawing', () => {
  it('is deterministic across calls with the same palette', () => {
    expect(buildGeckoDrawing().ops).toEqual(buildGeckoDrawing().ops);
  });

  it('produces every op kind the renderer branches on', () => {
    const kinds = new Set(buildGeckoDrawing().ops.map((op) => op.kind));
    expect(kinds).toEqual(new Set(['wash', 'under', 'fill', 'line']));
  });

  it('draws fewer, simpler ops per eye when closed (one line vs. fill+line+fill+dot)', () => {
    const open = buildGeckoDrawing();
    const closed = buildGeckoDrawing({ closed: true });
    // Each eye collapses from 4 ops (white fill, outline, pupil fill, highlight dot) to 1 (a line).
    expect(open.ops.length - closed.ops.length).toBe(2 * (4 - 1));
    expect(closed.ops).not.toEqual(open.ops);
  });
});

describe('buildGeckoPaintOps', () => {
  it('reveals no strokes at progress 0 and the full set at progress 1', () => {
    const { ops, totalLineLength } = buildGeckoDrawing();
    expect(buildGeckoPaintOps(ops, totalLineLength, 0)).toHaveLength(0);
    const full = buildGeckoPaintOps(ops, totalLineLength, 1);
    expect(full.length).toBeGreaterThan(0);
  });

  it('reveals strictly more paint ops as progress advances (draw-on budget)', () => {
    const { ops, totalLineLength } = buildGeckoDrawing();
    const quarter = buildGeckoPaintOps(ops, totalLineLength, 0.25).length;
    const full = buildGeckoPaintOps(ops, totalLineLength, 1).length;
    expect(full).toBeGreaterThan(quarter);
  });
});
