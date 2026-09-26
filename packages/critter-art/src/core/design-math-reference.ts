import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import type { Point } from './geometry';

// Test-only: evaluates the unmodified design scripts so fidelity tests compare against the real
// source text instead of a hand-copied transcription. Never imported by shipped code.
const repoRoot = new URL('../../../../', import.meta.url);

function readDesignFile(name: string): string {
  return readFileSync(new URL(`design/${name}`, repoRoot), 'utf8');
}

function evaluateBlock<T>(source: string, exportExpression: string): T {
  const script = new vm.Script(`${source}\n;(${exportExpression});`);
  return script.runInNewContext() as T;
}

export interface RecordingCanvas {
  readonly points: Point[];
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
}

/** A minimal 2D context that only records the vertex order `ribbon` traces. */
export function createRecordingCanvas(): RecordingCanvas {
  const points: Point[] = [];
  return {
    points,
    beginPath() {},
    moveTo(x, y) {
      points.push([x, y]);
    },
    lineTo(x, y) {
      points.push([x, y]);
    },
    closePath() {},
    fill() {},
  };
}

export interface DesignRibbonOptions {
  readonly seed: number;
  readonly amp: number;
  readonly w: number;
  readonly minW: number;
  readonly close: boolean;
  readonly taper: boolean;
}

export interface DesignDoodlesMath {
  rng(seed: number): () => number;
  spl(points: readonly Point[], close: boolean, step?: number): Point[];
  E(cx: number, cy: number, rx: number, ry: number, n?: number, rot?: number): Point[];
  len(points: readonly Point[]): number;
  ribbon(
    ctx: RecordingCanvas,
    points: readonly Point[],
    fullPointCount: number,
    options: DesignRibbonOptions,
  ): void;
}

/**
 * Extracts and evaluates the standalone RNG/spline/ellipse/ribbon block from the unmodified
 * `design/doodles.js` (the `rng`..`ribbon` definitions, before the `K` kind registry). None of
 * these reach `window.DoodleKit`, so this loads the real source text instead of retyping it.
 */
export function loadDesignDoodlesMath(): DesignDoodlesMath {
  const source = readDesignFile('doodles.js');
  const start = source.indexOf('  const rng = s =>');
  const end = source.indexOf('\n\n  const K = {};', start);
  if (start === -1 || end === -1) {
    throw new Error('design/doodles.js layout changed; update loadDesignDoodlesMath markers');
  }
  return evaluateBlock<DesignDoodlesMath>(source.slice(start, end), '{ rng, spl, E, len, ribbon }');
}

export interface DesignTubeOutline {
  readonly L: Point[];
  readonly R: Point[];
  readonly P: Point[];
}

export interface DesignShapeMath {
  arcB(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    e: number,
    a0: number,
    a1: number,
    n?: number,
  ): Point[];
  blob(cx: number, cy: number, rx: number, ry: number, e?: number, n?: number): Point[];
  fluff(cx: number, cy: number, rx: number, ry: number, n: number, amp: number): Point[];
  bez(p0: Point, p1: Point, p2: Point, n?: number): Point[];
  crs(points: readonly Point[], per?: number): Point[];
  tube(points: readonly Point[], w0: number, w1: number): DesignTubeOutline;
}

/**
 * Extracts and evaluates the shared shape helpers (`arcB`..`tube`) from the unmodified
 * `design/critters-draw-1.js` `X.h` block, ahead of the accessory/archetype code later tasks port.
 */
export function loadDesignShapeMath(): DesignShapeMath {
  const source = readDesignFile('critters-draw-1.js');
  const start = source.indexOf('  const arcB = ');
  const end = source.indexOf('\n  const star = ', start);
  if (start === -1 || end === -1) {
    throw new Error('design/critters-draw-1.js layout changed; update loadDesignShapeMath markers');
  }
  return evaluateBlock<DesignShapeMath>(source.slice(start, end), '{ arcB, blob, fluff, bez, crs, tube }');
}
