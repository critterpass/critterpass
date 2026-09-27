import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';

import { critters } from '../../data/critters';
import { isGuideSpec } from '../../data/types';
import type { ArchetypeName } from '../../data/types';
import { renderToCanvas, viewportFor } from '../../backends/canvas2d/index';
import type { CanvasFactory, CanvasLike } from '../../backends/canvas2d/render';
import { frame } from '../../core/frame';
import { layout } from '../../core/layout';
import { build } from '../../core/model';
import type { Pose, RenderSpec } from '../../core/model';
import { createOpBuilder } from '../../core/ops';
import { drawSparkExtras, isEpicPose } from './poses';

describe('isEpicPose', () => {
  it('is true for tilt and hop only', () => {
    expect(isEpicPose('tilt')).toBe(true);
    expect(isEpicPose('hop')).toBe(true);
  });

  it('is false for every other pose value, including undefined', () => {
    for (const pose of ['idle', 'wave', 'cheer', 'think', 'point', 'sleep', 'crack', undefined]) {
      expect(isEpicPose(pose)).toBe(false);
    }
  });
});

describe('drawSparkExtras', () => {
  it('draws a wash + line outline spanning +/- r around (x, y)', () => {
    const { sink, ops } = createOpBuilder(7, '#221e19');
    drawSparkExtras(sink, 20, 30, 6, '#f2c14e');
    expect(ops.map((op) => op.t)).toEqual(['wash', 'line']);
    const wash = ops[0];
    if (wash?.t !== 'wash') throw new Error('expected a wash op');
    expect(wash.color).toBe('#f2c14e');
    // `wash` spline-tessellates its 8 authored control points (a closed Catmull-Rom curve passes
    // through each exactly), so the raw output has many more points than 8 -- the bounding box
    // survives tessellation since the control points are the curve's own extremes.
    const xs = wash.points.map(([x]) => x);
    const ys = wash.points.map(([, y]) => y);
    expect(Math.min(...xs)).toBeCloseTo(20 - 6, 5);
    expect(Math.max(...xs)).toBeCloseTo(20 + 6, 5);
    expect(Math.min(...ys)).toBeCloseTo(30 - 6, 5);
    expect(Math.max(...ys)).toBeCloseTo(30 + 6, 5);
  });

  it('alternates long and short radial points (a star, not a circle)', () => {
    const { sink, ops } = createOpBuilder(7, '#221e19');
    drawSparkExtras(sink, 0, 0, 10, '#fff');
    const wash = ops[0];
    if (wash?.t !== 'wash') throw new Error('expected a wash op');
    const distances = wash.points.map(([x, y]) => Math.hypot(x, y));
    expect(Math.max(...distances)).toBeCloseTo(10, 5);
    expect(Math.min(...distances)).toBeLessThan(6);
  });
});

// Every archetype and guide must have an epic pose whose render visibly differs from the common
// (unposed) render. `cheer` is design's own pose for sit/bird/lizard and 4 of the 6 guides (already
// real, ported geometry); `tilt` is the whole-body transform for the 12 pose-less archetypes and the
// 2 pose-less guides (sardine/alpaca), each combined with the bespoke flourish `poses.ts`'s callers
// add per archetype (or, for the guides, nothing beyond the transform itself, since sardine/alpaca
// have no pose-conditional geometry to begin with).
const ARCHETYPE_EPIC_POSE: Readonly<Record<ArchetypeName, Pose>> = {
  sit: 'cheer',
  stand: 'tilt',
  bird: 'cheer',
  wader: 'tilt',
  fish: 'tilt',
  lizard: 'cheer',
  frog: 'tilt',
  turtle: 'tilt',
  snake: 'tilt',
  bug: 'tilt',
  octo: 'tilt',
  crab: 'tilt',
  seal: 'tilt',
  whale: 'tilt',
  nessie: 'tilt',
};
const GUIDE_EPIC_POSE: Readonly<Record<string, Pose>> = {
  gecko: 'cheer',
  tanuki: 'cheer',
  puffin: 'cheer',
  axolotl: 'cheer',
  sardine: 'tilt',
  alpaca: 'tilt',
};
const SIZE_PT = 96;

const nodeCanvasFactory: CanvasFactory = (width, height) => createCanvas(width, height) as unknown as CanvasLike;

/** Rasterizes a spec to raw RGBA bytes via the real Node backend (`render.test.ts`'s established pattern), no PNG round-trip needed since both sides are compared in-process. */
function renderPixels(spec: RenderSpec, sizePt: number): { data: Uint8ClampedArray; width: number; height: number } {
  const model = build(spec, sizePt);
  const boxLayout = layout(spec, sizePt);
  const viewport = viewportFor(boxLayout, 1);
  const canvas = renderToCanvas(frame(model, 1), viewport, nodeCanvasFactory) as unknown as ReturnType<
    typeof createCanvas
  >;
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  return { data, width: canvas.width, height: canvas.height };
}

/** Fraction (0..1) of pixels whose RGBA differs by more than a small floor in any channel. */
function pctPixelsDiffer(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) throw new Error(`pixel buffer length mismatch: ${a.length} vs ${b.length}`);
  let differing = 0;
  const pixelCount = a.length / 4;
  for (let i = 0; i < a.length; i += 4) {
    let maxChannelDiff = 0;
    for (let channel = 0; channel < 4; channel++) {
      const diff = Math.abs((a[i + channel] ?? 0) - (b[i + channel] ?? 0));
      if (diff > maxChannelDiff) maxChannelDiff = diff;
    }
    if (maxChannelDiff > 8) differing++;
  }
  return differing / pixelCount;
}

describe('epic pose vs common pose: every archetype and guide must visibly differ', () => {
  const localCases = Object.entries(ARCHETYPE_EPIC_POSE).map(([archetype, pose]) => {
    const representative = critters.find(
      (c) => !isGuideSpec(c.spec) && c.spec.b === (archetype as ArchetypeName),
    );
    if (!representative) throw new Error(`no shipped critter uses archetype "${archetype}"`);
    return { label: `${archetype} (${representative.id})`, kind: representative.id, seed: representative.no, pose };
  });
  const guideCases = Object.entries(GUIDE_EPIC_POSE).map(([kind, pose]) => ({
    label: kind,
    kind,
    seed: 7,
    pose,
  }));

  // Stickered, like every real render (pass card, gallery, bake): the die-cut outline redraws around
  // the posed silhouette too, so this is both the more representative rendering mode *and* the one
  // where a pose change actually moves the most pixels (plain mode's bare ink line moves far fewer).
  const STICKER: RenderSpec['sticker'] = { color: '#f4efe4' };

  it.each([...localCases, ...guideCases])('$label: epic ("$pose") differs from common by > 3% of pixels', ({ kind, seed, pose }) => {
    const common = renderPixels({ kind, seed, sticker: STICKER }, SIZE_PT);
    const epic = renderPixels({ kind, seed, pose, sticker: STICKER }, SIZE_PT);
    expect(epic.width).toBe(common.width);
    expect(epic.height).toBe(common.height);
    const pct = pctPixelsDiffer(common.data, epic.data);
    expect(pct).toBeGreaterThan(0.03);
  });
});
