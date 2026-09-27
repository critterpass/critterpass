import type { Blend } from './cmd';
import type { Point } from './geometry';
import type { Op } from './ops';
import { createOpBuilder } from './ops';
import type { RibbonPolygon } from './ribbon';
import { ribbonPolygon } from './ribbon';
import { applyHopPose, applyTiltPose } from './pose-transform';
import { applyMaskVariant, applyMonoVariant, applyStampVariant } from './variants';
import type { KindDrawOptions } from '../kinds/registry';
import { resolveKind } from '../kinds/registry';
import { EDGE_RING_STYLES } from '../forms/tier-palette';

export type Pose =
  | 'idle'
  | 'wave'
  | 'cheer'
  | 'think'
  | 'point'
  | 'sleep'
  | 'crack'
  | 'tilt'
  | 'hop';

/** `color` is the default; `mask` is design's `locked` silhouette generalised to any single colour. */
export type Variant = 'color' | 'mask' | 'mono' | 'stamp';

export type EdgeStyle = 'none' | 'epic' | 'legendary';

export interface Palette {
  readonly f: string;
  readonly dk: string;
  readonly bl: string;
  readonly accent?: string;
  readonly leaf?: string;
  readonly beak2?: string;
  readonly stripe?: string;
  readonly eye?: string;
  readonly pupil?: string;
  readonly ink?: string;
}

export interface FormSpec {
  readonly rarity: 'common' | 'rare' | 'epic' | 'legendary';
  readonly palette: Palette;
  readonly pose?: Pose;
  readonly edge: EdgeStyle;
}

export interface StickerSpec {
  readonly color: string;
  readonly w?: number;
}

export interface RenderSpec {
  readonly kind: string;
  readonly form?: FormSpec;
  readonly pose?: Pose;
  readonly variant?: Variant;
  readonly maskColor?: string;
  readonly sticker?: StickerSpec | null;
  readonly blend?: Blend;
  readonly seed: number;
  readonly closedEyes?: boolean;
  readonly seedMode?: 'design' | 'stable';
}

const DEFAULT_INK = '#221e19';
const DEFAULT_EYE = '#fffdf6';
const DEFAULT_LOCKED_COLOR = '#3a3466';

export interface BuiltLineOp {
  readonly t: 'line';
  readonly points: Point[];
  readonly arcLength: number;
  readonly color: string;
  readonly ribbon: RibbonPolygon;
}

export interface BuiltUnderOp {
  readonly t: 'under';
  readonly points: Point[];
  readonly color: string;
  readonly ribbon: RibbonPolygon;
}

export interface BuiltWashOp {
  readonly t: 'wash';
  readonly points: Point[];
  readonly color: string;
  readonly alpha: number;
  readonly offset: number;
  readonly seed: number;
}

export interface BuiltFillOp {
  readonly t: 'fill';
  readonly points: Point[];
  readonly color: string;
  readonly alpha: number;
}

export type BuiltOp = BuiltLineOp | BuiltUnderOp | BuiltWashOp | BuiltFillOp;

export interface StickerOutlineShape {
  readonly points: Point[];
  readonly closed: boolean;
  readonly width: number;
  /** wash/fill ops die-cut as stroke+fill; line/under ops die-cut as stroke only. */
  readonly fill: boolean;
}

export interface Model {
  readonly ops: BuiltOp[];
  readonly totalArcLength: number;
  readonly blend: Blend;
  readonly stickerColor: string | null;
  readonly stickerOutline: StickerOutlineShape[] | null;
  /** Tier edge ring (epic/legendary), drawn beneath the sticker outline; `null` below (no sticker or no edge). */
  readonly edgeColor: string | null;
  readonly edgeOutline: StickerOutlineShape[] | null;
}

/** design's `minW = 1.05 * dpr / k`; the dpr terms cancel, leaving a size-only local-unit floor. */
function minRibbonWidth(sizePt: number, viewBoxWidth: number, pad: number): number {
  return (1.05 * (viewBoxWidth + 2 * pad)) / sizePt;
}

function resolvePose(spec: RenderSpec): string | undefined {
  return spec.form?.pose ?? spec.pose;
}

function resolveOptions(spec: RenderSpec): KindDrawOptions {
  const palette = spec.form?.palette;
  const ink = palette?.ink ?? DEFAULT_INK;
  const pose = resolvePose(spec);
  return {
    ink,
    eye: palette?.eye ?? DEFAULT_EYE,
    pupil: palette?.pupil ?? ink,
    ...(palette?.f !== undefined ? { fill: palette.f } : {}),
    ...(palette?.accent !== undefined ? { accent: palette.accent } : {}),
    ...(palette?.dk !== undefined ? { spot: palette.dk } : {}),
    ...(palette?.bl !== undefined ? { belly: palette.bl } : {}),
    ...(palette?.leaf !== undefined ? { leaf: palette.leaf } : {}),
    ...(palette?.beak2 !== undefined ? { beak2: palette.beak2 } : {}),
    ...(palette?.stripe !== undefined ? { stripe: palette.stripe } : {}),
    ...(pose !== undefined ? { pose } : {}),
    closed: spec.closedEyes ?? false,
    ...(spec.seedMode !== undefined ? { seedMode: spec.seedMode } : {}),
  };
}

function buildOp(op: Op, minW: number): BuiltOp {
  if (op.t === 'line') {
    return {
      t: 'line',
      points: op.points,
      arcLength: op.arcLength,
      color: op.color,
      ribbon: ribbonPolygon(op.points, op.points.length, {
        seed: op.seed,
        amp: 0.45,
        w: op.width,
        minW,
        close: op.closed,
        taper: op.taper,
      }),
    };
  }
  if (op.t === 'under') {
    return {
      t: 'under',
      points: op.points,
      color: op.color,
      ribbon: ribbonPolygon(op.points, op.points.length, {
        seed: op.seed,
        amp: 0.3,
        w: op.width,
        minW,
        close: false,
        taper: true,
      }),
    };
  }
  if (op.t === 'wash') {
    return { t: 'wash', points: op.points, color: op.color, alpha: op.alpha, offset: op.offset, seed: op.seed };
  }
  return { t: 'fill', points: op.points, color: op.color, alpha: op.alpha };
}

/** design's sticker outline pass: one silhouette shape per op, in the sticker's own colour. */
function buildStickerOutline(ops: readonly Op[], strokeWidth: number): StickerOutlineShape[] {
  return ops.map((op): StickerOutlineShape => {
    if (op.t === 'wash' || op.t === 'fill') {
      return { points: op.points, closed: true, width: strokeWidth * 2, fill: true };
    }
    if (op.t === 'line') {
      return { points: op.points, closed: op.closed, width: strokeWidth * 2 + op.width, fill: false };
    }
    return { points: op.points, closed: false, width: strokeWidth * 2 + op.width, fill: false };
  });
}

/**
 * Builds the backend-agnostic geometry for one render spec at one size: tessellated ops, full
 * ribbon L/R arrays (precomputed once so `frame` never re-tessellates or re-runs per-vertex trig),
 * the die-cut sticker outline, the tier edge ring, and variant recolouring. Called once per (spec,
 * sizePt, closedEyes) combination — build a second Model for the closed-eye variant instead of
 * mutating this one.
 */
export function build(spec: RenderSpec, sizePt: number): Model {
  const registration = resolveKind(spec.kind);
  const [viewBoxWidth] = registration.viewBox;
  const stickerWidth = spec.sticker?.w ?? 5;
  const pad = spec.sticker ? stickerWidth + 4 : 0;
  const minW = minRibbonWidth(sizePt, viewBoxWidth, pad);

  const options = resolveOptions(spec);
  const { sink, ops: rawOps } = createOpBuilder(spec.seed, options.ink);
  registration.fn(sink, options);

  // `tilt`/`hop` (T8): whole-body transforms for kinds design itself never gives a pose. Applied to
  // the complete authored op list -- the sticker/edge outline below is built from this same `ops`,
  // so it moves with the body automatically instead of needing its own transform.
  const pose = resolvePose(spec);
  const ops = pose === 'tilt' ? applyTiltPose(rawOps) : pose === 'hop' ? applyHopPose(rawOps) : rawOps;

  let builtOps = ops.map((op) => buildOp(op, minW));
  let blend: Blend = spec.blend ?? 'multiply';
  const variant = spec.variant ?? 'color';
  if (variant === 'mask') {
    builtOps = applyMaskVariant(builtOps, spec.maskColor ?? DEFAULT_LOCKED_COLOR);
    blend = 'srcOver';
  } else if (variant === 'mono') {
    builtOps = applyMonoVariant(builtOps);
  } else if (variant === 'stamp') {
    builtOps = applyStampVariant(builtOps, options.ink);
    blend = 'srcOver';
  }

  const totalArcLength = builtOps.reduce((sum, op) => (op.t === 'line' ? sum + op.arcLength : sum), 0) || 1;

  const edgeStyle = spec.form && spec.form.edge !== 'none' ? EDGE_RING_STYLES[spec.form.edge] : null;
  // `EDGE_RING_STYLES[x].width` is a fixed point width (it replaces design's CSS `drop-shadow(Npx
  // ...)`, which offsets by a constant number of CSS pixels regardless of element size) — unlike
  // `stickerWidth`, a local-unit value design itself scales with the art. Convert pt -> local units
  // the same way `minRibbonWidth` above converts its own pt-space constant, so the fixed-pt ring
  // stays visually the same width at every `sizePt` instead of growing/shrinking with the art.
  const edgeWidthLocal = edgeStyle ? (edgeStyle.width * (viewBoxWidth + 2 * pad)) / sizePt : 0;

  return {
    ops: builtOps,
    totalArcLength,
    blend,
    stickerColor: spec.sticker?.color ?? null,
    stickerOutline: spec.sticker ? buildStickerOutline(ops, stickerWidth) : null,
    edgeColor: edgeStyle?.color ?? null,
    edgeOutline: spec.sticker && edgeStyle ? buildStickerOutline(ops, stickerWidth + edgeWidthLocal) : null,
  };
}

export { DEFAULT_INK, DEFAULT_LOCKED_COLOR };
