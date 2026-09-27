// Tokek (the gecko) draw calls, ported from design/doodles.js `K.gecko` — same centreline maths and
// stroke order as the untouched design source. design/doodles.js stays read-only; this is a port,
// not an import (the source is a DOM custom element and cannot run outside a browser). The actual
// body/limb/face drawing lives in gecko-draw.ts (kept ≤300 lines per code-standards.md §2).
import { catmullRomSpline, ellipsePoints, polylineLength } from './geometry';
import type { Point } from './geometry';
import { drawGecko } from './gecko-draw';

export type GeckoPose = 'idle' | 'wave' | 'cheer' | 'think' | 'point' | 'sleep';

export interface GeckoPalette {
  readonly ink?: string;
  readonly fill?: string;
  readonly accent?: string;
  readonly spot?: string;
  readonly eye?: string;
  readonly pupil?: string;
  readonly pose?: GeckoPose;
  readonly closed?: boolean;
}

export type DrawOp =
  | {
      readonly kind: 'wash';
      readonly points: Point[];
      readonly color: string;
      readonly alpha: number;
      readonly offset: number;
      readonly seed: number;
    }
  | { readonly kind: 'under'; readonly points: Point[]; readonly color: string; readonly width: number; readonly seed: number }
  | { readonly kind: 'fill'; readonly points: Point[]; readonly color: string; readonly alpha: number }
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

/** Mirrors doodles.js's internal `d` op-builder (setup()'s `build()` closure) so the port reads the same. */
export interface DrawContext {
  line(points: readonly Point[], opts?: LineOptions): void;
  stroke(points: readonly Point[], color: string, width: number): void;
  wash(points: readonly Point[], color: string, opts?: { al?: number; off?: number }): void;
  fill(points: readonly Point[], color: string, alpha?: number): void;
  dot(x: number, y: number, r: number, color: string, alpha?: number): void;
}

function createDrawContext(seedStart: number, ink: string): { ctx: DrawContext; ops: DrawOp[] } {
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

export interface GeckoDrawing {
  readonly ops: readonly DrawOp[];
  readonly totalLineLength: number;
}

const DEFAULT_INK = '#221e19';
/** Fixed op-seed so two builds with the same palette/pose produce byte-identical geometry. */
const OP_SEED_START = 7;

/** Builds Tokek's draw-op list for one pose/palette; pure and deterministic. */
export function buildGeckoDrawing(palette: GeckoPalette = {}): GeckoDrawing {
  const ink = palette.ink ?? DEFAULT_INK;
  const { ctx, ops } = createDrawContext(OP_SEED_START, ink);
  drawGecko(ctx, ink, { pose: 'idle', ...palette });
  const totalLineLength = ops.reduce((sum, op) => (op.kind === 'line' ? sum + op.length : sum), 0) || 1;
  return { ops, totalLineLength };
}
