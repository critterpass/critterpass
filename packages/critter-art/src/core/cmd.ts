import type { Point } from './geometry';
import { toFloat32Points } from './geometry';

/** `multiply` matches design's default composite for washes/under-strokes; `srcOver` is design's `blend="source-over"` (icons on dark UI) and every masked/locked recolour. */
export type Blend = 'multiply' | 'srcOver';

export interface PolyCmd {
  readonly t: 'poly';
  readonly pts: Float32Array;
  readonly color: string;
  readonly alpha: number;
  readonly blend: Blend;
  readonly dx?: number;
  readonly dy?: number;
}

export interface PolylineCmd {
  readonly t: 'polyline';
  readonly pts: Float32Array;
  readonly closed: boolean;
  readonly width: number;
  readonly join: 'miter' | 'round';
  readonly cap: 'butt' | 'round';
  readonly color: string;
  readonly alpha: number;
  readonly blend: Blend;
  readonly dx?: number;
  readonly dy?: number;
}

export interface LayerShadow {
  readonly dy: number;
  readonly sigma: number;
  readonly color: string;
}

export interface LayerCmd {
  readonly t: 'layer';
  readonly cmds: Cmd[];
  /** Layers always isolate blending (design's own sticker/washes never multiply against the page behind them). */
  readonly isolate: true;
  readonly shadow?: LayerShadow;
  readonly alpha: number;
}

export type Cmd = PolyCmd | PolylineCmd | LayerCmd;

export function polyCmd(
  points: readonly Point[],
  color: string,
  alpha: number,
  blend: Blend,
  offset?: { readonly dx: number; readonly dy: number },
): PolyCmd {
  return {
    t: 'poly',
    pts: toFloat32Points(points),
    color,
    alpha,
    blend,
    ...(offset ? { dx: offset.dx, dy: offset.dy } : {}),
  };
}

export function polylineCmd(
  points: readonly Point[],
  closed: boolean,
  width: number,
  join: 'miter' | 'round',
  color: string,
  alpha: number,
  blend: Blend,
  offset?: { readonly dx: number; readonly dy: number },
): PolylineCmd {
  return {
    t: 'polyline',
    pts: toFloat32Points(points),
    closed,
    width,
    join,
    cap: join === 'round' ? 'round' : 'butt',
    color,
    alpha,
    blend,
    ...(offset ? { dx: offset.dx, dy: offset.dy } : {}),
  };
}

/** Builds a filled `'poly'` cmd from a ribbon's left/right vertex arrays (left forward, right reversed). */
export function ribbonPolyCmd(
  left: readonly Point[],
  right: readonly Point[],
  color: string,
  alpha: number,
  blend: Blend,
): PolyCmd {
  return polyCmd(left.concat(right.slice().reverse()), color, alpha, blend);
}

export function layerCmd(
  cmds: readonly Cmd[],
  alpha: number,
  shadow?: LayerShadow,
): LayerCmd {
  return {
    t: 'layer',
    cmds: [...cmds],
    isolate: true,
    alpha,
    ...(shadow ? { shadow } : {}),
  };
}
