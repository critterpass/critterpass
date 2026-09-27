// Draw-op recording for the spike critter painters: the op shapes the Skia painter replays and the
// context `K.gecko`-style draw code calls into (ported from design/doodles.js's `DK` helpers).
// Not a route: expo-router scans every file under src/app/ as a route candidate (see the default
// export at the bottom) even though this module has no screen.
import type { Point } from './critter-geometry';
import { catmullRomSpline, ellipsePoints, polylineLength } from './critter-geometry';

export type DrawOp =
  | {
      readonly kind: 'wash';
      readonly points: Point[];
      readonly color: string;
      readonly alpha: number;
      readonly offset: number;
      readonly seed: number;
    }
  | {
      readonly kind: 'under';
      readonly points: Point[];
      readonly color: string;
      readonly width: number;
      readonly seed: number;
    }
  | {
      readonly kind: 'fill';
      readonly points: Point[];
      readonly color: string;
      readonly alpha: number;
    }
  | {
      readonly kind: 'line';
      readonly points: Point[];
      readonly length: number;
      readonly color: string;
      readonly width: number;
      readonly taper: boolean;
      readonly close: boolean;
      readonly seed: number;
    };

interface LineOptions {
  readonly w?: number;
  readonly color?: string;
  readonly close?: boolean;
  readonly taper?: boolean;
}

export interface DrawContext {
  line(points: readonly Point[], opts?: LineOptions): void;
  stroke(points: readonly Point[], color: string, width: number): void;
  wash(points: readonly Point[], color: string, opts?: { al?: number; off?: number }): void;
  fill(points: readonly Point[], color: string, alpha?: number): void;
  dot(x: number, y: number, r: number, color: string, alpha?: number): void;
}

export function createDrawContext(
  seedStart: number,
  ink: string,
): { ctx: DrawContext; ops: DrawOp[] } {
  const ops: DrawOp[] = [];
  let seed = seedStart;
  const ctx: DrawContext = {
    line(points, opts = {}) {
      const close = opts.close === true;
      const p = catmullRomSpline(points, close);
      ops.push({
        kind: 'line',
        points: p,
        length: polylineLength(p),
        color: opts.color ?? ink,
        width: opts.w ?? 3,
        taper: opts.taper !== false && !close,
        close,
        seed: seed++,
      });
    },
    stroke(points, color, width) {
      const p = catmullRomSpline(points, false);
      ops.push({ kind: 'under', points: p, color, width, seed: seed++ });
    },
    wash(points, color, opts = {}) {
      ops.push({
        kind: 'wash',
        points: catmullRomSpline(points, true),
        color,
        alpha: opts.al ?? 0.9,
        offset: opts.off ?? 1.6,
        seed: seed++,
      });
    },
    fill(points, color, alpha = 1) {
      ops.push({ kind: 'fill', points: catmullRomSpline(points, true), color, alpha });
    },
    dot(x, y, r, color, alpha = 1) {
      ops.push({ kind: 'fill', points: ellipsePoints(x, y, r, r, 10), color, alpha });
    },
  };
  return { ctx, ops };
}

export function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined)
    throw new Error(`critter-draw-ops: index ${index} out of range (length ${items.length})`);
  return value;
}

// See the file header: this module is not a screen, only a helper next to route files.
export default {};
