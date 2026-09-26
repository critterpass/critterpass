import { arcLength, type Point } from './geometry';
import { catmullRomSpline } from './spline';
import { ellipsePolygon } from './shapes';

export interface LineOptions {
  readonly w?: number;
  readonly close?: boolean;
  readonly taper?: boolean;
  readonly color?: string;
}

export interface WashOptions {
  readonly al?: number;
  readonly off?: number;
}

export interface LineOp {
  readonly t: 'line';
  readonly points: Point[];
  readonly arcLength: number;
  readonly closed: boolean;
  readonly width: number;
  readonly color: string;
  readonly taper: boolean;
  readonly seed: number;
}

export interface UnderOp {
  readonly t: 'under';
  readonly points: Point[];
  readonly width: number;
  readonly color: string;
  readonly seed: number;
}

export interface WashOp {
  readonly t: 'wash';
  readonly points: Point[];
  readonly color: string;
  readonly alpha: number;
  readonly offset: number;
  readonly seed: number;
}

export interface FillOp {
  readonly t: 'fill';
  readonly points: Point[];
  readonly color: string;
  readonly alpha: number;
}

export type Op = LineOp | UnderOp | WashOp | FillOp;

/**
 * Drawing sink matching design/doodles.js's `d` object exactly: `line`/`stroke`(under)/`wash`/`fill`/
 * `dot`. `sid` (the seed counter) is consumed by line/stroke/wash only, in call order — op order and
 * seed order must stay authored-order for wobble/misregistration to match the design pixel-for-pixel.
 */
export interface OpSink {
  line(points: readonly Point[], options?: LineOptions): void;
  stroke(points: readonly Point[], color: string, width: number): void;
  wash(points: readonly Point[], color: string, options?: WashOptions): void;
  fill(points: readonly Point[], color: string): void;
  dot(x: number, y: number, r: number, color: string, alpha?: number): void;
}

export interface OpBuilder {
  readonly sink: OpSink;
  readonly ops: Op[];
}

/**
 * Creates a fresh op sink seeded at `seed`; `ink` is the default line colour (design's `x.color ||
 * o.ink`). One builder produces exactly one op list — build a second one for the closed-eye variant
 * instead of mutating this one, matching "blink list built on demand only, never eagerly".
 */
export function createOpBuilder(seed: number, ink: string): OpBuilder {
  const ops: Op[] = [];
  let sid = seed;
  const sink: OpSink = {
    line(points, options = {}) {
      const closed = options.close ?? false;
      const tessellated = catmullRomSpline(points, closed);
      ops.push({
        t: 'line',
        points: tessellated,
        arcLength: arcLength(tessellated),
        closed,
        width: options.w ?? 3,
        color: options.color ?? ink,
        taper: options.taper !== false && !closed,
        seed: sid++,
      });
    },
    stroke(points, color, width) {
      ops.push({ t: 'under', points: catmullRomSpline(points, false), width, color, seed: sid++ });
    },
    wash(points, color, options = {}) {
      ops.push({
        t: 'wash',
        points: catmullRomSpline(points, true),
        color,
        alpha: options.al ?? 0.9,
        offset: options.off ?? 1.6,
        seed: sid++,
      });
    },
    fill(points, color) {
      ops.push({ t: 'fill', points: catmullRomSpline(points, true), color, alpha: 1 });
    },
    dot(x, y, r, color, alpha = 1) {
      ops.push({ t: 'fill', points: ellipsePolygon(x, y, r, r, 10), color, alpha });
    },
  };
  return { sink, ops };
}

/** design/critters-draw-1.js `W`: watercolour wash plus its ink outline. */
export function W(
  sink: OpSink,
  points: readonly Point[],
  color: string,
  lineWidth = 2.3,
  close = true,
): void {
  sink.wash(points, color);
  sink.line(points, { w: lineWidth, close });
}

/** design/critters-draw-1.js `F`: solid fill plus its closed ink outline. */
export function F(sink: OpSink, points: readonly Point[], color: string, lineWidth = 1.9): void {
  sink.fill(points, color);
  sink.line(points, { w: lineWidth, close: true });
}
