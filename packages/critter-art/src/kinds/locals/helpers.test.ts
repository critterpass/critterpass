import { describe, expect, it } from 'vitest';

import { loadDesignCritterKit } from './design-critter-reference';
import { asDesignFn, buildBothCritterOps } from './design-critter-fixture';
import {
  CREAM_WHITE,
  CRITTER_INK,
  drawBloom,
  drawCheekDots,
  drawNose,
  drawSmile,
  heartPolygon,
  mirrorX,
  starPolygon,
  transformHeadLocal,
} from './helpers';

describe('locals helpers', () => {
  const { X } = loadDesignCritterKit();

  it('INK/CR constants match the design source', () => {
    expect(CRITTER_INK).toBe(X.h['INK']);
    expect(CREAM_WHITE).toBe(X.h['CR']);
  });

  it('mirrorX matches design MIR', () => {
    const mir = X.h['MIR'] as (points: readonly [number, number][]) => [number, number][];
    const points: [number, number][] = [
      [12, 34],
      [88, 4.5],
      [50, 50],
    ];
    expect(mirrorX(points)).toEqual(mir(points));
  });

  it('transformHeadLocal matches design TR', () => {
    const tr = X.h['TR'] as (
      points: readonly [number, number][],
      head: { x: number; y: number; k: number },
      mirror: boolean,
    ) => [number, number][];
    const points: [number, number][] = [
      [-19, -8],
      [-21, -26],
      [-6, -17],
    ];
    const head = { x: 50, y: 31, k: 1.05 };
    expect(transformHeadLocal(points, head, false)).toEqual(tr(points, head, false));
    expect(transformHeadLocal(points, head, true)).toEqual(tr(points, head, true));
  });

  it('starPolygon matches design star', () => {
    const star = X.h['star'] as (x: number, y: number, r: number) => [number, number][];
    expect(starPolygon(50, 60, 4.8)).toEqual(star(50, 60, 4.8));
  });

  it('heartPolygon matches design heart', () => {
    const heart = X.h['heart'] as (x: number, y: number, r: number) => [number, number][];
    expect(heartPolygon(39, 62, 4)).toEqual(heart(39, 62, 4));
  });

  it('drawNose matches design nose op sequence', () => {
    const designNose = asDesignFn(X.h['nose'], 'X.h.nose');
    const { ours, design } = buildBothCritterOps(drawNose, designNose, 7, '#221e19', 50, 68, 4.5, 5);
    expect(ours).toEqual(design);
  });

  it('drawSmile matches design smile op sequence, with and without an explicit colour', () => {
    const designSmile = asDesignFn(X.h['smile'], 'X.h.smile');
    const withDefaults = buildBothCritterOps(drawSmile, designSmile, 7, '#221e19', 50, 61, 4, 2, undefined);
    expect(withDefaults.ours).toEqual(withDefaults.design);
    const withColor = buildBothCritterOps(drawSmile, designSmile, 7, '#221e19', 50, 61, 4, 2, '#ffffff');
    expect(withColor.ours).toEqual(withColor.design);
  });

  it('drawCheekDots matches design cheek op sequence', () => {
    const designCheek = asDesignFn(X.h['cheek'], 'X.h.cheek');
    const points: [number, number][] = [
      [33, 58],
      [67, 58],
    ];
    const { ours, design } = buildBothCritterOps(drawCheekDots, designCheek, 7, '#221e19', points, 3);
    expect(ours).toEqual(design);
  });

  it('drawBloom matches design bloom op sequence', () => {
    const designBloom = asDesignFn(X.h['bloom'], 'X.h.bloom');
    const { ours, design } = buildBothCritterOps(drawBloom, designBloom, 7, '#221e19', 50, 3, '#ff5a6e', '#c42f4a');
    expect(ours).toEqual(design);
  });
});
